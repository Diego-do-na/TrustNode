"""TrustNode benchmark: accuracy + speed + memory of the audit pipeline per configuration.

Runs the REAL pipeline (ingestion -> Chroma -> retrieval -> Ollama -> verification ->
status derivation) for every combination of the swept parameters, against documents
with hand-reviewed expected states ("truth" files in bench/truth/).

Quick start (from backend/):
    .venv/bin/python bench/run_bench.py --models llama3.1:8b
    .venv/bin/python bench/run_bench.py --models llama3.1:8b,qwen2.5:7b,llama3.2:3b \
        --chunk-words 250,500 --k 3,5 --pad-pages 0,120 --repeats 2 --pull

Every swept option takes a comma-separated list; the run is the cartesian product.
Ingestion is done once per (embedding config, chunking, padding) and reused for every
LLM config. Results go to bench/results/<timestamp>_<host>/ :
    machine.json    hardware, Ollama version, model digests
    runs.jsonl      one line per run (all metrics + per-control statuses)
    raw/<run>.json  full audit response + every raw model answer (for inspection)
    summary.md      comparison table (also printed)

Nothing here changes production defaults: parameters are set in-process per run.
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import platform
import random
import re
import shutil
import socket
import statistics
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))

import fitz  # noqa: E402
import httpx  # noqa: E402

import evaluator  # noqa: E402
import ingestion  # noqa: E402
from evaluator import normalize_text  # noqa: E402
from schemas import AuditRequest  # noqa: E402
from standards_loader import load_standard  # noqa: E402

OLLAMA = "http://localhost:11434"
EMBED_PREFIXES = {
    "none": ("", ""),
    "nomic": ("search_document: ", "search_query: "),
}


# ---------------------------------------------------------------------------
# Ollama helpers
# ---------------------------------------------------------------------------

def ollama_get(path: str) -> dict:
    r = httpx.get(f"{OLLAMA}{path}", timeout=10)
    r.raise_for_status()
    return r.json()


def installed_models() -> dict[str, dict]:
    return {m["name"]: m for m in ollama_get("/api/tags").get("models", [])}


def resolve(name: str, models: dict) -> str | None:
    for cand in (name, f"{name}:latest"):
        if cand in models:
            return cand
    return None


def ensure_models(names: list[str], pull: bool) -> dict[str, dict]:
    models = installed_models()
    missing = [n for n in names if not resolve(n, models)]
    if missing and pull:
        for n in missing:
            print(f"[pull] {n} …", flush=True)
            subprocess.run(["ollama", "pull", n], check=True)
        models = installed_models()
        missing = [n for n in names if not resolve(n, models)]
    if missing:
        sys.exit(f"Missing Ollama models: {missing} (install them or pass --pull)")
    return models


def unload(model: str) -> None:
    try:
        httpx.post(f"{OLLAMA}/api/generate", json={"model": model, "keep_alive": 0}, timeout=60)
    except httpx.HTTPError:
        pass


def warm(model: str, num_ctx: int) -> float:
    """Load the model (with the run's num_ctx) and return the load time in seconds."""
    t = time.perf_counter()
    httpx.post(
        f"{OLLAMA}/api/generate",
        json={"model": model, "prompt": "ok", "stream": False,
              "options": {"num_predict": 1, "num_ctx": num_ctx}},
        timeout=600,
    ).raise_for_status()
    return time.perf_counter() - t


def loaded_memory() -> dict[str, dict]:
    try:
        return {m["name"]: {"size_gb": round(m.get("size", 0) / 1e9, 2),
                            "gpu_gb": round(m.get("size_vram", 0) / 1e9, 2)}
                for m in ollama_get("/api/ps").get("models", [])}
    except Exception:
        return {}


def machine_info() -> dict:
    info = {"host": socket.gethostname(), "platform": platform.platform(),
            "python": platform.python_version(), "machine": platform.machine()}
    if sys.platform == "darwin":
        for key in ("hw.model", "machdep.cpu.brand_string", "hw.memsize", "hw.perflevel0.physicalcpu",
                    "hw.perflevel1.physicalcpu"):
            try:
                info[key] = subprocess.run(["sysctl", "-n", key], capture_output=True, text=True).stdout.strip()
            except Exception:
                pass
        if info.get("hw.memsize", "").isdigit():
            info["ram_gb"] = round(int(info["hw.memsize"]) / 2**30, 1)
    try:
        info["ollama_version"] = ollama_get("/api/version").get("version")
    except Exception:
        pass
    return info


# ---------------------------------------------------------------------------
# Documents (optionally padded to simulate large PDFs)
# ---------------------------------------------------------------------------

# Filler from OTHER domains. Some sentences deliberately look policy-like (training,
# reviews, targets, responsible roles) so a large document also tests that the model does
# not accept off-topic evidence. None of it is about information security.
FILLER = [
    "Forklift operators must complete a practical driving assessment before operating any vehicle in the warehouse. "
    "Refresher training on load handling is scheduled every two years and recorded by the site supervisor.",
    "The canteen is open from 07:30 to 15:00. Menus rotate weekly and vegetarian options are always available. "
    "Feedback about the food service can be left in the box next to the coffee machines.",
    "Our target is to reduce diesel consumption of the delivery fleet by 12 percent by the end of next year. "
    "The fleet manager reports fuel usage per vehicle to the operations board every quarter.",
    "Annual leave requests should be submitted at least four weeks in advance through the HR portal. "
    "Line managers approve requests taking into account team coverage during peak periods.",
    "Pallets must not be stacked higher than 1.8 metres in aisle B. Damaged pallets are tagged in red and "
    "moved to the repair bay at the end of each shift by the duty team leader.",
    "The marketing style guide defines the approved colour palette, fonts and logo placement for brochures. "
    "Any deviation must be approved by the brand manager before printing.",
    "Visitors to the production floor must wear high-visibility vests and safety shoes at all times. "
    "Hearing protection is mandatory in zones marked with a blue sign.",
    "The maintenance plan for the folding machines includes weekly lubrication, monthly belt inspection and an "
    "annual service by the manufacturer. Breakdowns are logged in the maintenance book.",
    "Customer complaints about delivery times are acknowledged within two working days. The customer service lead "
    "reviews open complaints every Monday and escalates repeated issues to the sales director.",
    "The car park is resurfaced every five years. Spaces near the entrance are reserved for visitors and staff "
    "with mobility needs; electric vehicle chargers are located behind building C.",
    "Paper waste is collected separately and sent for recycling. The facilities team publishes the recycling rate "
    "on the notice board each month and aims to exceed 80 percent.",
    "New starters receive a tour of the site, a copy of the fire evacuation plan and an introduction to their "
    "team on their first day. The fire alarm is tested every Wednesday at 10:00.",
]


def filler_page_text(rng: random.Random, n: int) -> str:
    paras = rng.sample(FILLER, 5)
    return f"Operations Handbook - Section {n}\n\n" + "\n\n".join(paras)


def build_document(pdf_path: Path, pad_pages: int, seed: int = 1234) -> tuple[bytes, set[int]]:
    """The real PDF, inserted in the middle of `pad_pages` filler pages.

    Returns (pdf bytes, page numbers that belong to the real document).
    """
    src = fitz.open(pdf_path)
    n_real = src.page_count
    if pad_pages <= 0:
        data = src.tobytes()
        src.close()
        return data, set(range(1, n_real + 1))
    rng = random.Random(seed)
    out = fitz.open()

    def add_filler(count: int, start: int) -> None:
        for i in range(count):
            page = out.new_page()
            page.insert_textbox(fitz.Rect(50, 50, 545, 790), filler_page_text(rng, start + i), fontsize=10)

    before = pad_pages // 2
    add_filler(before, 1)
    out.insert_pdf(src)
    add_filler(pad_pages - before, before + 1)
    data = out.tobytes()
    out.close()
    src.close()
    return data, set(range(before + 1, before + 1 + n_real))


def page_texts(pdf_bytes: bytes) -> dict[int, str]:
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return {i: p.get_text("text") for i, p in enumerate(doc, start=1)}


def _compact(t: str) -> str:
    return re.sub(r"[\W_]+", "", t)


def _no_footnotes(t: str) -> str:
    return re.sub(r"(?<![\w.])\d{1,2}(?![\w.])", " ", t)


def quote_on_page(quote: str, page_text: str) -> bool:
    q, p = normalize_text(quote), normalize_text(page_text)
    return (q in p or _compact(q) in _compact(p)
            or _compact(_no_footnotes(q)) in _compact(_no_footnotes(p)))


# ---------------------------------------------------------------------------
# One audit run
# ---------------------------------------------------------------------------

def run_once(truth: dict, standard: dict, pages: dict[int, str], real_pages: set[int], llm: str, k: int,
             num_ctx: int, num_predict: int | None, verify: str = "none") -> dict:
    calls: list[dict] = []
    retrieved: dict[str, list[int]] = {}  # query text -> pages of the top-k chunks
    original_query = evaluator.query_evidence

    def spy_query(keywords, n_results=3):
        chunks = original_query(keywords, n_results=n_results)
        retrieved[" ".join(keywords)] = [c.get("page") for c in chunks]
        return chunks

    def hook(data: dict, prompt: str) -> None:
        calls.append({
            "prompt_chars": len(prompt),
            "est_prompt_tokens": len(prompt) // 4,
            "prompt_eval_count": data.get("prompt_eval_count"),
            "eval_count": data.get("eval_count"),
            "total_s": (data.get("total_duration") or 0) / 1e9,
            "load_s": (data.get("load_duration") or 0) / 1e9,
            "prompt_eval_s": (data.get("prompt_eval_duration") or 0) / 1e9,
            "eval_s": (data.get("eval_duration") or 0) / 1e9,
            "raw": data.get("response", ""),
        })

    evaluator.OLLAMA_MODEL = llm
    evaluator.VERIFY_MODE = verify
    evaluator.CHECK_RETRIEVAL = f"per_check_k{k}"
    evaluator.OLLAMA_OPTIONS["num_ctx"] = num_ctx
    if num_predict:
        evaluator.OLLAMA_OPTIONS["num_predict"] = num_predict
    else:
        evaluator.OLLAMA_OPTIONS.pop("num_predict", None)
    evaluator.OLLAMA_STATS_HOOK = hook
    evaluator.query_evidence = spy_query

    t0 = time.perf_counter()
    error = None
    try:
        resp = evaluator.run_audit(AuditRequest(**standard, doc_type=truth["doc_type"]))
    except Exception as exc:  # keep the sweep going
        resp, error = None, f"{type(exc).__name__}: {exc}"
    wall = time.perf_counter() - t0
    evaluator.OLLAMA_STATS_HOOK = None
    evaluator.query_evidence = original_query

    m: dict = {"wall_s": round(wall, 1), "llm_calls": len(calls), "error": error}
    if calls:
        gen_tok = sum(c["eval_count"] or 0 for c in calls)
        gen_s = sum(c["eval_s"] for c in calls)
        pe_tok = sum(c["prompt_eval_count"] or 0 for c in calls)
        pe_s = sum(c["prompt_eval_s"] for c in calls)
        per_call = sorted(c["total_s"] for c in calls)
        m.update({
            "llm_s": round(sum(per_call), 1),
            "call_mean_s": round(statistics.mean(per_call), 2),
            "call_p95_s": round(per_call[max(0, int(len(per_call) * 0.95) - 1)], 2),
            "gen_tok_s": round(gen_tok / gen_s, 1) if gen_s else None,
            "prompt_tok_s": round(pe_tok / pe_s, 1) if pe_s else None,
            "max_est_prompt_tokens": max(c["est_prompt_tokens"] for c in calls),
            # Ollama silently drops the start of prompts longer than num_ctx (the system
            # prompt with the rules!). Estimate at ~4 chars/token: treat as a red flag.
            "calls_over_ctx_est": sum(1 for c in calls if c["est_prompt_tokens"] > num_ctx * 0.95),
            "max_gen_tokens": max(c["eval_count"] or 0 for c in calls),
            "load_s_in_calls": round(sum(c["load_s"] for c in calls), 1),
        })
    if resp is None:
        return {"metrics": m, "statuses": {}, "response": None, "calls": calls}

    acceptable = {k_: set(v) for k_, v in truth["acceptable"].items()}
    statuses = {r.control_id: r.status for r in resp.results}
    evaluable = [c for c, ok in acceptable.items() if ok != {"not_evaluable"}]
    ok_eval = [c for c in evaluable if statuses.get(c) in acceptable[c]]
    ok_ne = [c for c, ok in acceptable.items() if ok == {"not_evaluable"} and statuses.get(c) == "not_evaluable"]

    cites = [(r.control_id, c) for r in resp.results
             for c in list(r.citations) + [c for ck in r.checks for c in ck.citations]]
    bad = [f"{cid} p{c.page}: {c.quote[:80]}" for cid, c in cites
           if c.page not in pages or not quote_on_page(c.quote, pages[c.page])]
    blob = resp.model_dump_json().lower()
    leaks = [t for t in truth.get("forbidden_terms", []) if t in blob]
    leaks += [w for w in truth.get("forbidden_words", []) if re.search(rf"\b{re.escape(w)}\b", blob)]
    unverified = sum(1 for r in resp.results for ck in r.checks if ck.evidence_unverified)

    # Retrieval vs model: filler pages never contain valid evidence, so a check whose
    # top-k has no chunk from the real document could not be answered by any model.
    by_question = {ck["question"]: ck for c in standard["controls"] for ck in c.get("checks") or []}
    hits = [any(p in real_pages for p in pg) for q, pg in retrieved.items() if q in by_question]
    # Per check: evidence quoted from a filler page is ALWAYS a false "found" (model);
    # a not-found check whose top-k has no real chunk is a retrieval miss.
    filler_found, retrieval_missed = {}, {}
    for r in resp.results:
        for ck in r.checks:
            if ck.found and any(c.page not in real_pages for c in ck.citations):
                filler_found.setdefault(r.control_id, []).append(ck.check_id)
            if not ck.found and not any(p in real_pages for p in retrieved.get(ck.question, [])):
                retrieval_missed.setdefault(r.control_id, []).append(ck.check_id)
    blame = {}
    for r in resp.results:
        cid = r.control_id
        if cid not in acceptable or statuses.get(cid) in acceptable[cid]:
            continue
        why = []
        if cid in filler_found:
            why.append("model-filler " + ",".join(filler_found[cid]))
        if cid in retrieval_missed:
            why.append("retrieval " + ",".join(retrieval_missed[cid]))
        blame[cid] = "; ".join(why) or "model"
    lucky = [cid for cid in filler_found if cid in acceptable and statuses.get(cid) in acceptable[cid]]
    llm_errors = sum(1 for r in resp.results if "error del LLM" in (r.note or ""))

    m.update({
        "accuracy": round(len(ok_eval) / len(evaluable), 3) if evaluable else None,
        "ok_controls": f"{len(ok_eval)}/{len(evaluable)}",
        "ok_not_evaluable": f"{len(ok_ne)}/{sum(1 for v in acceptable.values() if v == {'not_evaluable'})}",
        "wrong_controls": [f"{c}={statuses.get(c)}" for c in evaluable if c not in ok_eval],
        "citations": len(cites),
        "citations_bad_page": len(bad),
        "bad_citations": bad[:10],
        "forbidden_leaks": leaks,
        "checks_unverified": unverified,
        "retrieval_hit_rate": round(sum(hits) / len(hits), 3) if hits else None,
        "retrieval_misses": [q[:70] for q, pg in retrieved.items()
                             if q in by_question and not any(p in real_pages for p in pg)],
        "blame": blame,
        "filler_citations": sum(len(v) for v in filler_found.values()),
        "filler_found_checks": filler_found,
        "retrieval_missed_checks": retrieval_missed,
        # status accepted, but reached through evidence from filler pages
        "right_for_wrong_reason": lucky,
        "llm_errors": llm_errors,
        "score": resp.global_score_percentage,
    })
    return {"metrics": m, "statuses": statuses, "response": json.loads(resp.model_dump_json()), "calls": calls}


# ---------------------------------------------------------------------------
# Sweep
# ---------------------------------------------------------------------------

def csv_list(s: str, cast=str) -> list:
    return [cast(x.strip()) for x in str(s).split(",") if x.strip()]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", default=evaluator.OLLAMA_MODEL, help="LLMs, comma-separated")
    ap.add_argument("--embed-models", default=ingestion.OLLAMA_MODEL)
    ap.add_argument("--embed-prefix", default="none", help="none,nomic")
    ap.add_argument("--embed-num-ctx", default="", help="e.g. 8192 for big chunks (empty = Ollama default)")
    ap.add_argument("--chunk-words", default=str(ingestion.CHUNK_WORDS))
    ap.add_argument("--overlap", default=str(ingestion.CHUNK_OVERLAP))
    ap.add_argument("--k", default="3", help="chunks retrieved per check")
    ap.add_argument("--num-ctx", default=str(evaluator.OLLAMA_OPTIONS["num_ctx"]))
    ap.add_argument("--num-predict", default="", help="cap on generated tokens; empty = none")
    ap.add_argument("--verify", default="none", help="none,judge (second pass on every 'found' check)")
    ap.add_argument("--pad-pages", default="0", help="filler pages around the real PDF (simulates big PDFs)")
    ap.add_argument("--repeats", type=int, default=1)
    ap.add_argument("--truth", default=str(HERE / "truth" / "datagraphic_isms.json"))
    ap.add_argument("--out", default="")
    ap.add_argument("--pull", action="store_true", help="ollama pull missing models")
    ap.add_argument("--keep-loaded", action="store_true", help="do not unload the LLM when switching")
    args = ap.parse_args()

    truth_path = Path(args.truth).resolve()
    truth = json.loads(truth_path.read_text(encoding="utf-8"))
    pdf_path = (truth_path.parent / truth["pdf"]).resolve()
    standard = load_standard(truth["standard"])

    llms = csv_list(args.models)
    embeds = csv_list(args.embed_models)
    models = ensure_models(llms + embeds, args.pull)
    llms = [resolve(n, models) for n in llms]
    embeds = [resolve(n, models) for n in embeds]

    out = Path(args.out) if args.out else HERE / "results" / f"{datetime.now():%Y%m%d_%H%M%S}_{socket.gethostname().split('.')[0]}"
    (out / "raw").mkdir(parents=True, exist_ok=True)
    machine = machine_info()
    machine["models"] = {n: {"digest": models[n].get("digest", "")[:12],
                             "size_gb": round(models[n].get("size", 0) / 1e9, 2),
                             "params": models[n].get("details", {}).get("parameter_size"),
                             "quant": models[n].get("details", {}).get("quantization_level")}
                         for n in llms + embeds}
    machine["args"] = vars(args)
    (out / "machine.json").write_text(json.dumps(machine, indent=1), encoding="utf-8")
    print(json.dumps(machine, indent=1))

    ingest_grid = list(itertools.product(
        embeds, csv_list(args.embed_prefix), csv_list(args.chunk_words, int), csv_list(args.overlap, int),
        csv_list(args.pad_pages, int)))
    llm_grid = list(itertools.product(
        llms, csv_list(args.k, int), csv_list(args.num_ctx, int),
        [int(x) if x else None for x in (csv_list(args.num_predict) or [""])], csv_list(args.verify)))
    total = len(ingest_grid) * len(llm_grid) * args.repeats
    print(f"\n{len(ingest_grid)} ingestion config(s) x {len(llm_grid)} LLM config(s) x {args.repeats} repeat(s) = {total} runs\n")

    runs: list[dict] = []
    n = 0
    current_llm = None
    for emb, prefix, cw, ov, pad in ingest_grid:
        ingestion.OLLAMA_MODEL = emb
        ingestion.EMBED_DOC_PREFIX, ingestion.EMBED_QUERY_PREFIX = EMBED_PREFIXES[prefix]
        ingestion.EMBED_NUM_CTX = int(args.embed_num_ctx) if args.embed_num_ctx else None
        ingestion.CHUNK_WORDS, ingestion.CHUNK_OVERLAP = cw, ov
        chroma_dir = tempfile.mkdtemp(prefix="tn_bench_chroma_")
        ingestion.CHROMA_PATH = chroma_dir

        doc, real_pages = build_document(pdf_path, pad)
        pages = page_texts(doc)
        t = time.perf_counter()
        info = ingestion.ingest_pdf(doc, pdf_path.name if pad == 0 else f"padded{pad}_{pdf_path.name}")
        ingest_s = round(time.perf_counter() - t, 1)
        max_chunk_words = max((len(p.split()) for p in pages.values()), default=0)
        print(f"[ingest] {emb} prefix={prefix} chunk={cw}/{ov} pad={pad}: {len(pages)} pages, "
              f"{info.get('chunks')} chunks in {ingest_s}s {info.get('warning', '')}")

        for llm, k, ctx, npred, verify in llm_grid:
            if llm != current_llm:
                if current_llm and not args.keep_loaded:
                    unload(current_llm)
                cold = round(warm(llm, ctx), 1)
                current_llm = llm
            else:
                cold = None
            for rep in range(1, args.repeats + 1):
                n += 1
                cfg = {"llm": llm, "embed": emb, "prefix": prefix, "chunk_words": cw, "overlap": ov,
                       "pad_pages": pad, "pages": len(pages), "chunks": info.get("chunks"),
                       "failed_embeddings": info.get("failed_embeddings", 0), "k": k, "num_ctx": ctx,
                       "num_predict": npred, "verify": verify, "repeat": rep, "ingest_s": ingest_s, "cold_load_s": cold,
                       "max_words_per_page": max_chunk_words}
                print(f"[{n}/{total}] {cfg['llm']} verify={verify} k={k} ctx={ctx} np={npred} chunk={cw} pad={pad} rep={rep} …",
                      flush=True)
                res = run_once(truth, standard, pages, real_pages, llm, k, ctx, npred, verify)
                res["metrics"]["memory"] = loaded_memory()
                row = {"run": n, **cfg, **res["metrics"], "statuses": res["statuses"]}
                runs.append(row)
                with open(out / "runs.jsonl", "a", encoding="utf-8") as f:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                (out / "raw" / f"run{n:03d}.json").write_text(
                    json.dumps({"config": cfg, **res}, ensure_ascii=False, indent=1), encoding="utf-8")
                m = res["metrics"]
                print(f"      acc={m.get('accuracy')} ({m.get('ok_controls')}) wrong={m.get('wrong_controls')} "
                      f"blame={m.get('blame')} retrieval_hit={m.get('retrieval_hit_rate')} "
                      f"bad_cites={m.get('citations_bad_page')} wall={m['wall_s']}s calls={m['llm_calls']} "
                      f"gen={m.get('gen_tok_s')} tok/s over_ctx={m.get('calls_over_ctx_est')} err={m.get('error')}",
                      flush=True)
        shutil.rmtree(chroma_dir, ignore_errors=True)

    if current_llm and not args.keep_loaded:
        unload(current_llm)
    summary = render_summary(runs, machine)
    (out / "summary.md").write_text(summary, encoding="utf-8")
    print("\n" + summary)
    print(f"Results: {out}")


def render_summary(runs: list[dict], machine: dict) -> str:
    keys = ("llm", "verify", "embed", "prefix", "chunk_words", "overlap", "pad_pages", "k", "num_ctx", "num_predict")
    groups: dict[tuple, list[dict]] = {}
    for r in runs:
        groups.setdefault(tuple(r[k] for k in keys), []).append(r)

    lines = [
        f"# TrustNode benchmark — {machine.get('hw.model', machine.get('machine'))} "
        f"{machine.get('machdep.cpu.brand_string', '')} {machine.get('ram_gb', '?')} GB, "
        f"Ollama {machine.get('ollama_version', '?')}",
        "",
        "accuracy = controles evaluables con estado aceptable (media de repeticiones); "
        "stable = mismos estados en todas las repeticiones; causa: model-filler = el modelo dio por cumplido un check "
        "citando una página de relleno (falso positivo seguro), retrieval = check no encontrado sin ningún fragmento del "
        "documento real en su top-k, model = otro error de juicio; lucky = estado aceptable pero alcanzado con evidencia "
        "de relleno; filler cites = checks cumplidos con citas de relleno (media); retrieval hit = fracción de checks con "
        "al menos un fragmento del documento real en el top-k; bad cites = citas que no están en su página; "
        "over ctx = llamadas cuyo prompt estimado excede num_ctx (Ollama trunca en silencio).",
        "",
        "| LLM | verify | embed | prefix | chunk | pad | k | ctx | np | accuracy | stable | wrong (causa) | lucky | filler cites | retrieval hit | bad cites | leaks | ingest s | wall s | s/call | gen tok/s | over ctx | mem GB |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for key, rs in sorted(groups.items(), key=lambda kv: -statistics.mean([r.get("accuracy") or 0 for r in kv[1]])):
        cfg = dict(zip(keys, key))
        accs = [r.get("accuracy") or 0 for r in rs]
        stable = "yes" if len({json.dumps(r["statuses"], sort_keys=True) for r in rs}) == 1 else "NO"
        wrong = sorted({f"{c} [{b}]" for r in rs for c, b in r.get("blame", {}).items()})
        lucky = sorted({c for r in rs for c in r.get("right_for_wrong_reason", [])})
        filler = statistics.mean([r.get("filler_citations") or 0 for r in rs])
        hit = statistics.mean([r.get("retrieval_hit_rate") or 0 for r in rs])
        mem = rs[-1].get("memory", {}).get(cfg["llm"], {}).get("size_gb", "")
        lines.append(
            f"| {cfg['llm']} | {cfg['verify']} | {cfg['embed']} | {cfg['prefix']} | {cfg['chunk_words']}/{cfg['overlap']} | "
            f"{cfg['pad_pages']} | {cfg['k']} | {cfg['num_ctx']} | {cfg['num_predict'] or '-'} | "
            f"{statistics.mean(accs):.2f} | {stable if len(rs) > 1 else '-'} | {', '.join(wrong) or '-'} | "
            f"{', '.join(lucky) or '-'} | {filler:.1f} | {hit:.2f} | {sum(r.get('citations_bad_page', 0) for r in rs)} | "
            f"{len({t for r in rs for t in r.get('forbidden_leaks', [])})} | "
            f"{statistics.mean(r['ingest_s'] for r in rs):.0f} | {statistics.mean(r['wall_s'] for r in rs):.0f} | "
            f"{statistics.mean(r.get('call_mean_s') or 0 for r in rs):.1f} | "
            f"{statistics.mean(r.get('gen_tok_s') or 0 for r in rs):.0f} | "
            f"{sum(r.get('calls_over_ctx_est', 0) for r in rs)} | {mem} |"
        )
    errs = [r for r in runs if r.get("error")]
    if errs:
        lines += ["", "## Errores", *[f"- run {r['run']} ({r['llm']}): {r['error']}" for r in errs]]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
