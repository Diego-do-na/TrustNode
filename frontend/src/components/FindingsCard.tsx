import { useState } from "react";
import type { AuditResponse, AuditResult } from "../api/client";
import type { ComplianceTag, FindingSeverity } from "../types";

interface FindingsCardProps {
  auditResults: AuditResponse[];
}

const TITLE_MAX_CLOSED = 110;

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
  if (result.status === "Compliant") return result.evidence_found;
  return result.gaps || result.recommendation;
}

function hasContent(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed === "") return false;
  const lowered = trimmed.toLowerCase();
  return lowered !== "none" && lowered !== "null" && lowered !== "n/a";
}

interface FlatFinding {
  key: string;
  standard: string;
  tag: ComplianceTag;
  severity: FindingSeverity;
  raw: AuditResult;
}

export function FindingsCard({ auditResults }: FindingsCardProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const hasData = auditResults.length > 0;

  const findings: FlatFinding[] = auditResults.flatMap((auditResp) =>
    auditResp.findings.map((r) => ({
      key: `${auditResp.standard_audited}-${r.control_id}`,
      standard: auditResp.standard_audited,
      tag: toTag(r.status),
      severity: toSeverity(r.risk_level),
      raw: r,
    })),
  );

  const ORDER: Record<FindingSeverity, number> = { critical: 0, warning: 1, pass: 2 };
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  const toggle = (key: string) => setExpanded((curr) => (curr === key ? null : key));

  return (
    <div className="findings-card">
      <div className="card-header">
        <span className="card-title">Latest Findings</span>
        {hasData && (
          <span className="card-count">
            {findings.length} control{findings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {hasData ? (
        findings.map((finding) => {
          const isOpen = expanded === finding.key;
          const fullTitle = findingTitle(finding.raw);
          const displayedTitle =
            isOpen || fullTitle.length <= TITLE_MAX_CLOSED
              ? fullTitle
              : fullTitle.slice(0, TITLE_MAX_CLOSED).trimEnd() + "…";
          const showGaps = hasContent(finding.raw.gaps);
          const showRecommendation = hasContent(finding.raw.recommendation);
          const evidenceText = finding.raw.evidence_found ?? "";
          const showEvidence =
            hasContent(evidenceText) &&
            !/no textual evidence was retrieved/i.test(evidenceText);
          return (
            <article key={finding.key} className={`finding-item${isOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="finding-row"
                onClick={() => toggle(finding.key)}
                aria-expanded={isOpen}
              >
                <span className={`f-dot ${finding.severity}`} />
                <div className="finding-body">
                  <div className="finding-title">{displayedTitle}</div>
                  <div className="finding-meta">
                    <span className="f-std">{finding.standard}</span>
                    <span className="f-clause">{finding.raw.control_id}</span>
                    <span className={`tag ${finding.tag}`}>{TAG_LABELS[finding.tag]}</span>
                  </div>
                </div>
                <span className={`finding-caret${isOpen ? " open" : ""}`} aria-hidden>
                  ›
                </span>
              </button>

              <div className="finding-detail">
                  {showGaps && (
                    <section className="finding-section">
                      <h4 className="finding-section-title">Gaps</h4>
                      <p className="finding-section-body">{finding.raw.gaps}</p>
                    </section>
                  )}

                  {showRecommendation && (
                    <section className="finding-section">
                      <h4 className="finding-section-title">Recommendation</h4>
                      <p className="finding-section-body">{finding.raw.recommendation}</p>
                    </section>
                  )}

                  {showEvidence && (
                    <section className="finding-section">
                      <h4 className="finding-section-title">Evidence snippet</h4>
                      <pre className="evidence-snippet">
                        <span className="evidence-snippet-tag">
                          {finding.standard} · {finding.raw.control_id}
                        </span>
                        <code>{finding.raw.evidence_found}</code>
                      </pre>
                    </section>
                  )}
                </div>
            </article>
          );
        })
      ) : (
        <div className="card-empty">
          No findings yet. Run an audit to surface compliance gaps.
        </div>
      )}
    </div>
  );
}
