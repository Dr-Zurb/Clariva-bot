"use client";

import React, { useMemo } from "react";
import { formatTimeShort } from "@/lib/format-date";
import { Skeleton } from "@/components/ui/skeleton";
import type { SlotSessionCounts, SlotSessionRow } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "./OpdQueueStatusFilter";
import { filterSlotSessionRows } from "./shared/opdSlotSessionListModel";
import {
  bucketSlotRowsForSections,
  computeNowDividerPlacement,
  showActiveSlotSection,
} from "./opdSlotSectioning";
import { deriveSlotEmptyState } from "./opdSlotEmptyState";
import { SlotListEmptyStateView } from "./OpdSlotList";
import { OpdSlotMobileCard } from "./OpdSlotMobileCard";
import type { AddSlotDialogMode } from "./AddSlotDialog";

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

function NowDividerMobile() {
  const t = Date.now();
  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-background px-3 py-2">
      <div className="h-px flex-1 bg-primary/30" />
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
        Now · {formatTimeShort(t)}
      </span>
      <div className="h-px flex-1 bg-primary/30" />
    </div>
  );
}

export interface OpdSlotMobileListProps {
  entries: SlotSessionRow[];
  counts: SlotSessionCounts;
  statusFilter: OpdStatusFilterValue;
  searchQuery: string;
  token: string;
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

export function OpdSlotMobileList({
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
  onOverflowOpenChange: setOverflowRowId,
  onClearSearch,
  onResetStatusFilter,
  onOpenAddSlotDialog,
}: OpdSlotMobileListProps): JSX.Element {
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

  const { active, done, missed, overflow, cancelledOnly } = useMemo(
    () => bucketSlotRowsForSections(filtered),
    [filtered]
  );

  const activeNodes = useMemo(() => {
    if (active.length === 0) return null;
    const nowMs = Date.now();
    const placement = computeNowDividerPlacement(active, nowMs);
    const out: React.ReactNode[] = [];
    const card = (row: SlotSessionRow) => (
      <OpdSlotMobileCard
        key={row.appointmentId}
        entry={row}
        token={token}
        sessionDate={sessionDate}
        allSessionEntries={entries}
        keyboardFocused={focusedRowId === row.appointmentId}
        onOpen={(entry) => {
          onFocusChange?.(entry.appointmentId);
          onRowClick(entry);
        }}
        onMutationSuccess={onMutationSuccess}
        overflowOpen={overflowOpenId === row.appointmentId}
        onOverflowOpenChange={(open) =>
          setOverflowRowId?.(open ? row.appointmentId : null)
        }
        onOpenAddSlotDialog={onOpenAddSlotDialog}
      />
    );
    if (placement.kind === "all_past") {
      active.forEach((row) => out.push(card(row)));
      out.push(<NowDividerMobile key="now-end" />);
    } else if (placement.kind === "all_future") {
      out.push(<NowDividerMobile key="now-start" />);
      active.forEach((row) => out.push(card(row)));
    } else {
      const { beforeCount } = placement;
      active.slice(0, beforeCount).forEach((row) => out.push(card(row)));
      out.push(<NowDividerMobile key="now-mid" />);
      active.slice(beforeCount).forEach((row) => out.push(card(row)));
    }
    return out;
  }, [
    active,
    entries,
    focusedRowId,
    onFocusChange,
    onMutationSuccess,
    onOpenAddSlotDialog,
    onRowClick,
    overflowOpenId,
    setOverflowRowId,
    token,
  ]);

  if (isLoading && entries.length === 0) {
    return (
      <div
        className="flex flex-col gap-0 overflow-hidden rounded-lg border border-border"
        role="status"
        aria-label="Loading slots"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-2 border-b border-border px-3 py-3 last:border-b-0">
            <Skeleton className="h-10 w-1 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-[200px]" />
              <Skeleton className="h-3 w-full max-w-xs" />
            </div>
          </div>
        ))}
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
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      {statusFilter === "cancelled" && cancelledOnly.length > 0 && (
        <>
          <GroupDivider label="Cancelled" count={cancelledOnly.length} />
          {cancelledOnly.map((row) => (
            <OpdSlotMobileCard
              key={row.appointmentId}
              entry={row}
              token={token}
              sessionDate={sessionDate}
              allSessionEntries={entries}
              keyboardFocused={focusedRowId === row.appointmentId}
              onOpen={(entry) => {
                onFocusChange?.(entry.appointmentId);
                onRowClick(entry);
              }}
              onMutationSuccess={onMutationSuccess}
              overflowOpen={overflowOpenId === row.appointmentId}
              onOverflowOpenChange={(open) =>
                setOverflowRowId?.(open ? row.appointmentId : null)
              }
              dimmed
              onOpenAddSlotDialog={onOpenAddSlotDialog}
            />
          ))}
        </>
      )}

      {statusFilter !== "cancelled" && (
        <>
          {showActiveSlotSection(statusFilter) && (
            <>
              {active.length === 0 ? (
                <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                  No active slots.
                </div>
              ) : (
                activeNodes
              )}
            </>
          )}

          {done.length > 0 && (
            <>
              <GroupDivider label="Completed" count={done.length} />
              {done.map((row) => (
                <OpdSlotMobileCard
                  key={row.appointmentId}
                  entry={row}
                  token={token}
                  sessionDate={sessionDate}
                  allSessionEntries={entries}
                  keyboardFocused={focusedRowId === row.appointmentId}
                  onOpen={(entry) => {
                    onFocusChange?.(entry.appointmentId);
                    onRowClick(entry);
                  }}
                  onMutationSuccess={onMutationSuccess}
                  overflowOpen={overflowOpenId === row.appointmentId}
                  onOverflowOpenChange={(open) =>
                    setOverflowRowId?.(open ? row.appointmentId : null)
                  }
                  dimmed
                  onOpenAddSlotDialog={onOpenAddSlotDialog}
                />
              ))}
            </>
          )}

          {missed.length > 0 && (
            <>
              <GroupDivider label="Missed" count={missed.length} />
              {missed.map((row) => (
                <OpdSlotMobileCard
                  key={row.appointmentId}
                  entry={row}
                  token={token}
                  sessionDate={sessionDate}
                  allSessionEntries={entries}
                  keyboardFocused={focusedRowId === row.appointmentId}
                  onOpen={(entry) => {
                    onFocusChange?.(entry.appointmentId);
                    onRowClick(entry);
                  }}
                  onMutationSuccess={onMutationSuccess}
                  overflowOpen={overflowOpenId === row.appointmentId}
                  onOverflowOpenChange={(open) =>
                    setOverflowRowId?.(open ? row.appointmentId : null)
                  }
                  dimmed
                  onOpenAddSlotDialog={onOpenAddSlotDialog}
                />
              ))}
            </>
          )}

          {overflow.length > 0 && (
            <>
              <GroupDivider label="Overflow" count={overflow.length} />
              {overflow.map((row) => (
                <OpdSlotMobileCard
                  key={row.appointmentId}
                  entry={row}
                  token={token}
                  sessionDate={sessionDate}
                  allSessionEntries={entries}
                  keyboardFocused={focusedRowId === row.appointmentId}
                  onOpen={(entry) => {
                    onFocusChange?.(entry.appointmentId);
                    onRowClick(entry);
                  }}
                  onMutationSuccess={onMutationSuccess}
                  overflowOpen={overflowOpenId === row.appointmentId}
                  onOverflowOpenChange={(open) =>
                    setOverflowRowId?.(open ? row.appointmentId : null)
                  }
                  onOpenAddSlotDialog={onOpenAddSlotDialog}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
