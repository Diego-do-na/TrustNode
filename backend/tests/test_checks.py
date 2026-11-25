"""Unit tests for the atomic-checks flow (LLM and retrieval mocked)."""
import json
import re
from pathlib import Path

import pytest

import evaluator
from evaluator import apply_anchors, derive_status, parse_retrieval_mode
from schemas import AuditRequest, Citation

from standards_loader import load_standard, node_available

PDF = Path(__file__).parent / "fixtures" / "datagraphic_policy.pdf"

CHUNK_A = {"id": "d_chunk0", "source": "doc.pdf", "page": 2, "relevance": 70.0,
           "text": "We commit to continual improvement of the ISMS. Objectives are reviewed yearly."}
CHUNK_B = {"id": "d_chunk1", "source": "doc.pdf", "page": 3, "relevance": 60.0,
           "text": "The Safety Manager signs off the policy every January."}

CONTROL = {
    "control_id": "X.1", "title": "T", "description": "D", "search_keywords": ["k"],
    "checks": [
        {"id": "X.1.a", "question": "Is there a commitment to improvement?", "anchors": ["improv"],
         "recommendation": "Add an improvement commitment."},
        {"id": "X.1.b", "question": "Who signs off?", "recommendation": "Name the signatory."},
    ],
}


@pytest.fixture(autouse=True)
def _mode(monkeypatch):
    monkeypatch.setattr(evaluator, "CHECK_RETRIEVAL", "control_k5")
    monkeypatch.setattr(evaluator, "query_evidence", lambda kw, n_results=3: [CHUNK_A, CHUNK_B])


def _script(monkeypatch, answers):
    """answers: dict check_id -> list of responses (consumed in order)."""
    calls = []

    def fake(prompt):
        cid = prompt.split("CHECK ID: ")[1].split("\n")[0].strip()
        calls.append((cid, prompt))
        return json.dumps(answers[cid].pop(0))

    monkeypatch.setattr(evaluator, "_call_ollama", fake)
    return calls


def found(chunk, quote):
    return {"answer": "found", "citations": [{"chunk_id": chunk, "quote": quote}]}


NOT_FOUND = {"answer": "not_found", "citations": []}


def test_derive_status():
    assert derive_status([True, True]) == "Compliant"
    assert derive_status([True, False]) == "Partial"
    assert derive_status([False, False]) == "Non-Compliant"
    assert derive_status([]) == "Non-Compliant"


def test_parse_retrieval_mode():
    assert parse_retrieval_mode("control_k5") == ("control", 5)
    assert parse_retrieval_mode("per_check_k3") == ("per_check", 3)
    for bad in ("", "k5", "control_k0", "foo_k3"):
        with pytest.raises(ValueError):
            parse_retrieval_mode(bad)


def test_apply_anchors():
    cits = [Citation(chunk_id="E1", quote="commit to continual improvement"),
            Citation(chunk_id="E1", quote="Objectives are reviewed yearly")]
    assert [c.quote for c in apply_anchors(cits, ["IMPROV"])] == ["commit to continual improvement"]
    assert apply_anchors(cits, None) == cits


def test_all_found_is_compliant(monkeypatch):
    _script(monkeypatch, {"X.1.a": [found("E1", "commit to continual improvement of the ISMS")],
                          "X.1.b": [found("E2", "The Safety Manager signs off the policy")]})
    r = evaluator.evaluate_checked_control("S", CONTROL)
    assert r["status"] == "Compliant" and r["gaps"] == "None" and r["recommendation"] == "None"
    assert [c["found"] for c in r["checks"]] == [True, True]
    assert {c["page"] for c in r["citations"]} == {2, 3}   # pages come from chunk metadata


def test_some_found_is_partial_with_fixed_recommendation(monkeypatch):
    _script(monkeypatch, {"X.1.a": [found("E1", "continual improvement of the ISMS")], "X.1.b": [NOT_FOUND]})
    r = evaluator.evaluate_checked_control("S", CONTROL)
    assert r["status"] == "Partial"
    assert r["gaps"] == "No evidence found for: Who signs off?"
    assert r["recommendation"] == "Name the signatory."


def test_none_found_is_non_compliant(monkeypatch):
    _script(monkeypatch, {"X.1.a": [NOT_FOUND], "X.1.b": [NOT_FOUND]})
    r = evaluator.evaluate_checked_control("S", CONTROL)
    assert r["status"] == "Non-Compliant" and r["evidence_found"] == "None"
    assert r["recommendation"] == "Add an improvement commitment. Name the signatory."


def test_fabricated_quote_retried_then_unverified(monkeypatch):
    bad = found("E1", "Multi-factor authentication is enforced")
    calls = _script(monkeypatch, {"X.1.a": [bad, bad], "X.1.b": [NOT_FOUND]})
    r = evaluator.evaluate_checked_control("S", CONTROL)
    a = r["checks"][0]
    assert a["found"] is False and a["evidence_unverified"] is True
    assert r["evidence_unverified"] is True and "sin evidencia verificable" in r["note"]
    assert [c for c, _ in calls].count("X.1.a") == 2 and "STRICT RETRY" in calls[1][1]
    assert "multi-factor" not in r["evidence_found"].lower()


def test_retry_can_recover(monkeypatch):
    _script(monkeypatch, {"X.1.a": [found("E1", "made up"), found("E1", "continual improvement")],
                          "X.1.b": [NOT_FOUND]})
    r = evaluator.evaluate_checked_control("S", CONTROL)
    assert r["checks"][0]["found"] is True and r["checks"][0]["evidence_unverified"] is False


def test_anchor_violation_counts_as_unverified(monkeypatch):
    # quote exists in the chunk but lacks the required term "improv"
    ok_quote = found("E1", "Objectives are reviewed yearly")
    _script(monkeypatch, {"X.1.a": [ok_quote, ok_quote], "X.1.b": [NOT_FOUND]})
    r = evaluator.evaluate_checked_control("S", CONTROL)
    assert r["checks"][0]["found"] is False and r["checks"][0]["evidence_unverified"] is True


def test_page_number_as_chunk_id_is_discarded(monkeypatch):
    _script(monkeypatch, {"X.1.a": [found("2", "continual improvement")] * 2, "X.1.b": [NOT_FOUND]})
    assert evaluator.evaluate_checked_control("S", CONTROL)["checks"][0]["found"] is False


def test_answer_case_is_normalised(monkeypatch):
    _script(monkeypatch, {"X.1.a": [{"answer": "Not Found", "citations": []}], "X.1.b": [{"answer": "NOT_FOUND"}]})
    assert evaluator.evaluate_checked_control("S", CONTROL)["status"] == "Non-Compliant"


def test_prompt_separates_condition_from_fragments_and_hides_description():
    ctl = dict(CONTROL, description="SECRET-DESCRIPTION")
    chk = dict(ctl["checks"][0], hint="Count: something")
    msg = evaluator.build_check_message("S", ctl, chk, [CHUNK_A, CHUNK_B])
    assert msg.index("FRAGMENTOS RECUPERADOS") < msg.index("CONDICIÓN A VERIFICAR")
    assert "SECRET-DESCRIPTION" not in msg and "[E2]" in msg and "HINT" in msg
    cond = msg.split("CONDICIÓN A VERIFICAR")[1]
    assert chk["question"] in cond and chk["question"] not in msg.split("CONDICIÓN A VERIFICAR")[0]


def test_per_check_retrieval_uses_the_question(monkeypatch):
    monkeypatch.setattr(evaluator, "CHECK_RETRIEVAL", "per_check_k3")
    seen = []
    monkeypatch.setattr(evaluator, "query_evidence", lambda kw, n_results=3: seen.append((tuple(kw), n_results)) or [CHUNK_A])
    _script(monkeypatch, {"X.1.a": [NOT_FOUND], "X.1.b": [NOT_FOUND]})
    evaluator.evaluate_checked_control("S", CONTROL)
    assert seen == [(("Is there a commitment to improvement?",), 3), (("Who signs off?",), 3)]


def test_control_retrieval_is_shared_once(monkeypatch):
    seen = []
    monkeypatch.setattr(evaluator, "query_evidence", lambda kw, n_results=3: seen.append((tuple(kw), n_results)) or [CHUNK_A])
    _script(monkeypatch, {"X.1.a": [NOT_FOUND], "X.1.b": [NOT_FOUND]})
    evaluator.evaluate_checked_control("S", CONTROL)
    assert seen == [(("k",), 5)]


def test_empty_retrieval_is_an_audit_error(monkeypatch):
    monkeypatch.setattr(evaluator, "query_evidence", lambda kw, n_results=3: [])
    with pytest.raises(evaluator.EmptyEvidenceError):
        evaluator.evaluate_checked_control("S", CONTROL)


def test_run_audit_mixes_checked_and_legacy_controls(monkeypatch):
    monkeypatch.setattr(evaluator, "get_collection_stats", lambda: {"documents": 2})
    _script(monkeypatch, {"X.1.a": [found("E1", "continual improvement")], "X.1.b": [NOT_FOUND]})
    legacy = {"status": "Compliant", "gaps": "None", "recommendation": "None",
              "citations": [{"chunk_id": "E1", "quote": "continual improvement"}]}
    real = evaluator._call_ollama
    monkeypatch.setattr(evaluator, "_call_ollama",
                        lambda p: json.dumps(legacy) if "CHECK ID:" not in p else real(p))
    req = AuditRequest(standard_name="S", domain="d", controls=[
        CONTROL, {"control_id": "L.1", "title": "t", "description": "d", "search_keywords": ["k"]}])
    resp = evaluator.run_audit(req)
    by = {r.control_id: r for r in resp.results}
    assert by["X.1"].status == "Partial" and len(by["X.1"].checks) == 2
    assert by["L.1"].status == "Compliant" and by["L.1"].checks == []
    assert resp.global_score_percentage == 75.0


STAGE1 = {
    "5.2": ["5.2.a", "5.2.b", "5.2.c", "5.2.d"],
    "6.2": ["6.2.a", "6.2.b", "6.2.c"],
    "4.3": ["4.3.a", "4.3.b", "4.3.c", "4.3.d"],
}
STAGE2 = ["A.5.1", "A.5.2", "A.5.15", "A.5.24", "A.5.29", "A.5.31", "A.6.3", "A.6.8", "A.8.5", "A.8.8"]


@pytest.mark.skipif(not node_available(), reason="node not available")
def test_iso27001_every_control_defines_checks():
    std = load_standard("ISO 27001")
    with_checks = {c["control_id"]: [k["id"] for k in c["checks"]] for c in std["controls"] if c.get("checks")}
    assert set(with_checks) == set(STAGE1) | set(STAGE2)
    for cid, ids in STAGE1.items():
        assert with_checks[cid] == ids  # stage-1 checks must not change silently


@pytest.mark.skipif(not node_available(), reason="node not available")
def test_checks_are_well_formed():
    std = load_standard("ISO 27001")
    for c in std["controls"]:
        stage2 = c["control_id"] in STAGE2  # stage-1 checks are frozen (already reviewed)
        ids = [k["id"] for k in c.get("checks", [])]
        assert len(ids) == len(set(ids)), c["control_id"]
        for k in c.get("checks", []):
            where = f'{c["control_id"]}/{k["id"]}'
            assert k["id"].startswith(c["control_id"] + "."), where
            assert k["question"].strip().endswith("?"), where
            assert k.get("hint", "").startswith("Count:"), where          # positive hint
            assert k.get("recommendation", "").strip(), where              # fixed text, human-reviewed
            if stage2:
                assert not re.search(r"\b(and|or)\b.*\b(and|or)\b", k["question"]), f"{where}: looks like >1 condition"
            for a in k.get("anchors") or []:
                assert a.strip() and a == a.lower(), where


@pytest.mark.skipif(not (node_available() and PDF.exists()), reason="node or PDF fixture missing")
def test_checks_do_not_copy_phrases_from_the_datagraphic_pdf():
    """Hints/questions must be written from the standard, not from the test document."""
    import fitz

    def words(t):
        return re.findall(r"[a-z0-9]+", t.lower())

    with fitz.open(PDF) as doc:
        pdf_words = words(" ".join(p.get_text() for p in doc))
    shingles = {tuple(pdf_words[i:i + 6]) for i in range(len(pdf_words) - 5)}
    std = load_standard("ISO 27001")
    for c in std["controls"]:
        if c["control_id"] not in STAGE2:  # stage 1 legitimately shares ISO wording with the PDF
            continue
        for k in c.get("checks", []):
            for field in ("question", "hint", "recommendation"):
                w = words(k.get(field, ""))
                hits = [tuple(w[i:i + 6]) for i in range(len(w) - 5) if tuple(w[i:i + 6]) in shingles]
                assert not hits, f'{c["control_id"]}/{k["id"]}.{field} copies the PDF: {hits[:1]}'


# ---------------------------------------------------------------------------
# Second-pass judge (TRUSTNODE_VERIFY=judge)
# ---------------------------------------------------------------------------

def test_judge_confirms_keeps_the_check(monkeypatch):
    monkeypatch.setattr(evaluator, "VERIFY_MODE", "judge")
    calls = _script(monkeypatch, {
        "X.1.a": [found("E1", "We commit to continual improvement of the ISMS."), {"verdict": "yes"}],
        "X.1.b": [found("E2", "The Safety Manager signs off the policy every January."), {"verdict": "YES"}],
    })
    out = evaluator.evaluate_checked_control("S", CONTROL)
    assert out["status"] == "Compliant"
    judge_prompts = [p for _, p in calls if p.startswith(evaluator.JUDGE_SYSTEM_PROMPT)]
    assert len(judge_prompts) == 2
    # the judge sees only the quote and the condition, never the fragments
    assert all("FRAGMENTOS" not in p and "PASSAGE:" in p for p in judge_prompts)


def test_judge_rejection_turns_found_into_missing(monkeypatch):
    monkeypatch.setattr(evaluator, "VERIFY_MODE", "judge")
    _script(monkeypatch, {
        "X.1.a": [found("E1", "We commit to continual improvement of the ISMS."), {"verdict": "yes"}],
        "X.1.b": [found("E2", "The Safety Manager signs off the policy every January."), {"verdict": "no"}],
    })
    out = evaluator.evaluate_checked_control("S", CONTROL)
    assert out["status"] == "Partial"
    b = next(c for c in out["checks"] if c["check_id"] == "X.1.b")
    assert b["found"] is False and b["judge_rejected"] is True and b["citations"] == []
    assert "verificador rechazó" in out["note"]
    assert out["recommendation"] == "Name the signatory."


def test_judge_failure_counts_as_rejection(monkeypatch):
    monkeypatch.setattr(evaluator, "VERIFY_MODE", "judge")
    _script(monkeypatch, {
        "X.1.a": [found("E1", "We commit to continual improvement of the ISMS."), "not json", "still not json"],
        "X.1.b": [NOT_FOUND],
    })
    # _script json.dumps answers; raw strings become JSON strings -> validation fails twice
    out = evaluator.evaluate_checked_control("S", CONTROL)
    assert out["status"] == "Non-Compliant"


def test_judge_not_called_for_not_found_or_when_disabled(monkeypatch):
    monkeypatch.setattr(evaluator, "VERIFY_MODE", "judge")
    calls = _script(monkeypatch, {"X.1.a": [NOT_FOUND], "X.1.b": [NOT_FOUND]})
    evaluator.evaluate_checked_control("S", CONTROL)
    assert len(calls) == 2

    monkeypatch.setattr(evaluator, "VERIFY_MODE", "none")
    calls = _script(monkeypatch, {
        "X.1.a": [found("E1", "We commit to continual improvement of the ISMS.")],
        "X.1.b": [found("E2", "The Safety Manager signs off the policy every January.")],
    })
    assert evaluator.evaluate_checked_control("S", CONTROL)["status"] == "Compliant"
    assert len(calls) == 2


def test_judge_prompt_is_the_probe_variant_a_text():
    """The judge must stay the pre-registered probe prompt (no tuning against results)."""
    src = (Path(__file__).parent / "tools" / "judge_probe.py").read_text(encoding="utf-8")
    assert evaluator.JUDGE_SYSTEM_PROMPT in src
