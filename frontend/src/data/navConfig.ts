import type { NavId } from "../types";

export interface NavItemConfig {
  id: NavId;
  label: string;
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
    title: "Compliance",
    titleEmphasis: "Reports",
  },
  {
    id: "documents",
    label: "Documents",
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
