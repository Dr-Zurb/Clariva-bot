"use client";

import React, { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeShort } from "@/lib/format-date";
import { useConsultSteppedAway } from "@/hooks/useConsultSteppedAway";
import type { SlotSessionRow } from "@/types/opd-doctor";
import type { AddSlotDialogMode } from "./AddSlotDialog";
import { OpdSlotRowActions } from "./OpdSlotRowActions";
import { showArrivedChip } from "./shared/opdArrival";
import {
  hasSlotTag,
  isOverflowRow,
  lifecycleBadgeLabel,
  lifecycleTone,
  resolveLifecycle,
} from "./shared/slotAxes";

export interface OpdSlotMobileCardProps {
  entry: SlotSessionRow;
  token: string;
  sessionDate: string;
  allSessionEntries: SlotSessionRow[];
  onOpen: (entry: SlotSessionRow) => void;
  onMutationSuccess: () => void;
  dimmed?: boolean;
  keyboardFocused?: boolean;
  overflowOpen?: boolean;
  onOverflowOpenChange?: (open: boolean) => void;
  onOpenAddSlotDialog?: (opts: {
    mode: AddSlotDialogMode;
    relatedAppointmentId?: string | null;
  }) => void;
}

export function OpdSlotMobileCard({
  entry,
  token,
  sessionDate,
  allSessionEntries,
  onOpen,
  onMutationSuccess,
  dimmed = false,
  keyboardFocused = false,
  overflowOpen,
  onOverflowOpenChange,
  onOpenAddSlotDialog,
}: OpdSlotMobileCardProps): JSX.Element {
  const steppedAway = useConsultSteppedAway(entry.appointmentId);
  const lifecycle = resolveLifecycle(entry) ?? "scheduled";
  const tone = lifecycleTone(lifecycle);
  const lateBand =
    entry.timing?.band === "late" || entry.slotStatus === "running_late";
  const badgeLabel =
    lifecycle === "scheduled" && lateBand
      ? "Overdue"
      : lifecycleBadgeLabel(lifecycle);
  const isInConsult = lifecycle === "in_consult";
  const isIncomplete = lifecycle === "incomplete";
  const showAwayChip = steppedAway && (isInConsult || isIncomplete);
  const overflowTagged = isOverflowRow(entry);
  const earlyInviteActive =
    entry.earlyInviteExpiresAt != null &&
    new Date(entry.earlyInviteExpiresAt).getTime() > Date.now();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!keyboardFocused) return;
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [keyboardFocused]);

  const handleCardClick = () => onOpen(entry);

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") handleCardClick();
  };

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-label={`${formatTimeShort(entry.scheduledAt)}, ${entry.patientName}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "group flex cursor-pointer items-stretch gap-0",
        "border-b border-border last:border-0",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        isInConsult && "bg-primary/5",
        isIncomplete && "bg-amber-50/70 dark:bg-amber-950/20",
        dimmed && "opacity-60",
        keyboardFocused && "ring-2 ring-inset ring-primary"
      )}
    >
      <div
        className={cn(
          "w-1 shrink-0 self-stretch",
          tone.dotClass,
          lateBand && lifecycle === "scheduled" && "bg-amber-500",
          overflowTagged && lifecycle === "scheduled" && "bg-indigo-500"
        )}
        aria-hidden
      />

      <div className="relative min-w-0 flex-1 flex-col px-3 py-2 pr-10">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="tabular-nums text-muted-foreground">
            {formatTimeShort(entry.scheduledAt)}
          </span>
          <span className="text-muted-foreground">·</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              tone.pillClass,
              lateBand &&
                lifecycle === "scheduled" &&
                "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
            )}
          >
            {badgeLabel}
          </span>
          {overflowTagged && (
            <span className="rounded border border-orange-500/50 bg-orange-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-900 dark:text-orange-200">
              Overflow
            </span>
          )}
          {showAwayChip && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              Away
            </span>
          )}
          {showArrivedChip(entry) && (
            <span
              title="Arrived at the clinic."
              className="inline-flex shrink-0 rounded border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900"
            >
              Arrived
            </span>
          )}
          {hasSlotTag(entry, "patient_waiting") && (
            <span
              title="Patient is in the consult lobby right now."
              className="inline-flex shrink-0 rounded border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900"
            >
              Waiting
            </span>
          )}
          {hasSlotTag(entry, "patient_stepped_away") && (
            <span
              title="Patient checked in earlier but lobby went idle."
              className="inline-flex shrink-0 rounded border border-stone-400/50 bg-stone-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-700"
            >
              Stepped away
            </span>
          )}
          {(earlyInviteActive || hasSlotTag(entry, "early_invited")) && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              Early invite
            </span>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate pl-1 text-sm font-medium text-foreground",
              lifecycle === "cancelled" && "line-through"
            )}
          >
            {entry.patientName}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {[entry.gender, entry.age].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>

        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {entry.patientPhone} · {entry.reasonForVisit ?? "—"} ·{" "}
          {entry.serviceLabel ?? entry.catalogServiceKey ?? "—"}
        </div>

        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-0.5">
          <div className="pointer-events-auto">
            <OpdSlotRowActions
              entry={entry}
              token={token}
              sessionDate={sessionDate}
              allSessionEntries={allSessionEntries}
              onMutationSuccess={onMutationSuccess}
              overflowOpen={overflowOpen}
              onOverflowOpenChange={onOverflowOpenChange}
              onOpenAddSlotDialog={onOpenAddSlotDialog}
            />
          </div>
        </div>

        <ChevronRight
          className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 text-muted-foreground"
          aria-hidden
        />
      </div>
    </div>
  );
}
