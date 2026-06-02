"use client";

/**
 * OpdQueueMobileList — mobile card list for the OPD queue (oq-12).
 *
 * Renders OpdQueueMobileCard entries grouped into the same three sections
 * as OpdQueueTable: Active / Done today / No-show & skipped.
 * Driven by the same filter + search state as the desktop table — only the
 * presentation layer changes.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-12-density-mobile.md
 */

import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import type { OpdQueueStatusFilterValue } from "./OpdQueueStatusFilter";
import { matchesOpdQueueSearch } from "./shared/opdSearchMatcher";
import { OpdQueueMobileCard } from "./OpdQueueMobileCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpdQueueMobileListProps {
  entries: DoctorQueueSessionRow[];
  filter?: OpdQueueStatusFilterValue;
  q?: string;
  onOpen: (entry: DoctorQueueSessionRow) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Grouping (mirrors OpdQueueTable — keep in sync)
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES  = new Set(["waiting", "called", "in_consultation"]);
const DONE_STATUSES    = new Set(["completed"]);
const MISSED_STATUSES  = new Set(["missed", "skipped", "cancelled"]);
const NO_SHOW_STATUSES = new Set(["missed", "skipped", "cancelled"]);

function compareActive(a: DoctorQueueSessionRow, b: DoctorQueueSessionRow): number {
  const ORDER: Record<string, number> = {
    in_consultation: 0,
    called: 1,
    waiting: 2,
  };
  const oa = ORDER[a.queueStatus] ?? 99;
  const ob = ORDER[b.queueStatus] ?? 99;
  return oa !== ob ? oa - ob : a.tokenNumber - b.tokenNumber;
}

interface Buckets {
  active: DoctorQueueSessionRow[];
  done: DoctorQueueSessionRow[];
  missed: DoctorQueueSessionRow[];
  nextUpId: string | null;
}

function groupEntries(
  entries: DoctorQueueSessionRow[],
  filter: OpdQueueStatusFilterValue,
  q: string
): Buckets {
  const searched = q ? entries.filter((e) => matchesOpdQueueSearch(e, q)) : entries;
  const filtered: DoctorQueueSessionRow[] =
    filter === "all"
      ? searched
      : filter === "no_show"
      ? searched.filter((e) => NO_SHOW_STATUSES.has(e.queueStatus))
      : searched.filter((e) => e.queueStatus === filter);

  const active = filtered
    .filter((e) => ACTIVE_STATUSES.has(e.queueStatus))
    .sort(compareActive);

  const done = filtered
    .filter((e) => DONE_STATUSES.has(e.queueStatus))
    .sort((a, b) => a.tokenNumber - b.tokenNumber);

  const missed = filtered
    .filter((e) => MISSED_STATUSES.has(e.queueStatus))
    .sort((a, b) => a.tokenNumber - b.tokenNumber);

  const firstWaiting = active
    .filter((e) => e.queueStatus === "waiting")
    .sort((a, b) => a.tokenNumber - b.tokenNumber)[0];

  return { active, done, missed, nextUpId: firstWaiting?.entryId ?? null };
}

// ---------------------------------------------------------------------------
// Group header divider
// ---------------------------------------------------------------------------

function GroupDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-t border-border/60 bg-muted/20 px-3 py-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="tabular-nums text-xs text-muted-foreground">
        ({count})
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function MobileLoadingSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-stretch gap-0">
          <div className="w-1 shrink-0 bg-muted" />
          <div className="flex flex-1 flex-col gap-1.5 px-3 py-2">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpdQueueMobileList({
  entries,
  filter = "all",
  q = "",
  onOpen,
  isLoading = false,
  error = null,
  onRetry,
}: OpdQueueMobileListProps): JSX.Element {
  // ── Loading ──
  if (isLoading && entries.length === 0) {
    return (
      <div
        className="overflow-hidden rounded-lg border border-border"
        role="status"
        aria-label="Loading queue"
      >
        <MobileLoadingSkeleton />
      </div>
    );
  }

  // ── Hard error ──
  if (error && entries.length === 0) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-medium text-destructive">
          Couldn&apos;t load the queue.
        </p>
        <button
          type="button"
          onClick={() => onRetry?.()}
          className={cn(
            "mt-2 rounded-md px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          Tap to retry
        </button>
      </div>
    );
  }

  // ── Empty ──
  if (!isLoading && entries.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/10 p-10 text-center"
        role="status"
      >
        <p className="font-medium text-foreground">No queue for this day</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Bookings in queue mode will appear here.
        </p>
      </div>
    );
  }

  const { active, done, missed, nextUpId } = groupEntries(entries, filter, q);

  const allGroupsEmpty =
    active.length === 0 && done.length === 0 && missed.length === 0;

  if (q && allGroupsEmpty) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/10 p-10 text-center"
        role="status"
      >
        <p className="font-medium text-foreground">
          No matches for &ldquo;{q}&rdquo;.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a different name, phone, or token.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      {/* Stale-while-revalidate banner */}
      {error && entries.length > 0 && (
        <div className="flex items-center justify-between border-b border-destructive/20 bg-destructive/5 px-3 py-1.5">
          <p className="text-xs text-destructive">
            Couldn&apos;t refresh just now.
          </p>
          <button
            type="button"
            onClick={() => onRetry?.()}
            className="ml-3 shrink-0 text-xs font-medium text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Retry
          </button>
        </div>
      )}

      {/* Active section */}
      {(active.length > 0 || filter === "all" || ACTIVE_STATUSES.has(filter as string)) && (
        <>
          <GroupDivider label="Active" count={active.length} />
          {active.length === 0 ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
              No active patients.
            </div>
          ) : (
            active.map((entry) => (
              <OpdQueueMobileCard
                key={entry.entryId}
                entry={entry}
                onOpen={onOpen}
                isNextUp={entry.entryId === nextUpId}
              />
            ))
          )}
        </>
      )}

      {/* Done today section */}
      {(done.length > 0 || filter === "completed") && (
        <>
          <GroupDivider label="Done today" count={done.length} />
          {done.length === 0 ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
              No completed patients.
            </div>
          ) : (
            done.map((entry) => (
              <OpdQueueMobileCard
                key={entry.entryId}
                entry={entry}
                onOpen={onOpen}
                dimmed
              />
            ))
          )}
        </>
      )}

      {/* No-show / skipped section */}
      {(missed.length > 0 || filter === "no_show" || filter === "skipped") && (
        <>
          <GroupDivider label="No-show / skipped" count={missed.length} />
          {missed.length === 0 ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
              No missed or skipped patients.
            </div>
          ) : (
            missed.map((entry) => (
              <OpdQueueMobileCard
                key={entry.entryId}
                entry={entry}
                onOpen={onOpen}
                dimmed
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
