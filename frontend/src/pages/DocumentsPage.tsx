import { DOCUMENTS } from "../data/navConfig";

const STATUS_LABELS = {
  indexed: "Indexed",
  processing: "Processing",
  failed: "Failed",
} as const;

export function DocumentsPage() {
  const indexed = DOCUMENTS.filter((d) => d.status === "indexed").length;
  const processing = DOCUMENTS.filter((d) => d.status === "processing").length;

  return (
    <section className="page-panel">
      <section className="panel-stats">
        <article className="stat-pill">
          <span className="stat-pill-value">{DOCUMENTS.length}</span>
          <span className="stat-pill-label">Uploaded files</span>
        </article>
        <article className="stat-pill">
          <span className="stat-pill-value">{indexed}</span>
          <span className="stat-pill-label">Indexed</span>
        </article>
        <article className="stat-pill">
          <span className="stat-pill-value">{processing}</span>
          <span className="stat-pill-label">Processing</span>
        </article>
      </section>

      <section className="glass-card list-card">
        <header className="card-header">
          <span className="card-title">Uploaded documents</span>
          <button type="button" className="btn-ghost btn-sm">
            Re-index all
          </button>
        </header>

        <ul className="list-rows">
          {DOCUMENTS.map((doc) => (
            <li key={doc.id}>
              <button type="button" className="list-row">
                <span className="list-row-main">
                  <span className="list-row-title">{doc.name}</span>
                  <span className="list-row-meta">
                    <span className="f-std">{doc.type}</span>
                    <span className="f-clause">{doc.size}</span>
                    <span className={`tag status-${doc.status}`}>
                      {STATUS_LABELS[doc.status]}
                    </span>
                    <span className="f-time">{doc.uploaded}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
