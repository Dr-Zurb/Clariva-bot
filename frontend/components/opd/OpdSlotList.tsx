"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useNowMs } from "@/hooks/useNowMs";
import { cn } from "@/lib/utils";
import type { SlotSessionCounts, SlotSessionRow } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "./OpdQueueStatusFilter";
import {
  OPD_SLOT_GRID_TEMPLATE,
  OPD_SLOT_HEADER_COLS,
} from "./OpdQueueGrid";
import { filterSlotSessionRows } from "./shared/opdSlotSessionListModel";
import { orderSlotRowsByTokenDesc } from "./opdSlotSectioning";
import {
  deriveSlotEmptyState,
  slotFilterEmptyLabel,
  type SlotEmptyState,
} from "./opdSlotEmptyState";
import { OpdSlotDenseRow } from "./OpdSlotDenseRow";
import { OpdSlotRowExpanded } from "./OpdSlotRowExpanded";
import { OpdSlotRowActions } from "./OpdSlotRowActions";
import type { AddSlotDialogMode } from "./AddSlotDialog";

// ---------------------------------------------------------------------------
// Empty state (sl-05)
// ---------------------------------------------------------------------------

export function SlotListEmptyStateView(props: {
  state: Exclude<SlotEmptyState, { kind: "none" }>;
  onClearSearch: () => void;
  onResetStatusFilter: () => void;
}): JSX.Element | null {
  const wrap = (inner: React.ReactNode) => (
    <div
      className="rounded-lg border border-dashed border-border bg-muted/10 p-12 text-center"
      role="status"
    >
      {inner}
    </div>
  );

  switch (props.state.kind) {
    case "no-data":
      return wrap(
        <>
          <p className="font-medium text-foreground">No slots booked for this date</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bookings in slot mode will appear here.
          </p>
          <p className="mt-4">
            <Link
              href="/dashboard/settings/practice-setup/availability"
              className="text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/90"
            >
              Open availability
            </Link>
          </p>
        </>
      );
    case "all-completed":
      return wrap(
        <>
          <p className="font-medium text-foreground">All slots done for today</p>
          <p className="mt-1 text-sm text-muted-foreground">Have a break ✦</p>
        </>
      );
    case "filtered-empty":
      if (props.state.filter === "search") {
        return wrap(
          <>
            <p className="font-medium text-foreground">No slot matches your search.</p>
            <p className="mt-3">
              <button
                type="button"
                className="text-sm font-medium text-primary underline underline-offset-2"
                onClick={props.onClearSearch}
              >
                Clear search
              </button>
            </p>
          </>
        );
      }
      return wrap(
        <>
          <p className="font-medium text-foreground">
            No {slotFilterEmptyLabel(props.state.filter)} slots.
          </p>
          <p className="mt-3">
            <button
              type="button"
              className="text-sm font-medium text-primary underline underline-offset-2"
              onClick={props.onResetStatusFilter}
            >
              Clear filter
            </button>
          </p>
        </>
      );
    default:
      return null;
  }
}

function SlotTableHeader() {
  return (
    <div
      className="sticky top-0 z-10 grid border-b border-border/50 bg-muted/60 backdrop-blur"
      style={{ gridTemplateColumns: OPD_SLOT_GRID_TEMPLATE }}
      role="row"
      aria-label="Slot column headers"
    >
      {OPD_SLOT_HEADER_COLS.map((col) => (
        <div
          key={col.key}
          role="columnheader"
          className={cn(
            "min-w-0 truncate px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          {col.srOnly ? (
            <span className="sr-only">{col.label}</span>
          ) : (
            col.label
          )}
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="grid items-center gap-2 px-2 py-2"
          style={{ gridTemplateColumns: OPD_SLOT_GRID_TEMPLATE }}
        >
          <Skeleton className="h-full w-1 self-stretch" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-5" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

export interface OpdSlotListProps {
  entries: SlotSessionRow[];
  counts: SlotSessionCounts;
  statusFilter: OpdStatusFilterValue;
  searchQuery: string;
  token: string;
  /** OPD session date — forwarded to row actions for cockpit back-navigation. */
  sessionDate: string;
  onMutationSuccess: () => void;
  onRowClick: (entry: SlotSessionRow) => void;
  isLoading?: boolean;
  focusedRowId?: string | null;
  onFocusChange?: (id: string | null) => void;
  overflowOpenId?: string | null;
  onOverflowOpenChange?: (id: string | null) => void;
  onClearSearch: () => void;
  onResetStatusFilter: () => void;
  onOpenAddSlotDialog?: (opts: {
    mode: AddSlotDialogMode;
    relatedAppointmentId?: string | null;
  }) => void;
}

export function OpdSlotList({
  entries,
  counts: _counts,
  statusFilter,
  searchQuery,
  token,
  sessionDate,
  onMutationSuccess,
  onRowClick,
  isLoading = false,
  focusedRowId = null,
  onFocusChange,
  overflowOpenId = null,
  onOverflowOpenChange,
  onClearSearch,
  onResetStatusFilter,
  onOpenAddSlotDialog,
}: OpdSlotListProps): JSX.Element {
  const [expandedAppointmentId, setExpandedAppointmentId] = useState<
    string | null
  >(null);

  const nowMs = useNowMs(30_000);

  const filtered = useMemo(
    () => filterSlotSessionRows(entries, statusFilter, searchQuery),
    [entries, statusFilter, searchQuery]
  );

  const emptyState = useMemo(
    () =>
      deriveSlotEmptyState({
        entries,
        filteredCount: filtered.length,
        statusFilter,
        searchQuery,
      }),
    [entries, filtered.length, statusFilter, searchQuery]
  );

  const ordered = useMemo(
    () => orderSlotRowsByTokenDesc(filtered),
    [filtered]
  );

  const renderRow = useCallback(
    (row: SlotSessionRow) => (
      <React.Fragment key={row.appointmentId}>
        <OpdSlotDenseRow
          entry={row}
          nowMs={nowMs}
          expanded={expandedAppointmentId === row.appointmentId}
          keyboardFocused={focusedRowId === row.appointmentId}
          onToggleExpand={() =>
            setExpandedAppointmentId((prev) =>
              prev === row.appointmentId ? null : row.appointmentId
            )
          }
          onOpen={() => {
            onFocusChange?.(row.appointmentId);
            onRowClick(row);
          }}
          actions={
            <OpdSlotRowActions
              entry={row}
              token={token}
              sessionDate={sessionDate}
              allSessionEntries={entries}
              onMutationSuccess={onMutationSuccess}
              overflowOpen={overflowOpenId === row.appointmentId}
              onOverflowOpenChange={(openState) =>
                onOverflowOpenChange?.(openState ? row.appointmentId : null)
              }
              onOpenAddSlotDialog={onOpenAddSlotDialog}
            />
          }
        />
        {expandedAppointmentId === row.appointmentId && (
          <OpdSlotRowExpanded entry={row} token={token} />
        )}
      </React.Fragment>
    ),
    [
      entries,
      expandedAppointmentId,
      focusedRowId,
      nowMs,
      onFocusChange,
      onMutationSuccess,
      onOpenAddSlotDialog,
      onOverflowOpenChange,
      onRowClick,
      overflowOpenId,
      sessionDate,
      token,
    ]
  );

  if (isLoading && entries.length === 0) {
    return (
      <div
        className="overflow-hidden rounded-lg border border-border"
        role="status"
        aria-label="Loading slots"
      >
        <SlotTableHeader />
        <LoadingSkeleton />
      </div>
    );
  }

  if (!isLoading && emptyState.kind !== "none") {
    return (
      <SlotListEmptyStateView
        state={emptyState}
        onClearSearch={onClearSearch}
        onResetStatusFilter={onResetStatusFilter}
      />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border/50 shadow-sm">
      <SlotTableHeader />

      <div
        className="overflow-y-auto pb-3"
        style={{ maxHeight: "calc(100vh - 340px)" }}
        role="rowgroup"
      >
        {ordered.map((row) => renderRow(row))}
      </div>
    </div>
  );
}
