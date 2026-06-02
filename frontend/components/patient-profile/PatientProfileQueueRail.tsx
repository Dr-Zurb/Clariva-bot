"use client";

/**
 * CockpitQueueRail (cp-02)
 *
 * Sticky strip showing exactly three slots: prev · now · next.
 * Mental model: who the doctor just saw, is seeing, will see next.
 * Full queue is one click away on /dashboard/opd-today.
 *
 * Below <sm: prev/next chips are hidden; only the "now" chip is shown.
 * The rail is always visible (cp-02 drops the <lg hidden gate).
 *
 * @see docs/Work/Daily-plans/May 2026/09-05-2026/Tasks/task-cp-02-prev-now-next-strip.md
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { buildCockpitAppointmentPathFromCurrentOrigin } from "@/lib/cockpit/back-target";
import { todayLocalIso } from "@/lib/dates";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useDoctorDayPipeline,
  type PipelineEntry,
} from "@/hooks/useDoctorDayPipeline";
import type { CockpitState } from "@/lib/patient-profile/state";

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

const STATUS_DOT_CLASS: Record<string, string> = {
  in_consultation: "bg-success",
  called: "bg-primary",
  waiting: "bg-muted-foreground/60",
  pending: "bg-muted-foreground/60",
  confirmed: "bg-foreground/60",
  completed: "bg-muted-foreground/40",
  missed: "bg-destructive",
  no_show: "bg-destructive",
  skipped: "bg-destructive",
  cancelled: "bg-muted-foreground/40",
};

function StatusDot({ status }: { status: string }) {
  const colorClass = STATUS_DOT_CLASS[status] ?? "bg-muted-foreground/40";
  return (
    <span
      aria-hidden
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", colorClass)}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstNameOf(label: string): string {
  const trimmed = label?.trim();
  if (!trimmed) return "Patient";
  return trimmed.split(/\s+/)[0];
}

function truncate(s: string, max = 12): string {
  return s.length > max ? `${s.slice(0, max)}\u2026` : s;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWaited(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMin = Math.round(
    (Date.now() - new Date(iso).getTime()) / 60_000,
  );
  if (diffMin <= 0) return "On time";
  if (diffMin < 60) return `Waited ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `Waited ${h}h ${m}m` : `Waited ${h}h`;
}

function tokenLabel(
  entry: PipelineEntry,
  source: "queue" | "schedule",
): string {
  if (source === "queue" && entry.tokenNumber != null) {
    return `#${entry.tokenNumber}`;
  }
  return `#${entry.position}`;
}

// ---------------------------------------------------------------------------
// Empty placeholder chip
// ---------------------------------------------------------------------------

function EmptyPlaceholder() {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center rounded border border-dashed px-2 py-1",
        "border-muted text-muted-foreground/60 text-xs select-none",
      )}
    >
      —
    </span>
  );
}

// ---------------------------------------------------------------------------
// Slot chip
// ---------------------------------------------------------------------------

interface SlotChipProps {
  entry: PipelineEntry;
  slot: "prev" | "now" | "next";
  source: "queue" | "schedule";
}

function SlotChip({ entry, slot, source }: SlotChipProps) {
  const searchParams = useSearchParams();
  const isNow = slot === "now";
  const token = tokenLabel(entry, source);
  const firstName = truncate(firstNameOf(entry.label), 12);

  const innerClass = cn(
    "inline-flex items-center gap-1.5 rounded border text-xs",
    isNow
      ? "cursor-default border-primary bg-primary/5 px-3 py-1.5 font-semibold"
      : "border-border bg-transparent px-2 py-1 font-normal text-muted-foreground hover:opacity-80 transition-opacity",
  );

  const tooltipBody = (
    <div className="space-y-0.5 text-xs">
      <p className="font-medium">{entry.label || "Patient"}</p>
      {entry.appointmentDate && (
        <p className="text-muted-foreground/80">
          {formatTime(entry.appointmentDate)}
        </p>
      )}
      {entry.appointmentDate && (
        <p className="text-muted-foreground/80">
          {formatWaited(entry.appointmentDate)}
        </p>
      )}
    </div>
  );

  const chipInner = (
    <>
      <StatusDot status={entry.status} />
      <span className="tabular-nums">{token}</span>
      <span>{firstName}</span>
    </>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {isNow ? (
          <div
            aria-current="step"
            aria-label={`Current patient: ${entry.label}`}
            className={innerClass}
          >
            {chipInner}
          </div>
        ) : (
          <Link
            href={buildCockpitAppointmentPathFromCurrentOrigin(
              entry.id,
              searchParams,
            )}
            aria-label={`${slot === "prev" ? "Previous" : "Next"} patient: ${entry.label}`}
            className={innerClass}
          >
            {chipInner}
          </Link>
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="p-2">
        {tooltipBody}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

function Separator({ visible }: { visible: boolean }) {
  return visible ? (
    <ChevronRight
      className="h-3 w-3 shrink-0 text-muted-foreground/40"
      aria-hidden
    />
  ) : (
    <span className="w-3 shrink-0" aria-hidden />
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CockpitQueueRailProps {
  currentAppointmentId: string | null;
  /** Forwarded from CockpitHeader — rail is hidden in `terminal` state. */
  state: CockpitState;
  /** Auth token forwarded to useDoctorDayPipeline. */
  token: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CockpitQueueRail({
  currentAppointmentId,
  state,
  token,
}: CockpitQueueRailProps): JSX.Element | null {
  const { entries, currentIndex, totalCount, source, isLoading } =
    useDoctorDayPipeline({ token, currentAppointmentId });

  // Visibility gates
  if (state === "terminal") return null;
  if (!isLoading && entries.length === 0) return null;

  // Three-slot derivation
  const prev =
    currentIndex !== null && currentIndex > 0
      ? entries[currentIndex - 1]
      : null;
  const now = currentIndex !== null ? (entries[currentIndex] ?? null) : null;
  const next =
    currentIndex !== null ? (entries[currentIndex + 1] ?? null) : null;

  // "View all" links to today's OPD queue
  const todayIso = todayLocalIso();
  const viewAllHref = `/dashboard/opd-today?date=${todayIso}`;

  return (
    <TooltipProvider delayDuration={300}>
      {/* cs-07: Sticky on `<lg` (page-scroll layout) so the rail tracks the
          cockpit header. On `lg+` the cockpit shell is a fixed-height flex
          container whose columns scroll independently, so the page itself
          doesn't scroll — the rail drops back into normal flow via
          `lg:static`. The inline `top` (var-driven sticky offset) is harmless
          on `lg:static` because `top` is ignored when position isn't
          sticky/absolute/fixed/relative. */}
      <div
        className={cn(
          "flex items-center gap-2",
          "sticky lg:static z-20",
          "h-10 shrink-0 border-b border-border bg-background/95 backdrop-blur",
          "px-4 lg:px-6",
        )}
        style={{ top: 'var(--cockpit-header-h)' }}
      >
        {/* Loading state */}
        {isLoading && (
          <span className="text-xs text-muted-foreground">Loading…</span>
        )}

        {/* Three-slot strip — centred in available space */}
        {!isLoading && (
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
            {/* prev — hidden on mobile (<sm) */}
            <div className="hidden sm:flex items-center gap-1">
              {prev ? (
                <SlotChip entry={prev} slot="prev" source={source} />
              ) : (
                <EmptyPlaceholder />
              )}
              <Separator visible={!!(prev && now)} />
            </div>

            {/* now — always visible */}
            {now ? (
              <SlotChip entry={now} slot="now" source={source} />
            ) : (
              <EmptyPlaceholder />
            )}

            {/* next — hidden on mobile (<sm) */}
            <div className="hidden sm:flex items-center gap-1">
              <Separator visible={!!(now && next)} />
              {next ? (
                <SlotChip entry={next} slot="next" source={source} />
              ) : (
                <EmptyPlaceholder />
              )}
            </div>
          </div>
        )}

        {/* View all — ghost link at the trailing edge */}
        {!isLoading && totalCount > 0 && (
          <Link
            href={viewAllHref}
            className={cn(
              "ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded",
            )}
          >
            View all ({totalCount})
          </Link>
        )}
      </div>
    </TooltipProvider>
  );
}
