import { FINDINGS } from "../data/mockData";
import type { ComplianceTag } from "../types";

const TAG_LABELS: Record<ComplianceTag, string> = {
  compliant: "Compliant",
  partial: "Partial",
  "non-compliant": "Non-compliant",
};

export function FindingsCard() {
  return (
    <div className="findings-card">
      <div className="card-header">
        <span className="card-title">Latest Findings</span>
      </div>
      {FINDINGS.map((finding) => (
        <button key={finding.id} type="button" className="finding-item">
          <span className={`f-dot ${finding.severity}`} />
          <div className="finding-body">
            <div className="finding-title">{finding.title}</div>
            <div className="finding-meta">
              <span className="f-std">{finding.standard}</span>
              <span className="f-clause">{finding.clause}</span>
              <span className={`tag ${finding.tag}`}>{TAG_LABELS[finding.tag]}</span>
              <span className="f-time">{finding.time}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
