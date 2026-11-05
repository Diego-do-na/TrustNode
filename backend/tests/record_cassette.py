"""Run a REAL audit against Ollama and record everything needed to replay it offline.

Usage (from anywhere):
    backend/venv/bin/python -I backend/tests/record_cassette.py \
        --mode control_k5 --out /path/run.json [--pdf PDF] [--standard "ISO 27001"] [--doc-type isms_policy]

Not collected by pytest (name does not start with test_). Uses a throw-away Chroma
directory, so it never touches backend/chroma_db. Ollama options are NOT changed.
"""
import argparse
import hashlib
import json
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import httpx  # noqa: E402

import evaluator  # noqa: E402
import ingestion  # noqa: E402
from schemas import AuditRequest  # noqa: E402
from standards_loader import load_standard  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default=evaluator.CHECK_RETRIEVAL)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pdf", default=str(HERE / "fixtures" / "datagraphic_policy.pdf"))
    ap.add_argument("--standard", default="ISO 27001")
    ap.add_argument("--doc-type", default="isms_policy")
    args = ap.parse_args()

    evaluator.parse_retrieval_mode(args.mode)
    evaluator.CHECK_RETRIEVAL = args.mode

    ingestion.CHROMA_PATH = tempfile.mkdtemp(prefix="tn_chroma_")
    pdf = Path(args.pdf)
    print("ingest:", ingestion.ingest_pdf(pdf.read_bytes(), pdf.name))

    retrieval: dict[str, dict] = {}
    llm: list[dict] = []

    orig_query = evaluator.query_evidence

    def query(keywords, n_results=3):
        chunks = orig_query(keywords, n_results=n_results)
        key = json.dumps([list(keywords), n_results])
        retrieval[key] = {"keywords": list(keywords), "n_results": n_results, "chunks": chunks}
        return chunks

    def call(prompt: str) -> str:
        cid = re.search(r"CONTROL ID: (\S+)", prompt).group(1)
        m = re.search(r"CHECK ID: (\S+)", prompt)
        payload = {"model": evaluator.OLLAMA_MODEL, "prompt": prompt, "format": "json",
                   "stream": False, "options": dict(evaluator.OLLAMA_OPTIONS)}
        t = time.time()
        with httpx.Client(timeout=evaluator.OLLAMA_TIMEOUT) as c:
            r = c.post(evaluator.OLLAMA_URL, json=payload)
            r.raise_for_status()
        j = r.json()
        llm.append({
            "control_id": cid, "check_id": m.group(1) if m else None,
            "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
            "raw": j["response"], "prompt_eval_count": j.get("prompt_eval_count"),
            "eval_count": j.get("eval_count"), "secs": round(time.time() - t, 1),
        })
        return j["response"]

    evaluator.query_evidence = query
    evaluator._call_ollama = call

    digest = None
    try:
        tags = httpx.get("http://localhost:11434/api/tags", timeout=10).json()["models"]
        digest = next((m["digest"][:12] for m in tags if m["name"].startswith(evaluator.OLLAMA_MODEL)), None)
    except Exception:  # noqa: BLE001
        pass

    std = load_standard(args.standard)
    req = AuditRequest(**std, doc_type=args.doc_type)
    t0 = time.time()
    resp = evaluator.run_audit(req)
    total = round(time.time() - t0, 1)

    out = {
        "meta": {
            "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": evaluator.OLLAMA_MODEL, "model_digest": digest,
            "options": evaluator.OLLAMA_OPTIONS, "retrieval_mode": args.mode,
            "document": pdf.name, "standard": args.standard, "doc_type": args.doc_type,
            "total_secs": total, "llm_calls": len(llm),
        },
        "retrieval": list(retrieval.values()),
        "llm": llm,
        "result": resp.model_dump(),
    }
    Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"done: {len(llm)} LLM calls in {total}s -> {args.out}")


if __name__ == "__main__":
    main()
