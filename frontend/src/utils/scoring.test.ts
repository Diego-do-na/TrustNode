import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAuditResponse, weightedScore } from "./scoring.ts";

const res = (status: string) => ({ control_id: "x", status }) as never;

test("old stored report: counts derived from results, no NaN/undefined", () => {
  const old = {
    standard_audited: "ISO 9001",
    global_score_percentage: 60,
    results: [res("Compliant"), res("Partial"), res("Non-Compliant")],
    findings: [],
  };
  const n = normalizeAuditResponse(old as never);
  assert.equal(n.evaluated_count, 3);
  assert.equal(n.not_evaluable_count, 0);
  assert.equal(n.global_score_percentage, 60);
  assert.equal(n.findings.length, 3);
});

test("old report with not_evaluable results counts them separately", () => {
  const n = normalizeAuditResponse({ results: [res("Compliant"), res("not_evaluable")] } as never);
  assert.equal(n.evaluated_count, 1);
  assert.equal(n.not_evaluable_count, 1);
  assert.equal(n.global_score_percentage, null);
});

test("garbage input yields safe defaults", () => {
  const n = normalizeAuditResponse(undefined);
  assert.deepEqual(
    [n.evaluated_count, n.not_evaluable_count, n.global_score_percentage, n.results.length],
    [0, 0, null, 0],
  );
  const bad = normalizeAuditResponse({ evaluated_count: NaN, global_score_percentage: undefined } as never);
  assert.equal(bad.evaluated_count, 0);
  assert.equal(bad.global_score_percentage, null);
});

test("current-shape report is preserved", () => {
  const n = normalizeAuditResponse({
    standard_audited: "ISO 27001", global_score_percentage: 75, evaluated_count: 4,
    not_evaluable_count: 9, results: [res("Compliant")],
  } as never);
  assert.equal(n.evaluated_count, 4);
  assert.equal(n.not_evaluable_count, 9);
});

test("weightedScore weights by evaluated controls", () => {
  const v = weightedScore([
    { global_score_percentage: 100, evaluated_count: 1 },
    { global_score_percentage: 50, evaluated_count: 3 },
  ]);
  assert.equal(v, 62.5); // simple mean would be 75
});

test("weightedScore ignores null scores and zero weights", () => {
  assert.equal(
    weightedScore([
      { global_score_percentage: null, evaluated_count: 0 },
      { global_score_percentage: 80, evaluated_count: 5 },
    ]),
    80,
  );
  assert.equal(weightedScore([{ global_score_percentage: null, evaluated_count: 0 }]), null);
  assert.equal(weightedScore([]), null);
});
