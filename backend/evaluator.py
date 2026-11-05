"""
evaluator.py — TrustNode AI inference layer.

Compliance engine: fully agnostic to any normative standard. All domain
knowledge arrives via the `control` dict (the "cartridge") parsed upstream
by main.py from /standards/*.json files. This module only knows how to
read the cartridge and call Ollama.

Imported by main.py:
    from evaluator import evaluate_control
"""

from __future__ import annotations

import difflib
import json
import logging
import os
import re
import unicodedata
from typing import Literal

import httpx
from pydantic import BaseModel, Field, ValidationError, field_validator

from schemas import (
    AuditRequest,
    AuditResponse,
    AuditResult as SchemaAuditResult,
    Citation,
    CheckResult,
)
from ingestion import get_collection_stats, query_evidence

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants.
# ---------------------------------------------------------------------------

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.1"
OLLAMA_TIMEOUT = 120  # seconds

# Single place to tune audit inference. Deterministic by default; override with
# TRUSTNODE_NUM_CTX / TRUSTNODE_SEED / TRUSTNODE_TEMPERATURE. Only audit calls use it
# (the executive summary keeps Ollama defaults).
OLLAMA_OPTIONS: dict = {
    "temperature": float(os.environ.get("TRUSTNODE_TEMPERATURE", "0")),
    "seed": int(os.environ.get("TRUSTNODE_SEED", "42")),
    "num_ctx": int(os.environ.get("TRUSTNODE_NUM_CTX", "6144")),
}


# Retrieval strategy for controls that define `checks`:
#   "control_k<N>"   one retrieval per control (control keywords), top N chunks shared by all its checks
#   "per_check_k<N>" one retrieval per check, using the check question as the query, top N chunks
CHECK_RETRIEVAL = os.environ.get("TRUSTNODE_CHECK_RETRIEVAL", "per_check_k3")


class EmptyEvidenceError(RuntimeError):
    """Ingestion produced no chunks, so no audit can be run."""

    def __init__(self) -> None:
        super().__init__("La ingesta no produjo fragmentos: no hay texto indexado para auditar.")

AUDIT_SYSTEM_PROMPT = """
You are a Senior Normative Auditor with over 20 years of experience at a Big 4 consulting
firm, specialising in regulatory compliance, internal controls, and corporate governance
frameworks.

Your task is to decide whether the RETRIEVED FRAGMENTS taken from a company document
satisfy the REQUISITO A VERIFICAR (the requirement to verify) of one control.

The user message has two clearly separated sections:
  * REQUISITO A VERIFICAR — the question/requirement. It is NOT evidence.
  * FRAGMENTOS RECUPERADOS — numbered fragments [E1], [E2], ... with their page. This is
    the ONLY admissible evidence.

CRITICAL RULES — follow without exception:
1. Base your analysis EXCLUSIVELY on the text of the numbered fragments. Do NOT infer,
   assume, extrapolate, or use external knowledge.
2. Evaluate SEMANTICALLY and FLEXIBLY: synonyms and reasonable variations count (e.g.
   'portal' instead of 'system'). Do not demand identical wording.
3. EVIDENCE MUST BE LITERAL: every entry in "citations" must be an exact, contiguous copy
   of text found in the fragment you name. Do not paraphrase, summarise, translate, or
   stitch pieces together inside one quote.
4. Return the fragment id (e.g. "E2") in "chunk_id" — NEVER a page number.
5. NEVER quote, copy, or paraphrase the REQUISITO A VERIFICAR as evidence. If a term (for
   example "MFA") appears only in the requirement and not in a fragment, it is NOT evidence.
6. If no fragment supports the control, return "citations": [] and status "Non-Compliant".
7. "Compliant" only when the cited fragments show that every aspect of the requirement is
   satisfied; "Partial" when only some aspects are; otherwise "Non-Compliant". When in
   doubt, rate down. "Compliant" and "Partial" REQUIRE at least one citation.
8. "gaps" and "recommendation" must be grounded in the fragments and the requirement; never
   invent content.
9. Respond with a single valid JSON object and NOTHING ELSE (no preamble, no markdown
   fences). It must begin with '{' and end with '}'.

OUTPUT SCHEMA (strict — all four keys, no extras):
{
  "status": "Compliant" | "Non-Compliant" | "Partial",
  "citations": [ {"chunk_id": "E1", "quote": "<exact text copied from fragment E1>"} ],
  "gaps": "<what the requirement asks that the fragments do not show. 'None' if fully satisfied.>",
  "recommendation": "<one concrete remediation step. 'None' if fully satisfied.>"
}
""".strip()

CHECK_SYSTEM_PROMPT = """
You verify ONE narrow condition against numbered fragments of a company document.
You do not judge the whole control and you do not decide compliance.

The user message has clearly separated sections:
  * FRAGMENTOS RECUPERADOS — numbered fragments [E1], [E2], ... with their page. This is
    the ONLY admissible evidence.
  * CONDICIÓN A VERIFICAR — the condition to check, plus an optional HINT that clarifies
    what counts. Neither the condition nor the HINT is evidence.

RULES — follow without exception:
1. Answer "found" only if a fragment EXPLICITLY states what the condition asks for.
2. Being on the same topic is not enough. If a fragment is more general, weaker, or about
   something else than the condition, answer "not_found". Examples from other domains:
   - Condition: "Does the document state a retention period for personal data?"
     Fragment: "Personal data is kept only as long as necessary."  -> "not_found"
     (a general principle, no period is stated)
   - Condition: "Does the document name who investigates workplace accidents?"
     Fragment: "Every workplace accident is investigated."  -> "not_found"
     (nobody is named)
   - Condition: "Does the document name who investigates workplace accidents?"
     Fragment: "The Health and Safety Manager investigates every workplace accident."
     -> "found"
3. A paraphrase with the same meaning is acceptable; an inference or implication is not.
4. Each quote must be an exact, contiguous copy (at most two sentences) of text in the
   fragment you name. Give the fragment id (E1, E2, ...) in "chunk_id", NEVER a page number.
5. Never quote the condition or the HINT.
6. If you are unsure, answer "not_found".
7. Respond with a single valid JSON object and NOTHING ELSE (no preamble, no markdown):
   {"answer": "found" | "not_found", "citations": [{"chunk_id": "E2", "quote": "<exact text>"}]}
   When the answer is "not_found", "citations" must be [].
""".strip()

STRICT_CHECK_RETRY_NOTICE = (
    "STRICT RETRY: your previous answer said \"found\" but no quote could be found verbatim "
    "(and, where applicable, containing the required term) in the fragment you cited. Either "
    "copy a short, exact, contiguous passage from a numbered fragment and give its id, or "
    "answer \"not_found\" with \"citations\": []. Never quote the condition or the HINT."
)

STRICT_RETRY_NOTICE = (
    "STRICT RETRY: your previous answer contained no quote that could be found verbatim in "
    "the fragment you cited. Either (a) copy a short, exact, contiguous passage from a "
    "numbered fragment and give its id in chunk_id, or (b) answer status \"Non-Compliant\" "
    "with \"citations\": []. Never quote the REQUISITO A VERIFICAR."
)

FUZZY_THRESHOLD = 0.9
FUZZY_MIN_QUOTE_LEN = 25  # shorter quotes must match exactly

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class LLMCitation(BaseModel):
    chunk_id: str
    quote: str


class LLMCheckAnswer(BaseModel):
    """Raw (unverified) LLM answer for one check."""

    answer: Literal["found", "not_found"]
    citations: list[LLMCitation] = Field(default_factory=list)

    @field_validator("answer", mode="before")
    @classmethod
    def _norm_answer(cls, v):
        return str(v).strip().lower().replace(" ", "_").replace("-", "_") if v is not None else v


class AuditResult(BaseModel):
    """Raw (unverified) LLM answer."""

    status: Literal["Compliant", "Non-Compliant", "Partial"]
    citations: list[LLMCitation] = Field(default_factory=list)
    gaps: str = "None"
    recommendation: str = "None"


# ---------------------------------------------------------------------------
# Deterministic helpers (pure functions — unit tested)
# ---------------------------------------------------------------------------

_QUOTE_MAP = str.maketrans({
    "‘": "'", "’": "'", "‚": "'", "‛": "'", "´": "'", "`": "'",
    "“": '"', "”": '"', "„": '"', "«": '"', "»": '"',
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-",
})


def normalize_text(text: str | None) -> str:
    """Normalise text for citation matching.

    Unicode NFKC, soft hyphens removed, hyphenated line breaks joined, typographic
    quotes/dashes mapped to ASCII, whitespace/newlines collapsed, lower-cased.
    """
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", text)
    t = t.replace("­", "")
    t = t.translate(_QUOTE_MAP)
    t = re.sub(r"(?<=\w)-[ \t]*\r?\n[ \t]*(?=\w)", "", t)  # "multi-\nfactor" -> "multifactor"
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t


def _compact(text: str) -> str:
    return re.sub(r"[\W_]+", "", text)


def _fuzzy_contains(needle: str, haystack: str, threshold: float = FUZZY_THRESHOLD) -> bool:
    n = len(needle)
    if n == 0 or len(haystack) < n * 0.8:
        return False
    step = max(1, n // 10)
    for width in (n, int(n * 0.9) or 1, int(n * 1.1)):
        for start in range(0, max(1, len(haystack) - width + 1), step):
            window = haystack[start:start + width]
            sm = difflib.SequenceMatcher(None, needle, window, autojunk=False)
            if sm.real_quick_ratio() < threshold or sm.quick_ratio() < threshold:
                continue
            if sm.ratio() >= threshold:
                return True
    return False


def verify_quote(quote: str, chunk_text: str) -> bool:
    """True if *quote* is (after normalisation) a substring of *chunk_text*.

    Falls back to a punctuation/space-insensitive comparison and, only for quotes of
    at least FUZZY_MIN_QUOTE_LEN characters, to a fuzzy match >= FUZZY_THRESHOLD.
    """
    nq = normalize_text(quote)
    nc = normalize_text(chunk_text)
    if not nq or not nc:
        return False
    if nq in nc:
        return True
    cq = _compact(nq)
    if cq and cq in _compact(nc):
        return True
    if len(nq) >= FUZZY_MIN_QUOTE_LEN:
        return _fuzzy_contains(nq, nc)
    return False


def parse_chunk_label(raw: str | None) -> int | None:
    """'E2', '[E2]', 'e2' -> 2; anything else (e.g. a page number) -> None."""
    m = re.fullmatch(r"\s*\[?\s*[Ee]\s*(\d+)\s*\]?\s*", raw or "")
    return int(m.group(1)) if m else None


def verify_citations(
    citations: list[LLMCitation],
    chunks: list[dict],
    control_id: str = "?",
) -> list[Citation]:
    """Keep only citations whose quote is verbatim in the cited chunk.

    The page/source come from the chunk metadata, never from the LLM. Every
    discarded citation is logged.
    """
    verified: list[Citation] = []
    for c in citations:
        idx = parse_chunk_label(c.chunk_id)
        if idx is None or not (1 <= idx <= len(chunks)):
            logger.warning(
                "verify_citations[%s]: discarded citation — unknown chunk_id %r (quote=%.80r)",
                control_id, c.chunk_id, c.quote,
            )
            continue
        chunk = chunks[idx - 1]
        if not verify_quote(c.quote, chunk["text"]):
            logger.warning(
                "verify_citations[%s]: discarded citation — quote not found in E%d (quote=%.80r)",
                control_id, idx, c.quote,
            )
            continue
        page = chunk.get("page")
        verified.append(Citation(
            chunk_id=f"E{idx}",
            source=str(chunk.get("source", "")),
            page=page if isinstance(page, int) else None,
            quote=c.quote.strip(),
        ))
    return verified


def format_evidence(citations: list[Citation]) -> str:
    if not citations:
        return "None"
    parts = []
    for c in citations:
        loc = ", ".join(x for x in (c.source, f"p. {c.page}" if c.page is not None else "") if x)
        parts.append(f"\"{c.quote}\"" + (f" ({loc})" if loc else ""))
    return " | ".join(parts)


def applicability(control: dict, doc_type: str) -> tuple[bool, str]:
    """Whether *control* can be assessed against a document of type *doc_type*.

    A control without ``applies_to`` (None or empty) always applies.
    """
    applies_to = control.get("applies_to")
    if not applies_to or doc_type in applies_to:
        return True, ""
    return False, f"El control aplica a {', '.join(applies_to)}; el documento es {doc_type}"


_SCORE_WEIGHTS: dict[str, float] = {"Compliant": 1.0, "Partial": 0.5, "Non-Compliant": 0.0}


def compute_score(statuses: list[str]) -> tuple[float | None, int, int]:
    """Return (score 0–100 | None, evaluated_count, not_evaluable_count).

    compliant=1, partial=0.5, non-compliant=0, averaged over evaluable controls.
    ``not_evaluable`` is excluded; with no evaluable control the score is None.
    """
    not_eval = sum(1 for s in statuses if s == "not_evaluable")
    weights = [_SCORE_WEIGHTS.get(s, 0.0) for s in statuses if s != "not_evaluable"]
    if not weights:
        return None, 0, not_eval
    return round(sum(weights) / len(weights) * 100, 1), len(weights), not_eval


def build_user_message(standard_name: str, control: dict, chunks: list[dict]) -> str:
    fragments = "\n\n".join(
        f"[E{i}] (source: {c.get('source', 'unknown')}, page: {c.get('page', '?')})\n{c['text']}"
        for i, c in enumerate(chunks, start=1)
    )
    return (
        f"STANDARD: {standard_name}\n"
        f"CONTROL ID: {control['control_id']}\n"
        f"CONTROL TITLE: {control['title']}\n\n"
        "=== REQUISITO A VERIFICAR (this is NOT evidence; never quote it) ===\n"
        f"{control['description']}\n\n"
        "=== FRAGMENTOS RECUPERADOS (the only admissible evidence) ===\n"
        f"{fragments}\n\n"
        "Evaluate using ONLY the fragments above. Quote literally and cite by fragment id "
        "(E1, E2, ...). Respond in JSON."
    )


# ---------------------------------------------------------------------------
# Fallback returned when inference fails after one retry
# ---------------------------------------------------------------------------

def _fallback() -> dict:
    return {
        "status": "Non-Compliant",
        "evidence_found": "None",
        "citations": [],
        "gaps": "Internal error during LLM inference or response parsing.",
        "recommendation": "Check Ollama service status and model availability.",
        "evidence_unverified": False,
        "note": "",
        "_error": True,
    }

# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------


def _call_ollama(prompt: str) -> str:
    """Single Ollama call returning the raw model text (patched in tests)."""
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": dict(OLLAMA_OPTIONS),
    }
    with httpx.Client(timeout=OLLAMA_TIMEOUT) as client:
        response = client.post(OLLAMA_URL, json=payload)
        response.raise_for_status()
    return response.json()["response"]


def _ask_llm(
    user_message: str,
    control_id: str,
    system_prompt: str = AUDIT_SYSTEM_PROMPT,
    model: type[BaseModel] = AuditResult,
):
    """Call the LLM and parse its answer, retrying once on transport/parse errors."""
    full_prompt = f"{system_prompt}\n\n{user_message}"
    for attempt in (1, 2):
        try:
            return model.model_validate(json.loads(_call_ollama(full_prompt)))
        except (httpx.HTTPError, json.JSONDecodeError, ValidationError, KeyError) as exc:
            logger.warning(
                "evaluate_control: attempt %d failed [%s %s]%s",
                attempt, control_id, type(exc).__name__,
                " — retrying" if attempt == 1 else " — returning fallback",
            )
    return None


def evaluate_control(
    standard_name: str,
    control: dict,
    chunks: list[dict],
) -> dict:
    """Evaluate a normative control against structured evidence chunks.

    Args:
        standard_name: Name of the audited standard.
        control:       Control dict ("control_id", "title", "description", ...).
        chunks:        Chunks from ``ingestion.query_evidence`` (id, text, page,
                       source, relevance). Labelled E1, E2... in the prompt in order.

    Returns:
        Dict with ``status``, ``evidence_found`` (verified quotes only),
        ``citations``, ``gaps``, ``recommendation``, ``evidence_unverified`` and
        ``note``. Pages come from chunk metadata. On unrecoverable failure
        ``_error: True`` is added and status is "Non-Compliant".
    """
    cid = control.get("control_id", "unknown")

    if not chunks:
        # An empty collection is an audit error, not a finding (run_audit checks first).
        raise EmptyEvidenceError()

    user_message = build_user_message(standard_name, control, chunks)
    raw = _ask_llm(user_message, cid)
    if raw is None:
        return _fallback()
    verified = verify_citations(raw.citations, chunks, cid)

    unverified = False
    note = ""
    if raw.status in ("Compliant", "Partial") and not verified:
        logger.warning("evaluate_control[%s]: %s without verifiable citations — strict retry", cid, raw.status)
        raw2 = _ask_llm(f"{user_message}\n\n{STRICT_RETRY_NOTICE}", cid)
        if raw2 is not None:
            raw = raw2
            verified = verify_citations(raw.citations, chunks, cid)
        if raw.status in ("Compliant", "Partial") and not verified:
            logger.warning("evaluate_control[%s]: still no verifiable evidence — downgraded to Non-Compliant", cid)
            raw = AuditResult(
                status="Non-Compliant",
                gaps="The model's verdict could not be backed by verifiable quotes from the document.",
                recommendation=raw.recommendation,
            )
            unverified = True
            note = "sin evidencia verificable"

    return {
        "status": raw.status,
        "evidence_found": format_evidence(verified),
        "citations": [c.model_dump() for c in verified],
        "gaps": raw.gaps,
        "recommendation": raw.recommendation,
        "evidence_unverified": unverified,
        "note": note,
    }


# ---------------------------------------------------------------------------
# Checks flow — controls that define atomic `checks`
# ---------------------------------------------------------------------------


def parse_retrieval_mode(mode: str) -> tuple[str, int]:
    """'control_k5' -> ('control', 5); 'per_check_k3' -> ('per_check', 3)."""
    m = re.fullmatch(r"(control|per_check)_k(\d+)", (mode or "").strip())
    if not m or int(m.group(2)) < 1:
        raise ValueError(f"Invalid TRUSTNODE_CHECK_RETRIEVAL {mode!r}; use control_k<N> or per_check_k<N>")
    return m.group(1), int(m.group(2))


def build_check_message(standard_name: str, control: dict, check: dict, chunks: list[dict]) -> str:
    fragments = "\n\n".join(
        f"[E{i}] (source: {c.get('source', 'unknown')}, page: {c.get('page', '?')})\n{c['text']}"
        for i, c in enumerate(chunks, start=1)
    )
    hint = f"HINT (clarifies what counts; not evidence): {check['hint']}\n" if check.get("hint") else ""
    return (
        f"STANDARD: {standard_name}\n"
        f"CONTROL ID: {control['control_id']}\n"
        f"CONTROL TITLE (context only): {control['title']}\n\n"
        "=== FRAGMENTOS RECUPERADOS (the only admissible evidence) ===\n"
        f"{fragments}\n\n"
        "=== CONDICIÓN A VERIFICAR (this is NOT evidence; never quote it) ===\n"
        f"CHECK ID: {check['id']}\n"
        f"CONDITION: {check['question']}\n"
        f"{hint}\n"
        "Verify ONLY this condition using ONLY the fragments above. Respond in JSON."
    )


def apply_anchors(
    citations: list[Citation],
    anchors: list[str] | None,
    label: str = "?",
) -> list[Citation]:
    """Keep citations whose quote contains at least one anchor (case/space-insensitive).

    Without anchors, citations are returned unchanged. Discards are logged.
    """
    if not anchors:
        return citations
    wanted = [normalize_text(a) for a in anchors if normalize_text(a)]
    kept: list[Citation] = []
    for c in citations:
        if any(a in normalize_text(c.quote) for a in wanted):
            kept.append(c)
        else:
            logger.warning(
                "apply_anchors[%s]: discarded citation — quote lacks required term(s) %s (quote=%.80r)",
                label, anchors, c.quote,
            )
    return kept


def derive_status(found_flags: list[bool]) -> str:
    """all found -> Compliant, some -> Partial, none -> Non-Compliant."""
    if found_flags and all(found_flags):
        return "Compliant"
    if any(found_flags):
        return "Partial"
    return "Non-Compliant"


def _evaluate_check(
    standard_name: str,
    control: dict,
    check: dict,
    chunks: list[dict],
) -> tuple[CheckResult, bool]:
    """Evaluate one check. Returns (result, llm_failed)."""
    label = f"{control['control_id']}/{check['id']}"
    user_message = build_check_message(standard_name, control, check, chunks)

    def ask(extra: str = ""):
        return _ask_llm(
            f"{user_message}\n\n{extra}" if extra else user_message,
            label,
            system_prompt=CHECK_SYSTEM_PROMPT,
            model=LLMCheckAnswer,
        )

    def verified_of(ans: LLMCheckAnswer) -> list[Citation]:
        v = verify_citations(ans.citations, chunks, label)
        return apply_anchors(v, check.get("anchors"), label)

    ans = ask()
    if ans is None:
        return CheckResult(check_id=check["id"], question=check["question"], found=False), True

    verified = verified_of(ans) if ans.answer == "found" else []
    unverified = False
    if ans.answer == "found" and not verified:
        logger.warning("evaluate_check[%s]: 'found' without verifiable citations — strict retry", label)
        ans2 = ask(STRICT_CHECK_RETRY_NOTICE)
        if ans2 is not None:
            ans = ans2
            verified = verified_of(ans) if ans.answer == "found" else []
        if ans.answer == "found" and not verified:
            logger.warning("evaluate_check[%s]: still unverifiable — treated as not_found", label)
            unverified = True

    return CheckResult(
        check_id=check["id"],
        question=check["question"],
        found=bool(verified),
        citations=verified,
        evidence_unverified=unverified,
    ), False


def evaluate_checked_control(standard_name: str, control: dict) -> dict:
    """Evaluate a control that defines `checks`; the status is derived by code.

    Retrieval follows CHECK_RETRIEVAL. Returns the same dict shape as
    ``evaluate_control`` plus ``checks``.
    """
    scope, k = parse_retrieval_mode(CHECK_RETRIEVAL)
    shared: list[dict] = []
    if scope == "control":
        shared = query_evidence(control["search_keywords"], n_results=k)
        if not shared:
            raise EmptyEvidenceError()

    results: list[CheckResult] = []
    errors = 0
    for check in control["checks"]:
        chunks = shared
        if scope == "per_check":
            chunks = query_evidence([check["question"]], n_results=k)
            if not chunks:
                raise EmptyEvidenceError()
        res, failed = _evaluate_check(standard_name, control, check, chunks)
        results.append(res)
        errors += int(failed)

    status = derive_status([r.found for r in results])
    by_id = {c["id"]: c for c in control["checks"]}
    missing = [r for r in results if not r.found]

    seen: set[tuple[str, int | None, str]] = set()
    citations: list[Citation] = []
    for r in results:
        for c in r.citations:
            key = (c.source, c.page, normalize_text(c.quote))
            if key not in seen:
                seen.add(key)
                citations.append(c)

    recs = [by_id[r.check_id].get("recommendation") for r in missing]
    recs = [x for x in recs if x]
    n_unverified = sum(1 for r in results if r.evidence_unverified)
    notes = []
    if n_unverified:
        notes.append(f"sin evidencia verificable en {n_unverified} check(s)")
    if errors:
        notes.append(f"error del LLM en {errors} check(s)")

    return {
        "status": status,
        "evidence_found": format_evidence(citations),
        "citations": [c.model_dump() for c in citations],
        "gaps": "None" if not missing else "No evidence found for: " + " | ".join(r.question for r in missing),
        "recommendation": (
            "None" if not missing
            else (" ".join(recs) if recs else "Address the missing conditions listed under gaps.")
        ),
        "evidence_unverified": n_unverified > 0,
        "note": "; ".join(notes),
        "checks": [r.model_dump() for r in results],
        **({"_error": True} if errors else {}),
    }


# ---------------------------------------------------------------------------
# Risk mapping helper
# ---------------------------------------------------------------------------

_STATUS_TO_RISK: dict[str, str] = {
    "Compliant":     "None",
    "Partial":       "Medium",
    "Non-Compliant": "High",
    "not_evaluable": "None",
}

# ---------------------------------------------------------------------------
# Public API — consumed by main.py
# ---------------------------------------------------------------------------


def check_llm_alive() -> None:
    """Raise RuntimeError if the Ollama LLM endpoint is not reachable."""
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get("http://localhost:11434/api/tags")
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Ollama LLM not reachable: {exc}") from exc


SUMMARY_SYSTEM_PROMPT_TEMPLATE = (
    "You are a Senior Cybersecurity Auditor. Your task is to summarise the company's "
    "compliance posture based on the findings provided. Be professional, focus on "
    "critical risks, and finish with an overall conclusion. "
    "Write the entire response in {language}. "
    "Use at most 3 paragraphs, plain text only — no markdown, no bullet lists, no "
    "headings. Do not include any preamble such as 'Sure' or 'Here is the summary'; "
    "output only the summary itself."
)


def build_summary_prompt(
    standard_audited: str,
    global_score_percentage: float | None,
    findings: list[dict],
    lang: str,
) -> str:
    """Build the executive-summary prompt.

    ``not_evaluable`` findings are NOT listed; they are reduced to a single count line.
    """
    evaluable = [f for f in findings if f.get("status") != "not_evaluable"]
    not_evaluable = len(findings) - len(evaluable)

    findings_block_lines: list[str] = []
    for f in evaluable:
        findings_block_lines.append(
            f"- [{f.get('control_id', '?')}] {f.get('status', '?')} "
            f"(risk: {f.get('risk_level', '?')}) — "
            f"gaps: {f.get('gaps', 'None') or 'None'} | "
            f"recommendation: {f.get('recommendation', 'None') or 'None'}"
        )
    findings_block = "\n".join(findings_block_lines) if findings_block_lines else "No findings."
    if not_evaluable:
        findings_block += f"\n{not_evaluable} controles no evaluables para este tipo de documento."

    system_prompt = SUMMARY_SYSTEM_PROMPT_TEMPLATE.format(language=lang)
    score_text = "N/A" if global_score_percentage is None else f"{global_score_percentage:.1f}%"
    user_message = (
        f"AUDITED STANDARD: {standard_audited}\n"
        f"GLOBAL SCORE: {score_text}\n"
        f"FINDINGS:\n{findings_block}\n\n"
        f"Write the executive summary in {lang}, following the system instructions."
    )
    return f"{system_prompt}\n\n{user_message}"


def generate_executive_summary(
    standard_audited: str,
    global_score_percentage: float | None,
    findings: list[dict],
    language: str = "English",
) -> str:
    """Call Llama 3.1 to produce a 3-paragraph executive summary of an audit.

    Args:
        standard_audited:         Name of the standard that was audited.
        global_score_percentage:  Overall compliance score (0–100).
        findings:                 List of finding dicts (control_id, status,
                                  evidence_found, gaps, recommendation,
                                  risk_level).

    Returns:
        Plain-text summary string. Raises RuntimeError on inference failure.
    """
    lang = (language or "English").strip() or "English"
    full_prompt = build_summary_prompt(
        standard_audited, global_score_percentage, findings, lang
    )

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": full_prompt,
        "stream": False,
    }

    try:
        with httpx.Client(timeout=OLLAMA_TIMEOUT) as client:
            response = client.post(OLLAMA_URL, json=payload)
            response.raise_for_status()
        text: str = response.json()["response"].strip()
    except (httpx.HTTPError, KeyError, json.JSONDecodeError) as exc:
        logger.exception("generate_executive_summary failed")
        raise RuntimeError(f"LLM summary generation failed: {exc}") from exc

    if not text:
        raise RuntimeError("LLM returned an empty summary.")

    return text


def run_audit(payload: AuditRequest) -> AuditResponse:
    """Evaluate every control in *payload* and return a full AuditResponse.

    Controls whose ``applies_to`` excludes ``payload.doc_type`` are returned as
    ``not_evaluable`` without calling retrieval or the LLM. The rest are retrieved,
    evaluated, and their citations verified. The score is computed here, only over
    evaluable controls (see ``compute_score``).
    """
    findings: list[SchemaAuditResult] = []

    needs_evidence = any(applicability(c.model_dump(), payload.doc_type)[0] for c in payload.controls)
    if needs_evidence and get_collection_stats().get("documents", 0) == 0:
        raise EmptyEvidenceError()

    for control in payload.controls:
        cdict = control.model_dump()
        applies, reason = applicability(cdict, payload.doc_type)
        if not applies:
            findings.append(SchemaAuditResult(
                control_id=control.control_id,
                status="not_evaluable",
                evidence_found="None",
                gaps=reason,
                recommendation="None",
                risk_level="None",
                note=reason,
            ))
            continue

        if cdict.get("checks"):
            raw = evaluate_checked_control(payload.standard_name, cdict)
        else:
            chunks = query_evidence(control.search_keywords)
            raw = evaluate_control(
                standard_name=payload.standard_name,
                control=cdict,
                chunks=chunks,
            )
        findings.append(SchemaAuditResult(
            control_id=control.control_id,
            status=raw["status"],
            evidence_found=raw["evidence_found"],
            gaps=raw["gaps"],
            recommendation=raw["recommendation"],
            risk_level=_STATUS_TO_RISK.get(raw["status"], "High"),
            citations=raw.get("citations", []),
            evidence_unverified=raw.get("evidence_unverified", False),
            checks=raw.get("checks", []),
            note=raw.get("note", ""),
        ))

    score, evaluated, not_evaluable = compute_score([f.status for f in findings])

    return AuditResponse(
        standard_audited=payload.standard_name,
        global_score_percentage=score,
        evaluated_count=evaluated,
        not_evaluable_count=not_evaluable,
        doc_type=payload.doc_type,
        results=findings,
    )


# ---------------------------------------------------------------------------
# Smoke test — mirrors the main.py call pattern
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import pprint

    # Simulate a cartridge control being passed in by main.py
    test_control = {
        "control_id": "A.5.1",
        "title": "Information Security Policies",
        "description": (
            "Security policies must be defined, approved by management, "
            "published and communicated to all employees."
        ),
        "search_keywords": ["security policy", "approval", "communication", "management"],
    }

    test_evidence = [{
        "id": "handbook_chunk0",
        "source": "Employee Handbook v3.2",
        "page": 4,
        "relevance": 90.0,
        "text": (
            "Section 4.1 states: 'All information security policies were reviewed and "
            "formally approved by the CTO on December 15, 2023. Policies are published "
            "on the internal wiki at security.acme.com.' HR records show 287 of 310 "
            "employees completed the mandatory policy acknowledgment form."
        ),
    }]

    print("\n=== TrustNode Smoke Test — evaluate_control ===")
    result = evaluate_control("ISO 27001:2022", test_control, test_evidence)
    pprint.pprint(result)
