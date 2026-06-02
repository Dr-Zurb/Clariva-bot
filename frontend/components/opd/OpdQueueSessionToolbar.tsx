"use client";

/**
 * OpdQueueSessionToolbar — session-level actions for the OPD queue page (oq-11).
 *
 * Surfaces two session-level controls that doctors previously had to find on
 * individual appointment detail pages:
 *   - Broadcast delay: sets opd_session_delay_minutes so patients see a
 *     "running late" banner. Applied to the in_consultation appointment (or
 *     first waiting one as fallback).
 *   - Offer early join: allows the next eligible waiting patient to accept an
 *     early call-in, with an expiry window.
 *
 * Also exposes the last-updated timestamp (from useOpdSnapshot) and a manual
 * refresh button so doctors can confirm queue freshness without dev tools.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-11-session-toolbar.md
 */

import React, { useEffect, useRef, useState } from "react";
import { Clock, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import { BroadcastDelayPopover } from "./shared/BroadcastDelayPopover";
import { OfferEarlyJoinPopover } from "./shared/OfferEarlyJoinPopover";
import {
  resolveQueueDelayTarget,
  resolveQueueEarlyJoinTarget,
} from "./shared/opdToolbarResolvers";
import { OpdSessionModePillDropdown } from "./session-mode/OpdSessionModePillDropdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpdQueueSessionToolbarProps {
  token: string;
  /**
   * Snapshot data — used to (a) find the next eligible appointment for
   * "Offer early join", (b) decide whether either action is currently sensible.
   */
  active: DoctorQueueSessionRow[];
  /** Wall-clock of last successful poll (ms epoch); from useOpdSnapshot. */
  lastUpdatedAt: number | null;
  /** Manual refetch handler from useOpdSnapshot. */
  onRefresh: () => void;
  /** Snapshot mutation success handler — same as oq-10 uses. */
  onMutationSuccess: () => void;
  /** Current session date (yyyy-mm-dd).  Folded into the toolbar's left rail. */
  sessionDate: string;
  /** Called when the doctor picks a different date. */
  onChangeSessionDate: (next: string) => void;
  /**
   * "queue" | "slot" — drives the small Mode pill rendered next to the date
   * picker.  Pass `null` while the doctor's settings are still loading; the
   * pill renders a Skeleton in that case.
   */
  mode?: "queue" | "slot" | null;
  modeChangeCount?: number;
  isPastDate?: boolean;
  onModeConverted?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ---------------------------------------------------------------------------
// Main Component: OpdQueueSessionToolbar
// ---------------------------------------------------------------------------

export function OpdQueueSessionToolbar({
  token,
  active,
  lastUpdatedAt,
  onRefresh,
  onMutationSuccess,
  sessionDate,
  onChangeSessionDate,
  mode = null,
  modeChangeCount = 0,
  isPastDate = false,
  onModeConverted,
}: OpdQueueSessionToolbarProps): JSX.Element {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const [refreshPending, setRefreshPending] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const handleDateClick = () => {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      const withPicker = el as HTMLInputElement & {
        showPicker?: () => void;
      };
      withPicker.showPicker?.();
    } catch {
      // SecurityError in cross-origin frames — silently ignore; native picker
      // still opens on the calendar icon click.
    }
  };

  const handleRefresh = () => {
    setRefreshPending(true);
    onRefresh();
    setTimeout(() => setRefreshPending(false), 3_000);
  };

  const delayTarget = resolveQueueDelayTarget(active);
  const earlyJoinTarget = resolveQueueEarlyJoinTarget(active);

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-2",
        "rounded-md border border-border bg-background/80 px-3 py-1.5",
        "shadow-sm backdrop-blur"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={dateInputRef}
          type="date"
          value={sessionDate}
          onChange={(e) => onChangeSessionDate(e.target.value)}
          onClick={handleDateClick}
          aria-label="Session date"
          className={cn(
            "h-7 cursor-pointer rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
        />
        {mode === null ? (
          <Skeleton className="h-6 w-20 rounded-full" />
        ) : (
          <OpdSessionModePillDropdown
            token={token}
            date={sessionDate}
            mode={mode}
            modeChangeCount={modeChangeCount}
            isPastDate={isPastDate}
            onConverted={() => onModeConverted?.()}
          />
        )}
        <span className="hidden h-5 w-px bg-border md:inline-block" aria-hidden />
        <BroadcastDelayPopover
          token={token}
          target={
            delayTarget
              ? {
                  appointmentId: delayTarget.appointmentId,
                  patientName: delayTarget.patientName,
                  tokenNumber: delayTarget.tokenNumber,
                  statusOfTargetRow: delayTarget.queueStatus,
                }
              : null
          }
          onSuccess={onMutationSuccess}
        />
        <OfferEarlyJoinPopover
          token={token}
          target={
            earlyJoinTarget
              ? {
                  appointmentId: earlyJoinTarget.appointmentId,
                  patientName: earlyJoinTarget.patientName,
                  tokenNumber: earlyJoinTarget.tokenNumber,
                  statusOfTargetRow: earlyJoinTarget.queueStatus,
                }
              : null
          }
          onSuccess={onMutationSuccess}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          Last updated {timeAgo(lastUpdatedAt)}
        </span>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Refresh queue"
                disabled={refreshPending}
                onClick={handleRefresh}
              >
                <RefreshCcw
                  className={cn(
                    "h-3.5 w-3.5",
                    refreshPending && "animate-spin"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh queue</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
