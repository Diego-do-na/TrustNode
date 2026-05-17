import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuditRequest, AuditResponse } from "../api/client";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface StoredDocument {
  id: string;
  name: string;
  size: number;          // bytes
  type: string;          // e.g. "PDF"
  uploadedAt: number;    // epoch ms
}

export interface StoredReport {
  id: string;
  name: string;
  standards: string[];
  score: number;
  createdAt: number;     // epoch ms
  results: AuditResponse[];
  documentNames: string[];
  language?: string;
}

export interface CustomStandard {
  id: string;
  definition: AuditRequest;
  uploadedAt: number;
}

interface AppState {
  documents: StoredDocument[];
  reports: StoredReport[];
  customStandards: CustomStandard[];
  // In-memory File blobs so previously uploaded files can be re-used in a new
  // audit without forcing the user to drop them again. Not persisted.
  fileCache: Record<string, File>;
}

interface AppStateContextValue extends AppState {
  registerUploadedFiles: (files: File[]) => StoredDocument[];
  recordReport: (report: Omit<StoredReport, "id" | "createdAt">) => StoredReport;
  addCustomStandard: (definition: AuditRequest) => CustomStandard;
  removeCustomStandard: (id: string) => void;
  removeDocument: (id: string) => void;
  removeReport: (id: string) => void;
}

const STORAGE_KEY = "trustnode.state.v1";

const AppStateContext = createContext<AppStateContextValue | null>(null);

// ──────────────────────────────────────────────────────────────────────────
// Persistence helpers — only the serialisable slices are written.
// ──────────────────────────────────────────────────────────────────────────

interface PersistedShape {
  documents: StoredDocument[];
  reports: StoredReport[];
  customStandards: CustomStandard[];
}

function loadPersisted(): PersistedShape {
  if (typeof window === "undefined") {
    return { documents: [], reports: [], customStandards: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { documents: [], reports: [], customStandards: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      documents: parsed.documents ?? [],
      reports: parsed.reports ?? [],
      customStandards: parsed.customStandards ?? [],
    };
  } catch {
    return { documents: [], reports: [], customStandards: [] };
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────────────────

export function AppStateProvider({ children }: { children: ReactNode }) {
  const persisted = useRef<PersistedShape | null>(null);
  if (persisted.current === null) persisted.current = loadPersisted();

  const [documents, setDocuments] = useState<StoredDocument[]>(persisted.current.documents);
  const [reports, setReports] = useState<StoredReport[]>(persisted.current.reports);
  const [customStandards, setCustomStandards] = useState<CustomStandard[]>(
    persisted.current.customStandards,
  );
  const [fileCache, setFileCache] = useState<Record<string, File>>({});

  // Sync persisted slices to localStorage whenever they change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: PersistedShape = { documents, reports, customStandards };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota exceeded or storage unavailable — silently skip.
    }
  }, [documents, reports, customStandards]);

  const registerUploadedFiles = useCallback((files: File[]): StoredDocument[] => {
    const created: StoredDocument[] = [];
    const newCacheEntries: Record<string, File> = {};

    setDocuments((prev) => {
      const next = [...prev];
      for (const file of files) {
        const existing = next.find((d) => d.name === file.name && d.size === file.size);
        if (existing) {
          newCacheEntries[existing.id] = file;
          continue;
        }
        const doc: StoredDocument = {
          id: makeId("doc"),
          name: file.name,
          size: file.size,
          type: file.name.split(".").pop()?.toUpperCase() ?? "FILE",
          uploadedAt: Date.now(),
        };
        next.unshift(doc);
        created.push(doc);
        newCacheEntries[doc.id] = file;
      }
      return next;
    });

    setFileCache((prev) => ({ ...prev, ...newCacheEntries }));
    return created;
  }, []);

  const recordReport = useCallback(
    (report: Omit<StoredReport, "id" | "createdAt">) => {
      const full: StoredReport = {
        ...report,
        id: makeId("rep"),
        createdAt: Date.now(),
      };
      setReports((prev) => [full, ...prev]);
      return full;
    },
    [],
  );

  const addCustomStandard = useCallback((definition: AuditRequest) => {
    const entry: CustomStandard = {
      id: makeId("std"),
      definition,
      uploadedAt: Date.now(),
    };
    setCustomStandards((prev) => {
      // Replace any existing custom standard with the same name.
      const filtered = prev.filter((s) => s.definition.standard_name !== definition.standard_name);
      return [entry, ...filtered];
    });
    return entry;
  }, []);

  const removeCustomStandard = useCallback((id: string) => {
    setCustomStandards((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setFileCache((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const removeReport = useCallback((id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      documents,
      reports,
      customStandards,
      fileCache,
      registerUploadedFiles,
      recordReport,
      addCustomStandard,
      removeCustomStandard,
      removeDocument,
      removeReport,
    }),
    [
      documents,
      reports,
      customStandards,
      fileCache,
      registerUploadedFiles,
      recordReport,
      addCustomStandard,
      removeCustomStandard,
      removeDocument,
      removeReport,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within <AppStateProvider>");
  return ctx;
}

// ──────────────────────────────────────────────────────────────────────────
// Formatting helpers re-used by Documents / Reports pages.
// ──────────────────────────────────────────────────────────────────────────

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}mo ago`;
  const year = Math.round(month / 12);
  return `${year}y ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
