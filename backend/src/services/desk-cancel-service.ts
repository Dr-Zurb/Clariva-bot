/**
 * Desk cancel for waiting / booked visits.
 * Does not call cancelAppointmentForPatient (webhook / patient path).
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification } from '../utils/audit-logger';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { syncOpdQueueEntryOnAppointmentStatus } from './opd/opd-queue-service';

export type DeskCancelAppointment = {
  id: string;
  status: 'cancelled';
  opd_token_number: number | null;
};

type DeskCancelRow = {
  id: string;
  status: string;
  doctor_id: string;
  patient_checked_in_at: string | null;
  opd_queue_entry?: { token_number?: number | null } | { token_number?: number | null }[] | null;
};

function queueToken(row: Pick<DeskCancelRow, 'opd_queue_entry'>): number | null {
  const raw = row.opd_queue_entry;
  const entry = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  return entry?.token_number ?? null;
}

const DESK_CANCEL_SELECT =
  'id, status, doctor_id, patient_checked_in_at, opd_queue_entry:opd_queue_entries(token_number)' as const;

/**
 * Cancel a not-yet-arrived visit for the acting doctor.
 * Arrived / paid reversal is P5.3 — refuse checked-in rows here.
 */
export async function cancelAppointmentForDesk(
  appointmentId: string,
  doctorId: string,
  actorId: string,
  correlationId: string
): Promise<{ appointment: DeskCancelAppointment }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: fetchError } = await admin
    .from('appointments')
    .select(DESK_CANCEL_SELECT)
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchError) handleSupabaseError(fetchError, correlationId);
  const row = existing as DeskCancelRow | null;
  if (!row || row.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }

  if (row.status === 'cancelled' || row.status === 'completed' || row.status === 'no_show') {
    throw new ValidationError('Appointment is already cancelled, completed, or marked no-show');
  }

  if (row.status !== 'pending' && row.status !== 'confirmed') {
    throw new ValidationError('Appointment cannot be cancelled');
  }

  if (row.patient_checked_in_at) {
    throw new ValidationError('Already checked in. Use Left.');
  }

  return markDeskAppointmentCancelled(appointmentId, doctorId, actorId, correlationId);
}

/** Shared cancel write after desk-cancel / desk-left gates. */
export async function markDeskAppointmentCancelled(
  appointmentId: string,
  doctorId: string,
  actorId: string,
  correlationId: string
): Promise<{ appointment: DeskCancelAppointment }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: updated, error } = await admin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
    .eq('doctor_id', doctorId)
    .select(DESK_CANCEL_SELECT)
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId,
    'update',
    'appointment',
    appointmentId,
    ['status'],
    onBehalf
  );

  await syncOpdQueueEntryOnAppointmentStatus(appointmentId, 'cancelled', correlationId);

  logger.info({ correlationId, appointmentId }, 'desk_appointment_cancelled');

  const next = updated as DeskCancelRow;
  return {
    appointment: {
      id: next.id,
      status: 'cancelled',
      opd_token_number: queueToken(next),
    },
  };
}
