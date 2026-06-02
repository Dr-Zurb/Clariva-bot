/**
 * opdQueueEmptyState — pure helper that maps filter + search state to
 * context-aware empty-state copy (task-oq-13, Phase 5 polish).
 *
 * Priority: query match first, then status filter, then global fallback.
 * Pure function → easy to unit-test with no React imports needed.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-13-keyboard-a11y.md
 */

import type { OpdQueueStatusFilterValue } from "./OpdQueueStatusFilter";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OpdQueueEmptyStateInput {
  statusFilter: OpdQueueStatusFilterValue;
  query: string;
  /** YYYY-MM-DD — used in the global fallback description. */
  sessionDate: string;
}

export function getOpdQueueEmptyState(input: OpdQueueEmptyStateInput): {
  title: string;
  description: string;
} {
  const { statusFilter, query, sessionDate } = input;

  // Query has highest priority — if there is search text, the empty state is
  // always "no matches" regardless of which status filter is active.
  if (query !== "") {
    return {
      title: `No matches for \u201c${query}\u201d.`,
      description: "Try a different name, phone, or token.",
    };
  }

  switch (statusFilter) {
    case "waiting":
      return {
        title: "No waiting patients.",
        description: "Patients arriving will show here.",
      };
    case "called":
      return {
        title: "No one called yet.",
        description: "Click Open on a row to call the next patient in.",
      };
    case "in_consultation":
      return {
        title: "No active consultation.",
        description: "Open a patient to start one.",
      };
    case "completed":
      return {
        title: "Nobody finished yet.",
        description: "Completed patients will show here.",
      };
    case "no_show":
    case "skipped":
      return {
        title: "No no-shows yet today.",
        description: "Patients you mark as no-show or skip will show here.",
      };
    default:
      return {
        title: "No queue for this day.",
        description: `Bookings in queue mode will appear here on ${sessionDate}.`,
      };
  }
}
