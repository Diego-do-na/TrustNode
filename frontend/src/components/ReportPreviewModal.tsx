import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { exportReportPdf, type AuditResponse, type ExportFinding } from "../api/client";
import { LogoMark } from "./Logo";
import { averageTrustScore, flattenFindings, scoreLevel } from "../utils/auditMetrics";

interface ReportPreviewModalProps {
  open: boolean;
  auditResults: AuditResponse[];
  lastAuditAt: Date | null;
  executiveSummary: string | null;
  onClose: () => void;
}

function findingTitle(evidence: string, gaps: string, recommendation: string, status: string): string {
  if (status === "Compliant") return evidence;
  return gaps || recommendation;
}

export function ReportPreviewModal({ open, auditResults, lastAuditAt, executiveSummary, onClose }: ReportPreviewModalProps) {
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!busy && e.target === e.currentTarget) onClose();
    },
    [onClose, busy],
  );

  useEffect(() => {
    if (!open) {
      setExportError(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open || auditResults.length === 0) return null;

  const score = averageTrustScore(auditResults)!;
  const level = scoreLevel(score);
  const previewFindings = flattenFindings(auditResults)
    .filter((f) => f.severity !== "pass")
    .slice(0, 6);
  const generated = lastAuditAt?.toLocaleString() ?? new Date().toLocaleString();

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    setExportError(null);
    try {
      const allFindings: ExportFinding[] = auditResults.flatMap((audit) =>
        audit.results.map((r) => ({
          key: `${audit.standard_audited}-${r.control_id}`,
          standard: audit.standard_audited,
          control_id: r.control_id,
          status: r.status,
          evidence_found: r.evidence_found ?? "",
          gaps: r.gaps ?? "",
          recommendation: r.recommendation ?? "",
          risk_level: r.risk_level ?? "",
        })),
      );

      const blob = await exportReportPdf({
        standard_name: auditResults.map((r) => r.standard_audited).join(" + "),
        compliance_score: score,
        findings: allFindings,
        executive_summary: executiveSummary,
        generated_at: generated,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "TrustNode_Audit_Report.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not generate the PDF.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="report-preview-bg print:hidden" onClick={handleBackdrop} role="presentation">
      <div className="report-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="report-preview-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <header className="report-preview-toolbar">
          <h2 id="report-preview-title" className="report-preview-toolbar-title">
            Export preview
          </h2>
          <p className="report-preview-toolbar-sub">This is how your PDF report will be structured.</p>
        </header>

        <article className="report-preview-sheet">
          <header className="report-preview-header">
            <div className="report-preview-brand">
              <span className="report-preview-logo">
                <LogoMark />
              </span>
              <div>
                <div className="report-preview-brand-name">
                  Trust<span>Node</span>
                </div>
                <div className="report-preview-brand-meta">Compliance report</div>
              </div>
            </div>
            <div className="report-preview-meta">
              <span>Generated {generated}</span>
              <span>{auditResults.length} standard{auditResults.length > 1 ? "s" : ""}</span>
            </div>
          </header>

          <section className="report-preview-score-block">
            <span className="report-preview-label">Trust score</span>
            <div className={`report-preview-score report-preview-score--${level}`}>
              {score}
              <span>/100</span>
            </div>
          </section>

          <section className="report-preview-section">
            <h3>Standards summary</h3>
            <ul className="report-preview-standards">
              {auditResults.map((r) => (
                <li key={r.standard_audited}>
                  <span>{r.standard_audited}</span>
                  <strong>{Math.round(r.global_score_percentage)}%</strong>
                </li>
              ))}
            </ul>
          </section>

          {previewFindings.length > 0 && (
            <section className="report-preview-section">
              <h3>Priority findings</h3>
              <ul className="report-preview-findings">
                {previewFindings.map((f) => (
                  <li key={f.key}>
                    <span className={`report-preview-sev report-preview-sev--${f.severity}`} />
                    <div>
                      <strong>
                        {f.standard} · {f.raw.control_id}
                      </strong>
                      <p>
                        {findingTitle(
                          f.raw.evidence_found,
                          f.raw.gaps,
                          f.raw.recommendation,
                          f.raw.status,
                        ).slice(0, 160)}
                        …
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="report-preview-footer">TrustNode · Automated compliance analysis</footer>
        </article>

        <footer className="report-preview-actions">
          {exportError && (
            <span className="text-sm text-rose-400/90" role="alert">
              {exportError}
            </span>
          )}
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExport}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Generating PDF…" : "Download PDF"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
