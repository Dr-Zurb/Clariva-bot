"use client";

/**
 * useOpdQueueHotkeys (task-oq-13)
 *
 * Window-level single-key shortcuts for the OPD queue page:
 *   J        → move focus to the next visible queue row (vim-style, wraps)
 *   K        → move focus to the previous visible queue row (wraps)
 *   Enter    → open the focused row (same as clicking the row)
 *   C        → mark focused row as called silently (no-op unless status === 'waiting')
 *   S        → open the overflow menu for the focused row
 *   /        → focus the search box (prevents literal '/' from being typed)
 *
 * Guards:
 *   - Bails when `enabled === false`.
 *   - Bails when `ctrlKey || metaKey || altKey` is true (single keys only).
 *   - Bails when the active element is INPUT / TEXTAREA / SELECT / [contenteditable].
 *     Exception: Esc while inside an input blurs it back to the table (≤5 LOC).
 *
 * Selection visualisation is handled by the caller — it tracks `focusedEntryId`
 * and passes `focused` to each `OpdQueueDenseRow`.
 */

import { useCallback, useEffect } from "react";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface UseOpdQueueHotkeysOptions {
  /** Set to false while a modal / dialog that captures keys is open. */
  enabled: boolean;
  /**
   * The flat, post-filter visible entries — J/K navigate through this list.
   * Must be referentially stable (useMemo) to avoid re-registering the listener
   * every render.
   */
  visibleEntries: DoctorQueueSessionRow[];
  /** Currently keyboard-focused entry id, or null (no row focused yet). */
  focusedEntryId: string | null;
  setFocusedEntryId: (id: string | null) => void;
  /**
   * Navigate to / open the patient's appointment page.
   * The optional second argument `viaKeyboard` is true when triggered by the
   * Enter hotkey so callers can distinguish keyboard vs pointer interactions.
   */
  onOpen: (entry: DoctorQueueSessionRow, viaKeyboard?: boolean) => void;
  /** Fire-and-forget silent-call action. No-op unless status === 'waiting'. */
  onCallSilently: (entry: DoctorQueueSessionRow) => Promise<void> | void;
  /** Programmatically open the row's overflow DropdownMenu. */
  onOpenOverflow: (entry: DoctorQueueSessionRow) => void;
  /** Focus the search input (/ key). */
  onFocusSearch: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tags whose focus should suppress all single-key bindings. */
const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOpdQueueHotkeys(opts: UseOpdQueueHotkeysOptions): void {
  const {
    enabled,
    visibleEntries,
    focusedEntryId,
    setFocusedEntryId,
    onOpen,
    onCallSilently,
    onOpenOverflow,
    onFocusSearch,
  } = opts;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Mod-key guard — single keys only.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Typing-context guard.
      const target = e.target as HTMLElement | null;
      if (target) {
        const isEditable =
          EDITABLE_TAGS.has(target.tagName.toLowerCase()) ||
          target.isContentEditable;
        if (isEditable) {
          // Exception: Esc while in an input blurs it back to the table.
          if (e.key === "Escape") {
            target.blur();
            e.preventDefault();
          }
          return;
        }
      }

      const count = visibleEntries.length;
      const currentIndex = visibleEntries.findIndex(
        (entry) => entry.entryId === focusedEntryId
      );

      switch (e.key) {
        case "j":
        case "J": {
          e.preventDefault();
          if (count === 0) return;
          // First J with no focus → land on index 0.
          const nextIdx =
            currentIndex < 0 ? 0 : (currentIndex + 1) % count;
          setFocusedEntryId(visibleEntries[nextIdx].entryId);
          break;
        }
        case "k":
        case "K": {
          e.preventDefault();
          if (count === 0) return;
          // First K with no focus → land on last entry.
          const prevIdx =
            currentIndex < 0 ? count - 1 : (currentIndex - 1 + count) % count;
          setFocusedEntryId(visibleEntries[prevIdx].entryId);
          break;
        }
        case "Enter": {
          if (currentIndex < 0) return;
          e.preventDefault();
          onOpen(visibleEntries[currentIndex], true);
          break;
        }
        case "c":
        case "C": {
          if (currentIndex < 0) return;
          const focused = visibleEntries[currentIndex];
          // No-op unless the patient is actually waiting.
          if (focused.queueStatus !== "waiting") return;
          e.preventDefault();
          void onCallSilently(focused);
          break;
        }
        case "s":
        case "S": {
          if (currentIndex < 0) return;
          e.preventDefault();
          onOpenOverflow(visibleEntries[currentIndex]);
          break;
        }
        case "/": {
          e.preventDefault();
          onFocusSearch();
          break;
        }
      }
    },
    [
      enabled,
      visibleEntries,
      focusedEntryId,
      setFocusedEntryId,
      onOpen,
      onCallSilently,
      onOpenOverflow,
      onFocusSearch,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
