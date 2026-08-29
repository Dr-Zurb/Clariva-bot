"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SlotSessionCounts, SlotSessionRow } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "./OpdQueueStatusFilter";
import { filterSlotSessionRows } from "./shared/opdSlotSessionListModel";
import {
  partitionSlotRowsForList,
  rowsForChipSection,
  sectionDefaultOpen,
  shouldRenderChipSection,
  SLOT_CHIP_SECTION_HINT,
  SLOT_CHIP_SECTION_LABEL,
  SLOT_CHIP_SECTION_ORDER,
  type SlotChipSectionKey,
} from "./opdSlotSectioning";
import { deriveSlotEmptyState } from "./opdSlotEmptyState";
import { SlotListEmptyStateView } from "./OpdSlotList";
import { OpdSlotMobileCard } from "./OpdSlotMobileCard";
import type { AddSlotDialogMode } from "./AddSlotDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function CollapsibleGroup({
  label,
  hint,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  hint: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-expanded={open}
              aria-description={hint}
              onClick={() => setOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-1.5 border-b border-t border-border/60 bg-muted/20 px-3 py-1 text-left hover:bg-muted/30"
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
                  open && "rotate-180"
                )}
              />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              <span className="tabular-nums text-xs text-muted-foreground">
                ({count})
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-left">
            {hint}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div
        className={cn(
          "grid transition-all duration-150 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
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

  const partitions = useMemo(
    () => partitionSlotRowsForList(filtered),
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
      {statusFilter !== "all"
        ? SLOT_CHIP_SECTION_ORDER.flatMap((section: SlotChipSectionKey) => {
            const rows = rowsForChipSection(partitions, section);
            if (!shouldRenderChipSection(statusFilter, section, rows.length)) {
              return [];
            }
            return rows.map((row) => renderCard(row));
          })
        : SLOT_CHIP_SECTION_ORDER.map((section: SlotChipSectionKey) => {
            const rows = rowsForChipSection(partitions, section);
            if (!shouldRenderChipSection(statusFilter, section, rows.length)) {
              return null;
            }

            return (
              <CollapsibleGroup
                key={`${section}-${statusFilter}`}
                label={SLOT_CHIP_SECTION_LABEL[section]}
                hint={SLOT_CHIP_SECTION_HINT[section]}
                count={rows.length}
                defaultOpen={sectionDefaultOpen(statusFilter, section)}
              >
                {rows.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    None
                  </div>
                ) : (
                  rows.map((row) => renderCard(row))
                )}
              </CollapsibleGroup>
            );
          })}
    </div>
  );
}
