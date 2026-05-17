import type { NavId } from "../types";
import type { AuditResponse } from "../api/client";
import { OverviewPage } from "./OverviewPage";
import { ReportsPage } from "./ReportsPage";
import { DocumentsPage } from "./DocumentsPage";
import { SettingsPage } from "./SettingsPage";

interface PageContentProps {
  tab: NavId;
  auditResults: AuditResponse[];
  lastAuditAt: Date | null;
  onNavigate: (tab: NavId) => void;
  onShowReport: (results: AuditResponse[]) => void;
  onOpenUpload: () => void;
}

export function PageContent({
  tab,
  auditResults,
  lastAuditAt,
  onNavigate,
  onShowReport,
  onOpenUpload,
}: PageContentProps) {
  const panel = (() => {
  switch (tab) {
    case "overview":
      return (
        <OverviewPage
          auditResults={auditResults}
          lastAuditAt={lastAuditAt}
          onOpenUpload={onOpenUpload}
        />
      );
    case "reports":
      return <ReportsPage onShowReport={onShowReport} />;
    case "documents":
      return <DocumentsPage onOpenUpload={onOpenUpload} />;
    case "settings":
      return <SettingsPage />;
    default:
      return (
        <OverviewPage
          auditResults={auditResults}
          lastAuditAt={lastAuditAt}
          onOpenUpload={onOpenUpload}
        />
      );
  }
  })();

  return <div className="page-panel-transition">{panel}</div>;
}
