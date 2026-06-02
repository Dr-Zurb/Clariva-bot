"use client";

/**
 * useOpdQueueFilters
 *
 * Manages OPD hub filter state (queue **and** slot modes) through URL search
 * params so selections survive refresh, can be bookmarked, and can be shared.
 * Only one mode renders at a time; both share `?status=` / `?q=`.
 *
 * - `status` reads from ?status=…; defaults to 'all'.
 * - `q` (search query) reads from ?q=…; defaults to ''. Used by oq-08.
 * - Both use router.replace (not push) so filter clicks don't fill history.
 * - Invalid ?status values silently fall back to 'all'.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-07-status-filter.md
 */

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { OpdQueueStatusFilterValue } from "@/components/opd/OpdQueueStatusFilter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpdQueueFiltersState {
  status: OpdQueueStatusFilterValue;
  setStatus: (next: OpdQueueStatusFilterValue) => void;
  /** Search query — wired fully in oq-08; this hook owns the URL param surface. */
  q: string;
  setQ: (next: string) => void;
}

// ---------------------------------------------------------------------------
// Valid status guard
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set<OpdQueueStatusFilterValue>([
  "all",
  "waiting",
  "called",
  "upcoming",
  "grace",
  "running_late",
  "in_consultation",
  "completed",
  "no_show",
  "missed",
  "skipped",
  "cancelled",
  "overflow",
]);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOpdQueueFilters(): OpdQueueFiltersState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read current values from URL, falling back to safe defaults.
  const rawStatus = searchParams.get("status") as OpdQueueStatusFilterValue | null;
  const status: OpdQueueStatusFilterValue =
    rawStatus !== null && VALID_STATUSES.has(rawStatus) ? rawStatus : "all";

  const q = searchParams.get("q") ?? "";

  // Build a new URL with a single param changed.
  const buildUrl = useCallback(
    (key: string, value: string): string => {
      const params = new URLSearchParams(searchParams.toString());

      const isDefault =
        value === "" || (key === "status" && value === "all");

      if (isDefault) {
        params.delete(key);
      } else {
        params.set(key, value);
      }

      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams]
  );

  const setStatus = useCallback(
    (next: OpdQueueStatusFilterValue) => {
      router.replace(buildUrl("status", next), { scroll: false });
    },
    [router, buildUrl]
  );

  const setQ = useCallback(
    (next: string) => {
      router.replace(buildUrl("q", next), { scroll: false });
    },
    [router, buildUrl]
  );

  return { status, setStatus, q, setQ };
}
