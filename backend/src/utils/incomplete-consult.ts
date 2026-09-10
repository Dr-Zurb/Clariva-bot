/**
 * Incomplete consult predicate (PKD-D2).
 * Session started but linked appointment never reached `completed`.
 */

export interface IncompleteConsultSessionInput {
  status: string;
  actual_started_at?: string | null;
  doctor_joined_at?: string | null;
  patient_joined_at?: string | null;
  scheduled_start_at?: string | null;
}

/** True when the consult session clearly began (not merely booked). */
export function consultationSessionStarted(
  session: IncompleteConsultSessionInput
): boolean {
  if (session.status === 'live') return true;
  if (session.actual_started_at) return true;
  if (session.doctor_joined_at) return true;
  if (session.patient_joined_at) return true;
  return false;
}

/**
 * Incomplete = started session + appointment not completed.
 * Never-started sessions are excluded even if appointment is still open.
 */
export function isIncompleteConsult(input: {
  session: IncompleteConsultSessionInput;
  appointmentStatus: string;
}): boolean {
  if (!consultationSessionStarted(input.session)) return false;
  return input.appointmentStatus !== 'completed';
}

/** Rolling lookback for incomplete-consult lists/KPIs (days). */
export const INCOMPLETE_CONSULT_LOOKBACK_DAYS = 90;
