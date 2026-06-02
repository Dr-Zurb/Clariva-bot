"use client";

/**
 * useShellHotkeys (ppr-10, updated ppr-15d)
 *
 * Window-level keyboard shortcuts for the v2 patient-profile shell.
 * Routes the same hotkey table as `useCockpitHotkeys` to the new
 * layout-state setters from `useShellLayout`.
 *
 * Key bindings:
 *   [                    → hide leftmost visible pane (visiblePaneOrder[0])
 *   ]                    → hide rightmost visible pane (visiblePaneOrder[N-1])
 *   Cmd/Ctrl+1           → toggle paneOrder[0] visibility
 *   Cmd/Ctrl+2           → toggle paneOrder[1] visibility
 *   Cmd/Ctrl+3           → toggle paneOrder[2] visibility
 *   Cmd/Ctrl+Shift+L     → onToggleCustomize() (cpfc-01)
 *   Cmd/Ctrl+Shift+1     → applyPreset("built-in:triage")
 *   Cmd/Ctrl+Shift+2     → applyPreset("built-in:consult")
 *   Cmd/Ctrl+Shift+3     → applyPreset("built-in:document")
 *   Cmd/Ctrl+Enter       → onSendRx()
 *   Cmd/Ctrl+Shift+Enter → onOpenWrapUp()
 *
 * Bracket semantics (ppr-15d):
 *   `[` hides the leftmost currently-visible pane. `]` hides the rightmost
 *   currently-visible pane. If no panes are visible, both are no-ops.
 *   Note: unlike ppr-10, brackets are hide-only (not toggle). The doctor
 *   uses Cmd+1/2/3 or the toggle bar to bring a hidden pane back.
 *
 * Cmd+1/2/3 semantics (ppr-15d):
 *   Toggle the hidden bit of `paneOrder[0/1/2]` regardless of its current
 *   visibility. Index is stable even after drag-to-reorder — same key always
 *   drives the same position-slot. No-op if paneOrder has fewer entries than
 *   the requested index.
 *
 * Walk-in mode:
 *   When `paneOrder` has only 2 entries (body + rx), bracket hotkeys still
 *   work — `[` targets the leftmost visible, `]` targets the rightmost visible.
 *   Walk-in preset fallback (filtering a 3-pane preset to a 2-pane shell) is
 *   handled by the CALLER's `applyPreset` wrapper; this hook simply calls
 *   `applyPreset(id)` unconditionally.
 *
 * Implementation — stable listener + optsRef:
 *   Uses a single stable `window` listener registered on mount, plus an
 *   `optsRef` that is synced on every render so the listener always reads
 *   fresh options without being re-registered on every option change. This
 *   mirrors the pattern used by `useCockpitHotkeys`.
 *
 * Guards (inherited from useCockpitHotkeys):
 *   - Skips when the active element is a text input / textarea / select /
 *     contenteditable so shortcuts don't fire while the doctor is typing.
 *   - Skips single-character shortcuts when any modifier key is held (keeps
 *     Ctrl+[ browser-back and similar combos working).
 *   - Calls preventDefault() only on matched combos.
 *   - Skips everything when `enabled === false` (e.g. finish-visit POST in
 *     flight).
 *
 * Out of scope:
 *   - Live-consult guard on hotkey-initiated hides (ppr-15e handles the
 *     toggle-bar click path; hotkey path bypasses the warning intentionally).
 *   - Hotkey rebinding UI.
 *   - Esc-to-close modals — shadcn <Dialog> has built-in Esc handling.
 */

import { useEffect, useRef } from "react";
import type { PaneRuntimeState } from "@/lib/patient-profile/types";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UseShellHotkeysOptions {
  /**
   * Current pane order from `useShellLayout` (live from shellRef).
   * Slot [0] is the left column; slot [N-1] is the right column.
   */
  paneOrder: string[];
  /**
   * Per-pane runtime state (sizePct + hidden). The hook reads the
   * `hidden` bit before calling `setPaneHidden` to compute the
   * toggled value. Exposed via `PatientProfileShellHandle` (ppr-10).
   */
  paneState: Record<string, PaneRuntimeState>;
  /**
   * Setter forwarded from `useShellLayout` via `PatientProfileShellHandle`.
   * Stable across renders — safe to omit from the deps array.
   */
  setPaneHidden: (id: string, hidden: boolean) => void;
  /**
   * Apply a built-in or custom preset by id. Returns true on success.
   * The CALLER is responsible for walk-in fallback logic (filtering a
   * 3-pane preset to 2 panes when paneOrder.length === 2); this hook
   * simply calls applyPreset(id) unconditionally.
   */
  applyPreset: (presetId: string) => boolean;
  /**
   * Called on Cmd/Ctrl+Enter — maps to "Send Rx".
   * TODO(ppr-10): wire to the Rx workspace's submit handler once a
   * stable imperative ref is available from <RxPane>.
   */
  onSendRx: () => void;
  /** Called on Cmd/Ctrl+Shift+Enter — maps to "Finish visit / wrap-up". */
  onOpenWrapUp: () => void;
  /** cpfc-01: Toggle customize-layout mode. Bound to Cmd/Ctrl+Shift+L (P3-DL-3). */
  onToggleCustomize: () => void;
  /**
   * Set to false while a finish-visit POST is in flight to prevent a
   * second trigger from the same keypress. Defaults to true.
   */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** HTML tags whose focus suppresses all hotkeys. */
const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);

/** Maps digit key → built-in preset id for Cmd/Ctrl+Shift+1/2/3 (cc-11 / CC-D5). */
const DIGIT_TO_PRESET: Readonly<Record<string, string>> = {
  "1": "built-in:triage",
  "2": "built-in:consult",
  "3": "built-in:document",
};

/** Maps digit key → paneOrder index for Cmd/Ctrl+1/2/3 toggle hotkeys (ppr-15d). */
const DIGIT_TO_PANE_INDEX: Readonly<Record<string, number>> = {
  "1": 0,
  "2": 1,
  "3": 2,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShellHotkeys(opts: UseShellHotkeysOptions): void {
  // Sync opts into a ref so the single stable listener always reads fresh
  // values without being re-registered on every render.
  const optsRef = useRef<UseShellHotkeysOptions>(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const {
        paneOrder,
        paneState,
        setPaneHidden,
        applyPreset,
        onSendRx,
        onOpenWrapUp,
        onToggleCustomize,
        enabled = true,
      } = optsRef.current;

      if (!enabled) return;

      // Skip when an editable element has focus.
      const target = e.target;
      if (target instanceof Element) {
        if (
          EDITABLE_TAGS.has(target.tagName.toLowerCase()) ||
          (target as HTMLElement).isContentEditable
        ) {
          return;
        }
      }

      // ── Bracket hotkeys — hide leftmost/rightmost visible, no modifiers ──
      // Skip when any modifier is held so Ctrl+[/] (browser back/forward in
      // some browsers) and similar combos still work.
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "[" && paneOrder.length > 0) {
          e.preventDefault();
          const visibleOrder = paneOrder.filter((id) => !(paneState[id]?.hidden ?? false));
          if (visibleOrder.length > 0) {
            setPaneHidden(visibleOrder[0], true);
          }
          return;
        }
        if (e.key === "]" && paneOrder.length > 0) {
          e.preventDefault();
          const visibleOrder = paneOrder.filter((id) => !(paneState[id]?.hidden ?? false));
          if (visibleOrder.length > 0) {
            setPaneHidden(visibleOrder[visibleOrder.length - 1], true);
          }
          return;
        }
      }

      // ── Preset hotkeys — Cmd/Ctrl+Shift+1/2/3 ───────────────────────────
      // Only the three built-in presets receive hotkeys (CC-D5). Custom
      // presets do not — avoids "doctor renames a preset and forgets which
      // number was bound" failure mode.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
        // cpfc-01: Cmd/Ctrl+Shift+L → toggle customize mode (P3-DL-3).
        if (e.key.toLowerCase() === "l") {
          e.preventDefault();
          onToggleCustomize();
          return;
        }
        const presetId = DIGIT_TO_PRESET[e.key];
        if (presetId) {
          e.preventDefault();
          // Walk-in fallback (paneOrder.length === 2) is handled by the
          // caller's applyPreset wrapper — this hook is intentionally
          // walk-in-agnostic.
          applyPreset(presetId);
          return;
        }
      }

      // ── Pane toggle hotkeys — Cmd/Ctrl+1/2/3 (no Shift) ─────────────────
      // Toggles the hidden bit of paneOrder[0/1/2] by index. Distinct from
      // Cmd+Shift+1/2/3 (preset apply) — the two are separate concepts.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const idx = DIGIT_TO_PANE_INDEX[e.key];
        if (idx !== undefined && idx < paneOrder.length) {
          e.preventDefault();
          const id = paneOrder[idx];
          setPaneHidden(id, !(paneState[id]?.hidden ?? false));
          return;
        }
      }

      // ── Cmd/Ctrl+Enter → send Rx; Cmd/Ctrl+Shift+Enter → wrap-up ────────
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key !== "Enter") return;

      e.preventDefault();
      if (e.shiftKey) {
        onOpenWrapUp();
      } else {
        onSendRx();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // stable — optsRef provides freshness at every event
}
