"use client";

import React, { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SlotSessionCounts, SlotSessionRow } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "./OpdQueueStatusFilter";
import { filterSlotSessionRows } from "./shared/opdSlotSessionListModel";
import { orderSlotRowsByTokenDesc } from "./opdSlotSectioning";
import { deriveSlotEmptyState } from "./opdSlotEmptyState";
import { SlotListEmptyStateView } from "./OpdSlotList";
import { OpdSlotMobileCard } from "./OpdSlotMobileCard";
import type { AddSlotDialogMode } from "./AddSlotDialog";

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

  const ordered = useMemo(
    () => orderSlotRowsByTokenDesc(filtered),
    [filtered]
  );

  const renderCard = (row: SlotSessionRow) => (
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
      onOverflowOpenChange={(openState) =>
        setOverflowRowId?.(openState ? row.appointmentId : null)
      }
      onOpenAddSlotDialog={onOpenAddSlotDialog}
    />
  );

  if (isLoading && entries.length === 0) {
    return (
      <div
        className="flex flex-col gap-0 overflow-hidden rounded-lg border border-border"
        role="status"
        aria-label="Loading slots"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-2 border-b border-border px-3 py-3 last:border-b-0"
          >
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
      {ordered.map((row) => renderCard(row))}
    </div>
  );
}
