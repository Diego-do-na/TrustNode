import { useCallback, useEffect, useRef, useState } from "react";
import { clearDb, ingestFiles, runAudit } from "../api/client";
import { ASSESSMENT_STANDARDS, STANDARD_DEFINITIONS } from "../data/standards";
import { formatBytes, useAppState } from "../context/AppStateContext";
import { PixelAnimation } from "./PixelAnimation";
import type { AuditRequest, AuditResponse } from "../api/client";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onAuditComplete: (results: AuditResponse[], language: string) => void;
}

type Phase = "idle" | "clearing" | "ingesting" | "auditing" | "error";

export function UploadModal({ open, onClose, onAuditComplete }: UploadModalProps) {
  const {
    documents,
    fileCache,
    customStandards,
    registerUploadedFiles,
    recordReport,
  } = useAppState();

  const [files, setFiles] = useState<File[]>([]);
  const [reusedDocIds, setReusedDocIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["ISO 27001", "ISO 9001"]),
  );
  const [reportLang, setReportLang] = useState("English");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [auditProgress, setAuditProgress] = useState({ current: 0, total: 0, standard: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = phase !== "idle" && phase !== "error";

  const previousDocs = documents.filter((d) => Boolean(fileCache[d.id]));

  const allStandards = [
    ...ASSESSMENT_STANDARDS,
    ...customStandards.map((s) => s.definition.standard_name),
  ];

  const standardDefinitionFor = useCallback(
    (name: string): AuditRequest | undefined => {
      if (STANDARD_DEFINITIONS[name]) return STANDARD_DEFINITIONS[name];
      const custom = customStandards.find((s) => s.definition.standard_name === name);
      return custom?.definition;
    },
    [customStandards],
  );

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

  const toggleReusedDoc = (id: string) => {
    setReusedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
    const reusedFiles: File[] = [];
    for (const id of reusedDocIds) {
      const f = fileCache[id];
      if (f) reusedFiles.push(f);
    }

    const filesToIngest = [...reusedFiles, ...files];
    if (filesToIngest.length === 0) {
      setError("Select at least one previously uploaded document or add a new PDF.");
      return;
    }
    if (selected.size === 0) {
      setError("Please select at least one standard.");
      return;
    }

    setError(null);

    try {
      // 1. Wipe Chroma so the LLM only sees evidence from this run.
      setPhase("clearing");
      await clearDb();

      // 2. Re-ingest every file the user chose for this audit.
      setPhase("ingesting");
      await ingestFiles(filesToIngest);

      // 3. Persist the doc metadata + file cache for newly dropped files.
      if (files.length > 0) registerUploadedFiles(files);

      // 4. Run audits sequentially against the selected standards.
      setPhase("auditing");
      const standardNames = Array.from(selected);
      const results: AuditResponse[] = [];

      for (let i = 0; i < standardNames.length; i++) {
        const name = standardNames[i];
        setAuditProgress({ current: i + 1, total: standardNames.length, standard: name });
        const def = standardDefinitionFor(name);
        if (!def) continue;
        const result = await runAudit({ ...def, language: reportLang });
        results.push(result);
      }

      // 5. Save the report so it shows up in the Reports tab.
      const documentNames = filesToIngest.map((f) => f.name);
      const avgScore =
        results.length > 0
          ? Math.round(
              results.reduce((sum, r) => sum + r.global_score_percentage, 0) / results.length,
            )
          : 0;
      recordReport({
        name: `Audit · ${standardNames.join(", ")}`,
        standards: standardNames,
        score: avgScore,
        results,
        documentNames,
        language: reportLang,
      });

      onAuditComplete(results, reportLang);
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
      setReusedDocIds(new Set());
      setPhase("idle");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const totalDocs = files.length + reusedDocIds.size;
  const progressLabel =
    phase === "clearing"
      ? "Clearing RAG memory…"
      : phase === "ingesting"
        ? `Ingesting ${totalDocs} file${totalDocs > 1 ? "s" : ""}…`
        : phase === "auditing"
          ? `Analyzing ${auditProgress.standard}… (${auditProgress.current}/${auditProgress.total})`
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
          Analyze Documents
        </h2>
        <p className="modal-sub">
          Upload new files or reuse documents from past sessions, then pick the standards to assess
          against. TrustNode wipes the RAG memory before every audit so results never bleed across
          runs.
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
                <span className="file-item-size">{formatBytes(file.size)}</span>
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

        {previousDocs.length > 0 && (
          <>
            <div className="modal-section-label">Reuse previous uploads</div>
            <ul className="doc-checkbox-list">
              {previousDocs.map((doc) => {
                const checked = reusedDocIds.has(doc.id);
                return (
                  <li key={doc.id}>
                    <label className={`doc-checkbox${checked ? " checked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isLoading}
                        onChange={() => toggleReusedDoc(doc.id)}
                      />
                      <span className="doc-checkbox-name">{doc.name}</span>
                      <span className="doc-checkbox-size">{formatBytes(doc.size)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="modal-section-label">Standards to assess</div>
        <div className="chip-row">
          {allStandards.map((name) => (
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

        <div className="modal-section-label">Report language</div>
        <select
          value={reportLang}
          onChange={(e) => setReportLang(e.target.value)}
          disabled={isLoading}
          className="modal-select"
        >
          <option value="English">Report in English</option>
          <option value="Spanish">Reporte en Español</option>
          <option value="French">Rapport en Français</option>
          <option value="German">Bericht auf Deutsch</option>
          <option value="Portuguese">Relatório em Português</option>
        </select>

        {error && <div className="modal-error">{error}</div>}

        {isLoading && progressLabel && (
          <div className="w-full h-64 flex items-center justify-center bg-transparent">
            <PixelAnimation showHint={true} hintText={progressLabel} />
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
