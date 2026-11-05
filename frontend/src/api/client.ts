const API_BASE = "http://localhost:8000";

export interface StatusResponse {
  api: string;
  ollama_alive: boolean;
  ollama_url: string;
  models_available: string[];
  chroma: Record<string, unknown>;
}

import type { DocType } from "../data/standards";
export type { DocType };

/** Runtime list of valid document types (kept in sync with the DocType union). */
export const DOC_TYPES: readonly DocType[] = ["isms_policy", "topic_policy", "procedure", "soa"];

export interface Check {
  id: string;
  question: string;
  hint?: string;
  /** Case-insensitive substrings; a verified quote must contain at least one. */
  anchors?: string[];
  /** Fixed remediation text shown when the check is not met. */
  recommendation?: string;
}

export interface ControlSchema {
  control_id: string;
  title: string;
  description: string;
  search_keywords: string[];
  applies_to?: DocType[];
  legacy_id?: string;
  checks?: Check[];
}

export interface AuditRequest {
  standard_name: string;
  domain: string;
  controls: ControlSchema[];
  language?: string;
  doc_type?: DocType;
}

export interface Citation {
  chunk_id: string;
  source: string;
  page: number | null;
  quote: string;
}

export interface CheckResult {
  check_id: string;
  question: string;
  found: boolean;
  citations?: Citation[];
  evidence_unverified?: boolean;
}

export interface AuditResult {
  control_id: string;
  status: "Compliant" | "Non-Compliant" | "Partial" | "not_evaluable";
  evidence_found: string;
  gaps: string;
  recommendation: string;
  risk_level: "High" | "Medium" | "Low" | "None";
  citations?: Citation[];
  evidence_unverified?: boolean;
  checks?: CheckResult[];
  note?: string;
}

export interface AuditResponse {
  standard_audited: string;
  /** null when no control was evaluable (rendered as "N/A"). */
  global_score_percentage: number | null;
  evaluated_count: number;
  not_evaluable_count: number;
  /** Absent in reports saved by older versions. */
  doc_type?: DocType;
  results: AuditResult[];
  findings: AuditResult[];
}

export interface IngestResponse {
  ingested: number;
  documents: Record<string, unknown>[];
}

export async function clearDb(): Promise<{ cleared: boolean; collection: string }> {
  const res = await fetch(`${API_BASE}/api/v1/clear_db`, { method: "POST" });
  if (!res.ok) throw new Error(`clear_db failed: ${res.status}`);
  return res.json();
}

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch(`${API_BASE}/api/v1/status`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

export async function ingestFiles(files: File[]): Promise<IngestResponse> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch(`${API_BASE}/api/v1/ingest`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(body.detail ?? `Ingest failed: ${res.status}`);
  }
  return res.json();
}

export interface SummaryRequest {
  standard_audited: string;
  global_score_percentage: number | null;
  results: AuditResult[];
  language?: string;
}

export interface SummaryResponse {
  summary: string;
}

export interface ExportFinding {
  key: string;
  standard: string;
  control_id: string;
  status: string;
  evidence_found: string;
  gaps: string;
  recommendation: string;
  risk_level: string;
  citations?: Citation[];
  evidence_unverified?: boolean;
  checks?: CheckResult[];
}

export interface ExportPdfRequest {
  standard_name: string;
  compliance_score: number | null;
  findings: ExportFinding[];
  doc_type?: DocType | null;
  executive_summary?: string | null;
  generated_at?: string | null;
}

export async function exportReportPdf(payload: ExportPdfRequest): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/v1/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `Export failed: ${res.status}`;
    try {
      const body = (await res.json()) as Record<string, string>;
      if (body.detail) detail = body.detail;
    } catch {
      /* response wasn't JSON — keep the default detail */
    }
    throw new Error(detail);
  }
  return res.blob();
}

export async function generateSummary(payload: SummaryRequest): Promise<SummaryResponse> {
  const res = await fetch(`${API_BASE}/api/v1/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(body.detail ?? `Summary failed: ${res.status}`);
  }
  return res.json();
}

export async function runAudit(payload: AuditRequest): Promise<AuditResponse> {
  const res = await fetch(`${API_BASE}/api/v1/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(body.detail ?? `Audit failed: ${res.status}`);
  }
  return res.json();
}
