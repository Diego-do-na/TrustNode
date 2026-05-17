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

import json
import logging
from typing import Literal

import httpx
from pydantic import BaseModel, ValidationError

from schemas import AuditRequest, AuditResponse, AuditResult as SchemaAuditResult
from ingestion import query_evidence

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
OLLAMA_MODEL = "llama3.1:8b"
OLLAMA_TIMEOUT = 120  # seconds

AUDIT_SYSTEM_PROMPT = """
You are a Senior Normative Auditor with over 20 years of experience at a Big 4 consulting firm, specialising in regulatory compliance, internal controls, and corporate governance frameworks.

Your task is to evaluate whether the EVIDENCE provided by the user satisfies the RULE TO EVALUATE for the given control. You will be given the standard name, control identifier, control title, the rule to evaluate, and the evidence retrieved from company documents.

CRITICAL RULES — follow without exception:
1. Base your entire analysis EXCLUSIVELY on the evidence text supplied in the user message. You must NOT infer, assume, extrapolate, or use any external knowledge, industry benchmarks, or information not explicitly present in the provided evidence.
2. If the evidence is empty, absent, vague, or insufficient to demonstrate compliance, you MUST output status "Non-Compliant".
3. If the evidence shows intent or partial implementation but lacks proof of full compliance, you MUST output status "Partial".
4. Only output "Compliant" when the evidence directly and explicitly demonstrates that every aspect of the rule is satisfied.
5. When in doubt, rate down: prefer "Non-Compliant" over "Partial", and "Partial" over "Compliant".
6. Every value for "evidence_found" and "gaps" MUST be derived verbatim or directly paraphrased from the supplied evidence text. You must NEVER fabricate or invent content for any field.
7. You MUST respond with a single, valid JSON object and NOTHING ELSE. No preamble, no explanation, no markdown fences. The response must begin with '{' and end with '}'.

OUTPUT SCHEMA (strict — include all four keys, no extras):
{
  "status": "Compliant" | "Non-Compliant" | "Partial",
  "evidence_found": "<Direct quotes or close paraphrases from the evidence that support compliance. Write 'None' if no supporting evidence exists.>",
  "gaps": "<Specific deficiencies in the evidence relative to what the rule requires. Write 'None' if the control is fully satisfied.>",
  "recommendation": "<A single, concrete, actionable remediation step. Write 'None' if the control is fully satisfied.>"
}
""".strip()

# ---------------------------------------------------------------------------
# Pydantic model
# ---------------------------------------------------------------------------


class AuditResult(BaseModel):
    status: Literal["Compliant", "Non-Compliant", "Partial"]
    evidence_found: str
    gaps: str
    recommendation: str


# ---------------------------------------------------------------------------
# Fallback returned when inference fails after one retry
# ---------------------------------------------------------------------------

_FALLBACK: dict = {
    "status": "Non-Compliant",
    "evidence_found": "Evaluation could not be completed.",
    "gaps": "Internal error during LLM inference or response parsing.",
    "recommendation": "Check Ollama service status and model availability.",
    "_error": True,
}

# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------


def evaluate_control(
    standard_name: str,
    control: dict,
    chromadb_evidence: str,
) -> dict:
    """Evaluate a normative control against evidence retrieved from ChromaDB.

    Args:
        standard_name:     Human-readable name of the normative standard being
                           audited, e.g. "ISO 27001:2022" or "SOC 2 Type II".
                           Comes from the parent standard JSON, not hardcoded.
        control:           Full control dict parsed from a /standards/*.json
                           cartridge. Expected keys: "control_id", "title",
                           "description". Any extra keys are ignored.
        chromadb_evidence: Pre-retrieved evidence string assembled by
                           ingestion.py from ChromaDB using the control's
                           search_keywords. May be empty if no chunks matched.

    Returns:
        A dict with keys ``status``, ``evidence_found``, ``gaps``, and
        ``recommendation``. On unrecoverable failure an additional
        ``_error: True`` key is present and ``status`` is forced to
        "Non-Compliant".
    """
    user_message = (
        f"STANDARD: {standard_name}\n"
        f"CONTROL ID: {control['control_id']}\n"
        f"CONTROL TITLE: {control['title']}\n"
        f"RULE TO EVALUATE: {control['description']}\n"
        f"EVIDENCE FOUND IN COMPANY DOCUMENTS:\n{chromadb_evidence}\n\n"
        "Evaluate strictly using ONLY the evidence above. Respond in JSON."
    )

    full_prompt = f"{AUDIT_SYSTEM_PROMPT}\n\n{user_message}"

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": full_prompt,
        "format": "json",
        "stream": False,
    }

    def _call_and_parse() -> dict:
        with httpx.Client(timeout=OLLAMA_TIMEOUT) as client:
            response = client.post(OLLAMA_URL, json=payload)
            response.raise_for_status()

        raw: str = response.json()["response"]
        parsed = json.loads(raw)
        audit_result = AuditResult.model_validate(parsed)
        return audit_result.model_dump()

    try:
        return _call_and_parse()
    except (httpx.HTTPError, json.JSONDecodeError, ValidationError, KeyError) as exc:
        logger.warning(
            "evaluate_control: attempt 1 failed [%s %s] — retrying",
            control.get("control_id", "unknown"),
            type(exc).__name__,
        )

    try:
        return _call_and_parse()
    except Exception as exc:
        logger.error(
            "evaluate_control: retry failed [%s %s] — returning fallback",
            control.get("control_id", "unknown"),
            type(exc).__name__,
        )
        return _FALLBACK.copy()


# ---------------------------------------------------------------------------
# Risk mapping helper
# ---------------------------------------------------------------------------

_STATUS_TO_RISK: dict[str, str] = {
    "Compliant":     "None",
    "Partial":       "Medium",
    "Non-Compliant": "High",
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


def run_audit(payload: AuditRequest) -> AuditResponse:
    """Evaluate every control in *payload* and return a full AuditResponse.

    For each control: retrieves evidence from ChromaDB via query_evidence,
    calls evaluate_control, maps the raw result to SchemaAuditResult, and
    collects everything into an AuditResponse.
    """
    findings: list[SchemaAuditResult] = []

    for control in payload.controls:
        evidence = query_evidence(control.search_keywords)
        raw = evaluate_control(
            standard_name=payload.standard_name,
            control=control.model_dump(),
            chromadb_evidence=evidence,
        )
        findings.append(SchemaAuditResult(
            control_id=control.control_id,
            status=raw["status"],
            evidence_found=raw["evidence_found"],
            gaps=raw["gaps"],
            recommendation=raw["recommendation"],
            risk_level=_STATUS_TO_RISK.get(raw["status"], "High"),
        ))

    compliant = sum(1 for f in findings if f.status == "Compliant")
    score = round(compliant / len(findings) * 100, 1) if findings else 0.0

    return AuditResponse(
        standard_audited=payload.standard_name,
        global_score_percentage=score,
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

    test_evidence = """
        Document: Employee Handbook v3.2 (2024-01-10)
        Section 4.1 states: 'All information security policies were reviewed and
        formally approved by the CTO on December 15, 2023. Policies are published
        on the internal wiki at security.acme.com.' HR records show 287 of 310
        employees completed the mandatory policy acknowledgment form. 23 employees
        hired after December have not yet completed it.
    """

    print("\n=== TrustNode Smoke Test — evaluate_control ===")
    result = evaluate_control("ISO 27001:2022", test_control, test_evidence)
    pprint.pprint(result)
