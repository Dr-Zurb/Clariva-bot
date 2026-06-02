"use client";

/**
 * OpdQueueTable — grouped OPD queue table with dense rows (oq-04).
 *
 * Renders DoctorQueueSessionRow entries as a dense 13-column CSS grid:
 *   - Sticky header row aligned to OPD_QUEUE_GRID_TEMPLATE.
 *   - Three grouped sections: Active (never collapsible) / Done today
 *     (collapsible) / No-show & skipped (collapsible).
 *   - "Next up" emphasis on the first waiting row.
 *   - Full pipeline rendered (no client-side row cap); body scrolls.
 *   - Status filter (oq-07): `filter` prop narrows which rows/groups appear.
 *   - Stale-while-revalidate error banner when entries exist but refresh failed.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-04-table-shell-grouping.md
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { todayLocalIso } from "@/lib/dates";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import {
  OPD_QUEUE_GRID_TEMPLATE,
  OPD_QUEUE_HEADER_COLS,
} from "./OpdQueueGrid";
import { OpdQueueDenseRow } from "./OpdQueueDenseRow";
import { OpdQueueRowExpanded } from "./OpdQueueRowExpanded";
import type { OpdQueueStatusFilterValue } from "./OpdQueueStatusFilter";
import { matchesOpdQueueSearch } from "./shared/opdSearchMatcher";
import { getOpdQueueEmptyState } from "./opdQueueEmptyState";
import type { OpdQueueGrouping } from "@/hooks/useOpdQueueGrouping";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpdQueueTableProps {
  /** All queue entries for today. Grouping + filtering applied here. */
  entries: DoctorQueueSessionRow[];
  /** Active status filter from useOpdQueueFilters (oq-07). Default: 'all'. */
  filter?: OpdQueueStatusFilterValue;
  /** Free-text search query from oq-08. Matches name / phone / token / MRN. */
  q?: string;
  /**
   * Ordering mode.  `'group'` (default) renders Active / Done / Missed sections;
   * `'token-asc'` / `'token-desc'` renders a flat list sorted by token number.
   * Persisted via useOpdQueueGrouping.
   */
  grouping?: OpdQueueGrouping;
  /** Called when the doctor clicks the # column header to change token sort direction. */
  onChangeGrouping?: (next: OpdQueueGrouping) => void;
  /** Currently-expanded row entryId (single-row expand at a time). */
  expandedEntryId?: string | null;
  /** Handler to toggle the inline expand for a given entry. */
  onToggleExpand?: (entryId: string) => void;
  /** Handler called when a row's primary action fires (Open). */
  onOpenRow?: (entry: DoctorQueueSessionRow) => void;
  /** Slot supplier — given an entry, returns the row's right-edge actions JSX. */
  renderActions?: (entry: DoctorQueueSessionRow) => React.ReactNode;
  /**
   * Doctor JWT passed to OpdQueueRowExpanded for lazy allergy fetching.
   * Required to enable the inline expand panel; if omitted the expand chevron
   * still shows but the panel data will skip authenticated fetches.
   */
  token?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /**
   * The keyboard-focused entry id from J/K hotkeys (task-oq-13).
   * Passed through to OpdQueueDenseRow as `focused` so the row can render
   * the left-edge ring-primary treatment.
   */
  focusedEntryId?: string | null;
  /**
   * Session date (YYYY-MM-DD) — used by getOpdQueueEmptyState to build the
   * context-aware fallback description (task-oq-13).
   */
  sessionDate?: string;
  /**
   * Unix-ms timestamp of the last successful snapshot poll.
   * Drives the aria-live="polite" region that announces "Queue refreshed at
   * HH:mm" to screen readers, throttled to once per minute (task-oq-13).
   */
  lastUpdatedAt?: number | null;
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(["waiting", "called", "in_consultation"]);
const DONE_STATUSES = new Set(["completed"]);
const MISSED_STATUSES = new Set(["missed", "skipped", "cancelled"]);
const NO_SHOW_STATUSES = new Set(["missed", "skipped", "cancelled"]);

function compareActive(
  a: DoctorQueueSessionRow,
  b: DoctorQueueSessionRow
): number {
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
  /**
   * Flat token-ordered list — only populated when `grouping === 'token'`.
   * When non-null, the table renders a single un-grouped section instead of
   * the three Disclosure sections.
   */
  flat: DoctorQueueSessionRow[] | null;
  nextUpId: string | null;
}

function groupEntries(
  entries: DoctorQueueSessionRow[],
  filter: OpdQueueStatusFilterValue,
  q: string,
  grouping: OpdQueueGrouping
): Buckets {
  // Apply search first, then status filter
  const searched = q ? entries.filter((e) => matchesOpdQueueSearch(e, q)) : entries;
  const filtered: DoctorQueueSessionRow[] =
    filter === "all"
      ? searched
      : filter === "no_show"
      ? searched.filter((e) => NO_SHOW_STATUSES.has(e.queueStatus))
      : searched.filter((e) => e.queueStatus === filter);

  // Always compute the "next up" hint, regardless of grouping mode, so the
  // (next) suffix on the first waiting row stays correct in token view too.
  const firstWaiting = filtered
    .filter((e) => e.queueStatus === "waiting")
    .sort((a, b) => a.tokenNumber - b.tokenNumber)[0];

  // Token-asc/desc is honored regardless of filter:
  //   - filter === "all"      → flat list of all rows in chosen direction
  //   - filter !== "all"      → single status bucket, still sorted by token
  //                             in the chosen direction
  // The "Group" mode is only meaningful when filter === "all" (a status
  // filter already collapses the queue to one bucket).  When a status filter
  // is active and `grouping === "group"`, the table renders one Disclosure
  // section using the per-bucket comparator (active → compareActive,
  // done/missed → token asc).
  if (grouping === "token-asc" || grouping === "token-desc") {
    const direction = grouping === "token-asc" ? 1 : -1;
    const flat = [...filtered].sort(
      (a, b) => direction * (a.tokenNumber - b.tokenNumber)
    );
    return {
      active: [],
      done: [],
      missed: [],
      flat,
      nextUpId: firstWaiting?.entryId ?? null,
    };
  }

  const active = filtered
    .filter((e) => ACTIVE_STATUSES.has(e.queueStatus))
    .sort(compareActive);

  const done = filtered
    .filter((e) => DONE_STATUSES.has(e.queueStatus))
    .sort((a, b) => a.tokenNumber - b.tokenNumber);

  const missed = filtered
    .filter((e) => MISSED_STATUSES.has(e.queueStatus))
    .sort((a, b) => a.tokenNumber - b.tokenNumber);

  return {
    active,
    done,
    missed,
    flat: null,
    nextUpId: firstWaiting?.entryId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Disclosure — animated collapsible section (CSS grid row trick)
// ---------------------------------------------------------------------------

interface DisclosureProps {
  label: string;
  count: number;
  defaultOpen: boolean;
  /** When true, section cannot be collapsed (Active group). */
  locked?: boolean;
  children: React.ReactNode;
}

function Disclosure({
  label,
  count,
  defaultOpen,
  locked = false,
  children,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = locked || open;

  return (
    <div>
      {/* Section divider row */}
      <div
        className={cn(
          "grid items-center border-b border-border/30 bg-muted/15 px-2 py-1",
          !locked && "cursor-pointer hover:bg-muted/30 transition-colors"
        )}
        style={{ gridTemplateColumns: OPD_QUEUE_GRID_TEMPLATE }}
        role={locked ? undefined : "button"}
        tabIndex={locked ? undefined : 0}
        aria-expanded={locked ? undefined : isOpen}
        onClick={() => !locked && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!locked && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {/* Spans all 13 columns via a single div that covers everything */}
        <div
          className="col-span-full flex items-center gap-1.5"
          style={{ gridColumn: "1 / -1" }}
        >
          {!locked && (
            <ChevronDown
              className={cn(
                "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
                isOpen && "rotate-180"
              )}
            />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="tabular-nums text-xs text-muted-foreground">
            ({count})
          </span>
        </div>
      </div>

      {/* Animated body */}
      <div
        className={cn(
          "grid transition-all duration-150 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticky header
// ---------------------------------------------------------------------------

interface TableHeaderProps {
  grouping: OpdQueueGrouping;
  onChangeGrouping?: (next: OpdQueueGrouping) => void;
}

function TableHeader({ grouping, onChangeGrouping }: TableHeaderProps) {
  const isToken = grouping === "token-asc" || grouping === "token-desc";

  // Clicking the # header:
  //  - If currently in group mode → enter token-asc
  //  - If token-asc               → token-desc
  //  - If token-desc              → token-asc  (simple asc/desc cycle)
  const handleTokenSortClick = () => {
    if (!onChangeGrouping) return;
    if (grouping === "token-asc") {
      onChangeGrouping("token-desc");
    } else {
      onChangeGrouping("token-asc");
    }
  };

  return (
    <div
      className="sticky top-0 z-10 grid border-b border-border/50 bg-muted/60 backdrop-blur"
      style={{ gridTemplateColumns: OPD_QUEUE_GRID_TEMPLATE }}
      role="row"
      aria-label="Queue column headers"
    >
      {/*
       * IMPORTANT: do NOT apply `sr-only` to the grid cell itself.
       * Tailwind's `.sr-only` uses `position: absolute`, which removes the
       * element from the grid's auto-placement flow. That collapses the
       * track and shifts every subsequent visible header left, breaking
       * alignment with the body rows. Keep the cell in flow; only hide
       * the label visually via a nested <span class="sr-only">.
       */}
      {OPD_QUEUE_HEADER_COLS.map((col) => {
        // The "#" token column gets a clickable sort affordance.
        if (col.key === "token" && onChangeGrouping) {
          return (
            <div key={col.key} role="columnheader" className="min-w-0 px-2 py-2">
              <button
                type="button"
                onClick={handleTokenSortClick}
                aria-label={
                  isToken
                    ? `Sort by token — ${grouping === "token-asc" ? "ascending, click for descending" : "descending, click for ascending"}`
                    : "Sort by token number"
                }
                className={cn(
                  "flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide",
                  "rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isToken
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                #
                {isToken ? (
                  grouping === "token-asc" ? (
                    <ArrowUp className="h-3 w-3" aria-hidden />
                  ) : (
                    <ArrowDown className="h-3 w-3" aria-hidden />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
                )}
              </button>
            </div>
          );
        }

        return (
          <div
            key={col.key}
            role="columnheader"
            className={cn(
              "py-2 text-xs",
              "min-w-0 truncate px-2 font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            {col.srOnly ? (
              <span className="sr-only">{col.label}</span>
            ) : (
              col.label
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="grid items-center gap-2 px-2 py-2"
          style={{ gridTemplateColumns: OPD_QUEUE_GRID_TEMPLATE }}
        >
          <Skeleton className="h-full w-1 self-stretch" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-5" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpdQueueTable({
  entries,
  filter = "all",
  q = "",
  grouping = "group",
  onChangeGrouping,
  expandedEntryId,
  onToggleExpand,
  onOpenRow,
  renderActions,
  token = "",
  isLoading = false,
  error = null,
  onRetry,
  focusedEntryId,
  sessionDate = todayLocalIso(),
  lastUpdatedAt: lastUpdatedAtProp,
}: OpdQueueTableProps): JSX.Element {
  // Stale banner: use the incoming lastUpdatedAt to show HH:mm.
  // Fall back to mount-time Date if not provided (backward compat).
  const staleBannerTime = useMemo(
    () => (lastUpdatedAtProp ? new Date(lastUpdatedAtProp) : new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastUpdatedAtProp ?? 0]
  );

  // ── aria-live region — announce snapshot refreshes to screen readers ──────
  // Throttled to 1 announcement per minute so screen-reader users aren't spammed.
  const [liveText, setLiveText] = useState("");
  const lastAnnouncedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!lastUpdatedAtProp) return;
    const now = Date.now();
    if (now - lastAnnouncedAtRef.current < 60_000) return;
    lastAnnouncedAtRef.current = now;
    const hhmm = new Date(lastUpdatedAtProp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setLiveText(`Queue refreshed at ${hhmm}`);
  }, [lastUpdatedAtProp]);

  const { active, done, missed, flat, nextUpId } = useMemo(
    () => groupEntries(entries, filter, q, grouping),
    [entries, filter, q, grouping]
  );

  // When filter is active, force sections open
  const forceOpen = filter !== "all";

  // ── Loading — initial fetch, no entries ──
  if (isLoading && entries.length === 0) {
    return (
      <div
        className="overflow-hidden rounded-lg border border-border"
        role="status"
        aria-label="Loading queue"
      >
        <TableHeader grouping={grouping} onChangeGrouping={onChangeGrouping} />
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Hard error — no stale data to show ──
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

  // ── Empty — no queue for today ──
  if (!isLoading && entries.length === 0) {
    const { title, description } = getOpdQueueEmptyState({
      statusFilter: filter,
      query: q,
      sessionDate,
    });
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/10 p-12 text-center"
        role="status"
      >
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    );
  }

  // ── Filter / search empty state — entries exist but none match ──
  const allGroupsEmpty =
    active.length === 0 &&
    done.length === 0 &&
    missed.length === 0 &&
    (flat?.length ?? 0) === 0;
  if (allGroupsEmpty) {
    const { title, description } = getOpdQueueEmptyState({
      statusFilter: filter,
      query: q,
      sessionDate,
    });
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/10 p-12 text-center"
        role="status"
      >
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border/50 shadow-sm">
      {/* Screen-reader live region — announces queue refreshes (throttled 1/min) */}
      <span
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveText}
      </span>

      {/* Stale-while-revalidate banner */}
      {error && entries.length > 0 && (
        <div className="flex items-center justify-between border-b border-destructive/20 bg-destructive/5 px-3 py-1.5">
          <p className="text-xs text-destructive">
            Couldn&apos;t refresh just now. Last update:{" "}
            {staleBannerTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
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

      {/* Sticky header */}
      <TableHeader grouping={grouping} onChangeGrouping={onChangeGrouping} />

      {/* Scrollable body */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 280px)" }}
        role="rowgroup"
      >
        {flat ? (
          /*
           * Token-order view — single flat list.  Status pill / color bar still
           * convey state; rows are NOT dimmed by group, because that hierarchy
           * is the entire reason a doctor would switch to this mode.
           */
          flat.map((entry) => (
            <React.Fragment key={entry.entryId}>
              <OpdQueueDenseRow
                entry={entry}
                isNextUp={entry.entryId === nextUpId}
                expanded={expandedEntryId === entry.entryId}
                focused={focusedEntryId === entry.entryId}
                onToggleExpand={
                  onToggleExpand
                    ? () => onToggleExpand(entry.entryId)
                    : undefined
                }
                onOpen={() => onOpenRow?.(entry)}
                actions={renderActions?.(entry)}
              />
              {expandedEntryId === entry.entryId && (
                <OpdQueueRowExpanded entry={entry} token={token} />
              )}
            </React.Fragment>
          ))
        ) : (
          <>
        {/* ── Active section (never collapsible) ── */}
        {(active.length > 0 || filter === "all" || ACTIVE_STATUSES.has(filter as string)) && (
          <Disclosure
            label="Active"
            count={active.length}
            defaultOpen
            locked
          >
            {active.length === 0 ? (
              <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                No active patients.
              </div>
            ) : (
              active.map((entry) => (
                <React.Fragment key={entry.entryId}>
                  <OpdQueueDenseRow
                    entry={entry}
                    isNextUp={entry.entryId === nextUpId}
                    expanded={expandedEntryId === entry.entryId}
                    focused={focusedEntryId === entry.entryId}
                    onToggleExpand={
                      onToggleExpand
                        ? () => onToggleExpand(entry.entryId)
                        : undefined
                    }
                    onOpen={() => onOpenRow?.(entry)}
                    actions={renderActions?.(entry)}
                  />
                  {expandedEntryId === entry.entryId && (
                    <OpdQueueRowExpanded entry={entry} token={token} />
                  )}
                </React.Fragment>
              ))
            )}
          </Disclosure>
        )}

        {/* ── Done today section (collapsible) ── */}
        {(done.length > 0 || filter === "completed") && (
          <Disclosure
            label="Done today"
            count={done.length}
            defaultOpen={forceOpen || done.length <= 10}
          >
            {done.length === 0 ? (
              <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                No completed patients.
              </div>
            ) : (
              done.map((entry) => (
                <React.Fragment key={entry.entryId}>
                  <OpdQueueDenseRow
                    entry={entry}
                    dimmed
                    onOpen={() => onOpenRow?.(entry)}
                    expanded={expandedEntryId === entry.entryId}
                    focused={focusedEntryId === entry.entryId}
                    onToggleExpand={
                      onToggleExpand
                        ? () => onToggleExpand(entry.entryId)
                        : undefined
                    }
                    actions={renderActions?.(entry)}
                  />
                  {expandedEntryId === entry.entryId && (
                    <OpdQueueRowExpanded entry={entry} token={token} />
                  )}
                </React.Fragment>
              ))
            )}
          </Disclosure>
        )}

        {/* ── No-show / skipped section (collapsible) ── */}
        {(missed.length > 0 || filter === "no_show" || filter === "skipped") && (
          <Disclosure
            label="No-show / skipped"
            count={missed.length}
            defaultOpen={forceOpen || missed.length <= 5}
          >
            {missed.length === 0 ? (
              <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                No missed or skipped patients.
              </div>
            ) : (
              missed.map((entry) => (
                <React.Fragment key={entry.entryId}>
                  <OpdQueueDenseRow
                    entry={entry}
                    dimmed
                    onOpen={() => onOpenRow?.(entry)}
                    expanded={expandedEntryId === entry.entryId}
                    focused={focusedEntryId === entry.entryId}
                    onToggleExpand={
                      onToggleExpand
                        ? () => onToggleExpand(entry.entryId)
                        : undefined
                    }
                    actions={renderActions?.(entry)}
                  />
                  {expandedEntryId === entry.entryId && (
                    <OpdQueueRowExpanded entry={entry} token={token} />
                  )}
                </React.Fragment>
              ))
            )}
          </Disclosure>
        )}
          </>
        )}
      </div>
    </div>
  );
}
