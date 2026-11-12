"""Integration test: a REAL audit (Ollama + Chroma + PyMuPDF) of the Datagraphic policy.

Excluded by default (pytest.ini: addopts = -m "not integration"). Run with:
    backend/.venv/bin/python -m pytest -m integration -s backend/tests/integration

Skipped when Ollama, the audit/embedding models, the PDF or node are missing.

What it checks (sets, never exact values: the 8B model is not bit-stable across hardware):
  * acceptable statuses per control (same sets as the cassette test),
  * no output mentions "multi-factor"/"MFA" (the PDF never does),
  * every citation is verbatim in the text of ITS page, extracted independently with
    PyMuPDF (this also validates page assignment),
  * a near-empty synthetic policy never yields Compliant/Partial and scores far below the
    real policy (catches a model that answers not_found to everything, which would
    otherwise pass the negative test),
  * the model digest is printed so results can be tied to a model build.
On failure the raw model answers are dumped.
"""
import json
import re
import sys
import tempfile
from pathlib import Path

import httpx
import pytest

import evaluator
import ingestion
from evaluator import normalize_text
from schemas import AuditRequest
from standards_loader import load_standard, node_available

pytestmark = pytest.mark.integration

PDF = Path(__file__).resolve().parents[1] / "fixtures" / "datagraphic_policy.pdf"
OLLAMA = "http://localhost:11434"

ACCEPTABLE = {
    "5.2": {"Compliant"}, "A.5.2": {"Compliant"}, "A.5.29": {"Compliant"},
    "A.5.31": {"Compliant"}, "A.6.3": {"Compliant"},
    "6.2": {"Partial"}, "4.3": {"Partial"},
    "A.5.1": {"Compliant", "Partial"}, "A.6.8": {"Compliant", "Partial"},
    "A.5.15": {"not_evaluable"}, "A.5.24": {"not_evaluable"},
    "A.8.5": {"not_evaluable"}, "A.8.8": {"not_evaluable"},
}
KNOWN_MODEL_FAILURES = {  # same marker as the cassette test; remove when fixed
    "6.2": "llama3.1 8B over-accepts the measurability/ownership checks",
}

NEGATIVE_TEXT = (
    "Acme Policy. This document is a draft placeholder and has not been completed. "
    "Nothing has been decided yet about this subject. Content will be added at a later date "
    "by a future owner of the document. Please ignore the contents of this page for now."
)


# ---------------------------------------------------------------------------
# Environment gates
# ---------------------------------------------------------------------------

def _models() -> dict[str, str]:
    try:
        r = httpx.get(f"{OLLAMA}/api/tags", timeout=5)
        r.raise_for_status()
        return {m["name"]: m.get("digest", "") for m in r.json().get("models", [])}
    except Exception:
        return {}


def _has(models: dict[str, str], name: str) -> str | None:
    for cand in (name, f"{name}:latest"):
        if cand in models:
            return cand
    return None


@pytest.fixture(scope="module", autouse=True)
def _environment():
    models = _models()
    if not models:
        pytest.skip("Ollama is not reachable at localhost:11434")
    audit = _has(models, evaluator.OLLAMA_MODEL)
    if not audit:
        pytest.skip(f"audit model {evaluator.OLLAMA_MODEL!r} not installed (set TRUSTNODE_MODEL)")
    if not _has(models, ingestion.OLLAMA_MODEL):
        pytest.skip(f"embedding model {ingestion.OLLAMA_MODEL!r} not installed")
    if not PDF.exists():
        pytest.skip("Datagraphic PDF fixture missing")
    if not node_available():
        pytest.skip("node not available (standards.ts is loaded through node)")
    print(f"\n[integration] audit model {audit} digest={models[audit][:12]} options={evaluator.OLLAMA_OPTIONS}")
    print(f"[integration] embedding model {ingestion.OLLAMA_MODEL} digest={models[_has(models, ingestion.OLLAMA_MODEL)][:12]}")


# ---------------------------------------------------------------------------
# Audit runner (temp Chroma, raw answers captured)
# ---------------------------------------------------------------------------

def _audit(pdf_bytes: bytes, name: str, doc_type: str = "isms_policy"):
    raw_log: list[dict] = []
    mp = pytest.MonkeyPatch()
    try:
        mp.setattr(ingestion, "CHROMA_PATH", tempfile.mkdtemp(prefix="tn_it_chroma_"))
        original = evaluator._call_ollama

        def spy(prompt: str) -> str:
            out = original(prompt)
            raw_log.append({"prompt_tail": prompt[-600:], "raw": out})
            return out

        mp.setattr(evaluator, "_call_ollama", spy)
        info = ingestion.ingest_pdf(pdf_bytes, name)
        assert info["chunks"] > 0, f"ingestion produced no chunks: {info}"
        req = AuditRequest(**load_standard("ISO 27001"), doc_type=doc_type)
        return evaluator.run_audit(req), raw_log
    finally:
        mp.undo()


def _dump(raw_log: list[dict]) -> str:
    return "\n--- RAW MODEL ANSWERS ---\n" + json.dumps(raw_log, ensure_ascii=False, indent=1)


@pytest.fixture(scope="module")
def real():
    return _audit(PDF.read_bytes(), PDF.name)


@pytest.fixture(scope="module")
def negative():
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_textbox(fitz.Rect(50, 50, 550, 400), NEGATIVE_TEXT, fontsize=11)
    data = doc.tobytes()
    doc.close()
    return _audit(data, "near_empty_policy.pdf")


# ---------------------------------------------------------------------------
# Tests on the real document
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("control_id", sorted(ACCEPTABLE))
def test_acceptable_state(real, request, control_id):
    resp, raw = real
    if control_id in KNOWN_MODEL_FAILURES:
        request.applymarker(pytest.mark.xfail(strict=True, reason=KNOWN_MODEL_FAILURES[control_id]))
    status = next(r.status for r in resp.results if r.control_id == control_id)
    assert status in ACCEPTABLE[control_id], f"{control_id}: {status} not in {ACCEPTABLE[control_id]}" + _dump(raw)


def test_no_multi_factor_anywhere(real):
    resp, raw = real
    blob = resp.model_dump_json().lower() + json.dumps(raw).lower()
    for term in ("multi-factor", "multifactor", "multi factor"):
        assert term not in blob.replace("\\u2011", "-"), f"{term!r} leaked into the output" + _dump(raw)
    assert not re.search(r"\bmfa\b", resp.model_dump_json().lower()), "MFA leaked into the output" + _dump(raw)


def _page_texts() -> dict[int, str]:
    import fitz

    with fitz.open(PDF) as doc:
        return {i: p.get_text("text") for i, p in enumerate(doc, start=1)}


def _compact(t: str) -> str:
    return re.sub(r"[\W_]+", "", t)


def test_every_citation_is_verbatim_on_its_own_page(real):
    """Independent of the pipeline's own verification: re-reads the PDF with PyMuPDF."""
    resp, raw = real
    pages = _page_texts()
    checked = 0
    for r in resp.results:
        cites = list(r.citations) + [c for ck in r.checks for c in ck.citations]
        for c in cites:
            checked += 1
            assert c.page in pages, f"{r.control_id}: citation page {c.page!r} does not exist" + _dump(raw)
            page_text = normalize_text(pages[c.page])
            q = normalize_text(c.quote)
            # Footnote markers are standalone 1-2 digit tokens in the PDF text layer that a
            # model may legitimately skip; tolerate only those, nothing fuzzier.
            no_fn = lambda t: re.sub(r"(?<![\w.])\d{1,2}(?![\w.])", " ", t)
            ok = (q in page_text or _compact(q) in _compact(page_text)
                  or _compact(no_fn(q)) in _compact(no_fn(page_text)))
            assert ok, f"{r.control_id}: quote not on page {c.page}: {c.quote!r}" + _dump(raw)
    assert checked > 0, "the audit produced no citations at all" + _dump(raw)


def test_evidence_found_only_contains_verified_quotes(real):
    resp, raw = real
    for r in resp.results:
        if r.citations:
            for c in r.citations:
                assert c.quote in r.evidence_found, r.control_id


# ---------------------------------------------------------------------------
# Negative fixture
# ---------------------------------------------------------------------------

def test_near_empty_policy_is_never_compliant(negative):
    resp, raw = negative
    for r in resp.results:
        if r.status == "not_evaluable":
            continue
        assert r.status != "Compliant", f"{r.control_id} Compliant on an empty policy" + _dump(raw)
        assert r.status != "Partial", f"{r.control_id} Partial on an empty policy" + _dump(raw)


def test_a_model_that_says_not_found_to_everything_is_detected(real, negative):
    """If the real policy does not score clearly above the empty one, the model/pipeline
    is not discriminating (e.g. always not_found, or always found)."""
    (r_resp, r_raw), (n_resp, n_raw) = real, negative
    assert r_resp.global_score_percentage is not None and n_resp.global_score_percentage is not None
    assert r_resp.global_score_percentage - n_resp.global_score_percentage >= 30, (
        f"real={r_resp.global_score_percentage} empty={n_resp.global_score_percentage}"
        + _dump(r_raw[:3] + n_raw[:3])
    )
