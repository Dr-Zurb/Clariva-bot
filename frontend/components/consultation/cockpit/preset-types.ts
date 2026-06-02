/**
 * preset-types — shared type and constant contracts lifted out of the v1-only
 * `cockpit-layout.ts` and `useCockpitPresets.ts` modules for ppr-14.
 *
 * The surviving green-grade components (`SavePresetDialog`, `ManagePresetsDialog`,
 * `PatientProfileHeader`) and the v2 adapter `PatientProfilePage` all reference
 * these symbols. Lifting them here makes the Step 4 deletions of the original
 * files genuinely transitive.
 *
 * Runtime helpers (BUILT_IN_PRESETS, COLUMN_ORDER_PERMUTATIONS, permutations,
 * labelForOrder, layoutsEqual, slotsEqualOrder) are included because
 * `PatientProfileHeader.tsx` needs them in v2 — they are NOT v1-only.
 */

// ---------------------------------------------------------------------------
// Column / layout types  (from cockpit-layout.ts)
// ---------------------------------------------------------------------------

/** The three cockpit column types. */
export type ColumnType = "chart" | "body" | "rx";

/** A 3-tuple of column types in [left, middle, right] order. */
export type ColumnSlots = readonly [ColumnType, ColumnType, ColumnType];

/** A 3-tuple of width percentages for [left, middle, right] slots. */
export type ColumnWidths = readonly [number, number, number];

/**
 * Per-column-type collapsed flag. Every column type is included — any
 * column parked on a side slot can be collapsed individually; the
 * middle-slot column has a separate directional collapse state
 * (MiddleCollapseSide) because the middle has two possible absorbers.
 * Storing by column type (rather than slot index) means it survives reorders.
 */
export interface CollapsedFlags {
  chart: boolean;
  body: boolean;
  rx: boolean;
}

/**
 * Directional collapse state for the middle slot. `null` when the middle
 * column is expanded.
 *
 *   - `"right"` → strip folded toward the right; LEFT neighbour absorbed freed width.
 *   - `"left"`  → strip folded toward the left; RIGHT neighbour absorbed.
 *   - `null`    → middle is expanded (default).
 */
export type MiddleCollapseSide = "left" | "right" | null;

/**
 * The cockpit-layout state — slots + widths + collapsed +
 * middle-collapse direction.
 */
export interface CockpitLayout {
  slots: ColumnSlots;
  widths: ColumnWidths;
  collapsed: CollapsedFlags;
  /**
   * Directional collapse state for the middle slot. `null` when the
   * middle column is expanded. Older payloads without this field are
   * accepted by validateLayout and default to `null`.
   */
  middleCollapseSide: MiddleCollapseSide;
}

// ---------------------------------------------------------------------------
// Preset types  (from useCockpitPresets.ts)
// ---------------------------------------------------------------------------

export interface CockpitLayoutPreset {
  id: string;
  name: string;
  created_at: string;
  layout: CockpitLayout;
}

export type PresetsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; presets: CockpitLayoutPreset[] }
  | { status: "error"; error: string };

// ---------------------------------------------------------------------------
// Runtime constants / helpers  (from cockpit-layout.ts — needed by PatientProfileHeader)
// ---------------------------------------------------------------------------

/** Default three-pane layout: chart-body-rx, 26/48/26 split, nothing collapsed. */
export const DEFAULT_COCKPIT_LAYOUT: CockpitLayout = {
  slots: ["chart", "body", "rx"],
  widths: [26, 48, 26],
  collapsed: { chart: false, body: false, rx: false },
  middleCollapseSide: null,
};

/**
 * Built-in presets bundled with the cockpit. Three presets covering the
 * dominant doctor mental modes:
 *
 *   - Triage   = "Reviewing the chart heavily, basics ready at a glance."
 *   - Consult  = "Balanced view, talking with patient + writing."
 *   - Document = "Patient gone, focus on writing the prescription / notes."
 */
export const BUILT_IN_PRESETS = {
  triage: {
    id: "built-in:triage",
    label: "Triage",
    description: "Chart focused — wide chart rail, narrow Rx",
    layout: {
      slots: ["chart", "body", "rx"] as const,
      widths: [40, 50, 10] as const,
      collapsed: { chart: false, body: false, rx: true },
      middleCollapseSide: null,
    },
    hotkey: "mod+shift+1",
  },
  consult: {
    id: "built-in:consult",
    label: "Consult",
    description: "Balanced 3-column — default layout",
    layout: DEFAULT_COCKPIT_LAYOUT,
    hotkey: "mod+shift+2",
  },
  document: {
    id: "built-in:document",
    label: "Document",
    description: "Rx focused — wide Rx, chart collapsed",
    layout: {
      slots: ["chart", "body", "rx"] as const,
      widths: [10, 35, 55] as const,
      collapsed: { chart: true, body: false, rx: false },
      middleCollapseSide: null,
    },
    hotkey: "mod+shift+3",
  },
} as const;

export type BuiltInPresetId = keyof typeof BUILT_IN_PRESETS;

/** All six permutations of the three column types, with display labels. */
export const COLUMN_ORDER_PERMUTATIONS = [
  { slots: ["chart", "body", "rx"] as const, label: "Chart · Body · Rx" },
  { slots: ["chart", "rx", "body"] as const, label: "Chart · Rx · Body" },
  { slots: ["body", "chart", "rx"] as const, label: "Body · Chart · Rx" },
  { slots: ["body", "rx", "chart"] as const, label: "Body · Rx · Chart" },
  { slots: ["rx", "chart", "body"] as const, label: "Rx · Chart · Body" },
  { slots: ["rx", "body", "chart"] as const, label: "Rx · Body · Chart" },
] as const;

/**
 * Generate all permutations of an array.
 * Returns an empty array for zero-length input and a single-element
 * array for length-1 input.
 */
export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [];
  if (items.length === 1) return [[items[0]]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)] as T[];
    for (const p of permutations(rest)) {
      out.push([items[i], ...p]);
    }
  }
  return out;
}

/** Human-readable display labels for the three pane ids. */
const PANE_DISPLAY_LABEL: Record<string, string> = {
  chart: "Chart",
  body: "Body",
  rx: "Rx",
};

/**
 * Build the "A · B · C" label for an ordered list of pane ids.
 * Falls back to the raw id for any unknown pane (future-proof for a 4th pane).
 */
export function labelForOrder(ids: readonly string[]): string {
  return ids.map((id) => PANE_DISPLAY_LABEL[id] ?? id).join(" · ");
}

/**
 * Deep-compare two CockpitLayout objects. Used to mark the active preset
 * with a check in the layout dropdown menu.
 */
export function layoutsEqual(a: CockpitLayout, b: CockpitLayout): boolean {
  return (
    a.slots[0] === b.slots[0] &&
    a.slots[1] === b.slots[1] &&
    a.slots[2] === b.slots[2] &&
    a.widths[0] === b.widths[0] &&
    a.widths[1] === b.widths[1] &&
    a.widths[2] === b.widths[2] &&
    a.collapsed.chart === b.collapsed.chart &&
    a.collapsed.body === b.collapsed.body &&
    a.collapsed.rx === b.collapsed.rx &&
    a.middleCollapseSide === b.middleCollapseSide
  );
}

/**
 * Compare just the slot order of two ColumnSlots tuples. Used to mark the
 * active column-order permutation in the layout dropdown menu.
 */
export function slotsEqualOrder(a: ColumnSlots, b: ColumnSlots): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
