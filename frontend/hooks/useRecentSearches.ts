/**
 * useRecentSearches — small LRU of recently-selected Cmd-K palette items.
 *
 * Sub-batch B / task-ui-B4 — when a doctor opens the palette without
 * typing, we render a "Recent" group seeded from this store so the most
 * common case ("the patient I just saw") is one keystroke (`Enter`)
 * away.
 *
 * Storage
 * -------
 *   - `localStorage` (per-device, per-doctor — no cross-device sync; that
 *     is fine for V1 and stated explicitly in the task spec).
 *   - Key: `clariva.search.recent`.
 *   - Shape: `RecentSearchItem[]`, max 5 entries, MRU order (index 0 = most
 *     recent).
 *
 * PHI posture
 * -----------
 * The store DOES hold patient names + subtitles (phone), because that's
 * what we need to render the row. localStorage is per-device on the
 * doctor's machine; the IDs are useless without an authenticated API call,
 * and the names + phones are already visible in the patients list page on
 * the same device. This is the same posture as e.g. browser autofill on
 * the doctor's laptop. Do NOT exfiltrate from this store into telemetry,
 * URLs, or anywhere else off-device — the cmdk telemetry helper is
 * intentionally counts-only for that reason
 * (`frontend/lib/telemetry/cmdk.ts`).
 *
 * Mechanics
 * ---------
 *   - `push()` prepends, dedupes by `(source, id)`, truncates to 5.
 *   - SSR-safe: returns empty array on server render; hydrates on mount.
 *   - Best-effort writes; quota / privacy-mode failures are swallowed.
 *
 * @see frontend/components/layout/GlobalCommandPalette.tsx
 */

"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "clariva.search.recent";
const MAX_RECENT = 5;

/** Source keys that may appear in recents. Mirrors the palette's
 *  `Source.key`. V1 only stores patient items, but the field is part of
 *  the schema so V1.1 sources slot in without a migration. */
export type RecentSourceKey =
  | "patients"
  | "appointments"
  | "drugs"
  | "settings";

export interface RecentSearchItem {
  source: RecentSourceKey;
  /** Stable identifier within the source (UUID / route key). */
  id: string;
  /** Primary line — display name. */
  label: string;
  /** Secondary muted line — phone, IG handle, etc. May be null. */
  subtitle?: string | null;
  /** Path to navigate to on re-select. */
  routedTo: string;
}

function readFromStorage(): RecentSearchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: discard malformed entries silently — better an empty
    // recent list than a runtime crash if the schema changes.
    return parsed
      .filter(
        (entry): entry is RecentSearchItem =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as RecentSearchItem).source === "string" &&
          typeof (entry as RecentSearchItem).id === "string" &&
          typeof (entry as RecentSearchItem).label === "string" &&
          typeof (entry as RecentSearchItem).routedTo === "string"
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function writeToStorage(items: RecentSearchItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota / privacy mode — best-effort, never throw.
  }
}

export interface UseRecentSearchesResult {
  recents: RecentSearchItem[];
  push: (item: RecentSearchItem) => void;
  clear: () => void;
}

/**
 * Hook entry point. Returns the recents list (hydrated on mount) plus a
 * `push()` writer that prepends + dedupes + truncates.
 */
export function useRecentSearches(): UseRecentSearchesResult {
  const [recents, setRecents] = useState<RecentSearchItem[]>([]);

  // Hydrate from storage post-mount (SSR-safe; matches the localStorage
  // pattern in DashboardShell.tsx for the sidebar collapsed flag).
  useEffect(() => {
    setRecents(readFromStorage());
  }, []);

  const push = useCallback((item: RecentSearchItem) => {
    setRecents((prev) => {
      const filtered = prev.filter(
        (existing) =>
          !(existing.source === item.source && existing.id === item.id)
      );
      const next = [item, ...filtered].slice(0, MAX_RECENT);
      writeToStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecents([]);
    writeToStorage([]);
  }, []);

  return { recents, push, clear };
}
