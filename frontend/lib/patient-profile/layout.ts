/**
 * layout.ts — Pure helper module for the patient-profile shell layout.
 *
 * Owns:
 *   - localStorage key constants for the v2 layout and the one-time seed flag.
 *   - Legacy key constants read once during the seed pass.
 *   - `buildDefaultLayout` — constructs a fresh layout from PaneDefinition[].
 *   - `layoutsEqual` — deep-compares two PatientProfileLayout objects.
 *   - `readLegacyLayoutOnce` — translates legacy cockpit keys → v2 on first load.
 *   - `shouldRunSeed` / `markSeedDone` — idempotent seed gate.
 *
 * Source decisions: DL-7, DL-9, R3.1, R3.2 from plan-patient-profile-shell-rebuild.md.
 */

import type { PaneDefinition, PaneRuntimeState, PatientProfileLayout } from "./types";
import { flatToPaneTree } from "./layout-tree";
import { layoutsEqual as layoutsEqualTree, validateLayout } from "./useShellLayout";

// ── v2 storage keys ───────────────────────────────────────────────────────────

/** localStorage key for the standard (3-pane) patient-profile layout (pre-csf-04). */
export const LAYOUT_STORAGE_KEY = "patient-profile:v1:layout";

/** localStorage key for the Telemed-Video 8-pane layout (csf-04 production default). */
export const TELEMED_VIDEO_LAYOUT_STORAGE_KEY =
  "patient-profile:v2:telemed-video-layout";

/** localStorage key for the walk-in (2-pane, no chart) patient-profile layout. */
export const WALKIN_LAYOUT_STORAGE_KEY = "patient-profile:v1:walkin-layout";

/**
 * Set to `"1"` after the one-time legacy → v2 seed has completed.
 * Its presence gates `shouldRunSeed()` so we never overwrite a v2
 * layout the doctor has customised after their first v2 visit.
 */
export const LEGACY_SEEDED_KEY = "patient-profile:v1:seeded";

// ── Legacy keys read once during seed ────────────────────────────────────────

/** react-resizable-panels autoSave key for the standard (3-pane) cockpit. */
export const LEGACY_RRP_KEY = "react-resizable-panels:cockpit-shell";

/** react-resizable-panels autoSave key for the walk-in (2-pane) cockpit. */
export const LEGACY_RRP_WALKIN_KEY = "react-resizable-panels:cockpit-shell-walkin";

/** Full CockpitLayout v1 JSON for the standard (3-pane) cockpit. */
export const LEGACY_COCKPIT_LAYOUT_KEY = "cockpit-layout:v1:cockpit-shell";

/** Full CockpitLayout v1 JSON for the walk-in (2-pane) cockpit. */
export const LEGACY_COCKPIT_LAYOUT_WALKIN_KEY = "cockpit-layout:v1:cockpit-shell-walkin";

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Build a fresh {@link PatientProfileLayout} from a {@link PaneDefinition}[]
 * using each pane's `naturalSizePct` (or 33 as a fallback) for initial
 * sizing. Used by `<PatientProfilePage>` to seed `useShellLayout` on first
 * load and after a "Reset layout" preset.
 */
export function buildDefaultLayout(panes: PaneDefinition[]): PatientProfileLayout {
  const paneOrder = panes.map((p) => p.id);
  const paneState: Record<string, PaneRuntimeState> = {};
  for (const pane of panes) {
    paneState[pane.id] = {
      sizePct: pane.naturalSizePct ?? 33,
      hidden: false,
    };
  }
  return {
    version: 5,
    paneTree: flatToPaneTree({ paneOrder, paneState }),
  };
}

/** @see layoutsEqual in useShellLayout.ts */
export const layoutsEqual = layoutsEqualTree;

// ── Legacy translation internals ──────────────────────────────────────────────

/**
 * Minimal runtime shape of a v1 CockpitLayout payload. We only check the
 * fields we need for translation so forward-compat payloads (with extra
 * fields) still translate cleanly.
 */
interface LegacyCockpitLayoutRaw {
  slots: string[];
  widths: number[];
  collapsed: Record<string, unknown>;
  /** Always dropped in v2 (DL-6 uniform collapse). */
  middleCollapseSide?: unknown;
}

function isLegacyCockpitLayoutRaw(raw: unknown): raw is LegacyCockpitLayoutRaw {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return (
    Array.isArray(r.slots) &&
    r.slots.length === 3 &&
    Array.isArray(r.widths) &&
    r.widths.length === 3 &&
    !!r.collapsed &&
    typeof r.collapsed === "object"
  );
}

/**
 * Translate a v1 `CockpitLayout` to a v3 `PatientProfileLayout`.
 *
 * - `paneOrder` = `slots`, filtered to only those present in the `panes`
 *   argument (walk-in omits "chart").
 * - `sizePct` = corresponding `widths` entry, normalised so visible panes
 *   sum to 100 (handles walk-in where the chart slot is at width 0).
 * - `hidden` = `collapsed[slotId]` boolean; defaults to `false` if absent.
 * - `middleCollapseSide` is **always dropped** (DL-6).
 */
function translateCockpitLayoutV1(
  raw: LegacyCockpitLayoutRaw,
  panes: PaneDefinition[],
): PatientProfileLayout {
  const includedIds = new Set(panes.map((p) => p.id));
  const paneOrder: string[] = [];
  const rawSizes: number[] = [];

  for (let i = 0; i < raw.slots.length; i++) {
    const id = raw.slots[i];
    if (typeof id === "string" && includedIds.has(id)) {
      paneOrder.push(id);
      const w = raw.widths[i];
      rawSizes.push(typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : 0);
    }
  }

  // Normalise so the visible panes' percentages sum to 100. This handles the
  // walk-in case where widths[0] (chart) is 0 and the other two sum to 100,
  // as well as edge cases where floating-point drift nudged the sum off 100.
  const sum = rawSizes.reduce((a, b) => a + b, 0) || 100;
  const paneState: Record<string, PaneRuntimeState> = {};
  for (let i = 0; i < paneOrder.length; i++) {
    const id = paneOrder[i];
    const c = raw.collapsed;
    // middleCollapseSide only describes DIRECTIONAL collapse for the middle
    // slot; it is not a simple boolean. If the slot's own `collapsed` flag
    // is false but middleCollapseSide is set, the pane was directionally
    // half-collapsed — an ephemeral UI state we drop in v2 (DL-6).
    paneState[id] = {
      sizePct: (rawSizes[i] / sum) * 100,
      hidden: typeof c[id] === "boolean" ? (c[id] as boolean) : false,
    };
  }

  return {
    version: 5,
    paneTree: flatToPaneTree({ paneOrder, paneState }),
  };
}

/**
 * Translate a widths-only `react-resizable-panels` payload to a v2 layout.
 *
 * The RRP library stores sizes as `{ "cockpit-col-{type}": pct, ... }`.
 * We strip the `cockpit-col-` prefix and match against the `panes` argument.
 * All `collapsed` flags default to `false` (the RRP key doesn't store them).
 */
function translateRrpLayout(
  rrpRaw: Record<string, unknown>,
  panes: PaneDefinition[],
): PatientProfileLayout {
  const paneOrder = panes.map((p) => p.id);
  const paneState: Record<string, PaneRuntimeState> = {};
  for (const pane of panes) {
    const rrpKey = `cockpit-col-${pane.id}`;
    const v = rrpRaw[rrpKey];
    paneState[pane.id] = {
      sizePct:
        typeof v === "number" && Number.isFinite(v) && v >= 0
          ? v
          : pane.naturalSizePct ?? 33,
      hidden: false,
    };
  }
  return {
    version: 5,
    paneTree: flatToPaneTree({ paneOrder, paneState }),
  };
}

// ── Public seed API ───────────────────────────────────────────────────────────

/**
 * One-time legacy-key reader. Returns a {@link PatientProfileLayout} translated
 * from whichever legacy key(s) exist, or `null` if nothing to seed.
 *
 * Tries in order:
 *   1. `cockpit-layout:v1:cockpit-shell[(-walkin)]` — full v1 layout (slots +
 *      widths + collapsed). Best-fidelity translation.
 *   2. `react-resizable-panels:cockpit-shell[(-walkin)]` — widths only. Used
 *      as a fallback for builds where the full key wasn't saved.
 *   3. Neither found → returns `null`; caller falls back to `buildDefaultLayout`.
 *
 * After translation, the legacy keys are NOT deleted — the v1 cockpit shell
 * still reads them during the kill-switch window (ppr-14 is when they become
 * dead data). The seed gate (`LEGACY_SEEDED_KEY`) is the only thing preventing
 * this function from re-running and overwriting a v2 layout the doctor has
 * set since their first v2 visit.
 *
 * If JSON parsing or `validateLayout` rejects a translated payload, the
 * function logs a single `console.warn` and falls through to the next
 * candidate rather than crashing. This matches the principle that a seed
 * failure should be silent to the user.
 *
 * @param panes  The pane definitions in their default order. Used to:
 *               - Determine which slots to include (walk-in omits "chart").
 *               - Fall back to `naturalSizePct` for panes without a saved width.
 * @param walkin Whether to read the walk-in shape (2-pane) instead of the
 *               standard 3-pane shape.
 */
export function readLegacyLayoutOnce(opts: {
  panes: PaneDefinition[];
  walkin?: boolean;
}): PatientProfileLayout | null {
  if (typeof window === "undefined") return null;

  const { panes, walkin = false } = opts;
  const fullKey = walkin ? LEGACY_COCKPIT_LAYOUT_WALKIN_KEY : LEGACY_COCKPIT_LAYOUT_KEY;
  const rrpKey = walkin ? LEGACY_RRP_WALKIN_KEY : LEGACY_RRP_KEY;

  // ── Try 1: full cockpit-layout:v1 key ─────────────────────────────────────
  try {
    const raw = window.localStorage.getItem(fullKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isLegacyCockpitLayoutRaw(parsed)) {
        const translated = translateCockpitLayoutV1(parsed, panes);
        const validated = validateLayout(translated);
        if (validated) return validated;
        console.warn("[layout:seed] legacy-translation-fail", { key: fullKey });
      }
    }
  } catch {
    console.warn("[layout:seed] legacy-parse-fail", { key: fullKey });
  }

  // ── Try 2: widths-only react-resizable-panels key ─────────────────────────
  try {
    const raw = window.localStorage.getItem(rrpKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const translated = translateRrpLayout(
          parsed as Record<string, unknown>,
          panes,
        );
        const validated = validateLayout(translated);
        if (validated) return validated;
        console.warn("[layout:seed] legacy-translation-fail", { key: rrpKey });
      }
    }
  } catch {
    console.warn("[layout:seed] legacy-parse-fail", { key: rrpKey });
  }

  return null;
}

/**
 * Returns `true` the first time it's called per browser (i.e. the one-time
 * seed has not yet run). Returns `false` after `markSeedDone()` has been
 * called. SSR-safe: always returns `false` on the server.
 */
export function shouldRunSeed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LEGACY_SEEDED_KEY) !== "1";
}

/**
 * Mark the legacy-seed pass as complete. Once this is called,
 * `shouldRunSeed()` returns `false` for the lifetime of the browser
 * session (and subsequent sessions, since the flag persists in
 * localStorage until natural eviction).
 */
export function markSeedDone(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LEGACY_SEEDED_KEY, "1");
}
