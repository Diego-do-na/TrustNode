import { useRef, useState } from "react";
import { ASSESSMENT_STANDARDS } from "../data/standards";
import { useTheme } from "../context/ThemeContext";
import { useAppState } from "../context/AppStateContext";
import type { AuditRequest, ControlSchema } from "../api/client";

function validateStandardJson(raw: unknown): AuditRequest {
  if (!raw || typeof raw !== "object") {
    throw new Error("File is not a JSON object.");
  }
  const obj = raw as Record<string, unknown>;

  const name = obj.standard_name;
  const domain = obj.domain ?? "Custom";
  const controls = obj.controls;

  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Missing required field: standard_name (string).");
  }
  if (!Array.isArray(controls) || controls.length === 0) {
    throw new Error("controls must be a non-empty array.");
  }

  const validControls: ControlSchema[] = controls.map((c, idx) => {
    if (!c || typeof c !== "object") {
      throw new Error(`controls[${idx}] is not an object.`);
    }
    const rec = c as Record<string, unknown>;
    if (typeof rec.control_id !== "string") {
      throw new Error(`controls[${idx}].control_id must be a string.`);
    }
    if (typeof rec.title !== "string") {
      throw new Error(`controls[${idx}].title must be a string.`);
    }
    if (typeof rec.description !== "string") {
      throw new Error(`controls[${idx}].description must be a string.`);
    }
    const keywords = Array.isArray(rec.search_keywords)
      ? rec.search_keywords.filter((k): k is string => typeof k === "string")
      : [];
    return {
      control_id: rec.control_id,
      title: rec.title,
      description: rec.description,
      search_keywords: keywords,
    };
  });

  return {
    standard_name: name.trim(),
    domain: typeof domain === "string" ? domain : "Custom",
    controls: validControls,
  };
}

export function SettingsPage() {
  const { theme, toggleTheme, themeLabel } = useTheme();
  const { customStandards, addCustomStandard, removeCustomStandard } = useAppState();

  const [enabledStandards, setEnabledStandards] = useState<Set<string>>(
    () => new Set(ASSESSMENT_STANDARDS),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleStandard = (name: string) => {
    setEnabledStandards((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleStandardFile = async (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const definition = validateStandardJson(parsed);
      const entry = addCustomStandard(definition);
      setEnabledStandards((prev) => new Set(prev).add(entry.definition.standard_name));
      setUploadSuccess(
        `Loaded "${entry.definition.standard_name}" (${entry.definition.controls.length} controls).`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid JSON file.";
      setUploadError(msg);
    }
  };

  const allStandardNames = [
    ...ASSESSMENT_STANDARDS,
    ...customStandards.map((s) => s.definition.standard_name),
  ];

  return (
    <section className="page-panel settings-panel">
      <section className="glass-card settings-card">
        <header className="card-header">
          <span className="card-title">Active standards</span>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Custom Standard (.json)
          </button>
        </header>
        <p className="settings-hint">
          Choose which frameworks TrustNode evaluates by default. Custom JSON cartridges loaded
          here become selectable in the Analyze modal.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleStandardFile(file);
            e.target.value = "";
          }}
        />

        {uploadError && <div className="settings-banner error">{uploadError}</div>}
        {uploadSuccess && <div className="settings-banner success">{uploadSuccess}</div>}

        <span className="chip-row settings-chips">
          {allStandardNames.map((name) => (
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

        {customStandards.length > 0 && (
          <ul className="custom-standards-list">
            {customStandards.map((std) => (
              <li key={std.id} className="custom-standard-row">
                <span className="custom-standard-name">
                  {std.definition.standard_name}
                  <small>
                    {std.definition.controls.length} controls · {std.definition.domain}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => removeCustomStandard(std.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card settings-card">
        <header className="card-header">
          <span className="card-title">Appearance</span>
        </header>
        <ul className="settings-rows">
          <li className="settings-row">
            <span className="settings-row-label">
              <strong>Theme</strong>
              <small>Currently {theme} mode</small>
            </span>
            <button type="button" className="btn-ghost btn-sm" onClick={toggleTheme}>
              Switch to {themeLabel.replace(" mode", "")}
            </button>
          </li>
        </ul>
      </section>
    </section>
  );
}
