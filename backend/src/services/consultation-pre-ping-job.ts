/**
 * Consultation Pre-Ping Job (Plan 04 · Task 18)
 *
 * Runs every minute (external cron hits `POST /cron/consultation-pre-ping`).
 *
 * Picks up text-modality appointments whose `appointment_date` is within
 * `CONSULTATION_PRE_PING_LEAD_MINUTES` (default 5) of `now()` AND have no
 * `consultation_sessions` row yet, then provisions the session via the
 * facade and fires the patient fan-out (`sendConsultationReadyToPatient`).
 *
 * Why text-only?
 *   - Voice ships in Plan 05 — its adapter throws today.
 *   - Video already has a doctor-initiated `startConsultation` path; the
 *     doctor clicking "Start Video" on the dashboard is the trigger.
 *     Pre-pinging video would create rooms the doctor never opens.
 *   - Text is asynchronous-feeling but synchronous-required (Decision 5
 *     LOCKED) — the patient needs the link in their DM *before* the slot
 *     starts, which is exactly what this cron solves.
 *
 * Idempotency:
 *   - The facade's `createSession` is idempotent on `(appointment_id,
 *     modality)` (Task 15) — re-running the cron over the same 5-minute
 *     window returns the existing row, no double-create.
 *   - `sendConsultationReadyToPatient` dedups via
 *     `consultation_sessions.last_ready_notification_at` +
 *     `CONSULTATION_READY_NOTIFY_DEDUP_SECONDS` (Task 16). Re-running the
 *     cron over the same minute won't spam the patient.
 *
 * Failure mode:
 *   - Per-appointment errors are logged and swallowed; the job continues
 *     to the next candidate. The job's overall return value reports
 *     counts so the cron HTTP response can flag if it ran but found no
 *     work vs. found work and partially failed.
 *
 * **No PHI in logs.** Only opaque IDs.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { createSession as facadeCreateSession } from './consultation-session-service';
import { sendConsultationReadyToPatient } from './notification-service';

// ============================================================================
// Types
// ============================================================================

export interface PrePingJobResult {
  ranAt: string;
  windowStart: string;
  windowEnd: string;
  candidatesFound: number;
  sessionsCreated: number;
  notificationsFired: number;
  errors: number;
}

interface CandidateAppointmentRow {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  appointment_date: string;
  modality: string | null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run one pass of the pre-ping job. Safe to call concurrently with itself
 * (idempotent at the facade layer).
 */
export async function runConsultationPrePingJob(
  correlationId: string,
): Promise<PrePingJobResult> {
  const ranAt = new Date();
  const leadMinutes = env.CONSULTATION_PRE_PING_LEAD_MINUTES;
  const windowStart = ranAt;
  const windowEnd = new Date(ranAt.getTime() + leadMinutes * 60 * 1000);

  const result: PrePingJobResult = {
    ranAt:               ranAt.toISOString(),
    windowStart:         windowStart.toISOString(),
    windowEnd:           windowEnd.toISOString(),
    candidatesFound:     0,
    sessionsCreated:     0,
    notificationsFired:  0,
    errors:              0,
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { correlationId },
      'consultation-pre-ping: admin client unavailable — skipping run',
    );
    return result;
  }

  // **Schema gap (documented):** the `appointments` table does NOT yet
  // have a `consultation_modality` column. Until a follow-up task adds
  // it (and wires the booking flow to populate it), this cron has no
  // reliable way to identify "text" appointments — so the query below
  // tries the column and gracefully no-ops on `42703` (undefined column).
  //
  // The doctor-side `POST /api/v1/consultation/start-text` endpoint is
  // the working text entry point until then; the cron becomes effective
  // once the column exists.
  const { data: candidates, error: candidatesError } = await admin
    .from('appointments')
    .select('id, doctor_id, patient_id, appointment_date, consultation_modality')
    .gte('appointment_date', windowStart.toISOString())
    .lte('appointment_date', windowEnd.toISOString())
    .eq('consultation_modality', 'text')
    .in('status', ['pending', 'confirmed']);

  if (candidatesError) {
    // 42703 = undefined_column. Treat as "schema not ready" and silently
    // no-op — this is the expected state until the booking flow ships
    // the modality column.
    const isUndefinedColumn =
      candidatesError.code === '42703' ||
      /column .* does not exist/i.test(candidatesError.message ?? '');

    if (isUndefinedColumn) {
      logger.info(
        { correlationId },
        'consultation-pre-ping: no-op (appointments.consultation_modality not yet provisioned — follow-up task)',
      );
      return result;
    }

    logger.warn(
      { correlationId, error: candidatesError.message, code: candidatesError.code },
      'consultation-pre-ping: candidate query failed',
    );
    result.errors += 1;
    return result;
  }

  // Map row shape — `consultation_modality` is selected but we only
  // verify it equals 'text' (the eq filter already did) and don't carry
  // it forward.
  const candidateRows = (candidates ?? []).map(
    (r): CandidateAppointmentRow => ({
      id:               r.id as string,
      doctor_id:        r.doctor_id as string,
      patient_id:       (r.patient_id as string | null) ?? null,
      appointment_date: r.appointment_date as string,
      modality:         (r.consultation_modality as string | null) ?? 'text',
    }),
  );
  result.candidatesFound = candidateRows.length;

  if (candidateRows.length === 0) {
    logger.info({ correlationId }, 'consultation-pre-ping: no candidates');
    return result;
  }

  // Fetch existing session rows to skip already-provisioned candidates.
  const candidateIds = candidateRows.map((r) => r.id);
  const { data: existingSessions, error: existingError } = await admin
    .from('consultation_sessions')
    .select('appointment_id, status')
    .in('appointment_id', candidateIds)
    .eq('modality', 'text');

  if (existingError) {
    logger.warn(
      { correlationId, error: existingError.message },
      'consultation-pre-ping: existing-session query failed (will re-attempt; facade is idempotent)',
    );
    // Don't return — facade-level idempotency makes a re-attempt safe.
  }

  const existingByAppointment = new Map<string, string>();
  for (const row of existingSessions ?? []) {
    existingByAppointment.set(
      row.appointment_id as string,
      row.status as string,
    );
  }

  for (const candidate of candidateRows) {
    try {
      const existingStatus = existingByAppointment.get(candidate.id);
      if (existingStatus && existingStatus !== 'cancelled') {
        // Already provisioned (likely by a previous cron tick). Skip
        // creation; the fan-out helper's dedup window will absorb any
        // notification re-fire.
        logger.info(
          {
            correlationId,
            appointmentId: candidate.id,
            existingStatus,
          },
          'consultation-pre-ping: skip (session already exists)',
        );
        continue;
      }

      const scheduledStartAt = new Date(candidate.appointment_date);
      const expectedEndAt = new Date(
        scheduledStartAt.getTime() + env.SLOT_INTERVAL_MINUTES * 60 * 1000,
      );

      const session = await facadeCreateSession(
        {
          appointmentId:    candidate.id,
          doctorId:         candidate.doctor_id,
          patientId:        candidate.patient_id ?? null,
          modality:         'text',
          scheduledStartAt,
          expectedEndAt,
        },
        correlationId,
      );
      result.sessionsCreated += 1;

      try {
        await sendConsultationReadyToPatient({
          sessionId:     session.id,
          correlationId,
        });
        result.notificationsFired += 1;
      } catch (err) {
        logger.warn(
          {
            correlationId,
            appointmentId: candidate.id,
            sessionId:     session.id,
            error: err instanceof Error ? err.message : String(err),
          },
          'consultation-pre-ping: fan-out failed (session already created)',
        );
        result.errors += 1;
      }
    } catch (err) {
      result.errors += 1;
      logger.warn(
        {
          correlationId,
          appointmentId: candidate.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'consultation-pre-ping: per-candidate provision failed',
      );
    }
  }

  logger.info(
    {
      correlationId,
      candidatesFound:     result.candidatesFound,
      sessionsCreated:     result.sessionsCreated,
      notificationsFired:  result.notificationsFired,
      errors:              result.errors,
      windowStart:         result.windowStart,
      windowEnd:           result.windowEnd,
    },
    'consultation-pre-ping: complete',
  );

  return result;
}
