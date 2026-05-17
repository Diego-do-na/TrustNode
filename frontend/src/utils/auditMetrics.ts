import type { AuditResponse, AuditResult } from "../api/client";
import { STANDARD_DEFINITIONS } from "../data/standards";
import type { FindingSeverity } from "../types";

export function scoreLevel(pct: number): "high" | "mid" | "low" {
  if (pct >= 80) return "high";
  if (pct >= 60) return "mid";
  return "low";
}

export function averageTrustScore(auditResults: AuditResponse[]): number | null {
  if (auditResults.length === 0) return null;
  return Math.round(
    auditResults.reduce((sum, r) => sum + r.global_score_percentage, 0) / auditResults.length,
  );
}

function toSeverity(risk: AuditResult["risk_level"]): FindingSeverity {
  if (risk === "High") return "critical";
  if (risk === "Medium") return "warning";
  return "pass";
}

export function flattenFindings(auditResults: AuditResponse[]) {
  return auditResults.flatMap((auditResp) =>
    auditResp.findings.map((raw) => ({
      key: `${auditResp.standard_audited}-${raw.control_id}`,
      standard: auditResp.standard_audited,
      severity: toSeverity(raw.risk_level),
      raw,
    })),
  );
}

export function controlProgress(result: AuditResponse): { assessed: number; total: number } {
  const assessed = result.findings.length;
  const defined = STANDARD_DEFINITIONS[result.standard_audited]?.controls.length;
  const total = Math.max(defined ?? 0, assessed, result.results.length);
  return { assessed, total: total || assessed };
}
