import type { AuditResponse, AuditResult } from "../api/client";

/**
 * Pure helpers (no runtime imports) so they can be unit-tested with `node --test`.
 */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Bring an AuditResponse persisted by an older version up to the current shape.
 * Missing counts are derived from `results`; a missing score becomes null.
 * Never yields undefined/NaN for the fields the UI reads.
 */
export function normalizeAuditResponse(raw: Partial<AuditResponse> | null | undefined): AuditResponse {
  const r = raw ?? {};
  const results: AuditResult[] = Array.isArray(r.results)
    ? r.results
    : Array.isArray(r.findings)
      ? r.findings
      : [];
  const notEvaluable = results.filter((x) => x.status === "not_evaluable").length;
  return {
    ...(r as AuditResponse),
    standard_audited: r.standard_audited ?? "",
    global_score_percentage: isNum(r.global_score_percentage) ? r.global_score_percentage : null,
    evaluated_count: isNum(r.evaluated_count) ? r.evaluated_count : results.length - notEvaluable,
    not_evaluable_count: isNum(r.not_evaluable_count) ? r.not_evaluable_count : notEvaluable,
    results,
    findings: results,
  };
}

/**
 * Global score across standards, weighted by evaluated controls.
 * Standards with a null score (nothing evaluable) are ignored. Returns null if none count.
 * Not rounded: callers round for display.
 */
export function weightedScore(
  audits: Pick<AuditResponse, "global_score_percentage" | "evaluated_count">[],
): number | null {
  let sum = 0;
  let weight = 0;
  for (const a of audits) {
    const s = a.global_score_percentage;
    const w = a.evaluated_count;
    if (!isNum(s) || !isNum(w) || w <= 0) continue;
    sum += s * w;
    weight += w;
  }
  return weight === 0 ? null : sum / weight;
}
