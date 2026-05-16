"""
TrustNode — Motor Universal de Cumplimiento Normativo (Offline RAG)
main.py — Orquestador FastAPI

Rol: Exponer la API pública, validar entradas/salidas vía Pydantic,
delegar el trabajo pesado a `ingestion` y `evaluator`. Sin lógica de negocio aquí.
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
from fastapi.responses import JSONResponse

# Módulos del equipo. Las firmas aquí son el CONTRATO — si cambian, avisar.
from ingestion import ingest_pdf, get_collection_stats
from evaluator import run_audit, check_llm_alive
from schemas import (
    AuditRequest,
    AuditResponse,
    IngestResponse,
    StatusResponse,
    ErrorResponse,
)


# ---------------------------------------------------------------------------
# Configuración y logging
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_TIMEOUT_SECONDS = 5.0  # Solo para health-check; las inferencias reales viven en evaluator
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
# Lifespan: cliente HTTP compartido para hablar con Ollama
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Mantengo un httpx.AsyncClient vivo durante toda la app — más rápido que crear
    uno por request y centraliza el timeout hacia Ollama.
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
    description="Motor de cumplimiento normativo offline basado en RAG local (Ollama + ChromaDB).",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS — permisivo para el hackathon. En prod, restringir origins.
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # con "*" no se puede usar credentials, así queda consistente
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Manejo global de excepciones — respuestas JSON uniformes
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning("HTTPException %s en %s :: %s", exc.status_code, request.url.path, exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error=exc.detail, path=request.url.path).model_dump(),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Captura todo lo que no sea HTTPException — evita filtrar stack traces al cliente.
    logger.exception("Unhandled error en %s", request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="Internal server error",
            detail=str(exc),
            path=request.url.path,
        ).model_dump(),
    )


# ---------------------------------------------------------------------------
# Dependencias
# ---------------------------------------------------------------------------

async def get_http_client(request: Request) -> httpx.AsyncClient:
    """Inyecta el AsyncClient compartido (creado en lifespan)."""
    return request.app.state.http


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get(
    "/api/v1/status",
    response_model=StatusResponse,
    tags=["system"],
    summary="Health-check del stack local (API + Ollama).",
)
async def status_endpoint(http: httpx.AsyncClient = Depends(get_http_client)) -> StatusResponse:
    """
    Verifica:
      1. Que Ollama responde en :11434
      2. Que los modelos requeridos (llama3.1:8b, nomic-embed-text) están disponibles.
    No bloquea si la colección de Chroma está vacía — eso es un estado válido al arrancar.
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
        logger.error("Ollama health-check falló: %s", e)

    # Delegamos al evaluator una verificación más fina si Ollama está vivo
    # (p.ej. probar un generate corto). Para hackathon, con /api/tags basta.
    if ollama_alive:
        try:
            await run_in_threadpool(check_llm_alive)
        except Exception as e:  # noqa: BLE001
            logger.warning("check_llm_alive lanzó: %s — degradando estado.", e)
            ollama_alive = False

    try:
        chroma_stats = await run_in_threadpool(get_collection_stats)
    except Exception as e:  # noqa: BLE001
        logger.warning("ChromaDB stats no disponibles: %s", e)
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
    summary="Ingesta uno o varios PDFs al vector store local.",
)
async def ingest_endpoint(
    files: List[UploadFile] = File(..., description="PDFs a indexar."),
) -> IngestResponse:
    """
    Recibe N PDFs, los valida (mime + tamaño) y los pasa al pipeline de ingestion.
    `ingest_pdf` se encarga de: extracción → chunking → embeddings (nomic) → upsert en Chroma.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No se recibieron archivos.")

    results = []
    for upload in files:
        # Validación de tipo
        if upload.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Tipo no soportado: {upload.content_type} ({upload.filename}). Solo PDF.",
            )

        # Lectura controlada (limita tamaño en memoria)
        payload = await upload.read()
        size_mb = len(payload) / (1024 * 1024)
        if size_mb > MAX_PDF_SIZE_MB:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename} pesa {size_mb:.1f} MB (límite {MAX_PDF_SIZE_MB} MB).",
            )

        logger.info("Ingestando %s (%.2f MB)…", upload.filename, size_mb)

        # `ingest_pdf` es CPU-bound (parsing + embeddings) → threadpool para no bloquear el loop.
        try:
            doc_meta = await run_in_threadpool(ingest_pdf, payload, upload.filename)
        except Exception as e:  # noqa: BLE001
            logger.exception("Falló ingesta de %s", upload.filename)
            raise HTTPException(
                status_code=500,
                detail=f"Error procesando {upload.filename}: {e}",
            ) from e

        results.append(doc_meta)
        logger.info("✔ %s indexado (chunks=%s)", upload.filename, doc_meta.get("chunks", "?"))

    return IngestResponse(
        ingested=len(results),
        documents=results,
    )


@app.post(
    "/api/v1/audit",
    response_model=AuditResponse,
    tags=["pipeline"],
    summary="Lanza una auditoría contra el estándar normativo recibido.",
)
async def audit_endpoint(payload: AuditRequest) -> AuditResponse:
    """
    Toma un estándar (lista de controles/requisitos) y por cada uno:
      1. Recupera chunks relevantes de Chroma (lo hace evaluator internamente).
      2. Llama a llama3.1:8b con un prompt estructurado.
      3. Parsea la respuesta a un veredicto + evidencia.

    TODO(post-hackathon): si supera ~30s, mover a patrón job-queue (POST devuelve job_id).
    """
    logger.info(
        "Auditoría solicitada: estándar=%r, controles=%d",
        payload.standard_name,
        len(payload.controls),
    )

    try:
        # El evaluator orquesta retrieval + prompting + parsing.
        # Es bloqueante (espera al LLM local) → threadpool.
        result = await run_in_threadpool(run_audit, payload)
    except Exception as e:  # noqa: BLE001
        logger.exception("Auditoría falló")
        raise HTTPException(status_code=500, detail=f"Audit error: {e}") from e

    logger.info("Auditoría completa: %d/%d controles evaluados.", len(result.findings), len(payload.controls))
    return result


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # quítalo en demo final para evitar recargas accidentales
        log_level="info",
    )
