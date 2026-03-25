/**
 * Doctor OPD operations: queue session list, early invite, delay broadcast, queue entry updates (e-task-opd-06).
 * Service role; ownership validated per call.
 */

import { getSupabaseAdminClient } from '../config/database';
import type { OpdQueueEntryStatus } from '../types/database';
import { handleSupabaseError, validateOwnership } from '../utils/db-helpers';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { updateAppointmentStatus } from './appointment-service';
import { requeueEntryAfterCurrentPatient, requeueEntryToEndOfSession } from './opd/opd-queue-service';

export interface DoctorQueueSessionRow {
  entryId: string;
  appointmentId: string;
  tokenNumber: number;
  position: number;
  queueStatus: OpdQueueEntryStatus;
  sessionDate: string;
  appointmentStatus: string;
  appointmentDate: string;
  /** Initials / short label — not full name */
  patientLabel: string;
}

function patientLabelFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Pt';
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.length <= 2 ? w.toUpperCase() : (w[0]! + w[w.length - 1]!).toUpperCase();
  }
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

/**
 * Queue rows for a session day (doctor TZ date string YYYY-MM-DD).
 */
export async function listDoctorQueueSession(
  doctorId: string,
  sessionDateYmd: string,
  correlationId: string
): Promise<DoctorQueueSessionRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: entries, error } = await admin
    .from('opd_queue_entries')
    .select('id, appointment_id, token_number, position, status, session_date')
    .eq('doctor_id', doctorId)
    .eq('session_date', sessionDateYmd)
    .order('token_number', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!entries?.length) {
    return [];
  }

  const aptIds = entries.map((e) => e.appointment_id as string);
  const { data: apts, error: aptErr } = await admin
    .from('appointments')
    .select('id, patient_name, appointment_date, status')
    .in('id', aptIds);

  if (aptErr) {
    handleSupabaseError(aptErr, correlationId);
  }

  const aptMap = new Map((apts ?? []).map((a) => [a.id as string, a]));

  return entries.map((e) => {
    const apt = aptMap.get(e.appointment_id as string);
    const name = (apt?.patient_name as string) || '';
    return {
      entryId: e.id as string,
      appointmentId: e.appointment_id as string,
      tokenNumber: e.token_number as number,
      position: e.position as number,
      queueStatus: e.status as OpdQueueEntryStatus,
      sessionDate: e.session_date as string,
      appointmentStatus: (apt?.status as string) || 'unknown',
      appointmentDate: apt?.appointment_date
        ? new Date(apt.appointment_date as string).toISOString()
        : '',
      patientLabel: patientLabelFromName(name),
    };
  });
}

/**
 * Offer early join to a patient (slot mode): sets expiry and clears prior response.
 */
export async function doctorOfferEarlyJoin(
  appointmentId: string,
  doctorId: string,
  expiresInMinutes: number,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error: fe } = await admin
    .from('appointments')
    .select('id, doctor_id, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!apt) {
    throw new NotFoundError('Appointment not found');
  }
  validateOwnership(apt.doctor_id as string, doctorId);

  if (apt.status !== 'pending' && apt.status !== 'confirmed') {
    throw new ValidationError('Early join can only be offered for pending or confirmed visits');
  }

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  const { error } = await admin
    .from('appointments')
    .update({
      opd_early_invite_expires_at: expiresAt,
      opd_early_invite_response: null,
    })
    .eq('id', appointmentId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

/**
 * Set or clear doctor broadcast delay (minutes) for patient banners.
 */
export async function doctorSetSessionDelay(
  appointmentId: string,
  doctorId: string,
  delayMinutes: number | null,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error: fe } = await admin
    .from('appointments')
    .select('id, doctor_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!apt) {
    throw new NotFoundError('Appointment not found');
  }
  validateOwnership(apt.doctor_id as string, doctorId);

  const { error } = await admin
    .from('appointments')
    .update({ opd_session_delay_minutes: delayMinutes })
    .eq('id', appointmentId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

const QUEUE_ENTRY_DOCTOR_STATUSES: OpdQueueEntryStatus[] = ['called', 'skipped'];

/**
 * Update queue entry status (call next, skip).
 */
export async function doctorUpdateQueueEntryStatus(
  entryId: string,
  doctorId: string,
  status: OpdQueueEntryStatus,
  correlationId: string
): Promise<void> {
  if (!QUEUE_ENTRY_DOCTOR_STATUSES.includes(status)) {
    throw new ValidationError('Invalid queue action status');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: row, error: fe } = await admin
    .from('opd_queue_entries')
    .select('id, doctor_id, status')
    .eq('id', entryId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!row) {
    throw new NotFoundError('Queue entry not found');
  }
  validateOwnership(row.doctor_id as string, doctorId);

  const current = row.status as OpdQueueEntryStatus;
  if (current === 'completed' || current === 'cancelled') {
    throw new ValidationError('Queue entry is already finished');
  }

  const { error } = await admin.from('opd_queue_entries').update({ status }).eq('id', entryId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

/**
 * Mark appointment no-show / missed slot (slot policy); syncs queue row to missed when applicable.
 */
export async function doctorMarkAppointmentNoShow(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error: fe } = await admin
    .from('appointments')
    .select('id, doctor_id, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!apt) {
    throw new NotFoundError('Appointment not found');
  }
  validateOwnership(apt.doctor_id as string, doctorId);

  if (apt.status !== 'pending' && apt.status !== 'confirmed') {
    throw new ValidationError('Only pending or confirmed visits can be marked no-show');
  }

  await updateAppointmentStatus(appointmentId, 'no_show', correlationId, doctorId);
}

/**
 * Requeue a patient after missed turn (OPD-08).
 */
export async function doctorRequeueQueueEntry(
  entryId: string,
  doctorId: string,
  strategy: 'end_of_queue' | 'after_current',
  correlationId: string
): Promise<void> {
  if (strategy === 'after_current') {
    await requeueEntryAfterCurrentPatient(entryId, doctorId, correlationId);
  } else {
    await requeueEntryToEndOfSession(entryId, doctorId, correlationId);
  }
}
