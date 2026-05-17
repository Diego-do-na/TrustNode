import type { AuditResponse } from "../api/client";
import { averageTrustScore, openIssueCount } from "../utils/auditMetrics";

interface OverviewStatsStripProps {
  auditResults: AuditResponse[];
  lastAuditAt: Date | null;
}

function formatLastRun(date: Date | null): string {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function OverviewStatsStrip({ auditResults, lastAuditAt }: OverviewStatsStripProps) {
  const avg = averageTrustScore(auditResults);
  const issues = openIssueCount(auditResults);

  return (
    <section className="overview-stats-strip panel-stats">
      <article className="stat-pill">
        <span className="stat-pill-value">{auditResults.length}</span>
        <span className="stat-pill-label">Standards assessed</span>
      </article>
      <article className="stat-pill">
        <span className="stat-pill-value">{issues}</span>
        <span className="stat-pill-label">Open issues</span>
      </article>
      <article className="stat-pill">
        <span className="stat-pill-value stat-pill-value--sm">{avg !== null ? `${avg}%` : "—"}</span>
        <span className="stat-pill-label">Avg trust · {formatLastRun(lastAuditAt)}</span>
      </article>
    </section>
  );
}
