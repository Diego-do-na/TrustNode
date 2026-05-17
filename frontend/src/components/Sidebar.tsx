import { Logo } from "./Logo";
import { AnalyzeCta } from "./AnalyzeCta";
import {
  DocumentsIcon,
  OverviewIcon,
  ReportsIcon,
  SettingsIcon,
} from "./icons/NavIcons";
import { useTheme } from "../context/ThemeContext";
import { NAV_ITEMS } from "../data/navConfig";
import type { NavId } from "../types";

const NAV_ICONS = {
  overview: OverviewIcon,
  reports: ReportsIcon,
  documents: DocumentsIcon,
  settings: SettingsIcon,
} as const;

interface SidebarProps {
  activeTab: NavId;
  onTabChange: (tab: NavId) => void;
  onOpenUpload: () => void;
  ollamaAlive: boolean | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ activeTab, onTabChange, onOpenUpload, ollamaAlive, isOpen, onToggle }: SidebarProps) {
  const { theme, toggleTheme, themeLabel } = useTheme();

  const statusClass =
    ollamaAlive === null ? "pending" : ollamaAlive ? "online" : "offline";
  const statusLabel =
    ollamaAlive === null ? "Checking..." : ollamaAlive ? "System Online" : "LLM Offline";

  return (
    <aside className="sidebar print:hidden">
      <Logo />

      <AnalyzeCta onClick={onOpenUpload} />

      <span className="nav-label">Main</span>
      {NAV_ITEMS.map(({ id, label }) => {
        const Icon = NAV_ICONS[id];
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            className={`nav-item${isActive ? " active" : ""}`}
            onClick={() => onTabChange(id)}
            aria-current={isActive ? "page" : undefined}
            title={label}
          >
            <Icon />
            <span className="nav-item-label">{label}</span>
          </button>
        );
      })}

      <section className="sidebar-bottom">
        <div className="system-status">
          <span className={`status-dot ${statusClass}`} />
          <span className="status-label">{statusLabel}</span>
        </div>

        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-pressed={theme === "light"}
        >
          <span className="theme-toggle-label">{themeLabel}</span>
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </button>

        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <span className="sidebar-toggle-icon">{isOpen ? "⟨" : "⟩"}</span>
        </button>
      </section>
    </aside>
  );
}
