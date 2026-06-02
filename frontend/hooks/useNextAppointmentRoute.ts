"use client";

/**
 * useNextAppointmentRoute (pf-10)
 *
 * Returns the next appointment the doctor should navigate to, or null when
 * the day is done. Wraps useDoctorDayPipeline — no extra API calls.
 *
 * Eligibility rules:
 *   Queue mode    → first entry AFTER currentIndex with status ∈ {waiting, called}.
 *                   (Skips in_consultation — two patients can overlap; doctor must
 *                    choose manually. Skips completed / missed.)
 *   Schedule mode → first entry AFTER currentIndex with status ∈ {pending, confirmed}
 *                   AND appointmentDate >= now() − 1 h (stale slots are irrelevant).
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-10-next-appointment-route-hook.md
 */

import { useMemo } from "react";
import {
  useDoctorDayPipeline,
  type PipelineEntry,
} from "@/hooks/useDoctorDayPipeline";
import type { ConsultationModality } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_ELIGIBLE = new Set<string>(["waiting", "called"]);
const SCHEDULE_ELIGIBLE = new Set<string>(["pending", "confirmed"]);

/** Slots that started more than 1 h ago are not worth auto-advancing to. */
const SCHEDULE_CUTOFF_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NextAppointmentRoute {
  appointmentId: string;
  /** /dashboard/appointments/{id} */
  url: string;
  /** "Mohit K (#5)" in queue mode · "Mohit K (2:30 PM)" in schedule mode */
  label: string;
  modality: ConsultationModality;
  /** "#5 of 12" — for the countdown overlay copy */
  positionLabel: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSlotTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildQueueLabel(entry: PipelineEntry): string {
  const name = entry.label || "Walk-in";
  const token = entry.tokenNumber ?? entry.position;
  return `${name} (#${token})`;
}

function buildScheduleLabel(entry: PipelineEntry): string {
  const name = entry.label || "Walk-in";
  if (entry.appointmentDate) {
    return `${name} (${formatSlotTime(entry.appointmentDate)})`;
  }
  return name;
}

function isScheduleEligible(entry: PipelineEntry): boolean {
  if (!SCHEDULE_ELIGIBLE.has(entry.status)) return false;
  if (!entry.appointmentDate) return true; // no date available — allow conservatively
  return new Date(entry.appointmentDate).getTime() >= Date.now() - SCHEDULE_CUTOFF_MS;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNextAppointmentRoute(opts: {
  currentAppointmentId: string | null;
  token: string;
}): {
  next: NextAppointmentRoute | null;
  isLoading: boolean;
  error: Error | null;
} {
  const pipeline = useDoctorDayPipeline({
    token: opts.token,
    currentAppointmentId: opts.currentAppointmentId ?? undefined,
  });

  const next = useMemo<NextAppointmentRoute | null>(() => {
    const { entries, currentIndex, totalCount, source } = pipeline;
    if (entries.length === 0) return null;

    // Entries strictly after the current appointment (or all if none is active).
    const startAfter = currentIndex ?? -1;
    const candidates = entries.slice(startAfter + 1);

    if (source === "queue") {
      const found = candidates.find((e) => QUEUE_ELIGIBLE.has(e.status));
      if (!found) return null;

      return {
        appointmentId: found.id,
        url: found.href,
        label: buildQueueLabel(found),
        modality: found.consultationType ?? "in_clinic",
        positionLabel: `#${found.position} of ${totalCount}`,
      };
    }

    // Schedule / telemed mode.
    const found = candidates.find(isScheduleEligible);
    if (!found) return null;

    return {
      appointmentId: found.id,
      url: found.href,
      label: buildScheduleLabel(found),
      // Fallback to 'video' — the most common remote modality — when
      // consultation_type was absent on the legacy appointment row.
      modality: found.consultationType ?? "video",
      positionLabel: `#${found.position} of ${totalCount}`,
    };
  }, [pipeline]);

  return {
    next,
    isLoading: pipeline.isLoading,
    error: pipeline.error,
  };
}
