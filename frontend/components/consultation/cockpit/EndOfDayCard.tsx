"use client";

/**
 * EndOfDayCard (pf-18)
 *
 * Shown at the end of the doctor's last patient when
 * `useNextAppointmentRoute().next === null`.
 *
 * Replaces EndedCard's content (or the NextPatientCountdown overlay) with a
 * compact summary of the day and two navigation CTAs.
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-18-end-of-day-summary.md
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { formatLocalIsoDate } from "@/lib/dates";
import { useDoctorDayPipeline } from "@/hooks/useDoctorDayPipeline";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface EndOfDayCardProps {
  doctorName?: string | null;
  /** Doctor JWT — forwarded to useDoctorDayPipeline for day-count data. */
  token: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns tomorrow's date as YYYY-MM-DD for the schedule deep-link param. */
function getTomorrowParam(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatLocalIsoDate(d);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EndOfDayCard({
  doctorName,
  token,
}: EndOfDayCardProps): JSX.Element {
  const router = useRouter();

  const { doneCount, missedCount, totalCount, isLoading } =
    useDoctorDayPipeline({ token });

  const title = useMemo<string>(() => {
    const first = doctorName?.split(" ")[0] ?? null;
    return first ? `Wrapped — ${first}` : "You're done for today";
  }, [doctorName]);

  /**
   * Builds the subtitle stat line:
   *   "12 patients · 11 completed · 1 no-show"
   * Prescription count omitted for v1 (no cheap aggregate endpoint yet).
   */
  const subtitle = useMemo<string | null>(() => {
    if (isLoading) return null;
    const parts: string[] = [];
    if (totalCount > 0)
      parts.push(`${totalCount} patient${totalCount !== 1 ? "s" : ""}`);
    if (doneCount > 0) parts.push(`${doneCount} completed`);
    if (missedCount > 0)
      parts.push(`${missedCount} no-show${missedCount !== 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [isLoading, totalCount, doneCount, missedCount]);

  const tomorrow = getTomorrowParam();

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-8 text-center space-y-6",
        "shadow-sm",
      )}
    >
      {/* Celebration mark */}
      <div className="flex justify-center" aria-hidden>
        <span className="text-4xl leading-none">🎉</span>
      </div>

      {/* Title + day stats */}
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-sm tabular-nums text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>

      {/* Primary CTAs */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className={cn(
            "flex-1 max-w-xs rounded-md bg-primary px-4 py-2.5",
            "text-sm font-semibold text-primary-foreground",
            "hover:bg-primary/90 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          Wrap up clinic ▸
        </button>

        <button
          type="button"
          onClick={() => router.push(`/dashboard?d=${tomorrow}`)}
          className={cn(
            "flex-1 max-w-xs rounded-md border border-border bg-background px-4 py-2.5",
            "text-sm font-medium text-foreground",
            "hover:bg-muted transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          Review tomorrow&apos;s schedule
        </button>
      </div>

      {/* Tertiary: reassures the doctor they can stay without navigating */}
      <button
        type="button"
        // No navigation — purely confirms "you're already here, no action needed"
        onClick={() => void 0}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground transition-colors"
      >
        Stay on this screen
      </button>
    </div>
  );
}
