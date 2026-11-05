from typing import Literal
from pydantic import BaseModel, Field, computed_field


DocType = Literal["isms_policy", "topic_policy", "procedure", "soa"]
DEFAULT_DOC_TYPE: DocType = "isms_policy"


class CheckSchema(BaseModel):
    """One atomic, single-condition sub-requirement of a control."""

    id: str = Field(description="Stable id of the check within the control, e.g. '5.2.a'.")
    question: str = Field(description="A single yes/no condition to verify against the document.")
    hint: str | None = Field(default=None, description="Clarifies what counts as satisfying the condition. Not evidence.")
    anchors: list[str] | None = Field(
        default=None,
        description="Optional case-insensitive substrings; a verified quote must contain at least one of them.",
    )
    recommendation: str | None = Field(default=None, description="Fixed remediation text used when the check is not met.")


class ControlSchema(BaseModel):
    control_id: str = Field(description="Unique identifier for the control rule, e.g. 'AC-1' or 'ISO-A.9.1'.")
    title: str = Field(description="Short, human-readable name of the control rule.")
    description: str = Field(description="Full description of what the control requires and how compliance is assessed.")
    search_keywords: list[str] = Field(description="List of keywords used to retrieve relevant evidence from the document corpus for this control.")
    applies_to: list[DocType] | None = Field(
        default=None,
        description="Document types this control can be assessed against. None/absent means it always applies.",
    )
    legacy_id: str | None = Field(default=None, description="Previous numbering (e.g. ISO 27001:2013), for traceability only.")
    checks: list[CheckSchema] | None = Field(
        default=None,
        description="Optional atomic sub-requirements. When present, the control status is derived from them by code.",
    )


class StandardSchema(BaseModel):
    standard_name: str = Field(description="Official name of the normative framework being audited, e.g. 'ISO 27001' or 'NIST SP 800-53'.")
    domain: str = Field(description="Thematic domain or category of the standard, e.g. 'Information Security' or 'Privacy'.")
    controls: list[ControlSchema] = Field(description="Ordered list of all controls that belong to this normative standard.")


class Citation(BaseModel):
    chunk_id: str = Field(description="Label of the retrieved fragment (E1, E2, ...) the quote came from.")
    source: str = Field(default="", description="Source file name, taken from the chunk metadata.")
    page: int | None = Field(default=None, description="Page number, assigned by code from the chunk metadata (never by the LLM).")
    quote: str = Field(description="Verified quote, found verbatim (after normalisation) in the chunk text.")


class CheckResult(BaseModel):
    check_id: str
    question: str
    found: bool = Field(description="True only if at least one citation was verified against the cited fragment.")
    citations: list[Citation] = Field(default_factory=list)
    evidence_unverified: bool = Field(default=False, description="The model said 'found' but no quote could be verified.")


class AuditResult(BaseModel):
    control_id: str = Field(description="Identifier of the control that was evaluated. Must match the control_id from ControlSchema.")
    status: Literal["Compliant", "Non-Compliant", "Partial", "not_evaluable"] = Field(
        description="Compliance verdict for this control. 'Compliant' means full adherence, 'Non-Compliant' means no adherence, 'Partial' means incomplete adherence, 'not_evaluable' means the control does not apply to the audited document type (excluded from the score)."
    )
    evidence_found: str = Field(description="Verbatim excerpts or paraphrased passages from the audited documents that support or contradict compliance with this control.")
    gaps: str = Field(description="Specific requirements of the control that are missing or insufficiently addressed in the audited documents. Empty string if status is 'Compliant'.")
    recommendation: str = Field(description="Actionable guidance to remediate the identified gaps and achieve full compliance with this control.")
    risk_level: Literal["High", "Medium", "Low", "None"] = Field(
        description="Risk severity associated with the compliance gap. 'None' when status is 'Compliant' or 'not_evaluable', 'High' for critical gaps with significant regulatory or operational exposure."
    )
    citations: list[Citation] = Field(default_factory=list, description="Verified citations backing the verdict.")
    evidence_unverified: bool = Field(default=False, description="True when the LLM verdict was downgraded because no citation could be verified.")
    checks: list[CheckResult] = Field(default_factory=list, description="Per-check outcomes when the control defines `checks`; empty otherwise.")
    note: str = Field(default="", description="Extra explanation (e.g. reason a control is not_evaluable, or 'sin evidencia verificable').")


class FullAuditReport(BaseModel):
    standard_audited: str = Field(description="Name of the normative standard that was audited, matching StandardSchema.standard_name.")
    global_score_percentage: float | None = Field(description="Overall compliance score (0.0–100.0): compliant=1, partial=0.5, non-compliant=0 averaged over evaluable controls only. None when no control is evaluable.")
    evaluated_count: int = Field(default=0, description="Number of controls that were actually evaluated (excludes not_evaluable).")
    not_evaluable_count: int = Field(default=0, description="Number of controls skipped because they do not apply to the document type.")
    doc_type: DocType = Field(default=DEFAULT_DOC_TYPE, description="Document type the audit was run against (echo of the request).")
    results: list[AuditResult] = Field(description="List of individual audit results, one entry per evaluated control, in the same order as the controls in the standard.")


# ---------------------------------------------------------------------------
# API contract schemas — consumed by main.py
# ---------------------------------------------------------------------------

class AuditRequest(StandardSchema):
    """Audit request payload: a complete normative standard with its controls."""

    doc_type: DocType = Field(default=DEFAULT_DOC_TYPE, description="Type of the audited document; controls whose applies_to excludes it are not_evaluable.")


class AuditResponse(FullAuditReport):
    """Audit response: inherits FullAuditReport and exposes `findings` as an alias for `results`."""

    @computed_field
    @property
    def findings(self) -> list[AuditResult]:
        return self.results


class IngestResponse(BaseModel):
    ingested: int = Field(description="Number of documents successfully ingested.")
    documents: list[dict] = Field(description="Metadata dict for each ingested document.")


class StatusResponse(BaseModel):
    api: str
    ollama_alive: bool
    ollama_url: str
    models_available: list[str]
    chroma: dict


class ErrorResponse(BaseModel):
    error: str
    detail: str = ""
    path: str = ""


# ---------------------------------------------------------------------------
# Executive summary schemas
# ---------------------------------------------------------------------------

class SummaryRequest(BaseModel):
    standard_audited: str = Field(description="Name of the audited standard (matches AuditResponse.standard_audited).")
    global_score_percentage: float | None = Field(default=None, description="Overall compliance score as a percentage (0.0–100.0); None if not available.")
    results: list[AuditResult] = Field(description="Findings from a prior audit run — fed to the LLM as raw context.")
    language: str = Field(default="English", description="Natural language the summary must be written in (e.g. 'English', 'Spanish', 'French').")


class SummaryResponse(BaseModel):
    summary: str = Field(description="Executive summary generated by the LLM (≤ 3 paragraphs).")


# ---------------------------------------------------------------------------
# PDF export schemas
# ---------------------------------------------------------------------------

class ExportFinding(BaseModel):
    key: str = Field(default="", description="Stable identifier for the finding within the report.")
    standard: str = Field(default="", description="Name of the standard this finding belongs to.")
    control_id: str = Field(description="Control identifier from the audited standard.")
    status: str = Field(description="Compliance status: Compliant, Partial, Non-Compliant, or not_evaluable.")
    evidence_found: str = Field(default="", description="Evidence text supporting the verdict.")
    gaps: str = Field(default="", description="Gaps detected vs. the control requirements.")
    recommendation: str = Field(default="", description="Remediation recommendation for the gap.")
    risk_level: str = Field(default="", description="Risk severity (High/Medium/Low/None).")
    citations: list[Citation] = Field(default_factory=list, description="Verified citations backing the verdict.")
    evidence_unverified: bool = Field(default=False, description="True when the verdict was downgraded for lack of verifiable evidence.")
    checks: list[CheckResult] = Field(default_factory=list, description="Per-check outcomes (rendered as a checklist).")


class ExportPdfRequest(BaseModel):
    standard_name: str = Field(description="Name of the audited standard or composite ('A + B').")
    compliance_score: float | None = Field(default=None, description="Trust score (0.0–100.0) shown on the cover; None renders as N/A.")
    findings: list[ExportFinding] = Field(description="All findings to render in the Detailed Findings section.")
    doc_type: str | None = Field(default=None, description="Document type the audit was run against (shown on the cover).")
    executive_summary: str | None = Field(default=None, description="Optional AI-generated executive summary.")
    generated_at: str | None = Field(default=None, description="Human-readable timestamp for the cover header.")
