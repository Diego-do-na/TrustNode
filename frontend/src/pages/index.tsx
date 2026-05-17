import type { NavId } from "../types";
import type { AuditResponse } from "../api/client";
import { OverviewPage } from "./OverviewPage";
import { ReportsPage } from "./ReportsPage";
import { DocumentsPage } from "./DocumentsPage";
import { SettingsPage } from "./SettingsPage";

interface PageContentProps {
  tab: NavId;
  auditResults: AuditResponse[];
}

export function PageContent({ tab, auditResults }: PageContentProps) {
  switch (tab) {
    case "reports":
      return <ReportsPage />;
    case "documents":
      return <DocumentsPage />;
    case "settings":
      return <SettingsPage />;
    case "overview":
    default:
      return <OverviewPage auditResults={auditResults} />;
  }
}
