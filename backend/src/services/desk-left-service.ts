/**
 * Desk Left: arrived visit leaves the open list.
 * Paid visits get a full till reversal in the same sitting.
 * Does not call cancelAppointmentForPatient or Razorpay.
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import type { VisitPaymentReturnMethod } from '../types/visit-payment';
import { markDeskAppointmentCancelled } from './desk-cancel-service';
import {
  deriveVisitPaymentStatus,
  lastVisitCollectRow,
  listVisitPaymentsForAppointment,
  netVisitCollectedMinor,
  recordTillReversal,
} from './visit-payments-service';

type DeskLeftRow = {
  id: string;
  status: string;
  doctor_id: string;
  patient_checked_in_at: string | null;
};

/**
 * Take an arrived, not-completed visit off Today.
 * If paid, insert a full reversal then cancel.
 */
export async function leaveAppointmentForDesk(
  appointmentId: string,
  doctorId: string,
  actorId: string,
  correlationId: string,
  input: { returnMethod?: VisitPaymentReturnMethod } = {}
): Promise<{
  appointment: { id: string; status: 'cancelled'; opd_token_number: number | null };
}> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: fetchError } = await admin
    .from('appointments')
    .select('id, status, doctor_id, patient_checked_in_at')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchError) handleSupabaseError(fetchError, correlationId);
  const row = existing as DeskLeftRow | null;
  if (!row || row.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }

  if (row.status === 'cancelled') {
    throw new ValidationError('Appointment is already cancelled');
  }
  if (row.status === 'completed' || row.status === 'no_show') {
    throw new ValidationError('Appointment is already completed or marked no-show');
  }
  if (row.status !== 'pending' && row.status !== 'confirmed') {
    throw new ValidationError('Appointment cannot be marked left');
  }
  if (!row.patient_checked_in_at) {
    throw new ValidationError('Not checked in');
  }

  const ledger = await listVisitPaymentsForAppointment(appointmentId, doctorId, correlationId);
  const status = deriveVisitPaymentStatus(ledger);
  if (status === 'returned') {
    throw new ValidationError('Visit collection was already returned');
  }

  if (status === 'paid') {
    if (!input.returnMethod) {
      throw new ValidationError('Choose how you returned the money');
    }
    const source = lastVisitCollectRow(ledger);
    if (!source) {
      throw new ValidationError('No collection to return');
    }
    await recordTillReversal(
      appointmentId,
      doctorId,
      {
        returnMethod: input.returnMethod,
        reversesPaymentId: source.id,
        amountMinor: netVisitCollectedMinor(ledger),
      },
      correlationId,
      actorId
    );
  }

  return markDeskAppointmentCancelled(appointmentId, doctorId, actorId, correlationId);
}
