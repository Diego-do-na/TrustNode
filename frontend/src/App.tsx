import { useMemo, useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { UploadModal } from "./components/UploadModal";
import { AmbientBackground } from "./components/AmbientBackground";
import { PlaygroundCube } from "./components/PlaygroundCube";
import { NAV_ITEMS } from "./data/navConfig";
import { PageContent } from "./pages";
import type { NavId } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<NavId>("overview");
  const [uploadOpen, setUploadOpen] = useState(false);

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
        />
        <section className="content-column">
          <AmbientBackground />
          <Topbar key={activeTab} title={page.title} titleEmphasis={page.titleEmphasis} />
          <main className="main page-enter" key={activeTab}>
            <PageContent tab={activeTab} />
          </main>
        </section>
      </section>
      <PlaygroundCube />
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </ThemeProvider>
  );
}
