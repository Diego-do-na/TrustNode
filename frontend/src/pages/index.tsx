import type { NavId } from "../types";
import type { AuditResponse } from "../api/client";
import { OverviewPage } from "./OverviewPage";
import { ReportsPage } from "./ReportsPage";
import { DocumentsPage } from "./DocumentsPage";
import { SettingsPage } from "./SettingsPage";

interface PageContentProps {
  tab: NavId;
  auditResults: AuditResponse[];
  onNavigate: (tab: NavId) => void;
  onShowReport: (results: AuditResponse[]) => void;
}

export function PageContent({ tab, auditResults, onNavigate, onShowReport }: PageContentProps) {
  switch (tab) {
    case "overview":
      return <OverviewPage auditResults={auditResults} />;
    case "reports":
      return <ReportsPage onShowReport={onShowReport} />;
    case "documents":
      return <DocumentsPage onOpenUpload={() => onNavigate("overview")} />;
    case "settings":
      return <SettingsPage />;
    default:
      return <OverviewPage auditResults={auditResults} />;
  }
}
