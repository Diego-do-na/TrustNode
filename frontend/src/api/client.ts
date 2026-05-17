const API_BASE = "http://localhost:8000";

export interface StatusResponse {
  api: string;
  ollama_alive: boolean;
  ollama_url: string;
  models_available: string[];
  chroma: Record<string, unknown>;
}

export interface ControlSchema {
  control_id: string;
  title: string;
  description: string;
  search_keywords: string[];
}

export interface AuditRequest {
  standard_name: string;
  domain: string;
  controls: ControlSchema[];
  language?: string;
}

export interface AuditResult {
  control_id: string;
  status: "Compliant" | "Non-Compliant" | "Partial";
  evidence_found: string;
  gaps: string;
  recommendation: string;
  risk_level: "High" | "Medium" | "Low" | "None";
}

export interface AuditResponse {
  standard_audited: string;
  global_score_percentage: number;
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
  global_score_percentage: number;
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
}

export interface ExportPdfRequest {
  standard_name: string;
  compliance_score: number;
  findings: ExportFinding[];
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
