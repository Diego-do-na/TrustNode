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
