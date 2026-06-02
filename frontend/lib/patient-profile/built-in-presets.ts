import { flatToPaneTree } from "./layout-tree";
import type { PatientProfileLayout } from "./types";

function layoutFromFlat(flat: {
  paneOrder: string[];
  paneState: Record<string, { sizePct: number; hidden: boolean }>;
}): PatientProfileLayout {
  return { version: 5, paneTree: flatToPaneTree(flat) };
}

export interface BuiltInPreset {
  id: "built-in:triage" | "built-in:consult" | "built-in:document";
  label: string;
  description: string;
  layout: PatientProfileLayout;
  /** Keyboard shortcut that activates this preset (ppr-10 registers listeners). */
  hotkey: string;
}

export const BUILT_IN_PRESETS: readonly BuiltInPreset[] = [
  {
    id: "built-in:triage",
    label: "Triage",
    description: "Chart focused — wide chart rail, Rx hidden",
    layout: layoutFromFlat({
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 60, hidden: false },
        body: { sizePct: 40, hidden: false },
        rx: { sizePct: 0, hidden: true },
      },
    }),
    hotkey: "mod+shift+1",
  },
  {
    id: "built-in:consult",
    label: "Consult",
    description: "Balanced 3-column — default layout",
    layout: layoutFromFlat({
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 25, hidden: false },
        body: { sizePct: 50, hidden: false },
        rx: { sizePct: 25, hidden: false },
      },
    }),
    hotkey: "mod+shift+2",
  },
  {
    id: "built-in:document",
    label: "Document",
    description: "Rx focused — chart hidden, body + Rx focus",
    layout: layoutFromFlat({
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 0, hidden: true },
        body: { sizePct: 30, hidden: false },
        rx: { sizePct: 70, hidden: false },
      },
    }),
    hotkey: "mod+shift+3",
  },
];
