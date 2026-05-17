import { formatBytes, formatRelativeTime, useAppState } from "../context/AppStateContext";

interface DocumentsPageProps {
  onOpenUpload: () => void;
}

export function DocumentsPage({ onOpenUpload }: DocumentsPageProps) {
  const { documents, fileCache, removeDocument } = useAppState();
  const reusable = documents.filter((d) => fileCache[d.id]).length;

  return (
    <section className="page-panel">
      <section className="panel-stats">
        <article className="stat-pill">
          <span className="stat-pill-value">{documents.length}</span>
          <span className="stat-pill-label">Uploaded files</span>
        </article>
        <article className="stat-pill">
          <span className="stat-pill-value">{reusable}</span>
          <span className="stat-pill-label">Cached this session</span>
        </article>
      </section>

      <section className="glass-card list-card">
        <header className="card-header">
          <span className="card-title">Uploaded documents</span>
          <button type="button" className="btn-ghost btn-sm" onClick={onOpenUpload}>
            Upload more
          </button>
        </header>

        {documents.length === 0 ? (
          <div className="card-empty">
            No documents yet. Start an audit from the sidebar to ingest PDFs into TrustNode.
          </div>
        ) : (
          <ul className="list-rows">
            {documents.map((doc) => {
              const cached = Boolean(fileCache[doc.id]);
              return (
                <li key={doc.id}>
                  <div className="list-row">
                    <span className="list-row-main">
                      <span className="list-row-title">{doc.name}</span>
                      <span className="list-row-meta">
                        <span className="f-std">{doc.type}</span>
                        <span className="f-clause">{formatBytes(doc.size)}</span>
                        <span className={`tag ${cached ? "compliant" : "partial"}`}>
                          {cached ? "Ready" : "Re-upload to reuse"}
                        </span>
                        <span className="f-time">{formatRelativeTime(doc.uploadedAt)}</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => removeDocument(doc.id)}
                    >
                      Remove
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
