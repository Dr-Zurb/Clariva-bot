"use client";

/**
 * OpdQueueDenseRow — single dense row for the OPD queue table (oq-03).
 *
 * 13-column CSS grid (1 color-bar + 12 content columns).
 * Row height ~40 px (py-2 + text-sm leading-snug).
 *
 * Actions slot (col 13) is reserved and populated by oq-10 via the `actions`
 * prop. Absent that prop the gutter renders empty so column widths stay stable.
 *
 * Phone copy: no external toast library is present — a 1 s inline "Copied!"
 * indicator is used instead.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-03-dense-row-component.md
 */

import React, { useCallback, useRef, useState } from "react";
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
import { getOpdStatusMeta } from "@/lib/consultation/opd-status-meta";
import { cn } from "@/lib/utils";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import { OPD_QUEUE_GRID_TEMPLATE } from "./OpdQueueGrid";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OpdQueueDenseRowProps {
  entry: DoctorQueueSessionRow;
  /** When true, render the row in greyed-out "done" / "missed" style. */
  dimmed?: boolean;
  /** When true, render the "next up" left-accent treatment + (next) suffix. */
  isNextUp?: boolean;
  /** When true, the inline expand panel is open (parent owns the boolean). */
  expanded?: boolean;
  /** Toggles `expanded`. */
  onToggleExpand?: () => void;
  /** Click handler for the whole-row primary action. */
  onOpen: () => void;
  /**
   * Slot for right-edge action affordances (Open chevron + ⋯ overflow).
   * Owned by oq-10. When undefined, a 64 px empty gutter is preserved.
   */
  actions?: React.ReactNode;
  /**
   * When true, the row is keyboard-focused via J/K hotkeys (task-oq-13).
   * Renders a left-edge `ring-primary` ring (2 px) to distinguish from the
   * browser's built-in focus ring on interactive elements.
   * Does NOT conflict with `isNextUp` — both states can co-occur.
   */
  focused?: boolean;
}

// ---------------------------------------------------------------------------
// Internal color maps
// Hardcoded to avoid fragile string extraction from badgeClassName.
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

// Thin leading color bar — a slightly more opaque read than the badge tones.
// in_consultation gets a deeper green so the "this row is happening right now"
// signal is unambiguous from across the room.
const STATUS_BAR_BG: Record<string, string> = {
  waiting: "bg-muted",
  called: "bg-blue-400 dark:bg-blue-600",
  in_consultation: "bg-green-600 dark:bg-green-500",
  completed: "bg-green-300 dark:bg-green-700",
  missed: "bg-destructive/50",
  skipped: "bg-muted",
  cancelled: "bg-destructive/50",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatScheduledTime(iso: string): string {
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

// Grid template — imported from the shared constant so row and header stay aligned.

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpdQueueDenseRow({
  entry,
  dimmed = false,
  isNextUp = false,
  expanded = false,
  onToggleExpand,
  onOpen,
  actions,
  focused = false,
}: OpdQueueDenseRowProps): JSX.Element {
  const meta = getOpdStatusMeta(entry.queueStatus);
  const isInConsult = entry.queueStatus === "in_consultation";

  // ── Next-up only fires when the row is genuinely waiting ──
  const showNextUp = isNextUp && entry.queueStatus === "waiting";

  // ── Waited time — recomputed per-render; no interval here ──
  const waitedMinutes = Math.floor(
    (Date.now() - new Date(entry.queueCreatedAt).getTime()) / 60_000
  );
  const showWaited =
    entry.queueStatus === "waiting" || entry.queueStatus === "called";
  const isLongWait = showWaited && waitedMinutes > 30;

  // ── Modality ──
  const modality = modalityIcon(entry.consultationType);

  // ── Phone copy ──
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

  // ── Row keyboard ──
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter") onOpen();
    },
    [onOpen]
  );

  // ── Sizing ── ~40 px row (py-2 + text-sm leading-snug). Single canonical
  // density — the prior default/compact toggle was retired because the delta
  // wasn't meaningful in practice and added bookkeeping.
  const rowPy = "py-2";
  const textBase = "text-sm leading-snug";
  const cellPx = "px-2";

  // ── Color bar / chevron background ──
  const barBg = showNextUp
    ? "bg-primary"
    : (STATUS_BAR_BG[entry.queueStatus] ?? "bg-muted");

  const dotBg = STATUS_DOT_BG[entry.queueStatus] ?? "bg-muted-foreground/40";

  // ── Accessibility label ──
  const ariaLabel = `Token #${entry.tokenNumber}, ${entry.patientName}, ${meta.label}, waited ${waitedMinutes} minutes`;

  return (
    <TooltipProvider delayDuration={400}>
      <div
        role="row"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-selected={focused}
        onClick={onOpen}
        onKeyDown={handleRowKeyDown}
        className={cn(
          "group grid cursor-pointer items-stretch",
          // Minimalist row separator — hairline, very low opacity so columns
          // breathe without a cage-like grid feel.
          "border-b border-border/30 last:border-b-0",
          textBase,
          // In-consult row background — visibly tinted so the active patient
          // is the first thing the eye catches in the Active group.
          isInConsult &&
            "bg-green-100/70 dark:bg-green-900/30 ring-1 ring-inset ring-green-500/30",
          // Dimmed style for done / missed rows
          dimmed && "opacity-60",
          // Keyboard-focused row (J/K navigation) — left-edge 2 px ring-primary
          focused && "ring-2 ring-inset ring-primary",
          // Hover + browser focus-visible ring
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        )}
        style={{ gridTemplateColumns: OPD_QUEUE_GRID_TEMPLATE }}
      >
        {/* ── Col 1 — Color bar OR expand chevron ── */}
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

        {/* ── Col 2 — Token ── */}
        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center justify-end tabular-nums text-xs text-muted-foreground"
          )}
        >
          #{String(entry.tokenNumber).padStart(2, "0")}
        </div>

        {/* ── Col 3 — Status dot + label ── */}
        <div
          className={cn(cellPx, rowPy, "flex items-center gap-1.5 overflow-hidden")}
        >
          {/* Dot is purely decorative; text label carries the meaning. */}
          <span
            aria-hidden
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              dotBg,
              isInConsult && "animate-pulse"
            )}
          />
          <span
            className={cn(
              "truncate text-xs",
              isInConsult &&
                "font-semibold text-green-700 dark:text-green-300"
            )}
          >
            {meta.label}
          </span>
        </div>

        {/* ── Col 4 — MRN ── */}
        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center overflow-hidden tabular-nums text-xs text-muted-foreground"
          )}
        >
          <span className="truncate">{entry.medicalRecordNumber ?? "—"}</span>
        </div>

        {/* ── Col 5 — Patient name ── */}
        <div className={cn(cellPx, rowPy, "min-w-0 overflow-hidden")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0 items-center">
                <span className={cn("truncate font-medium", textBase)}>
                  {entry.patientName}
                </span>
                {showNextUp && (
                  <span className="ml-2 shrink-0 text-xs font-medium text-primary">
                    (next)
                  </span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>{entry.patientName}</TooltipContent>
          </Tooltip>
        </div>

        {/* ── Col 6 — Age / Sex ── */}
        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center whitespace-nowrap text-xs text-muted-foreground"
          )}
        >
          {entry.age ?? "—"} · {entry.gender ?? "—"}
        </div>

        {/* ── Col 7 — Phone (click-to-copy) ── */}
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

        {/* ── Col 8 — Consultation type icon (modality) ── */}
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

        {/* ── Col 9 — Service ── */}
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

        {/* ── Col 10 — Reason for visit ── */}
        {/*
         * Truncation is purely CSS-driven: `truncate` (overflow-hidden +
         * text-ellipsis + whitespace-nowrap) clips based on the actual rendered
         * width of the column, which is the right metric.  The previous JS
         * 40-char slice was redundant at narrow widths and over-eager at wide
         * widths.  Tooltip on hover surfaces the full reason.
         */}
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

        {/* ── Col 11 — Scheduled time ── */}
        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center whitespace-nowrap tabular-nums text-xs text-muted-foreground"
          )}
        >
          {formatScheduledTime(entry.scheduledAt)}
        </div>

        {/* ── Col 12 — Waited time ── */}
        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center whitespace-nowrap tabular-nums text-xs"
          )}
        >
          {showWaited ? (
            <span
              className={cn(
                isLongWait
                  ? "font-semibold text-red-700 dark:text-red-400"
                  : "text-muted-foreground"
              )}
            >
              {waitedMinutes} m{isLongWait ? " !" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>

        {/* ── Col 13 — Actions slot (oq-10) ── */}
        {/*
         * Opacity control is delegated to the OpdQueueRowActions component:
         *   - Open chevron is always visible (primary affordance).
         *   - ⋯ overflow button is hover-only (managed via the row's `group` class).
         * When actions is undefined the empty 64 px gutter keeps column widths stable.
         */}
        <div
          className={cn(
            cellPx,
            rowPy,
            "flex items-center justify-end"
          )}
        >
          {actions ?? null}
        </div>
      </div>
    </TooltipProvider>
  );
}
