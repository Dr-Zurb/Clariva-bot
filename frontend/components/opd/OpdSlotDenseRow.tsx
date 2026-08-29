"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Building,
  ChevronRight,
  MessageSquare,
  Phone,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatTimeShort } from "@/lib/format-date";
import { useConsultSteppedAway } from "@/hooks/useConsultSteppedAway";
import type { SlotSessionRow } from "@/types/opd-doctor";
import { OPD_SLOT_GRID_TEMPLATE } from "./OpdQueueGrid";
import { showArrivedChip } from "./shared/opdArrival";
import {
  hasSlotTag,
  isOverflowRow,
  lifecycleBadgeLabel,
  lifecycleTone,
  resolveLifecycle,
} from "./shared/slotAxes";
import {
  formatSlotDelta,
  SLOT_DELTA_TONE_CLASS,
} from "./shared/slotTimeDelta";

export interface OpdSlotDenseRowProps {
  entry: SlotSessionRow;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onOpen: () => void;
  actions?: React.ReactNode;
  /** Keyboard focus ring (J/K hotkeys) — sl-05 */
  keyboardFocused?: boolean;
  /** Ticking wall-clock from the list, so every row's delta advances together. */
  nowMs?: number;
}

function modalityIcon(
  t: string | null
): { icon: LucideIcon; label: string } | null {
  switch (t) {
    case "in_clinic":
      return { icon: Building, label: "In-clinic" };
    case "voice":
      return { icon: Phone, label: "Voice" };
    case "video":
      return { icon: Video, label: "Video" };
    case "text":
      return { icon: MessageSquare, label: "Text" };
    default:
      return null;
  }
}

export function OpdSlotDenseRow({
  entry,
  expanded = false,
  onToggleExpand,
  onOpen,
  actions,
  keyboardFocused = false,
  nowMs,
}: OpdSlotDenseRowProps): JSX.Element {
  const steppedAway = useConsultSteppedAway(entry.appointmentId);
  const lifecycle = resolveLifecycle(entry) ?? "scheduled";
  const tone = lifecycleTone(lifecycle);
  const badgeLabel = lifecycleBadgeLabel(lifecycle);
  const isInConsult = lifecycle === "in_consult";
  const isIncomplete = lifecycle === "incomplete";
  const isActiveConsult = isInConsult && !steppedAway;
  const showAwayChip = steppedAway && (isInConsult || isIncomplete);
  const overflowTagged = isOverflowRow(entry);
  const lateBand =
    entry.timing?.band === "late" || entry.slotStatus === "running_late";
  const modality = modalityIcon(entry.consultationType);
  const rowRef = useRef<HTMLDivElement>(null);
  const ariaStatus =
    isIncomplete || (isInConsult && steppedAway)
      ? "Incomplete consult"
      : badgeLabel;

  useEffect(() => {
    if (!keyboardFocused) return;
    rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [keyboardFocused]);

  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePhoneCopy = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(entry.patientPhone).then(() => {
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 1000);
      });
    },
    [entry.patientPhone]
  );

  const handlePhoneKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlePhoneCopy(e);
      }
    },
    [handlePhoneCopy]
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter") onOpen();
    },
    [onOpen]
  );

  const rowPy = "py-2";
  const textBase = "text-sm leading-snug";
  const cellPx = "px-2";

  const barBg = onToggleExpand
    ? "bg-muted hover:bg-muted/80"
    : "bg-muted";

  const earlyInviteActive =
    entry.earlyInviteExpiresAt != null &&
    new Date(entry.earlyInviteExpiresAt).getTime() > Date.now();

  // Delta only helps while the visit is still ahead of the doctor; on a
  // finished / missed / cancelled row it's noise.
  const delta =
    lifecycle === "scheduled"
      ? formatSlotDelta(entry.scheduledAt, nowMs ?? Date.now())
      : null;

  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={rowRef}
        role="row"
        tabIndex={0}
        aria-label={`Slot ${entry.position}, ${entry.patientName}, ${ariaStatus}`}
        onClick={onOpen}
        onKeyDown={handleRowKeyDown}
        className={cn(
          "group grid cursor-pointer items-stretch",
          "border-b border-border/30 last:border-b-0",
          textBase,
          tone.rowClass,
          lateBand && lifecycle === "scheduled" && "border-l-amber-500",
          overflowTagged && lifecycle === "scheduled" && "border-l-indigo-500",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          keyboardFocused && "ring-2 ring-inset ring-primary"
        )}
        style={{ gridTemplateColumns: OPD_SLOT_GRID_TEMPLATE }}
      >
        {onToggleExpand ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className={cn(
              "flex items-center justify-center self-stretch focus-visible:outline-none",
              barBg
            )}
            aria-label={expanded ? "Collapse row" : "Expand row"}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground transition-transform duration-150",
                expanded && "rotate-90"
              )}
            />
          </button>
        ) : (
          <div className={cn("self-stretch", barBg)} aria-hidden />
        )}

        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center justify-end tabular-nums text-xs text-muted-foreground"
          )}
        >
          #{String(entry.position).padStart(2, "0")}
        </div>

        <div
          className={cn(
            cellPx,
            rowPy,
            "flex min-w-0 flex-col justify-center whitespace-nowrap"
          )}
        >
          <span className="text-[13px] font-semibold tabular-nums tracking-tight text-foreground">
            {formatTimeShort(entry.scheduledAt)}
          </span>
          {delta && (
            <span
              className={cn(
                "text-[10px] font-medium tabular-nums",
                SLOT_DELTA_TONE_CLASS[delta.tone]
              )}
            >
              {delta.label}
            </span>
          )}
        </div>

        <div
          className={cn(
            cellPx,
            rowPy,
            "flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              tone.dotClass,
              lateBand && lifecycle === "scheduled" && "bg-amber-500",
              overflowTagged && lifecycle === "scheduled" && "bg-indigo-500",
              isActiveConsult && "animate-pulse"
            )}
          />
          <span
            title={isIncomplete ? "Incomplete consult" : badgeLabel}
            className={cn(
              "inline-flex min-w-0 max-w-full items-center truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              tone.pillClass,
              lateBand &&
                lifecycle === "scheduled" &&
                "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
            )}
          >
            {lifecycle === "scheduled" && lateBand ? "Overdue" : badgeLabel}
          </span>
          {overflowTagged && (
            <span className="inline-flex shrink-0 rounded border border-orange-500/50 bg-orange-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-900 dark:text-orange-200">
              Overflow
            </span>
          )}
          {showAwayChip && (
            <span className="inline-flex shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              Away
            </span>
          )}
          {hasSlotTag(entry, "return_visit") && (
            <span className="inline-flex shrink-0 rounded border border-sky-500/40 bg-sky-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
              Return
            </span>
          )}
          {(earlyInviteActive || hasSlotTag(entry, "early_invited")) && (
            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              Early invite
            </span>
          )}
          {showArrivedChip(entry) && (
            <span
              title="Arrived at the clinic."
              className="inline-flex shrink-0 rounded border border-emerald-500/50 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200"
            >
              Arrived
            </span>
          )}
          {hasSlotTag(entry, "patient_waiting") && (
            <span
              title="Patient is in the consult lobby right now."
              className="inline-flex shrink-0 rounded border border-emerald-500/50 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200"
            >
              Waiting
            </span>
          )}
          {hasSlotTag(entry, "patient_stepped_away") && (
            <span
              title="Patient checked in earlier but lobby went idle."
              className="inline-flex shrink-0 rounded border border-stone-400/50 bg-stone-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-700 dark:text-stone-300"
            >
              Stepped away
            </span>
          )}
        </div>

        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center overflow-hidden tabular-nums text-xs text-muted-foreground"
          )}
        >
          <span className="truncate">{entry.medicalRecordNumber ?? "—"}</span>
        </div>

        <div className={cn(cellPx, rowPy, "min-w-0 overflow-hidden")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "block truncate font-medium",
                  textBase,
                  lifecycle === "cancelled" && "line-through"
                )}
              >
                {entry.patientName}
              </span>
            </TooltipTrigger>
            <TooltipContent>{entry.patientName}</TooltipContent>
          </Tooltip>
        </div>

        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center whitespace-nowrap text-xs text-muted-foreground"
          )}
        >
          {entry.age ?? "—"} · {entry.gender ?? "—"}
        </div>

        <div className={cn(cellPx, rowPy, "flex items-center overflow-hidden")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handlePhoneCopy}
                onKeyDown={handlePhoneKeyDown}
                aria-label={`Copy phone number ${entry.patientPhone}`}
                className={cn(
                  "max-w-full overflow-hidden tabular-nums text-xs text-muted-foreground",
                  "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                )}
              >
                {copied ? (
                  <span className="text-green-600 dark:text-green-400">
                    Copied!
                  </span>
                ) : (
                  <span className="block truncate">{entry.patientPhone}</span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? "Phone copied" : "Click to copy"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className={cn(cellPx, rowPy, "flex items-center justify-center")}>
          {modality ? (
            <modality.icon
              className={cn(
                "h-4 w-4",
                isInConsult ? "text-foreground" : "text-muted-foreground"
              )}
              aria-label={modality.label}
            />
          ) : (
            <span className="text-xs text-muted-foreground" aria-label="Unknown type">
              —
            </span>
          )}
        </div>

        <div className={cn(cellPx, rowPy, "flex min-w-0 items-center overflow-hidden")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate text-xs text-muted-foreground">
                {entry.serviceLabel ?? entry.catalogServiceKey ?? "—"}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {entry.serviceLabel ?? entry.catalogServiceKey ?? "—"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className={cn(cellPx, rowPy, "min-w-0 flex items-center overflow-hidden")}>
          {entry.reasonForVisit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate text-xs text-muted-foreground">
                  {entry.reasonForVisit}
                </span>
              </TooltipTrigger>
              <TooltipContent>{entry.reasonForVisit}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        <div className={cn(cellPx, rowPy, "flex items-center justify-end")}>
          {actions ?? null}
        </div>
      </div>
    </TooltipProvider>
  );
}
