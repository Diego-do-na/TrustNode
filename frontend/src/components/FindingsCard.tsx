import type { AuditResponse, AuditResult } from "../api/client";
import type { ComplianceTag, FindingSeverity } from "../types";

interface FindingsCardProps {
  auditResults: AuditResponse[];
}

const TAG_LABELS: Record<ComplianceTag, string> = {
  compliant: "Compliant",
  partial: "Partial",
  "non-compliant": "Non-compliant",
};

function toTag(status: AuditResult["status"]): ComplianceTag {
  if (status === "Compliant") return "compliant";
  if (status === "Partial") return "partial";
  return "non-compliant";
}

function toSeverity(risk: AuditResult["risk_level"]): FindingSeverity {
  if (risk === "High") return "critical";
  if (risk === "Medium") return "warning";
  return "pass";
}

function findingTitle(result: AuditResult): string {
  if (result.status === "Compliant") {
    return result.evidence_found.length > 120
      ? result.evidence_found.slice(0, 120) + "…"
      : result.evidence_found;
  }
  const text = result.gaps || result.recommendation;
  return text.length > 120 ? text.slice(0, 120) + "…" : text;
}

export function FindingsCard({ auditResults }: FindingsCardProps) {
  const hasData = auditResults.length > 0;

  const findings = auditResults.flatMap((auditResp) =>
    auditResp.findings.map((r) => ({
      key: `${auditResp.standard_audited}-${r.control_id}`,
      title: findingTitle(r),
      standard: auditResp.standard_audited,
      clause: r.control_id,
      tag: toTag(r.status),
      severity: toSeverity(r.risk_level),
    })),
  );

  // Sort: critical first, then warning, then pass
  const ORDER: Record<FindingSeverity, number> = { critical: 0, warning: 1, pass: 2 };
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  return (
    <div className="findings-card">
      <div className="card-header">
        <span className="card-title">Latest Findings</span>
        {hasData && (
          <span className="card-count">{findings.length} control{findings.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {hasData ? (
        findings.map((finding) => (
          <button key={finding.key} type="button" className="finding-item">
            <span className={`f-dot ${finding.severity}`} />
            <div className="finding-body">
              <div className="finding-title">{finding.title}</div>
              <div className="finding-meta">
                <span className="f-std">{finding.standard}</span>
                <span className="f-clause">{finding.clause}</span>
                <span className={`tag ${finding.tag}`}>{TAG_LABELS[finding.tag]}</span>
              </div>
            </div>
          </button>
        ))
      ) : (
        <div className="card-empty">
          No findings yet. Run an audit to surface compliance gaps.
        </div>
      )}
    </div>
  );
}
