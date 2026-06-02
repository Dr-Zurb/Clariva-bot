"use client";

/**
 * RunningBehindBadge (task-pf-14 · P5.3)
 *
 * Shows a soft warning badge — e.g. "+18 min" — when the current time has
 * passed the next appointment's scheduled start time.
 *
 * Accepts `nextSlotAt` (ISO datetime string) from the parent. When
 * `useDoctorDayPipeline` (task-pf-07) or `useNextAppointmentRoute`
 * (task-pf-10) land, the caller should pass the next-active entry's
 * `appointment_date` here; until then the badge simply stays hidden.
 *
 * Visibility: `hidden` on screens narrower than `lg` (1024 px) because
 * the cockpit header is space-tight at small widths.
 *
 * Updates: once per minute via a `setInterval`.
 */

import { useEffect, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface RunningBehindBadgeProps {
  /**
   * ISO datetime string for the next scheduled appointment slot.
   * When `null` / `undefined` the badge is not rendered.
   */
  nextSlotAt?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeMinutesBehind(nextSlotAt: string, now: number): number {
  const nextMs = new Date(nextSlotAt).getTime();
  return Math.floor((now - nextMs) / 60_000);
}

function formatSlotTime(nextSlotAt: string): string {
  return new Date(nextSlotAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RunningBehindBadge({
  nextSlotAt,
  className,
}: RunningBehindBadgeProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick once per minute so the label stays fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!nextSlotAt) return null;

  const behindMins = computeMinutesBehind(nextSlotAt, now);
  if (behindMins <= 0) return null;

  const timeLabel = formatSlotTime(nextSlotAt);
  const pluralMin = behindMins === 1 ? "minute" : "minutes";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={`Running behind by ${behindMins} ${pluralMin}`}
            className={cn(
              // Hidden on < lg — header is space-tight at small widths.
              "hidden lg:inline-flex items-center rounded-full px-2 py-0.5",
              "text-xs font-medium select-none",
              "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
              className,
            )}
          >
            +{behindMins}&nbsp;min
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Next slot at {timeLabel} — running behind by {behindMins}{" "}
          {pluralMin}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
