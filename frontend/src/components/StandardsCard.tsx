import type { AuditResponse } from "../api/client";
import { STANDARD_DEFINITIONS } from "../data/standards";

interface StandardsCardProps {
  auditResults: AuditResponse[];
}

function scoreLevel(pct: number): "high" | "mid" | "low" {
  if (pct >= 80) return "high";
  if (pct >= 60) return "mid";
  return "low";
}

export function StandardsCard({ auditResults }: StandardsCardProps) {
  const hasData = auditResults.length > 0;

  return (
    <div className="standards-card">
      <div className="card-header">
        <span className="card-title">Active Standards</span>
      </div>

      {hasData ? (
        <div className="standards-grid">
          {auditResults.map((result) => {
            const score = Math.round(result.global_score_percentage);
            const level = scoreLevel(result.global_score_percentage);
            const domain = STANDARD_DEFINITIONS[result.standard_audited]?.domain ?? "";
            return (
              <button
                key={result.standard_audited}
                type="button"
                className={`standard-pill standard-pill--${level}`}
              >
                <div className="standard-pill-body">
                  <div className="standard-name">
                    <span className={`std-dot ${level}`} />
                    {result.standard_audited}
                  </div>
                  <div className="standard-desc">{domain}</div>
                </div>
                <div className={`standard-score ${level}`}>{score}%</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card-empty">
          No audit data yet. Upload documents and run an analysis to see results.
        </div>
      )}
    </div>
  );
}
