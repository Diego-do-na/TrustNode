import { REPORTS } from "../data/navConfig";

const STATUS_LABELS = {
  ready: "Ready",
  generating: "Generating",
  draft: "Draft",
} as const;

export function ReportsPage() {
  return (
    <section className="page-panel">
      <section className="panel-stats">
        <article className="stat-pill">
          <span className="stat-pill-value">4</span>
          <span className="stat-pill-label">Total reports</span>
        </article>
        <article className="stat-pill">
          <span className="stat-pill-value">2</span>
          <span className="stat-pill-label">Ready to export</span>
        </article>
        <article className="stat-pill">
          <span className="stat-pill-value">1</span>
          <span className="stat-pill-label">In progress</span>
        </article>
      </section>

      <section className="glass-card list-card">
        <header className="card-header">
          <span className="card-title">All reports</span>
          <button type="button" className="btn-ghost btn-sm">
            Export all
          </button>
        </header>

        <ul className="list-rows">
          {REPORTS.map((report) => (
            <li key={report.id}>
              <button type="button" className="list-row">
                <span className="list-row-main">
                  <span className="list-row-title">{report.name}</span>
                  <span className="list-row-meta">
                    {report.standards.map((std) => (
                      <span key={std} className="f-std">
                        {std}
                      </span>
                    ))}
                    <span className={`tag status-${report.status}`}>
                      {STATUS_LABELS[report.status]}
                    </span>
                    <span className="f-time">{report.updated}</span>
                  </span>
                </span>
                <span
                  className={`list-row-score${report.score >= 80 ? " high" : report.score >= 70 ? " mid" : " low"}`}
                >
                  {report.score}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
