"""
TrustNode — Universal Compliance Engine (Offline RAG)
main.py — FastAPI orchestrator

Role: Expose the public API, validate inputs/outputs via Pydantic,
delegate heavy work to `ingestion` and `evaluator`. No business logic here.
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from typing import List

import httpx
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

# Team modules. These signatures are the CONTRACT — notify the team if they change.
from ingestion import ingest_pdf, get_collection_stats, clear_collection
from evaluator import run_audit, check_llm_alive, generate_executive_summary
from latex_report import render_pdf
from schemas import (
    AuditRequest,
    AuditResponse,
    IngestResponse,
    StatusResponse,
    ErrorResponse,
    SummaryRequest,
    SummaryResponse,
    ExportPdfRequest,
)


# ---------------------------------------------------------------------------
# Configuración y logging
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_TIMEOUT_SECONDS = 5.0  # Health-check only; actual inference timeouts live in evaluator
MAX_PDF_SIZE_MB = 50
ALLOWED_MIME_TYPES = {"application/pdf"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s :: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("trustnode.api")


# ---------------------------------------------------------------------------
# Lifespan: shared HTTP client for Ollama communication
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Keeps a single httpx.AsyncClient alive for the entire app lifetime —
    faster than creating one per request and centralises the Ollama timeout.
    """
    logger.info("Booting TrustNode API…")
    app.state.http = httpx.AsyncClient(
        base_url=OLLAMA_BASE_URL,
        timeout=OLLAMA_TIMEOUT_SECONDS,
    )
    logger.info("HTTP client ready. Ollama target: %s", OLLAMA_BASE_URL)
    try:
        yield
    finally:
        await app.state.http.aclose()
        logger.info("Shutdown complete.")


app = FastAPI(
    title="TrustNode — Compliance Engine",
    version="0.1.0",
    description="Offline normative compliance engine based on local RAG (Ollama + ChromaDB).",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS — permissive for the hackathon. Restrict origins in production.
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # credentials cannot be used with wildcard origin
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global exception handlers — uniform JSON error responses
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning("HTTPException %s at %s :: %s", exc.status_code, request.url.path, exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error=exc.detail, path=request.url.path).model_dump(),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Catches everything that is not an HTTPException — prevents leaking stack traces to clients.
    logger.exception("Unhandled error at %s", request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="Internal server error",
            detail=str(exc),
            path=request.url.path,
        ).model_dump(),
    )


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

async def get_http_client(request: Request) -> httpx.AsyncClient:
    """Injects the shared AsyncClient created during lifespan startup."""
    return request.app.state.http


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get(
    "/api/v1/status",
    response_model=StatusResponse,
    tags=["system"],
    summary="Health-check of the local stack (API + Ollama).",
)
async def status_endpoint(http: httpx.AsyncClient = Depends(get_http_client)) -> StatusResponse:
    """
    Verifies:
      1. That Ollama is responding at :11434.
      2. That the required models (llama3.1:8b, nomic-embed-text) are available.
    Does not fail if the Chroma collection is empty — that is a valid state on startup.
    """
    ollama_alive = False
    available_models: List[str] = []
    try:
        resp = await http.get("/api/tags")
        resp.raise_for_status()
        data = resp.json()
        available_models = [m.get("name", "") for m in data.get("models", [])]
        ollama_alive = True
    except httpx.HTTPError as e:
        logger.error("Ollama health-check failed: %s", e)

    # Delegate a finer check to the evaluator if Ollama is alive
    # (e.g. try a short generate). For the hackathon, /api/tags is sufficient.
    if ollama_alive:
        try:
            await run_in_threadpool(check_llm_alive)
        except Exception as e:  # noqa: BLE001
            logger.warning("check_llm_alive raised: %s — degrading status.", e)
            ollama_alive = False

    try:
        chroma_stats = await run_in_threadpool(get_collection_stats)
    except Exception as e:  # noqa: BLE001
        logger.warning("ChromaDB stats unavailable: %s", e)
        chroma_stats = {"documents": 0, "available": False}

    return StatusResponse(
        api="ok",
        ollama_alive=ollama_alive,
        ollama_url=OLLAMA_BASE_URL,
        models_available=available_models,
        chroma=chroma_stats,
    )


@app.post(
    "/api/v1/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["pipeline"],
    summary="Ingest one or more PDFs into the local vector store.",
)
async def ingest_endpoint(
    files: List[UploadFile] = File(..., description="PDFs to index."),
) -> IngestResponse:
    """
    Receives N PDFs, validates them (mime type + size), and passes them to the ingestion pipeline.
    `ingest_pdf` handles: extraction → chunking → embeddings (nomic) → upsert into Chroma.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files received.")

    results = []
    for upload in files:
        # MIME type validation
        if upload.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported type: {upload.content_type} ({upload.filename}). PDF only.",
            )

        # Controlled read (caps memory usage)
        payload = await upload.read()
        size_mb = len(payload) / (1024 * 1024)
        if size_mb > MAX_PDF_SIZE_MB:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename} is {size_mb:.1f} MB (limit: {MAX_PDF_SIZE_MB} MB).",
            )

        logger.info("Ingesting %s (%.2f MB)…", upload.filename, size_mb)

        # `ingest_pdf` is CPU-bound (parsing + embeddings) → threadpool to avoid blocking the loop.
        try:
            doc_meta = await run_in_threadpool(ingest_pdf, payload, upload.filename)
        except Exception as e:  # noqa: BLE001
            logger.exception("Ingestion failed for %s", upload.filename)
            raise HTTPException(
                status_code=500,
                detail=f"Error processing {upload.filename}: {e}",
            ) from e

        results.append(doc_meta)
        logger.info("✔ %s indexed (chunks=%s)", upload.filename, doc_meta.get("chunks", "?"))

    return IngestResponse(
        ingested=len(results),
        documents=results,
    )


@app.post(
    "/api/v1/clear_db",
    tags=["system"],
    summary="Wipe the ChromaDB collection used as RAG memory.",
)
async def clear_db_endpoint() -> dict:
    """Drops the vector collection so the next audit only sees freshly ingested
    documents. Prevents the LLM from grounding answers on evidence from past runs.
    """
    try:
        result = await run_in_threadpool(clear_collection)
    except Exception as e:  # noqa: BLE001
        logger.exception("clear_db failed")
        raise HTTPException(status_code=500, detail=f"clear_db error: {e}") from e
    logger.info("ChromaDB collection cleared (existed=%s).", result.get("cleared"))
    return result


@app.post(
    "/api/v1/audit",
    response_model=AuditResponse,
    tags=["pipeline"],
    summary="Run an audit against the received normative standard.",
)
async def audit_endpoint(payload: AuditRequest) -> AuditResponse:
    """
    Takes a standard (list of controls/requirements) and for each one:
      1. Retrieves relevant chunks from Chroma (handled internally by evaluator).
      2. Calls llama3.1:8b with a structured prompt.
      3. Parses the response into a verdict + evidence.

    TODO(post-hackathon): if runtime exceeds ~30s, move to job-queue pattern (POST returns job_id).
    """
    logger.info(
        "Audit requested: standard=%r, controls=%d",
        payload.standard_name,
        len(payload.controls),
    )

    try:
        # The evaluator orchestrates retrieval + prompting + parsing.
        # Blocking (waits on local LLM) → threadpool.
        result = await run_in_threadpool(run_audit, payload)
    except Exception as e:  # noqa: BLE001
        logger.exception("Audit failed")
        raise HTTPException(status_code=500, detail=f"Audit error: {e}") from e

    logger.info("Audit complete: %d/%d controls evaluated.", len(result.findings), len(payload.controls))
    return result


@app.post(
    "/api/v1/summary",
    response_model=SummaryResponse,
    tags=["pipeline"],
    summary="Generate an AI executive summary from a finished audit report.",
)
async def summary_endpoint(payload: SummaryRequest) -> SummaryResponse:
    """
    Takes the results of a completed audit and asks Llama 3.1 to produce a
    senior-auditor-style executive summary (max 3 paragraphs, plain text).
    """
    if not payload.results:
        raise HTTPException(status_code=400, detail="No audit results provided.")

    logger.info(
        "Summary requested: standard=%r, findings=%d, score=%.1f",
        payload.standard_audited,
        len(payload.results),
        payload.global_score_percentage,
    )

    try:
        text = await run_in_threadpool(
            generate_executive_summary,
            payload.standard_audited,
            payload.global_score_percentage,
            [r.model_dump() for r in payload.results],
            payload.language,
        )
    except RuntimeError as e:
        logger.exception("Summary generation failed")
        raise HTTPException(status_code=502, detail=str(e)) from e

    return SummaryResponse(summary=text)


@app.post(
    "/api/v1/export/pdf",
    tags=["pipeline"],
    summary="Compile the current audit into an institutional PDF report (LaTeX).",
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "Compiled PDF report stream.",
        },
    },
)
async def export_pdf_endpoint(payload: ExportPdfRequest) -> Response:
    """
    Builds a LaTeX source from the request, compiles it via `pdflatex`, and
    returns the resulting PDF as an attachment.
    """
    logger.info(
        "Export PDF requested: standard=%r, findings=%d, score=%.1f",
        payload.standard_name,
        len(payload.findings),
        payload.compliance_score,
    )

    try:
        pdf_bytes = await run_in_threadpool(render_pdf, payload)
    except RuntimeError as e:
        logger.exception("LaTeX compilation failed")
        raise HTTPException(status_code=502, detail=str(e)) from e

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="TrustNode_Audit_Report.pdf"',
        },
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # remove for the final demo to avoid accidental reloads
        log_level="info",
    )
