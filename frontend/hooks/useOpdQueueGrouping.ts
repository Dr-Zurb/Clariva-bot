"use client";

/**
 * useOpdQueueGrouping — persists the doctor's preferred queue ordering.
 *
 * Three modes:
 *   - 'group' (default): Active / Done / Missed sections, with in-consult
 *     surfaced first.  Clinically optimal during a busy session.
 *   - 'token-asc': flat list sorted by token number ascending — serial pipeline.
 *   - 'token-desc': flat list sorted by token number descending — latest first.
 *
 * Reads/writes `localStorage['opd_queue_grouping']`.
 * SSR-safe: defers `window` access to `useEffect`.
 *
 * Migration note: the legacy value `'token'` is mapped to `'token-asc'` so
 * existing localStorage values keep working without an explicit migration.
 */

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpdQueueGrouping = "group" | "token-asc" | "token-desc";

export interface UseOpdQueueGroupingState {
  grouping: OpdQueueGrouping;
  setGrouping: (next: OpdQueueGrouping) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "opd_queue_grouping";

function isValidGrouping(v: unknown): v is OpdQueueGrouping {
  return v === "group" || v === "token-asc" || v === "token-desc";
}

function readStored(): OpdQueueGrouping {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isValidGrouping(raw)) return raw;
    // Legacy value migration: pre-asc/desc, only 'token' existed.
    if (raw === "token") return "token-asc";
    return "group";
  } catch {
    return "group";
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOpdQueueGrouping(): UseOpdQueueGroupingState {
  const [grouping, setGroupingState] = useState<OpdQueueGrouping>("group");

  useEffect(() => {
    const stored = readStored();
    setGroupingState(stored);
  }, []);

  const setGrouping = useCallback((next: OpdQueueGrouping) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private browsing / storage full — silently fall back to in-memory state
    }
    setGroupingState(next);
  }, []);

  return { grouping, setGrouping };
}
