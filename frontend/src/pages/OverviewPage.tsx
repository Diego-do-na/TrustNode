import { useState } from "react";
import { TrustHero } from "../components/TrustHero";
import { StandardsCard } from "../components/StandardsCard";
import { FindingsCard } from "../components/FindingsCard";
import { ComplianceHeatmap } from "../components/ComplianceHeatmap";
import { ExecutiveSummary } from "../components/ExecutiveSummary";
import { OverviewEmptyState } from "../components/OverviewEmptyState";
import { ReportPreviewModal } from "../components/ReportPreviewModal";
import type { AuditResponse } from "../api/client";

interface OverviewPageProps {
  auditResults: AuditResponse[];
  lastAuditAt: Date | null;
  reportLanguage: string;
  onOpenUpload: () => void;
}

export function OverviewPage({ auditResults, lastAuditAt, reportLanguage, onOpenUpload }: OverviewPageProps) {
  const hasData = auditResults.length > 0;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [executiveSummary, setExecutiveSummary] = useState<string | null>(null);

  if (!hasData) {
    return <OverviewEmptyState onStartAudit={onOpenUpload} />;
  }

  return (
    <div className="overview-enter">
      <div className="overview-enter-item overview-enter-item--actions flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="btn-ghost btn-sm inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Export Report (PDF)
        </button>
      </div>

      <div className="hero-row overview-enter-item overview-enter-item--hero">
        <TrustHero auditResults={auditResults} />
        <StandardsCard auditResults={auditResults} />
      </div>

      <div className="overview-enter-item overview-enter-item--heatmap">
        <ComplianceHeatmap auditResults={auditResults} />
      </div>

      <div className="overview-enter-item overview-enter-item--findings">
        <FindingsCard auditResults={auditResults} />
      </div>

      <div className="overview-enter-item overview-enter-item--findings">
        <ExecutiveSummary
          auditResults={auditResults}
          language={reportLanguage}
          onSummaryChange={setExecutiveSummary}
        />
      </div>

      <ReportPreviewModal
        open={previewOpen}
        auditResults={auditResults}
        lastAuditAt={lastAuditAt}
        executiveSummary={executiveSummary}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
