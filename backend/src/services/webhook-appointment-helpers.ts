/**
 * Webhook / receptionist helpers for listing merged upcoming appointments (RBH-03).
 * Shared by cancel, reschedule, and check-appointment-status DM branches.
 */

import type { Appointment } from '../types';
import type { ConversationState } from '../types/conversation';
import { listAppointmentsForPatient } from './appointment-service';

/** Patient IDs tied to the current DM conversation for multi-person booking context. */
export function buildRelatedPatientIdsForWebhook(
  conversationPatientId: string,
  state: Pick<ConversationState, 'lastBookingPatientId' | 'bookingForPatientId'>
): string[] {
  const ids = [conversationPatientId];
  if (state.lastBookingPatientId && state.lastBookingPatientId !== conversationPatientId) {
    ids.push(state.lastBookingPatientId);
  }
  if (state.bookingForPatientId && !ids.includes(state.bookingForPatientId)) {
    ids.push(state.bookingForPatientId);
  }
  return ids.filter((p): p is string => !!p);
}

/**
 * Load appointments per patient for this doctor, dedupe by appointment id, sort by
 * `appointment_date` ascending, then keep only future `pending` / `confirmed`.
 */
export async function getMergedUpcomingAppointmentsForRelatedPatients(
  patientIds: string[],
  doctorId: string,
  correlationId: string
): Promise<Appointment[]> {
  const allAppointments: Appointment[] = [];
  const seen = new Set<string>();
  for (const pid of patientIds) {
    const list = await listAppointmentsForPatient(pid, doctorId, correlationId);
    for (const a of list) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        allAppointments.push(a);
      }
    }
  }
  allAppointments.sort((a, b) => {
    const da = new Date(a.appointment_date).getTime();
    const db = new Date(b.appointment_date).getTime();
    return da - db;
  });
  const now = new Date();
  return allAppointments.filter(
    (a) =>
      new Date(a.appointment_date) >= now && (a.status === 'pending' || a.status === 'confirmed')
  );
}
