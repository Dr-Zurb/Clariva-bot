"use client";

/**
 * OpdQueueMobileCard — 2-line card for the OPD queue on narrow viewports (oq-12).
 *
 * Layout (two lines):
 *   Line 1: #04 ● Waiting · 32 m !                             ⋯
 *   Line 2: Ravi Kumar · PT-2024-0218 · M · 28                 ⏵
 *
 * Tap anywhere = onOpen(entry).
 * Tap ⋯ (right of line 1) = open Sheet with reason / phone / mode / scheduled.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-12-density-mobile.md
 */

import React, { useState } from "react";
import { ChevronRight, MoreHorizontal, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getOpdStatusMeta } from "@/lib/consultation/opd-status-meta";
import { cn } from "@/lib/utils";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpdQueueMobileCardProps {
  entry: DoctorQueueSessionRow;
  onOpen: (entry: DoctorQueueSessionRow) => void;
  /** Same slot as the dense row — ignored on mobile (actions live in the sheet). */
  actions?: React.ReactNode;
  dimmed?: boolean;
  isNextUp?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_DOT_BG: Record<string, string> = {
  waiting: "bg-muted-foreground/50",
  called: "bg-blue-500",
  in_consultation: "bg-green-500",
  completed: "bg-green-500",
  missed: "bg-destructive",
  skipped: "bg-muted-foreground/40",
  cancelled: "bg-destructive",
};

const STATUS_BAR_BG: Record<string, string> = {
  waiting: "bg-muted",
  called: "bg-blue-300 dark:bg-blue-700",
  in_consultation: "bg-green-400 dark:bg-green-600",
  completed: "bg-green-300 dark:bg-green-700",
  missed: "bg-destructive/50",
  skipped: "bg-muted",
  cancelled: "bg-destructive/50",
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function modalityLabel(t: string | null): string {
  switch (t) {
    case "in_clinic":  return "In-clinic";
    case "voice":      return "Voice";
    case "video":      return "Video";
    case "text":       return "Text";
    default:           return "—";
  }
}

// ---------------------------------------------------------------------------
// Detail sheet
// ---------------------------------------------------------------------------

interface DetailSheetProps {
  open: boolean;
  onClose: () => void;
  entry: DoctorQueueSessionRow;
  onOpen: () => void;
}

function DetailSheet({ open, onClose, entry, onOpen }: DetailSheetProps) {
  const meta = getOpdStatusMeta(entry.queueStatus);

  const rows: { label: string; value: string | null }[] = [
    { label: "Phone",     value: entry.patientPhone },
    { label: "Mode",      value: modalityLabel(entry.consultationType) },
    { label: "Scheduled", value: formatTime(entry.scheduledAt) },
    { label: "Reason",    value: entry.reasonForVisit ?? "—" },
    { label: "Service",   value: entry.serviceLabel ?? entry.catalogServiceKey ?? "—" },
    { label: "MRN",       value: entry.medicalRecordNumber ?? "—" },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="tabular-nums text-muted-foreground">
              #{String(entry.tokenNumber).padStart(2, "0")}
            </span>
            <span>{entry.patientName}</span>
            <span
              className={cn(
                "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
                meta.badgeClassName
              )}
            >
              {meta.label}
            </span>
          </SheetTitle>
        </SheetHeader>

        <dl className="divide-y divide-border text-sm">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-start gap-4 py-2.5">
              <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="flex-1 break-words font-medium">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpen();
          }}
          className={cn(
            "mt-5 flex w-full items-center justify-center gap-2 rounded-lg",
            "bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground",
            "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          Open appointment
          <ChevronRight className="h-4 w-4" />
        </button>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpdQueueMobileCard({
  entry,
  onOpen,
  dimmed = false,
  isNextUp = false,
}: OpdQueueMobileCardProps): JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);

  const meta = getOpdStatusMeta(entry.queueStatus);
  const isInConsult = entry.queueStatus === "in_consultation";
  const showNextUp = isNextUp && entry.queueStatus === "waiting";

  const waitedMinutes = Math.floor(
    (Date.now() - new Date(entry.queueCreatedAt).getTime()) / 60_000
  );
  const showWaited =
    entry.queueStatus === "waiting" || entry.queueStatus === "called";
  const isLongWait = showWaited && waitedMinutes > 30;

  const dotBg = STATUS_DOT_BG[entry.queueStatus] ?? "bg-muted-foreground/40";
  const barBg = showNextUp
    ? "bg-primary"
    : (STATUS_BAR_BG[entry.queueStatus] ?? "bg-muted");

  const ariaLabel = `Token #${entry.tokenNumber}, ${entry.patientName}, ${meta.label}${showWaited ? `, waited ${waitedMinutes} minutes` : ""}`;

  const handleCardClick = () => onOpen(entry);

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSheetOpen(true);
  };

  const handleMoreKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      setSheetOpen(true);
    }
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") handleCardClick();
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className={cn(
          "flex cursor-pointer items-stretch gap-0",
          "border-b border-border last:border-0",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          isInConsult && "bg-green-50/60 dark:bg-green-900/20",
          dimmed && "opacity-60"
        )}
      >
        {/* Left color bar */}
        <div className={cn("w-1 shrink-0 self-stretch", barBg)} aria-hidden />

        {/* Card body */}
        <div className="flex min-w-0 flex-1 flex-col px-3 py-2">
          {/* Line 1: token · status · waited time */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="tabular-nums text-muted-foreground">
              #{String(entry.tokenNumber).padStart(2, "0")}
            </span>

            <span
              aria-hidden
              className={cn(
                "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                dotBg,
                isInConsult && "animate-pulse"
              )}
            />

            <span className="font-medium text-foreground">{meta.label}</span>

            {showWaited && (
              <>
                <span className="text-muted-foreground">·</span>
                <span
                  className={cn(
                    "tabular-nums",
                    isLongWait
                      ? "font-semibold text-red-700 dark:text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {waitedMinutes} m{isLongWait ? " !" : ""}
                </span>
              </>
            )}

            {showNextUp && (
              <span className="ml-1 text-xs font-medium text-primary">
                (next)
              </span>
            )}

            {/* Right edge: ⋯ */}
            <button
              type="button"
              onClick={handleMoreClick}
              onKeyDown={handleMoreKeyDown}
              aria-label="More details"
              className={cn(
                "ml-auto shrink-0 rounded p-0.5 text-muted-foreground",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Line 2: name · MRN · sex/age */}
          <div className="mt-0.5 flex items-center gap-1 text-sm">
            <span className="min-w-0 truncate font-medium text-foreground">
              {entry.patientName}
            </span>
            {entry.medicalRecordNumber && (
              <>
                <span className="shrink-0 text-muted-foreground">·</span>
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                  {entry.medicalRecordNumber}
                </span>
              </>
            )}
            {(entry.gender || entry.age != null) && (
              <>
                <span className="shrink-0 text-muted-foreground">·</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {[entry.gender, entry.age].filter(Boolean).join(" · ")}
                </span>
              </>
            )}

            {/* Right edge: ⏵ open chevron */}
            <ChevronRight
              className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </div>
        </div>
      </div>

      <DetailSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        entry={entry}
        onOpen={() => onOpen(entry)}
      />
    </>
  );
}
