import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { AuditResponse } from "../api/client";
import { LogoMark } from "./Logo";
import { averageTrustScore, flattenFindings, scoreLevel } from "../utils/auditMetrics";

interface ReportPreviewModalProps {
  open: boolean;
  auditResults: AuditResponse[];
  lastAuditAt: Date | null;
  onClose: () => void;
}

function findingTitle(evidence: string, gaps: string, recommendation: string, status: string): string {
  if (status === "Compliant") return evidence;
  return gaps || recommendation;
}

export function ReportPreviewModal({ open, auditResults, lastAuditAt, onClose }: ReportPreviewModalProps) {
  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handlePrint = () => {
    onClose();
    window.setTimeout(() => window.print(), 120);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || auditResults.length === 0) return null;

  const score = averageTrustScore(auditResults)!;
  const level = scoreLevel(score);
  const findings = flattenFindings(auditResults)
    .filter((f) => f.severity !== "pass")
    .slice(0, 6);
  const generated = lastAuditAt?.toLocaleString() ?? new Date().toLocaleString();

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

          {findings.length > 0 && (
            <section className="report-preview-section">
              <h3>Priority findings</h3>
              <ul className="report-preview-findings">
                {findings.map((f) => (
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
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            Print / Save as PDF
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
