"use client";

import React, { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeShort } from "@/lib/format-date";
import type { SlotSessionRow, SlotStatus } from "@/types/opd-doctor";
import type { AddSlotDialogMode } from "./AddSlotDialog";
import { OpdSlotRowActions } from "./OpdSlotRowActions";

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

function statusLabel(s: SlotStatus): string {
  switch (s) {
    case "upcoming":
      return "Upcoming";
    case "grace":
      return "Grace";
    case "running_late":
      return "Late";
    case "in_consultation":
      return "In consult";
    case "completed":
      return "Done";
    case "missed":
      return "Missed";
    case "cancelled":
      return "Cancelled";
    case "overflow":
      return "Overflow";
    default:
      return s;
  }
}

function waitSummary(entry: SlotSessionRow): string {
  if (entry.slotStatus === "running_late") {
    if (entry.delayMinutes != null && entry.delayMinutes > 0) {
      return `+${entry.delayMinutes}m`;
    }
    return "Late";
  }
  if (entry.slotStatus === "in_consultation") return "live";
  return "";
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
  const isInConsult = entry.slotStatus === "in_consultation";
  const wait = waitSummary(entry);
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
        dimmed && "opacity-60",
        keyboardFocused && "ring-2 ring-inset ring-primary"
      )}
    >
      <div
        className={cn(
          "w-1 shrink-0 self-stretch",
          entry.slotStatus === "running_late" && "bg-amber-500",
          entry.slotStatus === "in_consultation" && "bg-primary",
          entry.slotStatus === "completed" && "bg-green-600",
          entry.slotStatus === "missed" && "bg-destructive",
          entry.slotStatus === "overflow" && "bg-indigo-500",
          (entry.slotStatus === "upcoming" || entry.slotStatus === "grace") &&
            "bg-muted",
          entry.slotStatus === "cancelled" && "bg-muted-foreground/40"
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
              entry.slotStatus === "running_late" &&
                "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
              entry.slotStatus === "in_consultation" &&
                "bg-primary/15 text-primary",
              entry.slotStatus === "completed" &&
                "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
              entry.slotStatus === "missed" &&
                "bg-destructive/15 text-destructive",
              entry.slotStatus === "overflow" &&
                "bg-indigo-100 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-100",
              (entry.slotStatus === "upcoming" ||
                entry.slotStatus === "grace") &&
                "bg-muted text-muted-foreground",
              entry.slotStatus === "cancelled" && "bg-muted text-muted-foreground"
            )}
          >
            {statusLabel(entry.slotStatus)}
          </span>
          {entry.slotStatus === "overflow" && (
            <span className="rounded border border-orange-500/50 bg-orange-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-900 dark:text-orange-200">
              Overflow
            </span>
          )}
          {earlyInviteActive && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              Early invite
            </span>
          )}
          {wait && (
            <>
              <span className="text-muted-foreground">·</span>
              <span
                className={cn(
                  "tabular-nums",
                  entry.slotStatus === "in_consultation" &&
                    "font-medium text-primary",
                  entry.slotStatus === "running_late" &&
                    "font-semibold text-amber-800 dark:text-amber-200"
                )}
              >
                {wait}
              </span>
            </>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate pl-1 text-sm font-medium text-foreground",
              entry.slotStatus === "cancelled" && "line-through"
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
