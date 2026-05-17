import { useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { UploadModal } from "./components/UploadModal";
import { AmbientBackground } from "./components/AmbientBackground";
import { PlaygroundCube } from "./components/PlaygroundCube";
import { NAV_ITEMS } from "./data/navConfig";
import { PageContent } from "./pages";
import { fetchStatus } from "./api/client";
import type { NavId } from "./types";
import type { AuditResponse, StatusResponse } from "./api/client";

export default function App() {
  const [activeTab, setActiveTab] = useState<NavId>("overview");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<StatusResponse | null>(null);
  const [auditResults, setAuditResults] = useState<AuditResponse[]>([]);

  useEffect(() => {
    fetchStatus()
      .then(setSystemStatus)
      .catch((err: unknown) => console.error("Status check failed:", err));
  }, []);

  const page = useMemo(
    () => NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0],
    [activeTab],
  );

  return (
    <ThemeProvider>
      <section className="shell">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenUpload={() => setUploadOpen(true)}
          ollamaAlive={systemStatus?.ollama_alive ?? null}
        />
        <section className="content-column">
          <AmbientBackground />
          <Topbar key={activeTab} title={page.title} titleEmphasis={page.titleEmphasis} />
          <main className="main page-enter" key={activeTab}>
            <PageContent tab={activeTab} auditResults={auditResults} />
          </main>
        </section>
      </section>
      <PlaygroundCube />
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onAuditComplete={(results) => {
          setAuditResults(results);
          setUploadOpen(false);
        }}
      />
    </ThemeProvider>
  );
}
