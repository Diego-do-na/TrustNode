import { TrustHero } from "../components/TrustHero";
import { StandardsCard } from "../components/StandardsCard";
import { FindingsCard } from "../components/FindingsCard";
import type { AuditResponse } from "../api/client";

interface OverviewPageProps {
  auditResults: AuditResponse[];
}

export function OverviewPage({ auditResults }: OverviewPageProps) {
  const hasData = auditResults.length > 0;

  return (
    <>
      {hasData && (
        <div className="print:hidden flex justify-end mb-4">
          <button
            type="button"
            onClick={() => window.print()}
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
      )}
      <div className="hero-row">
        <TrustHero auditResults={auditResults} />
        <StandardsCard auditResults={auditResults} />
      </div>
      <FindingsCard auditResults={auditResults} />
    </>
  );
}
