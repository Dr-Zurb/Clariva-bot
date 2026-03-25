/**
 * OPD queue: tokens, daily cap, queue row lifecycle (e-task-opd-03).
 * Backend uses service role; logs use context `opd_queue` (not BullMQ).
 */

import { DateTime } from 'luxon';
import { getSupabaseAdminClient } from '../../config/database';
import { env } from '../../config/env';
import type { AppointmentStatus } from '../../types';
import type { OpdQueueEntryStatus } from '../../types/database';
import { handleSupabaseError, validateOwnership } from '../../utils/db-helpers';
import { InternalError, NotFoundError, ValidationError } from '../../utils/errors';
import { computeEtaMinutesFromRollingAverage } from './opd-eta';
import { recordOpdQueueReinsertTotal } from './opd-metrics';

const ROLLING_SAMPLE_SIZE = 20;

/** UTC ISO range [start, end) for a calendar day in the given IANA timezone. */
export function localDayUtcRange(sessionDateYmd: string, timezone: string): { start: string; end: string } {
  const start = DateTime.fromISO(sessionDateYmd, { zone: timezone }).startOf('day');
  const end = start.plus({ days: 1 });
  return { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
}

/** Calendar date (YYYY-MM-DD) in doctor TZ for an appointment instant. */
export function sessionDateFromAppointmentDate(appointmentDate: Date, timezone: string): string {
  return DateTime.fromJSDate(appointmentDate).setZone(timezone).toISODate()!;
}

/**
 * Count pending/confirmed appointments for this doctor on the session calendar day (doctor TZ).
 */
export async function countActiveAppointmentsForSessionDay(
  doctorId: string,
  sessionDateYmd: string,
  timezone: string,
  correlationId: string
): Promise<number> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for queue booking');
  }

  const { start, end } = localDayUtcRange(sessionDateYmd, timezone);

  const { count, error } = await admin
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', start)
    .lt('appointment_date', end);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return count ?? 0;
}

/**
 * Rolling average consultation duration (seconds) from completed visits with telemetry.
 */
export async function getRollingAverageConsultationSeconds(
  doctorId: string,
  correlationId: string,
  sampleSize: number = ROLLING_SAMPLE_SIZE
): Promise<number | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from('appointments')
    .select('consultation_duration_seconds')
    .eq('doctor_id', doctorId)
    .eq('status', 'completed')
    .not('consultation_duration_seconds', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(sampleSize);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const durations = (data ?? [])
    .map((r: { consultation_duration_seconds: number | null }) => r.consultation_duration_seconds)
    .filter((n): n is number => n != null && n > 0);

  if (durations.length === 0) {
    return null;
  }

  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

async function getNextTokenNumber(
  doctorId: string,
  sessionDateYmd: string,
  correlationId: string
): Promise<number> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for queue booking');
  }

  const { data, error } = await admin
    .from('opd_queue_entries')
    .select('token_number')
    .eq('doctor_id', doctorId)
    .eq('session_date', sessionDateYmd)
    .order('token_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (data?.token_number != null) {
    return data.token_number + 1;
  }
  return 1;
}

/**
 * Insert queue row after a queue-mode appointment is created.
 */
/**
 * Read token number for a queue-mode appointment (after createQueueEntryAfterBooking).
 */
export async function getQueueTokenForAppointment(
  appointmentId: string,
  correlationId: string
): Promise<number | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from('opd_queue_entries')
    .select('token_number')
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const n = data?.token_number;
  return typeof n === 'number' ? n : null;
}

export async function createQueueEntryAfterBooking(
  appointmentId: string,
  doctorId: string,
  appointmentDate: Date,
  timezone: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for queue booking');
  }

  const sessionDateYmd = sessionDateFromAppointmentDate(appointmentDate, timezone);
  const tokenNumber = await getNextTokenNumber(doctorId, sessionDateYmd, correlationId);

  const { error } = await admin.from('opd_queue_entries').insert({
    doctor_id: doctorId,
    appointment_id: appointmentId,
    session_date: sessionDateYmd,
    token_number: tokenNumber,
    position: tokenNumber,
    status: 'waiting',
  });

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

/**
 * Remove queue row before reschedule or when replacing session day.
 */
export async function deleteQueueEntryByAppointmentId(
  appointmentId: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return;
  }

  const { error } = await admin.from('opd_queue_entries').delete().eq('appointment_id', appointmentId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

function mapAppointmentStatusToQueueEntry(status: AppointmentStatus): OpdQueueEntryStatus | null {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'no_show') return 'missed';
  return null;
}

/**
 * When appointment status becomes terminal, mirror to opd_queue_entries if a row exists.
 */
export async function syncOpdQueueEntryOnAppointmentStatus(
  appointmentId: string,
  newStatus: AppointmentStatus,
  correlationId: string
): Promise<void> {
  const mapped = mapAppointmentStatusToQueueEntry(newStatus);
  if (!mapped) {
    return;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return;
  }

  const { data: row, error: selErr } = await admin
    .from('opd_queue_entries')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  if (selErr) {
    handleSupabaseError(selErr, correlationId);
  }
  if (!row) {
    return;
  }

  const { error } = await admin.from('opd_queue_entries').update({ status: mapped }).eq('appointment_id', appointmentId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

/**
 * ETA inputs for a queue token (for future session APIs / opd-04). No PHI.
 */
export async function getQueueEtaInputsForAppointment(
  doctorId: string,
  tokenNumber: number,
  correlationId: string
): Promise<{ etaMinutes: number; avgMinutesUsed: number; aheadCount: number }> {
  const coldStart = env.OPD_QUEUE_DEFAULT_CONSULT_MINUTES;
  const avgSeconds = await getRollingAverageConsultationSeconds(doctorId, correlationId);
  const aheadCount = Math.max(0, tokenNumber - 1);
  const { etaMinutes, avgMinutesUsed } = computeEtaMinutesFromRollingAverage(
    aheadCount,
    avgSeconds,
    coldStart
  );
  return { etaMinutes, avgMinutesUsed, aheadCount };
}

/**
 * Move a queue entry to the end of the session (new token #).
 * Used when patient missed turn and clinic policy is end-of-queue (OPD-08).
 */
export async function requeueEntryToEndOfSession(
  entryId: string,
  doctorId: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for queue booking');
  }

  const { data: row, error: fe } = await admin
    .from('opd_queue_entries')
    .select('id, doctor_id, session_date, status')
    .eq('id', entryId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!row) {
    throw new NotFoundError('Queue entry not found');
  }
  validateOwnership(row.doctor_id as string, doctorId);

  const st = row.status as string;
  if (st === 'completed' || st === 'cancelled') {
    throw new ValidationError('Queue entry is already finished');
  }

  const sessionDate = row.session_date as string;

  const { data: maxRow, error: qErr } = await admin
    .from('opd_queue_entries')
    .select('token_number')
    .eq('doctor_id', doctorId)
    .eq('session_date', sessionDate)
    .order('token_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr) {
    handleSupabaseError(qErr, correlationId);
  }

  const maxTok = (maxRow?.token_number as number) ?? 0;
  const next = maxTok + 1;

  const { error: upErr } = await admin
    .from('opd_queue_entries')
    .update({ token_number: next, position: next, status: 'waiting' })
    .eq('id', entryId);

  if (upErr) {
    handleSupabaseError(upErr, correlationId);
  }

  recordOpdQueueReinsertTotal('end_of_queue', correlationId);
}

/**
 * Reinsert after the patient currently in consultation (shift later tokens up).
 * If nobody is in_consultation, falls back to end-of-queue.
 */
export async function requeueEntryAfterCurrentPatient(
  entryId: string,
  doctorId: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for queue booking');
  }

  const { data: row, error: fe } = await admin
    .from('opd_queue_entries')
    .select('id, doctor_id, session_date, status')
    .eq('id', entryId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!row) {
    throw new NotFoundError('Queue entry not found');
  }
  validateOwnership(row.doctor_id as string, doctorId);

  const st = row.status as string;
  if (st === 'completed' || st === 'cancelled') {
    throw new ValidationError('Queue entry is already finished');
  }

  const sessionDate = row.session_date as string;

  const { data: currentRow, error: curErr } = await admin
    .from('opd_queue_entries')
    .select('token_number')
    .eq('doctor_id', doctorId)
    .eq('session_date', sessionDate)
    .eq('status', 'in_consultation')
    .limit(1)
    .maybeSingle();

  if (curErr) {
    handleSupabaseError(curErr, correlationId);
  }

  const anchor = (currentRow?.token_number as number) ?? null;
  if (anchor == null) {
    await requeueEntryToEndOfSession(entryId, doctorId, correlationId);
    return;
  }

  const { data: all, error: allErr } = await admin
    .from('opd_queue_entries')
    .select('id, token_number')
    .eq('doctor_id', doctorId)
    .eq('session_date', sessionDate);

  if (allErr) {
    handleSupabaseError(allErr, correlationId);
  }

  const entries = (all ?? []) as { id: string; token_number: number }[];
  const toShift = entries
    .filter((e) => e.id !== entryId && e.token_number > anchor)
    .sort((a, b) => b.token_number - a.token_number);

  for (const e of toShift) {
    const { error: u } = await admin
      .from('opd_queue_entries')
      .update({ token_number: e.token_number + 1, position: e.token_number + 1 })
      .eq('id', e.id);
    if (u) {
      handleSupabaseError(u, correlationId);
    }
  }

  const { error: fin } = await admin
    .from('opd_queue_entries')
    .update({
      token_number: anchor + 1,
      position: anchor + 1,
      status: 'waiting',
    })
    .eq('id', entryId);

  if (fin) {
    handleSupabaseError(fin, correlationId);
  }

  recordOpdQueueReinsertTotal('after_current', correlationId);
}
