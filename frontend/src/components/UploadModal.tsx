import { useCallback, useEffect, useState } from "react";
import { ASSESSMENT_STANDARDS } from "../data/mockData";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
}

export function UploadModal({ open, onClose }: UploadModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["ISO 27001", "ISO 9001"]),
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const toggleChip = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-bg open" onClick={handleBackdrop} role="presentation">
      <div className="modal" role="dialog" aria-labelledby="upload-modal-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 id="upload-modal-title" className="modal-title">
          Analyse Documents
        </h2>
        <p className="modal-sub">
          Upload company files and select the standards to assess against. TrustNode will surface
          gaps and compliance status automatically.
        </p>

        <button
          type="button"
          className="modal-drop"
          onClick={() => window.alert("File picker opens here")}
        >
          <div className="modal-drop-icon">📂</div>
          <div className="modal-drop-title">Drop files or click to browse</div>
          <div className="modal-drop-sub">PDF, DOCX, XLSX, TXT — up to 50 MB</div>
        </button>

        <div className="modal-section-label">Standards to assess</div>
        <div className="chip-row">
          {ASSESSMENT_STANDARDS.map((name) => (
            <button
              key={name}
              type="button"
              className={`chip${selected.has(name) ? " selected" : ""}`}
              onClick={() => toggleChip(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.alert("LLM analysis pipeline fires here!")}
          >
            Run Analysis →
          </button>
        </div>
      </div>
    </div>
  );
}
