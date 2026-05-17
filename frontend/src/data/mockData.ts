import type { Finding, Standard } from "../types";

export const TRUST_SCORE = 87;
export const SCORE_CHANGE = 4;

export const STANDARDS: Standard[] = [
  { id: "iso27001", name: "ISO 27001", desc: "Security", score: 91, level: "high" },
  { id: "iso9001", name: "ISO 9001", desc: "Quality", score: 88, level: "high" },
  { id: "iso14001", name: "ISO 14001", desc: "Environment", score: 74, level: "mid" },
  { id: "gdpr", name: "GDPR", desc: "Privacy", score: 79, level: "mid" },
  { id: "soc2", name: "SOC 2", desc: "Controls", score: 61, level: "low" },
  { id: "iso45001", name: "ISO 45001", desc: "Safety", score: 93, level: "high" },
];

export const FINDINGS: Finding[] = [
  {
    id: "1",
    title: "Access control policy lacks MFA enforcement documentation",
    standard: "ISO 27001",
    clause: "§ A.9.4.2",
    tag: "non-compliant",
    severity: "critical",
    time: "2h ago",
  },
  {
    id: "2",
    title: "Supplier evaluation criteria not fully documented in Q3 review",
    standard: "ISO 9001",
    clause: "§ 8.4.1",
    tag: "partial",
    severity: "warning",
    time: "5h ago",
  },
  {
    id: "3",
    title: "Data retention schedule aligns with GDPR Article 17 requirements",
    standard: "GDPR",
    clause: "Art. 17",
    tag: "compliant",
    severity: "pass",
    time: "1d ago",
  },
  {
    id: "4",
    title: "Greenhouse gas emission targets lack measurable baselines",
    standard: "ISO 14001",
    clause: "§ 6.2.1",
    tag: "partial",
    severity: "warning",
    time: "2d ago",
  },
  {
    id: "5",
    title: "Incident response plan has no documented recovery time objectives",
    standard: "SOC 2",
    clause: "CC7.5",
    tag: "non-compliant",
    severity: "critical",
    time: "3d ago",
  },
];

export const ASSESSMENT_STANDARDS = STANDARDS.map((s) => s.name);
