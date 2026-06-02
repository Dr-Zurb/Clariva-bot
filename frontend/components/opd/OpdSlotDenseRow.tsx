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
import type { SlotSessionRow, SlotStatus } from "@/types/opd-doctor";
import { OPD_QUEUE_GRID_TEMPLATE } from "./OpdQueueGrid";

export interface OpdSlotDenseRowProps {
  entry: SlotSessionRow;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onOpen: () => void;
  actions?: React.ReactNode;
  /** Keyboard focus ring (J/K hotkeys) — sl-05 */
  keyboardFocused?: boolean;
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

function slotStatusMeta(s: SlotStatus): {
  label: string;
  dotClass: string;
  pillClass: string;
} {
  switch (s) {
    case "upcoming":
      return {
        label: "Upcoming",
        dotClass: "bg-muted-foreground/50",
        pillClass: "bg-muted text-muted-foreground",
      };
    case "grace":
      return {
        label: "Grace",
        dotClass: "bg-muted-foreground/50",
        pillClass: "bg-muted text-muted-foreground",
      };
    case "running_late":
      return {
        label: "Late",
        dotClass: "bg-amber-500",
        pillClass:
          "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
      };
    case "in_consultation":
      return {
        label: "In consult",
        dotClass: "bg-primary",
        pillClass: "bg-primary/15 text-primary",
      };
    case "completed":
      return {
        label: "Done",
        dotClass: "bg-green-600",
        pillClass:
          "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
      };
    case "missed":
      return {
        label: "Missed",
        dotClass: "bg-destructive",
        pillClass: "bg-destructive/15 text-destructive",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        dotClass: "bg-muted-foreground/40",
        pillClass: "bg-muted text-muted-foreground",
      };
    case "overflow":
      return {
        label: "Overflow",
        dotClass: "bg-indigo-500",
        pillClass:
          "bg-indigo-100 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-100",
      };
    default:
      return {
        label: s,
        dotClass: "bg-muted-foreground/40",
        pillClass: "bg-muted text-muted-foreground",
      };
  }
}

function rowToneClass(s: SlotStatus): string {
  switch (s) {
    case "running_late":
      return "border-l-4 border-l-amber-500";
    case "in_consultation":
      return cn(
        "border-l-4 border-l-primary",
        "bg-primary/5 ring-1 ring-inset ring-primary/20"
      );
    case "completed":
      return "border-l-4 border-l-green-600/70 bg-green-50/40 dark:bg-green-950/20";
    case "missed":
      return "border-l-4 border-l-destructive";
    case "overflow":
      return "border-l-4 border-l-indigo-500";
    case "cancelled":
      return "border-l-4 border-l-muted-foreground/40 opacity-70";
    default:
      return "border-l-4 border-l-transparent";
  }
}

function waitCell(entry: SlotSessionRow): React.ReactNode {
  if (entry.slotStatus === "running_late") {
    const m = entry.delayMinutes;
    if (m != null && m > 0) {
      return (
        <span className="font-semibold text-amber-800 dark:text-amber-200">
          +{m}m
        </span>
      );
    }
    return <span className="text-amber-800 dark:text-amber-200">Late</span>;
  }
  if (entry.slotStatus === "in_consultation") {
    return (
      <span className="font-medium text-primary">live</span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export function OpdSlotDenseRow({
  entry,
  expanded = false,
  onToggleExpand,
  onOpen,
  actions,
  keyboardFocused = false,
}: OpdSlotDenseRowProps): JSX.Element {
  const meta = slotStatusMeta(entry.slotStatus);
  const isInConsult = entry.slotStatus === "in_consultation";
  const modality = modalityIcon(entry.consultationType);
  const rowRef = useRef<HTMLDivElement>(null);

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

  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={rowRef}
        role="row"
        tabIndex={0}
        aria-label={`Slot ${entry.position}, ${entry.patientName}, ${meta.label}`}
        onClick={onOpen}
        onKeyDown={handleRowKeyDown}
        className={cn(
          "group grid cursor-pointer items-stretch",
          "border-b border-border/30 last:border-b-0",
          textBase,
          rowToneClass(entry.slotStatus),
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          keyboardFocused && "ring-2 ring-inset ring-primary"
        )}
        style={{ gridTemplateColumns: OPD_QUEUE_GRID_TEMPLATE }}
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
          className={cn(cellPx, rowPy, "flex flex-wrap items-center gap-1 overflow-hidden")}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              meta.dotClass,
              isInConsult && "animate-pulse"
            )}
          />
          <span
            className={cn(
              "inline-flex max-w-[72px] shrink-0 items-center truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              meta.pillClass
            )}
          >
            {meta.label}
          </span>
          {entry.slotStatus === "overflow" && (
            <span className="inline-flex shrink-0 rounded border border-orange-500/50 bg-orange-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-900 dark:text-orange-200">
              Overflow
            </span>
          )}
          {earlyInviteActive && (
            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              Early invite
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
                  entry.slotStatus === "cancelled" && "line-through"
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

        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center whitespace-nowrap tabular-nums text-xs text-muted-foreground"
          )}
        >
          {formatTimeShort(entry.scheduledAt)}
        </div>

        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center whitespace-nowrap tabular-nums text-xs"
          )}
        >
          {waitCell(entry)}
        </div>

        <div className={cn(cellPx, rowPy, "flex items-center justify-end")}>
          {actions ?? null}
        </div>
      </div>
    </TooltipProvider>
  );
}
