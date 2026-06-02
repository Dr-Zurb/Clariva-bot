"use client";

/**
 * useDoctorDayPipeline (pf-07)
 *
 * Unified adapter that normalises queue-mode OPD entries and slot-mode
 * appointments into a single `PipelineEntry[]` shape consumed by
 * `<CockpitQueueRail>` (pf-08) and `<NextPatientCountdown>` (pf-10/pf-11).
 *
 * Source selection:
 *   - doctor_settings.opd_mode === 'queue'  → wraps useOpdSnapshot (pf-06)
 *   - anything else / unset                 → wraps useTodaysAppointments
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-07-doctor-day-pipeline-hook.md
 */

import { useMemo } from "react";
import { useOpdSnapshot } from "@/hooks/useOpdSnapshot";
import { useTodaysAppointments } from "@/components/dashboard/cockpit/useTodaysAppointments";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import type { Appointment, ConsultationModality } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PipelineEntry {
  /** appointment.id (or queue entry → appointment_id) */
  id: string;
  /** Patient short name, "walk-in", or "Token #4" */
  label: string;
  /** Normalised status across both source shapes */
  status:
    | "waiting"
    | "called"
    | "in_consultation"
    | "completed"
    | "missed"
    | "skipped"
    | "pending"
    | "confirmed"
    | "cancelled"
    | "no_show";
  /** 1-indexed position within the day's pipeline */
  position: number;
  /** Token number — queue mode only, null in schedule mode */
  tokenNumber?: number | null;
  /** Deep-link to the appointment detail page */
  href: string;
  /** True when this entry matches `opts.currentAppointmentId` */
  isCurrent: boolean;
  /**
   * ISO 8601 appointment date/time. Used by pf-10 for the schedule-mode
   * slot-time label and the now()-1h relevance cutoff.
   */
  appointmentDate?: string | null;
  /**
   * Booked consultation modality. `'in_clinic'` for all OPD/queue entries;
   * set from `appointment.consultation_type` for schedule/telemed entries.
   * Used by pf-10 to derive `NextAppointmentRoute.modality`.
   */
  consultationType?: ConsultationModality | null;
}

export interface UseDoctorDayPipelineResult {
  entries: PipelineEntry[];
  currentIndex: number | null;
  doneCount: number;
  activeCount: number;
  missedCount: number;
  totalCount: number;
  source: "queue" | "schedule";
  isLoading: boolean;
  error: Error | null;
}

export interface UseDoctorDayPipelineOpts {
  token: string;
  currentAppointmentId?: string | null;
}

// ---------------------------------------------------------------------------
// Schedule-mode status sets (queue-mode counts come from useOpdSnapshot totals)
// ---------------------------------------------------------------------------

const SCHEDULE_ACTIVE_STATUSES = new Set<string>(["pending", "confirmed"]);
const SCHEDULE_DONE_STATUSES = new Set<string>(["completed"]);
const SCHEDULE_MISSED_STATUSES = new Set<string>(["no_show", "cancelled"]);

// ---------------------------------------------------------------------------
// Internal mappers
// ---------------------------------------------------------------------------

function mapQueueEntry(
  row: DoctorQueueSessionRow,
  position: number,
  currentAppointmentId: string | null | undefined,
): PipelineEntry {
  return {
    id: row.appointmentId,
    label: row.patientName,
    status: row.queueStatus as PipelineEntry["status"],
    position,
    tokenNumber: row.tokenNumber,
    href: `/dashboard/appointments/${row.appointmentId}`,
    isCurrent: row.appointmentId === currentAppointmentId,
    appointmentDate: row.sessionDate ?? null,
    consultationType: "in_clinic",
  };
}

function mapAppointment(
  appt: Appointment,
  position: number,
  currentAppointmentId: string | null | undefined,
): PipelineEntry {
  return {
    id: appt.id,
    label: appt.patient_name,
    status: appt.status as PipelineEntry["status"],
    position,
    tokenNumber: null,
    href: `/dashboard/appointments/${appt.id}`,
    isCurrent: appt.id === currentAppointmentId,
    appointmentDate: appt.appointment_date ?? null,
    consultationType: appt.consultation_type ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDoctorDayPipeline(
  opts?: UseDoctorDayPipelineOpts,
): UseDoctorDayPipelineResult {
  const token = opts?.token ?? "";
  const currentAppointmentId = opts?.currentAppointmentId;

  // Both hooks are always called — hooks must not be called conditionally.
  // Only one source's output is used in the final result (selected by opd_mode).
  const opdSnap = useOpdSnapshot(token);
  const schedule = useTodaysAppointments(token);

  // isOpdEnabled: null while settings load; true = queue; false = slot/telemed.
  const settingsLoaded = opdSnap.isOpdEnabled !== null;
  const isQueueMode = opdSnap.isOpdEnabled === true;
  const source: "queue" | "schedule" = isQueueMode ? "queue" : "schedule";

  // --- Queue pipeline ---
  // CP-D2: token order is the canonical patient-flow order in OPD queue mode.
  // Don't pre-bucket by status — the moment the current patient flips to
  // `completed` they'd jump past the next active row, and useNextAppointmentRoute
  // would wrongly return null. Sort all three buckets together by tokenNumber ASC.
  // Rows with tokenNumber == null sort last (Number.POSITIVE_INFINITY tie-breaker).
  const queueEntries = useMemo<PipelineEntry[]>(() => {
    if (!isQueueMode) return [];

    const allRows = [
      ...opdSnap.active,
      ...opdSnap.done,
      ...opdSnap.missed,
    ].sort((a, b) => {
      const ta = a.tokenNumber ?? Number.POSITIVE_INFINITY;
      const tb = b.tokenNumber ?? Number.POSITIVE_INFINITY;
      return ta - tb;
    });
    return allRows.map((row, i) =>
      mapQueueEntry(row, i + 1, currentAppointmentId),
    );
  }, [
    isQueueMode,
    opdSnap.active,
    opdSnap.done,
    opdSnap.missed,
    currentAppointmentId,
  ]);

  // --- Schedule pipeline ---
  // Strict chronological order by appointment_date.
  const scheduleEntries = useMemo<PipelineEntry[]>(() => {
    if (isQueueMode || !schedule.appointments) return [];

    const sorted = [...schedule.appointments].sort((a, b) =>
      a.appointment_date.localeCompare(b.appointment_date),
    );
    return sorted.map((appt, i) =>
      mapAppointment(appt, i + 1, currentAppointmentId),
    );
  }, [isQueueMode, schedule.appointments, currentAppointmentId]);

  const entries = isQueueMode ? queueEntries : scheduleEntries;

  // --- currentIndex: first entry whose id matches currentAppointmentId ---
  const currentIndex = useMemo<number | null>(() => {
    if (!currentAppointmentId) return null;
    const idx = entries.findIndex((e) => e.id === currentAppointmentId);
    return idx === -1 ? null : idx;
  }, [entries, currentAppointmentId]);

  // --- Counts ---
  const { doneCount, activeCount, missedCount } = useMemo(() => {
    if (isQueueMode) {
      return {
        doneCount: opdSnap.totalDone,
        activeCount: opdSnap.totalActive,
        missedCount: opdSnap.totalMissed,
      };
    }
    const appts = schedule.appointments ?? [];
    return {
      activeCount: appts.filter((a) => SCHEDULE_ACTIVE_STATUSES.has(a.status))
        .length,
      doneCount: appts.filter((a) => SCHEDULE_DONE_STATUSES.has(a.status))
        .length,
      missedCount: appts.filter((a) => SCHEDULE_MISSED_STATUSES.has(a.status))
        .length,
    };
  }, [
    isQueueMode,
    opdSnap.totalDone,
    opdSnap.totalActive,
    opdSnap.totalMissed,
    schedule.appointments,
  ]);

  const totalCount = doneCount + activeCount + missedCount;

  // --- Loading / error ---
  // Show loading until the settings call completes (we don't know the mode yet).
  const isLoading =
    !settingsLoaded ||
    (isQueueMode ? opdSnap.isLoading : schedule.loading);

  const error: Error | null = isQueueMode
    ? opdSnap.error
    : schedule.error
      ? new Error(schedule.error)
      : null;

  return {
    entries,
    currentIndex,
    doneCount,
    activeCount,
    missedCount,
    totalCount,
    source,
    isLoading,
    error,
  };
}
