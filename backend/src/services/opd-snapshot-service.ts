/**
 * Patient OPD session snapshot builder (e-task-opd-04).
 * Uses service role; response contains no PHI.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import type { DoctorBusyWith, PatientOpdSnapshot } from '../types/opd-session';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { getDoctorSettings } from './doctor-settings-service';
import { resolveOpdModeFromSettings } from './opd/opd-mode-service';
import { getQueueEtaInputsForAppointment } from './opd/opd-queue-service';
import { recordOpdEtaComputed } from './opd/opd-metrics';
import { buildInAppNotificationHints } from './opd/opd-notification-hints';

const SUGGESTED_POLL_SECONDS = 20;
const ETA_VARIANCE = 0.2;

function computeDelayMinutes(
  status: string,
  scheduledStart: Date,
  now: Date,
  consultationStarted: string | null | undefined
): number | undefined {
  if (status !== 'pending' && status !== 'confirmed') {
    return undefined;
  }
  if (consultationStarted) {
    return undefined;
  }
  if (now.getTime() <= scheduledStart.getTime()) {
    return undefined;
  }
  return Math.max(0, Math.floor((now.getTime() - scheduledStart.getTime()) / 60000));
}

async function inferDoctorBusySnapshot(
  doctorId: string,
  myId: string,
  _myPatientId: string | null,
  myStarted: string | null | undefined,
  myEnded: string | null | undefined,
  correlationId: string
): Promise<DoctorBusyWith | undefined> {
  if (myStarted && !myEnded) {
    return 'you';
  }
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return undefined;
  }

  const { data: other, error } = await admin
    .from('appointments')
    .select('id, patient_id')
    .eq('doctor_id', doctorId)
    .neq('id', myId)
    .not('consultation_started_at', 'is', null)
    .is('consultation_ended_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!other) {
    return undefined;
  }
  return 'other_patient';
}

function withInAppNotifications(snapshot: PatientOpdSnapshot): PatientOpdSnapshot {
  const hints = buildInAppNotificationHints({
    opdMode: snapshot.opdMode,
    delayMinutes: snapshot.delayMinutes,
    earlyInviteAvailable: snapshot.earlyInviteAvailable,
    aheadCount: snapshot.aheadCount,
  });
  return { ...snapshot, inAppNotifications: hints };
}

/**
 * Build live session snapshot for patient-facing UI (polling).
 */
export async function buildPatientOpdSnapshot(
  appointmentId: string,
  correlationId: string
): Promise<PatientOpdSnapshot> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error } = await admin
    .from('appointments')
    .select(
      'id, doctor_id, patient_id, appointment_date, status, consultation_started_at, consultation_ended_at, opd_early_invite_expires_at, opd_early_invite_response, opd_session_delay_minutes'
    )
    .eq('id', appointmentId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!apt) {
    throw new NotFoundError('Appointment not found');
  }

  const settings = await getDoctorSettings(apt.doctor_id);
  const opdMode = resolveOpdModeFromSettings(settings);
  const slotIntervalMin = settings?.slot_interval_minutes ?? env.SLOT_INTERVAL_MINUTES;

  const appointmentDate = new Date(apt.appointment_date as string);
  const now = new Date();

  const doctorBusyWith = await inferDoctorBusySnapshot(
    apt.doctor_id,
    apt.id,
    apt.patient_id,
    apt.consultation_started_at,
    apt.consultation_ended_at,
    correlationId
  );

  const computedDelay = computeDelayMinutes(
    apt.status,
    appointmentDate,
    now,
    apt.consultation_started_at
  );
  const doctorDelay =
    apt.opd_session_delay_minutes != null ? Number(apt.opd_session_delay_minutes) : null;
  const delayMinutes =
    doctorDelay != null && doctorDelay > 0 ? doctorDelay : computedDelay ?? null;

  const base: PatientOpdSnapshot = {
    appointmentId: apt.id,
    status: apt.status,
    opdMode,
    suggestedPollSeconds: SUGGESTED_POLL_SECONDS,
    delayMinutes: delayMinutes ?? null,
    doctorBusyWith,
  };

  if (opdMode === 'slot') {
    const slotStart = appointmentDate.toISOString();
    const slotEnd = new Date(appointmentDate.getTime() + slotIntervalMin * 60 * 1000).toISOString();
    const expiresRaw = apt.opd_early_invite_expires_at;
    const expiresAt = expiresRaw ? new Date(expiresRaw as string).toISOString() : null;
    const offerActive =
      !!expiresRaw &&
      new Date(expiresRaw as string) > now &&
      !apt.opd_early_invite_response;
    return withInAppNotifications({
      ...base,
      slotStart,
      slotEnd,
      earlyInviteAvailable: offerActive,
      earlyInviteExpiresAt: offerActive ? expiresAt : null,
    });
  }

  const { data: qRow } = await admin
    .from('opd_queue_entries')
    .select('token_number')
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  if (!qRow?.token_number) {
    return withInAppNotifications({
      ...base,
      tokenNumber: undefined,
      aheadCount: undefined,
      etaMinutes: undefined,
      etaRange: undefined,
    });
  }

  const tokenNum = qRow.token_number as number;
  const eta = await getQueueEtaInputsForAppointment(apt.doctor_id, tokenNum, correlationId);
  recordOpdEtaComputed(correlationId);
  return withInAppNotifications({
    ...base,
    tokenNumber: tokenNum,
    aheadCount: eta.aheadCount,
    etaMinutes: eta.etaMinutes,
    etaRange: {
      minMinutes: Math.max(0, Math.ceil(eta.etaMinutes * (1 - ETA_VARIANCE))),
      maxMinutes: Math.ceil(eta.etaMinutes * (1 + ETA_VARIANCE)),
    },
  });
}

/**
 * Patient accepts early join (slot mode); idempotent if already accepted.
 */
export async function acceptEarlyJoin(appointmentId: string, correlationId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error } = await admin
    .from('appointments')
    .select('opd_early_invite_expires_at, opd_early_invite_response')
    .eq('id', appointmentId)
    .single();

  if (error || !apt) {
    throw new NotFoundError('Appointment not found');
  }

  if (apt.opd_early_invite_response === 'accepted') {
    return;
  }
  if (apt.opd_early_invite_response === 'declined') {
    throw new ValidationError('Early join was already declined');
  }

  const exp = apt.opd_early_invite_expires_at ? new Date(apt.opd_early_invite_expires_at as string) : null;
  if (!exp || exp <= new Date()) {
    throw new ValidationError('No active early join offer');
  }

  const { error: upErr } = await admin
    .from('appointments')
    .update({ opd_early_invite_response: 'accepted' })
    .eq('id', appointmentId);

  if (upErr) {
    handleSupabaseError(upErr, correlationId);
  }
}

/**
 * Patient declines early join; idempotent if already declined.
 */
export async function declineEarlyJoin(appointmentId: string, correlationId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error } = await admin
    .from('appointments')
    .select('opd_early_invite_expires_at, opd_early_invite_response')
    .eq('id', appointmentId)
    .single();

  if (error || !apt) {
    throw new NotFoundError('Appointment not found');
  }

  if (apt.opd_early_invite_response === 'declined') {
    return;
  }
  if (apt.opd_early_invite_response === 'accepted') {
    throw new ValidationError('Early join was already accepted');
  }

  const exp = apt.opd_early_invite_expires_at ? new Date(apt.opd_early_invite_expires_at as string) : null;
  if (!exp || exp <= new Date()) {
    throw new ValidationError('No active early join offer');
  }

  const { error: upErr } = await admin
    .from('appointments')
    .update({ opd_early_invite_response: 'declined' })
    .eq('id', appointmentId);

  if (upErr) {
    handleSupabaseError(upErr, correlationId);
  }
}
