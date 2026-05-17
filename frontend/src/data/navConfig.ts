import type { NavId } from "../types";

export interface NavItemConfig {
  id: NavId;
  label: string;
  dot?: "green" | "amber";
  title: string;
  titleEmphasis: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: "overview",
    label: "Overview",
    title: "Compliance",
    titleEmphasis: "Overview",
  },
  {
    id: "reports",
    label: "Reports",
    dot: "amber",
    title: "Compliance",
    titleEmphasis: "Reports",
  },
  {
    id: "documents",
    label: "Documents",
    dot: "green",
    title: "Document",
    titleEmphasis: "Library",
  },
  {
    id: "settings",
    label: "Settings",
    title: "Workspace",
    titleEmphasis: "Settings",
  },
];

export interface ReportRow {
  id: string;
  name: string;
  standards: string[];
  score: number;
  status: "ready" | "generating" | "draft";
  updated: string;
}

export interface DocumentRow {
  id: string;
  name: string;
  type: string;
  size: string;
  status: "indexed" | "processing" | "failed";
  uploaded: string;
}

export const REPORTS: ReportRow[] = [
  {
    id: "r1",
    name: "Q1 2026 Compliance Summary",
    standards: ["ISO 27001", "GDPR"],
    score: 87,
    status: "ready",
    updated: "2h ago",
  },
  {
    id: "r2",
    name: "SOC 2 Gap Analysis",
    standards: ["SOC 2"],
    score: 61,
    status: "ready",
    updated: "1d ago",
  },
  {
    id: "r3",
    name: "ISO 9001 Supplier Review",
    standards: ["ISO 9001"],
    score: 88,
    status: "generating",
    updated: "Just now",
  },
  {
    id: "r4",
    name: "Environmental Audit Draft",
    standards: ["ISO 14001"],
    score: 74,
    status: "draft",
    updated: "3d ago",
  },
];

export const DOCUMENTS: DocumentRow[] = [
  {
    id: "d1",
    name: "Access_Control_Policy_v3.pdf",
    type: "PDF",
    size: "2.4 MB",
    status: "indexed",
    uploaded: "2h ago",
  },
  {
    id: "d2",
    name: "Q3_Supplier_Evaluation.docx",
    type: "DOCX",
    size: "840 KB",
    status: "indexed",
    uploaded: "5h ago",
  },
  {
    id: "d3",
    name: "Incident_Response_Plan.pdf",
    type: "PDF",
    size: "1.1 MB",
    status: "processing",
    uploaded: "12m ago",
  },
  {
    id: "d4",
    name: "Data_Retention_Schedule.xlsx",
    type: "XLSX",
    size: "320 KB",
    status: "indexed",
    uploaded: "1d ago",
  },
  {
    id: "d5",
    name: "Legacy_HR_Policy.pdf",
    type: "PDF",
    size: "4.8 MB",
    status: "failed",
    uploaded: "2d ago",
  },
];
