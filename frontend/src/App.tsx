import { useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { AppStateProvider } from "./context/AppStateContext";
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
  const [lastAuditAt, setLastAuditAt] = useState<Date | null>(null);
  const [reportLanguage, setReportLanguage] = useState<string>("English");
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      <AppStateProvider>
        <section className={`shell print:block print:bg-white print:text-black print:p-0 print:m-0${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}>
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onOpenUpload={() => setUploadOpen(true)}
            ollamaAlive={systemStatus?.ollama_alive ?? null}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
          />
          <section className="content-column print:bg-white print:text-black print:p-0 print:m-0">
            <AmbientBackground />
            <Topbar key={`topbar-${activeTab}`} title={page.title} titleEmphasis={page.titleEmphasis} />
            <main className="main page-enter print:p-0 print:m-0" key={`main-${activeTab}`}>
              <PageContent
                tab={activeTab}
                auditResults={auditResults}
                lastAuditAt={lastAuditAt}
                reportLanguage={reportLanguage}
                onNavigate={setActiveTab}
                onOpenUpload={() => setUploadOpen(true)}
                onShowReport={(results, language) => {
                  setAuditResults(results);
                  setLastAuditAt(new Date());
                  if (language) setReportLanguage(language);
                  setActiveTab("overview");
                }}
              />
            </main>
          </section>
        </section>
        <PlaygroundCube />
        <UploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onAuditComplete={(results, language) => {
            setAuditResults(results);
            setLastAuditAt(new Date());
            setReportLanguage(language);
            setUploadOpen(false);
            setActiveTab("overview");
          }}
        />
      </AppStateProvider>
    </ThemeProvider>
  );
}
