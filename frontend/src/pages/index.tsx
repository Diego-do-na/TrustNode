import type { NavId } from "../types";
import { OverviewPage } from "./OverviewPage";
import { ReportsPage } from "./ReportsPage";
import { DocumentsPage } from "./DocumentsPage";
import { SettingsPage } from "./SettingsPage";

export function PageContent({ tab }: { tab: NavId }) {
  switch (tab) {
    case "reports":
      return <ReportsPage />;
    case "documents":
      return <DocumentsPage />;
    case "settings":
      return <SettingsPage />;
    case "overview":
    default:
      return <OverviewPage />;
  }
}
