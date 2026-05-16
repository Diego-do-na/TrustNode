from typing import Literal
from pydantic import BaseModel, Field, computed_field


class ControlSchema(BaseModel):
    control_id: str = Field(description="Unique identifier for the control rule, e.g. 'AC-1' or 'ISO-A.9.1'.")
    title: str = Field(description="Short, human-readable name of the control rule.")
    description: str = Field(description="Full description of what the control requires and how compliance is assessed.")
    search_keywords: list[str] = Field(description="List of keywords used to retrieve relevant evidence from the document corpus for this control.")


class StandardSchema(BaseModel):
    standard_name: str = Field(description="Official name of the normative framework being audited, e.g. 'ISO 27001' or 'NIST SP 800-53'.")
    domain: str = Field(description="Thematic domain or category of the standard, e.g. 'Information Security' or 'Privacy'.")
    controls: list[ControlSchema] = Field(description="Ordered list of all controls that belong to this normative standard.")


class AuditResult(BaseModel):
    control_id: str = Field(description="Identifier of the control that was evaluated. Must match the control_id from ControlSchema.")
    status: Literal["Compliant", "Non-Compliant", "Partial"] = Field(
        description="Compliance verdict for this control. 'Compliant' means full adherence, 'Non-Compliant' means no adherence, 'Partial' means incomplete adherence."
    )
    evidence_found: str = Field(description="Verbatim excerpts or paraphrased passages from the audited documents that support or contradict compliance with this control.")
    gaps: str = Field(description="Specific requirements of the control that are missing or insufficiently addressed in the audited documents. Empty string if status is 'Compliant'.")
    recommendation: str = Field(description="Actionable guidance to remediate the identified gaps and achieve full compliance with this control.")
    risk_level: Literal["High", "Medium", "Low", "None"] = Field(
        description="Risk severity associated with the compliance gap. 'None' when status is 'Compliant', 'High' for critical gaps with significant regulatory or operational exposure."
    )


class FullAuditReport(BaseModel):
    standard_audited: str = Field(description="Name of the normative standard that was audited, matching StandardSchema.standard_name.")
    global_score_percentage: float = Field(description="Overall compliance score expressed as a percentage (0.0–100.0), calculated as the ratio of fully compliant controls to total controls evaluated.")
    results: list[AuditResult] = Field(description="List of individual audit results, one entry per evaluated control, in the same order as the controls in the standard.")


# ---------------------------------------------------------------------------
# API contract schemas — consumed by main.py
# ---------------------------------------------------------------------------

class AuditRequest(StandardSchema):
    """Audit request payload: a complete normative standard with its controls."""


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
