import type { AuditResponse } from "../api/client";
import { STANDARD_DEFINITIONS } from "../data/standards";
import { controlProgress, scoreLevel } from "../utils/auditMetrics";

interface StandardsCardProps {
  auditResults: AuditResponse[];
}

function PillScoreArc({ score, level }: { score: number; level: "high" | "mid" | "low" }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;

  return (
    <svg className="standard-pill-arc" viewBox="0 0 44 44" aria-hidden>
      <circle className="standard-pill-arc-track" cx="22" cy="22" r={r} />
      <circle
        className={`standard-pill-arc-fill standard-pill-arc-fill--${level}`}
        cx="22"
        cy="22"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
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
            const { assessed, total } = controlProgress(result);
            const progressPct = total > 0 ? Math.round((assessed / total) * 100) : 0;

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
                  <div className="standard-pill-checklist">
                    <div className="standard-pill-checklist-track">
                      <div
                        className={`standard-pill-checklist-fill standard-pill-checklist-fill--${level}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="standard-pill-checklist-label">
                      {assessed}/{total} controls
                    </span>
                  </div>
                </div>
                <div className="standard-pill-score-wrap">
                  <PillScoreArc score={score} level={level} />
                  <div className={`standard-score ${level}`}>{score}%</div>
                </div>
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
