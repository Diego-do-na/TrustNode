import { useCallback, useEffect, useRef, useState } from "react";
import { ingestFiles, runAudit } from "../api/client";
import { ASSESSMENT_STANDARDS, STANDARD_DEFINITIONS } from "../data/standards";
import type { AuditResponse } from "../api/client";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onAuditComplete: (results: AuditResponse[]) => void;
}

type Phase = "idle" | "ingesting" | "auditing" | "error";

export function UploadModal({ open, onClose, onAuditComplete }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["ISO 27001", "ISO 9001"]),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [auditProgress, setAuditProgress] = useState({ current: 0, total: 0, standard: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = phase === "ingesting" || phase === "auditing";

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isLoading && e.target === e.currentTarget) onClose();
    },
    [onClose, isLoading],
  );

  const toggleChip = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const pdfs = Array.from(incoming).filter((f) => f.type === "application/pdf");
    if (pdfs.length < incoming.length) {
      setError("Only PDF files are accepted. Non-PDF files were skipped.");
    }
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...pdfs.filter((f) => !existingNames.has(f.name))];
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRunAnalysis = async () => {
    if (files.length === 0) {
      setError("Please select at least one PDF file.");
      return;
    }
    if (selected.size === 0) {
      setError("Please select at least one standard.");
      return;
    }

    setError(null);

    try {
      setPhase("ingesting");
      await ingestFiles(files);

      setPhase("auditing");
      const standardNames = Array.from(selected);
      const results: AuditResponse[] = [];

      for (let i = 0; i < standardNames.length; i++) {
        const name = standardNames[i];
        setAuditProgress({ current: i + 1, total: standardNames.length, standard: name });
        const def = STANDARD_DEFINITIONS[name];
        if (!def) continue;
        const result = await runAudit(def);
        results.push(result);
      }

      onAuditComplete(results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      setPhase("error");
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, isLoading]);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setPhase("idle");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const progressLabel =
    phase === "ingesting"
      ? `Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`
      : phase === "auditing"
        ? `Analysing ${auditProgress.standard}… (${auditProgress.current}/${auditProgress.total})`
        : null;

  return (
    <div className="modal-bg open" onClick={handleBackdrop} role="presentation">
      <div className="modal" role="dialog" aria-labelledby="upload-modal-title">
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          disabled={isLoading}
          aria-label="Close"
        >
          ✕
        </button>
        <h2 id="upload-modal-title" className="modal-title">
          Analyse Documents
        </h2>
        <p className="modal-sub">
          Upload company files and select the standards to assess against. TrustNode will surface
          gaps and compliance status automatically.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />

        <button
          type="button"
          className="modal-drop"
          disabled={isLoading}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <div className="modal-drop-icon">📂</div>
          <div className="modal-drop-title">
            {files.length > 0
              ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
              : "Drop files or click to browse"}
          </div>
          <div className="modal-drop-sub">PDF only — up to 50 MB per file</div>
        </button>

        {files.length > 0 && (
          <ul className="file-list">
            {files.map((file, i) => (
              <li key={file.name} className="file-item">
                <span className="file-item-name">{file.name}</span>
                <span className="file-item-size">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                {!isLoading && (
                  <button
                    type="button"
                    className="file-item-remove"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${file.name}`}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="modal-section-label">Standards to assess</div>
        <div className="chip-row">
          {ASSESSMENT_STANDARDS.map((name) => (
            <button
              key={name}
              type="button"
              className={`chip${selected.has(name) ? " selected" : ""}`}
              onClick={() => !isLoading && toggleChip(name)}
              disabled={isLoading}
            >
              {name}
            </button>
          ))}
        </div>

        {error && <div className="modal-error">{error}</div>}

        {isLoading && progressLabel && (
          <div className="modal-progress">
            <span className="spinner" />
            {progressLabel}
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunAnalysis}
            disabled={isLoading}
          >
            {isLoading ? "Running…" : "Run Analysis →"}
          </button>
        </div>
      </div>
    </div>
  );
}
