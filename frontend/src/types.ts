export type Theme = "dark" | "light";
export type NavId = "overview" | "reports" | "documents" | "settings";
export type ScoreLevel = "high" | "mid" | "low";
export type FindingSeverity = "critical" | "warning" | "pass";
export type ComplianceTag = "compliant" | "partial" | "non-compliant";

export interface Standard {
  id: string;
  name: string;
  desc: string;
  score: number;
  level: ScoreLevel;
}

export interface Finding {
  id: string;
  title: string;
  standard: string;
  clause: string;
  tag: ComplianceTag;
  severity: FindingSeverity;
  time: string;
}
