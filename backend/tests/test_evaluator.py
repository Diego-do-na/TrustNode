import json
import re
from pathlib import Path

import pytest

import evaluator
from evaluator import (
    LLMCitation,
    applicability,
    compute_score,
    normalize_text,
    parse_chunk_label,
    run_audit,
    verify_citations,
    verify_quote,
)
from schemas import AuditRequest

CHUNK = {
    "id": "doc_chunk0",
    "source": "policy.pdf",
    "page": 3,
    "relevance": 80.0,
    "text": "All access to systems is “role-based”. Passwords must be rotated every 90 days — no exceptions. "
            "Vulnerabilities are reviewed by the\nsecurity team and multi-\nfactor controls are out of scope.",
}


# ---------------- normalisation / verification ----------------

def test_normalize_handles_quotes_dashes_whitespace_case():
    assert normalize_text("  “Role-Based”\n  ACCESS —  ok ") == '"role-based" access - ok'


def test_normalize_joins_hyphenated_line_breaks():
    assert normalize_text("multi-\nfactor") == "multifactor"


def test_verify_exact_and_normalised():
    assert verify_quote('all access to systems is "role-based".', CHUNK["text"])
    assert verify_quote("Passwords must be rotated every 90 days - no exceptions", CHUNK["text"])
    assert verify_quote("reviewed by the security team", CHUNK["text"])


def test_verify_hyphen_break_variants():
    assert verify_quote("multi-factor controls", CHUNK["text"])


def test_verify_rejects_fabricated_quote():
    assert not verify_quote("Multi-factor authentication is mandatory for all users", CHUNK["text"])
    assert not verify_quote("", CHUNK["text"])


def test_verify_fuzzy_long_quote_only():
    near = "Passwords must be rotated every 90 days — no exception"  # tiny diff, long enough
    assert verify_quote(near.replace("exception", "exceptionz"), CHUNK["text"])
    assert not verify_quote("Passwords rotate yearly", CHUNK["text"])  # short + different


def test_parse_chunk_label():
    assert parse_chunk_label("E2") == 2
    assert parse_chunk_label("[e3]") == 3
    assert parse_chunk_label("7") is None  # a page number is not an id
    assert parse_chunk_label("") is None


def test_verify_citations_assigns_page_from_metadata_and_discards(caplog):
    cits = [
        LLMCitation(chunk_id="E1", quote="Passwords must be rotated every 90 days"),
        LLMCitation(chunk_id="E1", quote="MFA is required for administrators"),   # fabricated
        LLMCitation(chunk_id="7", quote="Passwords must be rotated"),            # page number as id
        LLMCitation(chunk_id="E5", quote="Passwords must be rotated"),            # unknown chunk
    ]
    with caplog.at_level("WARNING"):
        out = verify_citations(cits, [CHUNK], "X")
    assert len(out) == 1
    assert out[0].page == 3 and out[0].source == "policy.pdf" and out[0].chunk_id == "E1"
    assert sum("discarded citation" in r.message for r in caplog.records) == 3


# ---------------- applies_to ----------------

def test_applicability_rule():
    ctl = {"applies_to": ["topic_policy", "procedure"]}
    ok, reason = applicability(ctl, "isms_policy")
    assert not ok and reason == "El control aplica a topic_policy, procedure; el documento es isms_policy"
    assert applicability(ctl, "procedure") == (True, "")
    assert applicability({}, "soa") == (True, "")
    assert applicability({"applies_to": None}, "soa") == (True, "")


# ---------------- score ----------------

def test_score_weights_and_exclusion():
    assert compute_score(["Compliant", "Partial", "Non-Compliant", "not_evaluable"]) == (50.0, 3, 1)
    assert compute_score(["Compliant", "Compliant", "not_evaluable"]) == (100.0, 2, 1)
    assert compute_score(["Partial"]) == (50.0, 1, 0)


def test_score_none_when_nothing_evaluable():
    assert compute_score(["not_evaluable", "not_evaluable"]) == (None, 0, 2)
    assert compute_score([]) == (None, 0, 0)


# ---------------- evaluate_control flow (LLM mocked) ----------------

def _llm(*answers):
    calls = []
    it = iter(answers)

    def fake(prompt):
        calls.append(prompt)
        return json.dumps(next(it))
    return fake, calls


CONTROL = {"control_id": "A.5.1", "title": "t", "description": "Does it mention MFA?"}


def test_prompt_separates_requirement_and_numbers_fragments():
    msg = evaluator.build_user_message("ISO 27001", CONTROL, [CHUNK, dict(CHUNK, page=4)])
    assert msg.index("REQUISITO A VERIFICAR") < msg.index("Does it mention MFA?") < msg.index("FRAGMENTOS RECUPERADOS")
    assert "[E1] (source: policy.pdf, page: 3)" in msg and "[E2]" in msg
    assert "Does it mention MFA?" not in msg.split("FRAGMENTOS RECUPERADOS")[1]


def test_verified_compliant(monkeypatch):
    fake, calls = _llm({"status": "Compliant", "gaps": "None", "recommendation": "None",
                        "citations": [{"chunk_id": "E1", "quote": "Passwords must be rotated every 90 days"}]})
    monkeypatch.setattr(evaluator, "_call_ollama", fake)
    r = evaluator.evaluate_control("S", CONTROL, [CHUNK])
    assert r["status"] == "Compliant" and not r["evidence_unverified"] and len(calls) == 1
    assert "p. 3" in r["evidence_found"]


def test_unverifiable_then_retry_succeeds(monkeypatch):
    bad = {"status": "Compliant", "gaps": "None", "recommendation": "None",
           "citations": [{"chunk_id": "E1", "quote": "Does it mention MFA?"}]}
    good = {"status": "Partial", "gaps": "g", "recommendation": "r",
            "citations": [{"chunk_id": "E1", "quote": "role-based"}]}
    fake, calls = _llm(bad, good)
    monkeypatch.setattr(evaluator, "_call_ollama", fake)
    r = evaluator.evaluate_control("S", CONTROL, [CHUNK])
    assert r["status"] == "Partial" and len(calls) == 2 and "STRICT RETRY" in calls[1]


def test_unverifiable_twice_downgrades(monkeypatch):
    bad = {"status": "Compliant", "gaps": "None", "recommendation": "None",
           "citations": [{"chunk_id": "E1", "quote": "MFA is enforced everywhere"}]}
    fake, calls = _llm(bad, bad)
    monkeypatch.setattr(evaluator, "_call_ollama", fake)
    r = evaluator.evaluate_control("S", CONTROL, [CHUNK])
    assert r["status"] == "Non-Compliant" and r["evidence_unverified"] is True
    assert r["note"] == "sin evidencia verificable" and r["evidence_found"] == "None" and len(calls) == 2


# ---------------- run_audit + Datagraphic regression ----------------

STANDARDS_TS = Path(__file__).resolve().parents[2] / "frontend/src/data/standards.ts"
FIXTURE_PDF = Path(__file__).parent / "fixtures" / "datagraphic_policy.pdf"


def _ts_controls(wanted):
    """Read control_id/applies_to for the ISO 27001 block straight from standards.ts."""
    src = STANDARDS_TS.read_text(encoding="utf-8")
    block = src.split('"ISO 27001": {', 1)[1].split('"ISO 9001": {', 1)[0]
    out = []
    for m in re.finditer(r'control_id: "([^"]+)".*?applies_to: \[([^\]]*)\]', block, re.S):
        if m.group(1) in wanted:
            out.append({
                "control_id": m.group(1), "title": m.group(1), "description": "Question?",
                "search_keywords": ["x"],
                "applies_to": re.findall(r'"(\w+)"', m.group(2)),
            })
    return out


def _policy_chunks():
    if FIXTURE_PDF.exists():
        import ingestion
        recs = ingestion.extract_text_chunks_with_metadata(str(FIXTURE_PDF))
        return [{"id": f"c{r.chunk_idx}", "text": r.text, "page": r.page, "source": r.source, "relevance": 50.0}
                for r in recs[:3]]
    pytest.skip(f"fixture {FIXTURE_PDF} not present")


def test_regression_datagraphic_isms_policy(monkeypatch):
    chunks = _policy_chunks()
    controls = _ts_controls({"A.5.1", "A.8.5", "A.8.8"})
    assert {c["control_id"] for c in controls} == {"A.5.1", "A.8.5", "A.8.8"}
    quote = chunks[0]["text"][:80]

    def fake(prompt):
        return json.dumps({"status": "Compliant", "gaps": "None", "recommendation": "None",
                           "citations": [{"chunk_id": "E1", "quote": quote},
                                         {"chunk_id": "E1", "quote": "multi-factor authentication"}]})

    llm_calls = []
    monkeypatch.setattr(evaluator, "_call_ollama", lambda p: (llm_calls.append(p), fake(p))[1])
    monkeypatch.setattr(evaluator, "query_evidence", lambda kw: chunks)
    monkeypatch.setattr(evaluator, "get_collection_stats", lambda: {"documents": len(chunks)})

    req = AuditRequest(standard_name="ISO 27001", domain="d", controls=controls, doc_type="isms_policy")
    resp = run_audit(req)
    by_id = {r.control_id: r for r in resp.results}
    assert by_id["A.8.5"].status == "not_evaluable" and by_id["A.8.8"].status == "not_evaluable"
    assert by_id["A.5.1"].status == "Compliant"
    assert len(llm_calls) == 1  # LLM only called for the evaluable control
    for r in resp.results:
        assert "multi-factor" not in r.evidence_found.lower()
        assert all("multi-factor" not in c.quote.lower() for c in r.citations)
    assert resp.global_score_percentage == 100.0 and (resp.evaluated_count, resp.not_evaluable_count) == (1, 2)


def test_run_audit_all_not_evaluable_gives_null_score(monkeypatch):
    monkeypatch.setattr(evaluator, "_call_ollama", lambda p: pytest.fail("LLM must not be called"))
    monkeypatch.setattr(evaluator, "query_evidence", lambda kw: pytest.fail("no retrieval expected"))
    req = AuditRequest(standard_name="S", domain="d", doc_type="soa", controls=[
        {"control_id": "1", "title": "t", "description": "d", "search_keywords": [], "applies_to": ["procedure"]}])
    resp = run_audit(req)
    assert resp.global_score_percentage is None and resp.results[0].status == "not_evaluable"


def test_control_without_applies_to_always_evaluated(monkeypatch):
    """A control with no applies_to reaches retrieval + LLM whatever the doc_type."""
    seen = []
    monkeypatch.setattr(evaluator, "get_collection_stats", lambda: {"documents": 3})
    monkeypatch.setattr(evaluator, "query_evidence", lambda kw: seen.append(kw) or [CHUNK])
    fake, calls = _llm({"status": "Non-Compliant", "citations": [], "gaps": "g", "recommendation": "r"})
    monkeypatch.setattr(evaluator, "_call_ollama", fake)
    req = AuditRequest(standard_name="GDPR", domain="d", doc_type="soa", controls=[
        {"control_id": "1", "title": "t", "description": "d", "search_keywords": []}])
    resp = run_audit(req)
    assert resp.results[0].status == "Non-Compliant" and len(calls) == 1 and resp.doc_type == "soa"


# ---------------- empty collection = audit error, not a finding ----------------

def test_empty_collection_raises_before_any_llm_call(monkeypatch):
    monkeypatch.setattr(evaluator, "get_collection_stats", lambda: {"documents": 0, "available": True})
    monkeypatch.setattr(evaluator, "_call_ollama", lambda p: pytest.fail("LLM must not be called"))
    req = AuditRequest(standard_name="S", domain="d", controls=[
        {"control_id": "1", "title": "t", "description": "d", "search_keywords": []}])
    with pytest.raises(evaluator.EmptyEvidenceError, match="La ingesta no produjo fragmentos"):
        run_audit(req)


def test_empty_collection_ok_when_nothing_is_evaluable(monkeypatch):
    monkeypatch.setattr(evaluator, "get_collection_stats", lambda: {"documents": 0})
    req = AuditRequest(standard_name="S", domain="d", doc_type="soa", controls=[
        {"control_id": "1", "title": "t", "description": "d", "search_keywords": [], "applies_to": ["procedure"]}])
    assert run_audit(req).global_score_percentage is None


def test_evaluate_control_with_no_chunks_raises():
    with pytest.raises(evaluator.EmptyEvidenceError):
        evaluator.evaluate_control("S", CONTROL, [])


def test_audit_endpoint_returns_422_with_clear_message(monkeypatch):
    from fastapi.testclient import TestClient
    import main
    monkeypatch.setattr(evaluator, "get_collection_stats", lambda: {"documents": 0})
    monkeypatch.setattr(main, "run_audit", evaluator.run_audit)
    body = {"standard_name": "S", "domain": "d", "controls": [
        {"control_id": "1", "title": "t", "description": "d", "search_keywords": []}]}
    r = TestClient(main.app).post("/api/v1/audit", json=body)
    assert r.status_code == 422 and "La ingesta no produjo fragmentos" in r.text


# ---------------- Ollama options (single place) ----------------

def test_audit_call_sends_deterministic_options(monkeypatch):
    captured = {}

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {"response": "{}"}

    class FakeClient:
        def __init__(self, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def post(self, url, json): captured.update(json); return FakeResp()

    monkeypatch.setattr(evaluator.httpx, "Client", FakeClient)
    evaluator._call_ollama("p")
    assert captured["options"] == {"temperature": 0.0, "seed": 42, "num_ctx": 6144}
    assert captured["options"] is not evaluator.OLLAMA_OPTIONS


# ---------------- executive summary (9) ----------------

def test_summary_prompt_omits_not_evaluable_and_adds_count():
    findings = [
        {"control_id": "A.5.1", "status": "Partial", "risk_level": "Medium", "gaps": "g1", "recommendation": "r1"},
        {"control_id": "A.8.5", "status": "not_evaluable", "risk_level": "None", "gaps": "El control aplica a X", "recommendation": "None"},
        {"control_id": "A.8.8", "status": "not_evaluable", "risk_level": "None", "gaps": "El control aplica a X", "recommendation": "None"},
    ]
    p = evaluator.build_summary_prompt("ISO 27001", 50.0, findings, "Spanish")
    assert "A.5.1" in p and "A.8.5" not in p and "A.8.8" not in p
    assert "2 controles no evaluables para este tipo de documento" in p


def test_summary_prompt_no_count_line_when_all_evaluable_and_null_score():
    p = evaluator.build_summary_prompt("S", None, [{"control_id": "1", "status": "Compliant"}], "English")
    assert "no evaluables" not in p and "GLOBAL SCORE: N/A" in p
