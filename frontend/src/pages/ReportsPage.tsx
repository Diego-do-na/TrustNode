import { formatRelativeTime, useAppState } from "../context/AppStateContext";
import type { AuditResponse } from "../api/client";

interface ReportsPageProps {
  onShowReport: (results: AuditResponse[], language?: string) => void;
}

function scoreClass(score: number): "high" | "mid" | "low" {
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
}

export function ReportsPage({ onShowReport }: ReportsPageProps) {
  const { reports, removeReport } = useAppState();

  return (
    <section className="page-panel">
      <section className="panel-stats">
        <article className="stat-pill">
          <span className="stat-pill-value">{reports.length}</span>
          <span className="stat-pill-label">Total reports</span>
        </article>
        <article className="stat-pill">
          <span className="stat-pill-value">
            {reports.filter((r) => r.score >= 80).length}
          </span>
          <span className="stat-pill-label">High compliance</span>
        </article>
      </section>

      <section className="glass-card list-card">
        <header className="card-header">
          <span className="card-title">All reports</span>
        </header>

        {reports.length === 0 ? (
          <div className="card-empty">
            No reports yet. Run your first audit from the sidebar to generate one.
          </div>
        ) : (
          <ul className="list-rows">
            {reports.map((report) => {
              const level = scoreClass(report.score);
              return (
                <li key={report.id}>
                  <div className="list-row">
                    <button
                      type="button"
                      className="list-row-main list-row-open"
                      onClick={() => onShowReport(report.results, report.language)}
                    >
                      <span className="list-row-title">{report.name}</span>
                      <span className="list-row-meta">
                        {report.standards.map((std) => (
                          <span key={std} className="f-std">
                            {std}
                          </span>
                        ))}
                        <span className="f-time">{formatRelativeTime(report.createdAt)}</span>
                      </span>
                    </button>
                    <span className={`list-row-score ${level}`}>{report.score}%</span>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => removeReport(report.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
