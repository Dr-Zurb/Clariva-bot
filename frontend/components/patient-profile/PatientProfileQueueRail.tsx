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

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchNextConsult } from "@/lib/query/prefetch/next-consult";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { matchesOpdSearch } from "@/components/opd/shared/opdSearchMatcher";
import { formatDeskGuardian } from "@/lib/desk/guardian";
import { formatDeskAgeSex } from "@/lib/desk/queue";
import { buildCockpitAppointmentPathFromCurrentOrigin } from "@/lib/cockpit/back-target";
import { formatOpdSessionDateLabel, todayLocalIso } from "@/lib/dates";
import { formatTime as formatClockTime } from "@/lib/format-date";
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
  return formatClockTime(iso);
}

function formatWaited(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin <= 0) return "On time";
  if (diffMin < 60) return `Waited ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `Waited ${h}h ${m}m` : `Waited ${h}h`;
}

/** Same #N the neighbor chips use — queue token when present, else 1-based position. */
export function pipelineTokenLabel(
  entry: PipelineEntry,
  _source: "queue" | "schedule",
): string {
  if (entry.tokenNumber != null) {
    return `#${entry.tokenNumber}`;
  }
  return `#${entry.position}`;
}

function tokenLabel(
  entry: PipelineEntry,
  source: "queue" | "schedule",
): string {
  return pipelineTokenLabel(entry, source);
}

// ---------------------------------------------------------------------------
// Empty placeholder chip
// ---------------------------------------------------------------------------

function EmptyPlaceholder({ quiet = false }: { quiet?: boolean }) {
  if (quiet) {
    return <span aria-hidden className="inline-block min-w-[4rem]" />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center rounded border border-dashed px-2 py-1",
        "border-muted text-muted-foreground/60 text-xs select-none"
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
  /** Borderless neighbor chip so the current title stays the focus. */
  quiet?: boolean;
}

function SlotChip({ entry, slot, source, quiet = false }: SlotChipProps) {
  const searchParams = useSearchParams();
  const isNow = slot === "now";
  const token = tokenLabel(entry, source);
  const firstName = truncate(firstNameOf(entry.label), 12);

  const innerClass = cn(
    "inline-flex items-center gap-1.5 rounded text-xs",
    quiet
      ? "border-0 bg-transparent px-1 py-0.5 font-normal text-muted-foreground/70 hover:text-foreground"
      : isNow
        ? "cursor-default border border-primary bg-primary/5 px-3 py-1.5 font-semibold"
        : "border border-border bg-transparent px-2 py-1 font-normal text-muted-foreground hover:opacity-80 transition-opacity",
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

  const chipInner = quiet ? (
    <>
      {slot === "prev" ? (
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : null}
      <span className="tabular-nums">{token}</span>
      <span>{firstName}</span>
      {slot === "next" ? (
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : null}
    </>
  ) : (
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
              searchParams
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
// Today's-OPD picker — opens from "All" so switching never leaves the cockpit
// ---------------------------------------------------------------------------

/**
 * Name, relative, phone, and token. Token search (`#7`) falls back to
 * position exactly like the OPD hub. Digit queries of 3+ match the phone.
 */
function pickerMatchable(entry: PipelineEntry) {
  return {
    patientName: entry.label ?? "",
    medicalRecordNumber: null,
    patientPhone: entry.patientPhone?.trim() ?? "",
    guardianName: entry.guardianName,
    reasonForVisit: null,
    serviceLabel: null,
    position: entry.position,
    ...(entry.tokenNumber != null ? { tokenNumber: entry.tokenNumber } : {}),
  };
}

function pickerContactLine(entry: PipelineEntry): string {
  const phone = entry.patientPhone?.trim() ?? "";
  const relative = formatDeskGuardian(
    entry.guardianName,
    entry.guardianRelation,
    entry.sex,
  );
  return [phone, relative].filter(Boolean).join(" · ");
}

interface QueuePickerProps {
  entries: PipelineEntry[];
  source: "queue" | "schedule";
  currentAppointmentId: string | null;
  positionLabel: string;
  viewAllHref: string;
  token: string;
  sessionLabel: string;
}

function QueuePicker({
  entries,
  source,
  currentAppointmentId,
  positionLabel,
  viewAllHref,
  token,
  sessionLabel,
}: QueuePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const matches = useMemo(
    () => entries.filter((entry) => matchesOpdSearch(pickerMatchable(entry), query)),
    [entries, query]
  );

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Callback ref: Radix portals the list after `open`, so a layout effect
  // on `open` often runs before the row exists. Skip while filtering.
  const attachCurrentRow = useCallback(
    (node: HTMLLIElement | null) => {
      if (!node || query.trim()) return;
      node.scrollIntoView({ block: "center", inline: "nearest" });
    },
    [query],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${sessionLabel}, ${positionLabel}`}
          className="flex items-center gap-1.5 whitespace-nowrap rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          All
          <span className="tabular-nums" data-testid="cockpit-queue-position">
            {positionLabel}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 p-0"
        data-testid="cockpit-queue-picker"
      >
        <div className="border-b border-border p-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, or #token"
            aria-label={`Search ${sessionLabel}`}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto overscroll-y-contain py-1">
          {matches.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              No one in {sessionLabel} matches that.
            </li>
          ) : (
            matches.map((entry) => {
              const isCurrent = entry.id === currentAppointmentId;
              const ageSex = formatDeskAgeSex(entry.ageYears, entry.sex);
              const contact = pickerContactLine(entry);
              // Warm the chart on intent so the jump lands ready to type.
              const warm = () =>
                prefetchNextConsult(queryClient, token, {
                  appointmentId: entry.id,
                  patientId: entry.patientId,
                });
              return (
                <li
                  key={entry.id}
                  ref={isCurrent ? attachCurrentRow : undefined}
                >
                  <Link
                    href={buildCockpitAppointmentPathFromCurrentOrigin(
                      entry.id,
                      searchParams
                    )}
                    onClick={() => setOpen(false)}
                    onMouseEnter={warm}
                    onFocus={warm}
                    aria-current={isCurrent ? "page" : undefined}
                    data-testid={
                      isCurrent ? "cockpit-queue-picker-current" : undefined
                    }
                    className={cn(
                      "flex flex-col gap-0.5 px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:bg-muted",
                      isCurrent && "bg-primary/15 font-semibold hover:bg-primary/20"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <StatusDot status={entry.status} />
                      <span className="w-9 shrink-0 tabular-nums text-xs text-muted-foreground">
                        {tokenLabel(entry, source)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {entry.label || "Walk-in"}
                      </span>
                      {ageSex !== "—" ? (
                        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                          {ageSex}
                        </span>
                      ) : null}
                      {isCurrent ? (
                        <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Here
                        </span>
                      ) : entry.appointmentDate ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTime(entry.appointmentDate)}
                        </span>
                      ) : null}
                    </span>
                    {contact ? (
                      <span className="truncate pl-14 text-xs font-normal text-muted-foreground">
                        {contact}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {matches.length} {matches.length === 1 ? "patient" : "patients"}
          </span>
          <Link
            href={viewAllHref}
            onClick={() => setOpen(false)}
            className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Open OPD tab
          </Link>
        </div>
      </PopoverContent>
    </Popover>
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
  /**
   * Visit calendar day (YYYY-MM-DD) when the cockpit URL has no `date`.
   * URL `?date=` still wins inside the pipeline.
   */
  visitDate?: string | null;
  /** `inline` is the identity-row trio. `rail` is the legacy band. */
  variant?: "rail" | "inline";
  /** Current-patient title rendered in the trio center (inline only). */
  nowSlot?:
    | ReactNode
    | ((ctx: {
        now: PipelineEntry | null;
        source: "queue" | "schedule";
      }) => ReactNode);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CockpitQueueRail({
  currentAppointmentId,
  state,
  token,
  variant = "rail",
  nowSlot,
  visitDate,
}: CockpitQueueRailProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { entries, currentIndex, totalCount, source, isLoading, sessionDate } =
    useDoctorDayPipeline({ token, currentAppointmentId, sessionDate: visitDate });

  const nextForPrefetch =
    currentIndex !== null ? (entries[currentIndex + 1] ?? null) : null;
  // Both chips are one click away, so warm both. Prev was cold before, which is
  // why stepping back always felt slower than stepping forward.
  const prevForPrefetch =
    currentIndex !== null && currentIndex > 0
      ? (entries[currentIndex - 1] ?? null)
      : null;
  useEffect(() => {
    for (const entry of [nextForPrefetch, prevForPrefetch]) {
      if (!entry) continue;
      router.prefetch(entry.href);
      prefetchNextConsult(queryClient, token, {
        appointmentId: entry.id,
        patientId: entry.patientId,
      });
    }
    // Depend on stable fields — the entry object is new each pipeline memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    queryClient,
    router,
    token,
    nextForPrefetch?.id,
    nextForPrefetch?.href,
    nextForPrefetch?.patientId,
    prevForPrefetch?.id,
    prevForPrefetch?.href,
    prevForPrefetch?.patientId,
  ]);

  // Visibility gates — inline still mounts so the identity title can center.
  if (state === "terminal") return null;
  if (variant !== "inline" && !isLoading && entries.length === 0) return null;

  // Three-slot derivation
  const prev =
    currentIndex !== null && currentIndex > 0
      ? entries[currentIndex - 1]
      : null;
  const now = currentIndex !== null ? (entries[currentIndex] ?? null) : null;
  const next =
    currentIndex !== null ? (entries[currentIndex + 1] ?? null) : null;

  // "View all" / Open OPD tab stay on the session the doctor opened, not today.
  const viewAllHref = `/dashboard/opd-today?date=${sessionDate}`;
  const sessionLabel =
    sessionDate === todayLocalIso()
      ? "Today's OPD"
      : formatOpdSessionDateLabel(sessionDate);

  const positionLabel =
    currentIndex !== null
      ? `${currentIndex + 1} of ${totalCount}`
      : `${totalCount}`;

  if (variant === "inline") {
    const showAll = !isLoading && totalCount > 0;
    return (
      <TooltipProvider delayDuration={300}>
        <nav
          aria-label={`${sessionLabel} queue`}
          data-testid="cockpit-queue-inline"
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <div className="flex shrink-0 items-center gap-1.5">
            {showAll ? (
              <QueuePicker
                entries={entries}
                source={source}
                currentAppointmentId={currentAppointmentId}
                positionLabel={positionLabel}
                viewAllHref={viewAllHref}
                token={token}
                sessionLabel={sessionLabel}
              />
            ) : null}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-x-10">
            <div className="hidden justify-end sm:flex">
              {!isLoading && prev ? (
                <SlotChip entry={prev} slot="prev" source={source} quiet />
              ) : (
                <EmptyPlaceholder quiet />
              )}
            </div>
            <div className="justify-self-center px-1">
              {typeof nowSlot === "function"
                ? nowSlot({ now, source })
                : (nowSlot ??
                  (now ? (
                    <SlotChip entry={now} slot="now" source={source} />
                  ) : isLoading ? (
                    <span className="text-xs text-muted-foreground">…</span>
                  ) : (
                    <EmptyPlaceholder quiet />
                  )))}
            </div>
            <div className="hidden justify-start sm:flex">
              {!isLoading && next ? (
                <SlotChip entry={next} slot="next" source={source} quiet />
              ) : (
                <EmptyPlaceholder quiet />
              )}
            </div>
          </div>
        </nav>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex items-center gap-2",
          "sticky lg:static z-20",
          "h-10 shrink-0 border-b border-border bg-background/95 backdrop-blur",
          "px-4 lg:px-6"
        )}
        style={{ top: "var(--cockpit-header-h)" }}
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

        {/* View all — ghost link at the trailing edge (hidden mid-call). */}
        {!isLoading && totalCount > 0 && state !== "live" && (
          <Link
            href={viewAllHref}
            className={cn(
              "ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
            )}
          >
            View all ({totalCount})
          </Link>
        )}
      </div>
    </TooltipProvider>
  );
}
