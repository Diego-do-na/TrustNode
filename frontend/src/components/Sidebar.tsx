import { Logo } from "./Logo";
import { AnalyseCta } from "./AnalyseCta";
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
}

export function Sidebar({ activeTab, onTabChange, onOpenUpload }: SidebarProps) {
  const { theme, toggleTheme, themeLabel } = useTheme();

  return (
    <aside className="sidebar">
      <Logo />

      <AnalyseCta onClick={onOpenUpload} />

      <span className="nav-label">Main</span>
      {NAV_ITEMS.map(({ id, label, dot }) => {
        const Icon = NAV_ICONS[id];
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            className={`nav-item${isActive ? " active" : ""}`}
            onClick={() => onTabChange(id)}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon />
            {label}
            {dot && <span className={`nav-dot ${dot}`} />}
          </button>
        );
      })}

      <section className="sidebar-bottom">
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
      </section>
    </aside>
  );
}
