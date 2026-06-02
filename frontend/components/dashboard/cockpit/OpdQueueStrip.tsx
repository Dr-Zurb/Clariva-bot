"use client";

/**
 * OpdQueueStrip — cockpit C3.
 *
 * Conditional render: only doctors with `opd_mode === "queue"` see this strip.
 * Pure online / slot-mode doctors get `null` (no empty state, no banner).
 *
 * pf-12 additions:
 *   - Header subtitle: smart summary line ("3 done · 1 in consult · 8 waiting").
 *     Zero counts are elided. Uses tabular-num to prevent digit jitter.
 *   - "Done today (N) ▾" disclosure: expanded by default when N ≤ 5, collapsed
 *     otherwise.
 *   - "No-show / skipped (N) ▾" disclosure: collapsed by default when N > 3.
 *   - STATUS_META imported from canonical lib (no in-file duplicate).
 *
 * Polling: 30 s via useOpdSnapshot. Paused while document is hidden.
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-12-opd-strip-extension.md
 * @see docs/Work/Daily-plans/May 2026/06-05-2026/Tasks/task-ui-C3-cockpit-opd-strip.md
 */

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpdSnapshot } from "@/hooks/useOpdSnapshot";
import { patchDoctorQueueEntry } from "@/lib/api";
import { todayLocalIso } from "@/lib/dates";
import { invalidateOpdQueueSession } from "@/lib/query/invalidate";
import { getOpdStatusMeta } from "@/lib/consultation/opd-status-meta";
import { cn } from "@/lib/utils";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateLabel(text: string, maxLen = 24): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}\u2026` : text;
}

/**
 * Builds the compact summary subtitle, e.g. "3 done · 1 in consult · 8 waiting".
 * Zero segments are dropped gracefully.
 */
function buildSummaryLine(
  totalDone: number,
  totalActive: number,
  totalInConsult: number,
  totalMissed: number
): string {
  const parts: string[] = [];

  if (totalDone > 0) {
    parts.push(`${totalDone} done`);
  }

  if (totalActive > 0) {
    const totalWaiting = totalActive - totalInConsult;
    if (totalInConsult > 0) {
      parts.push(
        `${totalInConsult} ${totalInConsult === 1 ? "in consult" : "in consult"}`
      );
    }
    if (totalWaiting > 0) {
      parts.push(`${totalWaiting} ${totalWaiting === 1 ? "waiting" : "waiting"}`);
    }
  }

  if (totalMissed > 0) {
    parts.push(`${totalMissed} no-show`);
  }

  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Animated disclosure / collapsible — no external dependency.
 * Uses the CSS grid row trick for smooth height transitions.
 */
interface DisclosureProps {
  label: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}

function Disclosure({ label, count, defaultOpen, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-1 border-t pt-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
        <span>
          {label} ({count})
        </span>
      </button>

      {/* CSS grid row trick — smooth height with no JS measurement */}
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

// ---------------------------------------------------------------------------
// Queue row
// ---------------------------------------------------------------------------

interface QueueRowProps {
  entry: DoctorQueueSessionRow;
  onCallIn?: (entryId: string) => Promise<void>;
  callingIn?: boolean;
  /** When true, renders the row in greyed-out "done" style. */
  dimmed?: boolean;
}

function QueueRow({ entry, onCallIn, callingIn = false, dimmed = false }: QueueRowProps) {
  const meta = getOpdStatusMeta(entry.queueStatus);
  const canCallIn = entry.queueStatus === "waiting" && !!onCallIn;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 border-b last:border-0",
        dimmed && "opacity-60"
      )}
    >
      {/* Position — tabular so digits don't shift */}
      <span className="w-6 shrink-0 font-tabular text-xs text-muted-foreground">
        #{entry.position}
      </span>

      {/* Patient name */}
      <span className="min-w-0 flex-1 text-sm" title={entry.patientName}>
        {truncateLabel(entry.patientName)}
      </span>

      {/* Status badge */}
      <Badge
        variant="outline"
        className={cn("shrink-0 text-xs", meta.badgeClassName)}
      >
        {meta.label}
      </Badge>

      {/* Inline action */}
      {canCallIn ? (
        <button
          type="button"
          disabled={callingIn}
          onClick={() => {
            void onCallIn(entry.entryId);
          }}
          className="shrink-0 text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {callingIn ? "Calling…" : "Call in"}
        </button>
      ) : (
        <Link
          href="/dashboard/opd-today"
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          aria-label={`View ${entry.patientName} in OPD queue`}
        >
          →
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface OpdQueueStripProps {
  token: string;
}

export function OpdQueueStrip({ token }: OpdQueueStripProps) {
  const {
    isOpdEnabled,
    active,
    done,
    missed,
    totalActive,
    totalInConsult,
    totalDone,
    totalMissed,
    isLoading,
    error,
    retry,
  } = useOpdSnapshot(token);
  const queryClient = useQueryClient();

  // Optimistic call-in: tracks entry IDs currently being called in.
  const [callingInIds, setCallingInIds] = useState<Set<string>>(new Set());

  const handleCallIn = useCallback(
    async (entryId: string) => {
      setCallingInIds((prev) => new Set(prev).add(entryId));
      try {
        await patchDoctorQueueEntry(token, entryId, "called");
        void invalidateOpdQueueSession(queryClient, todayLocalIso());
      } catch (err) {
        console.error("[OpdQueueStrip] call-in failed:", err);
        // Roll back optimistic lock so the doctor can retry.
        setCallingInIds((prev) => {
          const next = new Set(prev);
          next.delete(entryId);
          return next;
        });
      }
    },
    [token, queryClient]
  );

  // Telemetry: fire cockpit.opd_strip.viewed once per mount for OPD doctors.
  // PHI-free: count only, no patient IDs.
  useEffect(() => {
    if (isOpdEnabled !== true || isLoading) return;
    try {
      // eslint-disable-next-line no-console
      console.debug("[cockpit:opd_strip]", {
        event: "cockpit.opd_strip.viewed",
        totalActive,
        totalDone,
        totalMissed,
      });
    } catch {
      // Telemetry must never break the UI.
    }
  }, [isOpdEnabled, isLoading, totalActive, totalDone, totalMissed]);

  // --- Render gate ---

  // 1. Settings still loading → show height-matched skeleton to avoid layout shift.
  if (isOpdEnabled === null) {
    return <Skeleton className="h-10 w-full rounded-lg" />;
  }

  // 2. Doctor is not in OPD queue mode → render nothing (saves vertical space).
  if (!isOpdEnabled) {
    return null;
  }

  const summaryLine = buildSummaryLine(totalDone, totalActive, totalInConsult, totalMissed);

  // 3. OPD queue-mode doctor → render the strip.
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-3 space-y-0">
        <div>
          <CardTitle className="text-sm font-medium uppercase text-muted-foreground tracking-wide">
            OPD Queue
          </CardTitle>
          {!isLoading && summaryLine && (
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {summaryLine}
            </p>
          )}
          {!isLoading && !summaryLine && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              No patients today
            </p>
          )}
        </div>

        <Link
          href="/dashboard/opd-today"
          className="text-xs text-primary shrink-0 hover:underline underline-offset-2"
        >
          View all →
        </Link>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <p className="py-2 text-xs text-muted-foreground">
            Couldn&apos;t load queue.{" "}
            <button
              type="button"
              onClick={retry}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Tap to retry.
            </button>
          </p>
        )}

        {/* Empty state — no active, no done, no missed */}
        {!isLoading && !error && totalActive === 0 && totalDone === 0 && totalMissed === 0 && (
          <p className="py-2 text-xs text-muted-foreground">
            Queue is empty. Patients will appear here as they check in.
          </p>
        )}

        {/* Active entry list */}
        {!isLoading && !error && active.length > 0 && (
          <div>
            {active.map((entry) => (
              <QueueRow
                key={entry.entryId}
                entry={entry}
                onCallIn={handleCallIn}
                callingIn={callingInIds.has(entry.entryId)}
              />
            ))}
          </div>
        )}

        {/* Done-today disclosure */}
        {!isLoading && !error && totalDone > 0 && (
          <Disclosure
            label="Done today"
            count={totalDone}
            defaultOpen={totalDone <= 5}
          >
            {done.map((entry) => (
              <QueueRow key={entry.entryId} entry={entry} dimmed />
            ))}
          </Disclosure>
        )}

        {/* No-show / skipped disclosure */}
        {!isLoading && !error && totalMissed > 0 && (
          <Disclosure
            label="No-show / skipped"
            count={totalMissed}
            defaultOpen={totalMissed <= 3}
          >
            {missed.map((entry) => (
              <QueueRow key={entry.entryId} entry={entry} dimmed />
            ))}
          </Disclosure>
        )}
      </CardContent>
    </Card>
  );
}
