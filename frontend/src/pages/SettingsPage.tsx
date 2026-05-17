import { useState } from "react";
import { ASSESSMENT_STANDARDS } from "../data/standards";
import { useTheme } from "../context/ThemeContext";

export function SettingsPage() {
  const { theme, toggleTheme, themeLabel } = useTheme();
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [autoIndex, setAutoIndex] = useState(true);
  const [enabledStandards, setEnabledStandards] = useState<Set<string>>(
    () => new Set(ASSESSMENT_STANDARDS),
  );

  const toggleStandard = (name: string) => {
    setEnabledStandards((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <section className="page-panel settings-panel">
      <section className="glass-card settings-card">
        <header className="card-header">
          <span className="card-title">Organization</span>
        </header>
        <ul className="settings-rows">
          <li className="settings-row">
            <span className="settings-row-label">
              <strong>Organization name</strong>
              <small>Displayed in sidebar and exports</small>
            </span>
            <input className="settings-input" type="text" defaultValue="Acme Corp" />
          </li>
          <li className="settings-row">
            <span className="settings-row-label">
              <strong>Analysis mode</strong>
              <small>Continuous monitoring of uploaded documents</small>
            </span>
            <span className="tag compliant">Active</span>
          </li>
        </ul>
      </section>

      <section className="glass-card settings-card">
        <header className="card-header">
          <span className="card-title">Active standards</span>
        </header>
        <p className="settings-hint">Choose which frameworks TrustNode evaluates by default.</p>
        <span className="chip-row settings-chips">
          {ASSESSMENT_STANDARDS.map((name) => (
            <button
              key={name}
              type="button"
              className={`chip${enabledStandards.has(name) ? " selected" : ""}`}
              onClick={() => toggleStandard(name)}
            >
              {name}
            </button>
          ))}
        </span>
      </section>

      <section className="glass-card settings-card">
        <header className="card-header">
          <span className="card-title">Preferences</span>
        </header>
        <ul className="settings-rows">
          <li className="settings-row">
            <span className="settings-row-label">
              <strong>Appearance</strong>
              <small>Currently {theme} mode</small>
            </span>
            <button type="button" className="btn-ghost btn-sm" onClick={toggleTheme}>
              Switch to {themeLabel.replace(" mode", "")}
            </button>
          </li>
          <li className="settings-row">
            <span className="settings-row-label">
              <strong>Email alerts</strong>
              <small>Notify when new critical findings appear</small>
            </span>
            <button
              type="button"
              className={`toggle-pill${emailAlerts ? " on" : ""}`}
              onClick={() => setEmailAlerts((v) => !v)}
              aria-pressed={emailAlerts}
            >
              <span className="toggle-pill-thumb" />
            </button>
          </li>
          <li className="settings-row">
            <span className="settings-row-label">
              <strong>Auto-index uploads</strong>
              <small>Index new files immediately after upload</small>
            </span>
            <button
              type="button"
              className={`toggle-pill${autoIndex ? " on" : ""}`}
              onClick={() => setAutoIndex((v) => !v)}
              aria-pressed={autoIndex}
            >
              <span className="toggle-pill-thumb" />
            </button>
          </li>
        </ul>
      </section>
    </section>
  );
}
