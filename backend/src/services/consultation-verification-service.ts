/**
 * Consultation Verification Service (e-task-4, Task 35 cutover)
 *
 * Handles Twilio Video room/participant status callbacks.
 * Updates appointment: doctor_joined_at, patient_joined_at (still on
 * `appointments` for payout verification).
 * Mirrors lifecycle into `consultation_sessions` (actual_started_at,
 * actual_ended_at, status, join timestamps).
 * Marks verified and completed when both joined + duration >= threshold.
 * Triggers per-appointment payout when doctor has payout_schedule='per_appointment'.
 *
 * Identity convention (from e-task-3): doctor-{doctorId}, patient-{appointmentId}
 *
 * Task 35: the legacy `appointments.consultation_room_sid` column was
 * dropped. The only RoomSid → appointment lookup path now goes through
 * `consultation_sessions.provider_session_id` → `appointment_id` via
 * `findSessionByProviderSessionId`. Legacy
 * `consultation_started_at` / `consultation_ended_at` columns were also
 * dropped; the Twilio `room-ended` timestamp now lives on
 * `consultation_sessions.actual_ended_at`, and the `tryMarkVerified`
 * pipeline reads it from there.
 *
 * @see TELECONSULTATION_PLAN.md
 * @see https://www.twilio.com/docs/video/api/status-callbacks
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification } from '../utils/audit-logger';
import type { Appointment } from '../types/database';
import { processPayoutForPayment } from './payout-service';
import { syncOpdQueueEntryOnAppointmentStatus } from './opd/opd-queue-service';
import { syncCareEpisodeLifecycleOnAppointmentCompleted } from './care-episode-service';
import {
  findSessionByProviderSessionId,
  markParticipantJoined,
  updateSessionStatus,
} from './consultation-session-service';

const MIN_VERIFIED_SEC = env.MIN_VERIFIED_CONSULTATION_SECONDS;
const DEFAULT_PAYOUT_SCHEDULE = 'weekly';

// ============================================================================
// Types (Twilio Room Status Callback payload - application/x-www-form-urlencoded)
// ============================================================================

export interface TwilioRoomCallbackPayload {
  AccountSid?: string;
  RoomSid: string;
  RoomName?: string;
  RoomStatus?: string;
  StatusCallbackEvent: string;
  Timestamp?: string;
  ParticipantSid?: string;
  ParticipantStatus?: string;
  ParticipantIdentity?: string;
  ParticipantDuration?: string; // seconds in room, only on participant-disconnected
  RoomDuration?: string; // seconds, only on room-ended
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve a Twilio RoomSid to its `consultation_sessions` row + the
 * appointment id. Task 35 makes this the sole resolution path — the
 * legacy `appointments.consultation_room_sid` column is gone.
 *
 * Returns `null` when no session row matches the sid (either truly unknown
 * or a race where Twilio's callback beat our row insert). Callers warn
 * and exit early in that case.
 */
async function resolveAppointmentIdByRoomSid(
  roomSid: string
): Promise<{ appointmentId: string; sessionId: string } | null> {
  const session = await findSessionByProviderSessionId('twilio_video', roomSid);
  if (!session) return null;
  return { appointmentId: session.appointmentId, sessionId: session.id };
}

function parsePayload(body: Record<string, unknown>): TwilioRoomCallbackPayload {
  return {
    AccountSid: body.AccountSid as string,
    RoomSid: (body.RoomSid as string) || '',
    RoomName: body.RoomName as string,
    RoomStatus: body.RoomStatus as string,
    StatusCallbackEvent: (body.StatusCallbackEvent as string) || '',
    Timestamp: body.Timestamp as string,
    ParticipantSid: body.ParticipantSid as string,
    ParticipantStatus: body.ParticipantStatus as string,
    ParticipantIdentity: (body.ParticipantIdentity as string) || '',
    ParticipantDuration: body.ParticipantDuration as string,
    RoomDuration: body.RoomDuration as string,
  };
}

// ============================================================================
// API
// ============================================================================

/**
 * Handle participant-connected event.
 * Identity: doctor-{doctorId} → doctor_joined_at; patient-{appointmentId} → patient_joined_at
 */
export async function handleParticipantConnected(
  payload: TwilioRoomCallbackPayload,
  correlationId: string
): Promise<void> {
  const identity = payload.ParticipantIdentity?.trim();
  if (!identity) return;

  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const resolved = await resolveAppointmentIdByRoomSid(payload.RoomSid);
  if (!resolved) {
    logger.warn({ correlationId, roomSid: payload.RoomSid }, 'No consultation_session for participant callback');
    return;
  }

  const { data: appointments, error: fetchError } = await admin
    .from('appointments')
    .select('id, doctor_id, doctor_joined_at, patient_joined_at')
    .eq('id', resolved.appointmentId)
    .limit(1);

  if (fetchError || !appointments?.length) {
    logger.warn({ correlationId, roomSid: payload.RoomSid, appointmentId: resolved.appointmentId }, 'Appointment missing for participant callback');
    return;
  }

  const apt = appointments[0]!;
  const timestamp = payload.Timestamp || new Date().toISOString();

  if (identity.startsWith('doctor-')) {
    const doctorId = identity.slice('doctor-'.length);
    if (apt.doctor_id === doctorId && !apt.doctor_joined_at) {
      const { error } = await admin
        .from('appointments')
        .update({ doctor_joined_at: timestamp })
        .eq('id', apt.id);

      if (error) handleSupabaseError(error, correlationId);
      else {
        logger.info({ correlationId, appointmentId: apt.id, roomSid: payload.RoomSid }, 'doctor_joined_at set');
        await logDataModification(correlationId, undefined as any, 'update', 'appointment', apt.id, [
          'doctor_joined_at',
        ]);
        await mirrorJoinEventToSession(resolved.sessionId, 'doctor', new Date(timestamp));
      }
    }
  } else if (identity.startsWith('patient-')) {
    const appointmentIdFromIdentity = identity.slice('patient-'.length);
    if (apt.id === appointmentIdFromIdentity && !apt.patient_joined_at) {
      const { error } = await admin
        .from('appointments')
        .update({ patient_joined_at: timestamp })
        .eq('id', apt.id);

      if (error) handleSupabaseError(error, correlationId);
      else {
        logger.info({ correlationId, appointmentId: apt.id, roomSid: payload.RoomSid }, 'patient_joined_at set');
        await logDataModification(correlationId, undefined as any, 'update', 'appointment', apt.id, [
          'patient_joined_at',
        ]);
        await mirrorJoinEventToSession(resolved.sessionId, 'patient', new Date(timestamp));
      }
    }
  }
}

/**
 * Handle participant-disconnected event.
 * Identity: doctor-{doctorId} → doctor_left_at; patient-{appointmentId} → patient_left_at.
 * Idempotent: only set if column is null (first disconnect wins).
 */
export async function handleParticipantDisconnected(
  payload: TwilioRoomCallbackPayload,
  correlationId: string
): Promise<void> {
  const identity = payload.ParticipantIdentity?.trim();
  if (!identity) return;

  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const resolved = await resolveAppointmentIdByRoomSid(payload.RoomSid);
  if (!resolved) {
    logger.warn({ correlationId, roomSid: payload.RoomSid }, 'No consultation_session for participant-disconnected callback');
    return;
  }

  const { data: appointments, error: fetchError } = await admin
    .from('appointments')
    .select('id, doctor_id, doctor_left_at, patient_left_at')
    .eq('id', resolved.appointmentId)
    .limit(1);

  if (fetchError || !appointments?.length) {
    logger.warn({ correlationId, roomSid: payload.RoomSid, appointmentId: resolved.appointmentId }, 'Appointment missing for participant-disconnected callback');
    return;
  }

  const apt = appointments[0]!;
  const timestamp = payload.Timestamp || new Date().toISOString();

  if (identity.startsWith('doctor-')) {
    const doctorId = identity.slice('doctor-'.length);
    if (apt.doctor_id === doctorId && !apt.doctor_left_at) {
      const { error } = await admin
        .from('appointments')
        .update({ doctor_left_at: timestamp })
        .eq('id', apt.id);

      if (error) handleSupabaseError(error, correlationId);
      else {
        logger.info({ correlationId, appointmentId: apt.id, roomSid: payload.RoomSid }, 'doctor_left_at set');
        await logDataModification(correlationId, undefined as any, 'update', 'appointment', apt.id, [
          'doctor_left_at',
        ]);
      }
    }
  } else if (identity.startsWith('patient-')) {
    const appointmentIdFromIdentity = identity.slice('patient-'.length);
    if (apt.id === appointmentIdFromIdentity && !apt.patient_left_at) {
      const { error } = await admin
        .from('appointments')
        .update({ patient_left_at: timestamp })
        .eq('id', apt.id);

      if (error) handleSupabaseError(error, correlationId);
      else {
        logger.info({ correlationId, appointmentId: apt.id, roomSid: payload.RoomSid }, 'patient_left_at set');
        await logDataModification(correlationId, undefined as any, 'update', 'appointment', apt.id, [
          'patient_left_at',
        ]);
      }
    }
  }
}

/**
 * Handle room-ended event.
 * Post-Task-35: writes end timestamp to `consultation_sessions.actual_ended_at`
 * (no longer mirrored onto `appointments.consultation_ended_at`). The
 * call-duration denormalization stays on `appointments` for the payout
 * verification pipeline.
 */
export async function handleRoomEnded(
  payload: TwilioRoomCallbackPayload,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const resolved = await resolveAppointmentIdByRoomSid(payload.RoomSid);
  if (!resolved) {
    logger.warn({ correlationId, roomSid: payload.RoomSid }, 'No consultation_session for room-ended callback');
    return;
  }

  const endedAt = payload.Timestamp || new Date().toISOString();
  const durationSec = payload.RoomDuration ? parseInt(payload.RoomDuration, 10) : null;

  // Stamp duration on the appointment row (payout verification reads it).
  const { error } = await admin
    .from('appointments')
    .update({
      consultation_duration_seconds: durationSec,
    })
    .eq('id', resolved.appointmentId);

  if (error) handleSupabaseError(error, correlationId);
  else {
    logger.info(
      { correlationId, appointmentId: resolved.appointmentId, roomSid: payload.RoomSid, durationSec },
      'consultation_duration_seconds set'
    );
    await logDataModification(correlationId, undefined as any, 'update', 'appointment', resolved.appointmentId, [
      'consultation_duration_seconds',
    ]);
    await updateSessionStatus(resolved.sessionId, 'ended', { actualEndedAt: new Date(endedAt) });
  }

  await tryMarkVerified(resolved.appointmentId, correlationId);
}

/**
 * Mirror a participant-join event into `consultation_sessions`: stamp the
 * matching join timestamp and transition the row to `live` on the first
 * connect. Idempotent and non-fatal.
 */
async function mirrorJoinEventToSession(
  sessionId: string,
  role: 'doctor' | 'patient',
  at: Date
): Promise<void> {
  try {
    await markParticipantJoined(sessionId, role, at);
    await updateSessionStatus(sessionId, 'live', { actualStartedAt: at });
  } catch (err) {
    logger.warn(
      { sessionId, role, error: err instanceof Error ? err.message : String(err) },
      'consultation_sessions mirror write failed (non-fatal)'
    );
  }
}

/**
 * Mark appointment as verified and completed using "who left first" rules.
 * Doctor gets verified if: patient no-show, or patient left first, or doctor left first but overlap >= MIN_VERIFIED_SEC.
 *
 * Post-Task-35: the room-ended timestamp comes from
 * `consultation_sessions.actual_ended_at` (legacy column dropped). All
 * other lifecycle fields (`doctor_joined_at`, `patient_joined_at`,
 * `doctor_left_at`, `patient_left_at`, `verified_at`,
 * `consultation_duration_seconds`) stay on `appointments`.
 *
 * @see CONSULTATION_VERIFICATION_STRATEGY.md
 */
export async function tryMarkVerified(
  appointmentId: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const { data: apt, error: fetchError } = await admin
    .from('appointments')
    .select(
      'id, doctor_id, doctor_joined_at, patient_joined_at, doctor_left_at, patient_left_at, consultation_duration_seconds, verified_at, status'
    )
    .eq('id', appointmentId)
    .single();

  if (fetchError || !apt) return;

  if (apt.verified_at || apt.status === 'completed') return;

  if (!apt.doctor_joined_at) return;

  // Read the room-ended timestamp from `consultation_sessions.actual_ended_at`
  // (Task 35 replaced the legacy `appointments.consultation_ended_at` column).
  const { data: sessionRow, error: sessionError } = await admin
    .from('consultation_sessions')
    .select('actual_ended_at')
    .eq('appointment_id', appointmentId)
    .not('actual_ended_at', 'is', null)
    .order('actual_ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    logger.warn(
      { correlationId, appointmentId, error: sessionError.message },
      'consultation_sessions actual_ended_at lookup failed'
    );
    return;
  }
  const consultationEndedAt = (sessionRow?.actual_ended_at as string | null) ?? null;
  if (!consultationEndedAt) return;

  const verifiedAt = consultationEndedAt;
  const previousStatus = apt.status;
  const performUpdate = async (): Promise<boolean> => {
    const { data: updated, error } = await admin
      .from('appointments')
      .update({ verified_at: verifiedAt, status: 'completed' })
      .eq('id', appointmentId)
      .select('*')
      .single();

    if (error) {
      handleSupabaseError(error, correlationId);
      return false;
    }
    logger.info({ correlationId, appointmentId }, 'Consultation verified and marked completed');
    await logDataModification(correlationId, undefined as any, 'update', 'appointment', appointmentId, [
      'verified_at',
      'status',
    ]);
    await syncOpdQueueEntryOnAppointmentStatus(appointmentId, 'completed', correlationId);
    if (updated) {
      await syncCareEpisodeLifecycleOnAppointmentCompleted(
        admin,
        updated as Appointment,
        previousStatus,
        correlationId
      );
    }
    return true;
  };

  const triggerPerAppointmentPayout = async (): Promise<void> => {
    const { data: payment } = await admin
      .from('payments')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('status', 'captured')
      .or('payout_status.eq.pending,payout_status.is.null')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment?.id) return;

    const { data: settings } = await admin
      .from('doctor_settings')
      .select('payout_schedule')
      .eq('doctor_id', apt.doctor_id)
      .maybeSingle();

    const schedule = settings?.payout_schedule ?? DEFAULT_PAYOUT_SCHEDULE;
    if (schedule !== 'per_appointment') return;

    await processPayoutForPayment(payment.id, correlationId);
  };

  // Patient no-show: doctor joined, room ended, patient never joined → verify
  if (!apt.patient_joined_at) {
    if (await performUpdate()) await triggerPerAppointmentPayout();
    return;
  }

  const docJoined = apt.doctor_joined_at ? new Date(apt.doctor_joined_at).getTime() : 0;
  const ptJoined = apt.patient_joined_at ? new Date(apt.patient_joined_at).getTime() : 0;
  const overlapStart = Math.max(docJoined, ptJoined);
  const docLeft = apt.doctor_left_at ? new Date(apt.doctor_left_at).getTime() : null;
  const ptLeft = apt.patient_left_at ? new Date(apt.patient_left_at).getTime() : null;

  // Patient left first: patient_left_at exists AND (!doctor_left_at OR patient_left_at < doctor_left_at)
  if (ptLeft !== null && (docLeft === null || ptLeft < docLeft)) {
    if (await performUpdate()) await triggerPerAppointmentPayout();
    return;
  }

  // Doctor left first: doctor_left_at exists AND (doctor_left_at <= patient_left_at OR patient_left_at null)
  // Overlap sec = from overlap_start to doctor_left_at
  if (docLeft !== null && (ptLeft === null || docLeft <= ptLeft)) {
    const overlapSec = (docLeft - overlapStart) / 1000;
    if (overlapSec >= MIN_VERIFIED_SEC && (await performUpdate())) {
      await triggerPerAppointmentPayout();
    }
    return;
  }

  // Fallback: left_at missing but both joined and duration >= threshold
  const durationSec = apt.consultation_duration_seconds ?? 0;
  if (durationSec >= MIN_VERIFIED_SEC && (await performUpdate())) {
    await triggerPerAppointmentPayout();
  }
}

/**
 * Route Twilio status callback by StatusCallbackEvent.
 */
export async function handleTwilioStatusCallback(
  body: Record<string, unknown>,
  correlationId: string
): Promise<void> {
  const payload = parsePayload(body);

  if (!payload.RoomSid) {
    logger.warn({ correlationId }, 'Twilio callback missing RoomSid');
    return;
  }

  switch (payload.StatusCallbackEvent) {
    case 'participant-connected':
      await handleParticipantConnected(payload, correlationId);
      break;
    case 'participant-disconnected':
      await handleParticipantDisconnected(payload, correlationId);
      break;
    case 'room-ended':
      await handleRoomEnded(payload, correlationId);
      break;
    default:
      logger.debug(
        { correlationId, event: payload.StatusCallbackEvent, roomSid: payload.RoomSid },
        'Twilio callback event ignored'
      );
  }
}
