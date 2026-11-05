"""Replay of a REAL audit of the Datagraphic policy (ISO 27001, isms_policy).

tests/fixtures/datagraphic_cassette.json holds the raw LLM answers and the retrieved
chunks of one real run. Replaying them exercises the whole pipeline (applies_to, check
flow, citation verification, status derivation, score) deterministically and offline.
It does NOT measure the model; for that regenerate the cassette with
tests/record_cassette.py (needs Ollama) and compare.

A stale cassette (prompt or standard changed) FAILS loudly instead of passing silently.
"""
import hashlib
import json
import re
from pathlib import Path

import pytest

import evaluator
from schemas import AuditRequest
from standards_loader import load_standard, node_available

FIX = Path(__file__).parent / "fixtures"
CASSETTE = FIX / "datagraphic_cassette.json"
PDF = FIX / "datagraphic_policy.pdf"

pytestmark = pytest.mark.skipif(
    not (CASSETTE.exists() and node_available()), reason="cassette or node missing"
)

# Acceptable states for the Datagraphic policy audited as isms_policy.
ACCEPTABLE = {
    "5.2": {"Compliant"}, "A.5.2": {"Compliant"}, "A.5.29": {"Compliant"},
    "A.5.31": {"Compliant"}, "A.6.3": {"Compliant"},
    "6.2": {"Partial"}, "4.3": {"Partial"},
    "A.5.1": {"Compliant", "Partial"}, "A.6.8": {"Compliant", "Partial"},
    "A.5.15": {"not_evaluable"}, "A.5.24": {"not_evaluable"},
    "A.8.5": {"not_evaluable"}, "A.8.8": {"not_evaluable"},
}
# Known model-quality failures on the recorded run (the pipeline is right, the 8B model
# over-accepts). strict=True: when a better prompt/model fixes it, the XPASS forces us to
# delete the marker.
KNOWN_MODEL_FAILURES = {
    "6.2": "llama3.1 8B answers 'found' for the measurability and ownership checks "
           "with quotes that do not satisfy the condition",
}


@pytest.fixture(scope="module")
def cassette():
    return json.loads(CASSETTE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def replayed(cassette):
    """Run the real pipeline with the recorded retrieval and LLM answers."""
    mp = pytest.MonkeyPatch()
    try:
        retrieval = {json.dumps([r["keywords"], r["n_results"]]): r["chunks"] for r in cassette["retrieval"]}
        queues: dict[tuple, list] = {}
        for e in cassette["llm"]:
            queues.setdefault((e["control_id"], e["check_id"]), []).append(e)

        def query(keywords, n_results=3):
            return retrieval[json.dumps([list(keywords), n_results])]

        def call(prompt):
            cid = re.search(r"CONTROL ID: (\S+)", prompt).group(1)
            m = re.search(r"CHECK ID: (\S+)", prompt)
            entry = queues[(cid, m.group(1) if m else None)].pop(0)
            if hashlib.sha256(prompt.encode()).hexdigest() != entry["prompt_sha256"]:
                pytest.fail(
                    f"Cassette is stale for {cid}/{m.group(1) if m else '-'}: the prompt changed. "
                    "Regenerate with backend/tests/record_cassette.py and review the diff."
                )
            return entry["raw"]

        mp.setattr(evaluator, "query_evidence", query)
        mp.setattr(evaluator, "_call_ollama", call)
        mp.setattr(evaluator, "get_collection_stats", lambda: {"documents": 6})
        mp.setattr(evaluator, "CHECK_RETRIEVAL", cassette["meta"]["retrieval_mode"])
        req = AuditRequest(**load_standard(cassette["meta"]["standard"]), doc_type=cassette["meta"]["doc_type"])
        resp = evaluator.run_audit(req)
        leftovers = {k: len(v) for k, v in queues.items() if v}
        assert not leftovers, f"recorded LLM answers never consumed: {leftovers}"
        return resp
    finally:
        mp.undo()


@pytest.mark.parametrize("control_id", sorted(ACCEPTABLE))
def test_acceptable_state(replayed, control_id, request):
    if control_id in KNOWN_MODEL_FAILURES:
        request.applymarker(pytest.mark.xfail(strict=True, reason=KNOWN_MODEL_FAILURES[control_id]))
    status = next(r.status for r in replayed.results if r.control_id == control_id)
    assert status in ACCEPTABLE[control_id], f"{control_id}: {status} not in {ACCEPTABLE[control_id]}"


def test_replay_reproduces_the_recorded_result(replayed, cassette):
    recorded = cassette["result"]
    assert [(r.control_id, r.status) for r in replayed.results] == [
        (r["control_id"], r["status"]) for r in recorded["results"]
    ]
    assert replayed.global_score_percentage == recorded["global_score_percentage"]
    assert (replayed.evaluated_count, replayed.not_evaluable_count) == (
        recorded["evaluated_count"], recorded["not_evaluable_count"])


def test_not_evaluable_controls_never_reach_the_llm(cassette):
    called = {e["control_id"] for e in cassette["llm"]}
    assert not called & {"A.5.15", "A.5.24", "A.8.5", "A.8.8"}


def test_no_multi_factor_anywhere(replayed):
    blob = json.dumps(replayed.model_dump()).lower()
    assert "multi-factor" not in blob and "multifactor" not in blob


def test_status_of_checked_controls_is_derived_from_checks(replayed):
    for r in replayed.results:
        if r.checks:
            assert r.status == evaluator.derive_status([c.found for c in r.checks])
            assert all(c.found == bool(c.citations) for c in r.checks)


@pytest.mark.skipif(not PDF.exists(), reason="pdf missing")
def test_every_citation_is_on_the_page_it_claims(replayed):
    """Independent of the chunk metadata: re-read each cited page from the PDF itself."""
    import fitz

    with fitz.open(PDF) as doc:
        pages = {i + 1: doc[i].get_text("text") for i in range(len(doc))}
    seen = 0
    for r in replayed.results:
        for c in r.citations:
            seen += 1
            assert c.page in pages, (r.control_id, c)
            assert evaluator.verify_quote(c.quote, pages[c.page]), (r.control_id, c.page, c.quote)
    assert seen > 0
