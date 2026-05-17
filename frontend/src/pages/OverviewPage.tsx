import { TrustHero } from "../components/TrustHero";
import { StandardsCard } from "../components/StandardsCard";
import { FindingsCard } from "../components/FindingsCard";
import type { AuditResponse } from "../api/client";

interface OverviewPageProps {
  auditResults: AuditResponse[];
}

export function OverviewPage({ auditResults }: OverviewPageProps) {
  return (
    <>
      <div className="hero-row">
        <TrustHero auditResults={auditResults} />
        <StandardsCard auditResults={auditResults} />
      </div>
      <FindingsCard auditResults={auditResults} />
    </>
  );
}
