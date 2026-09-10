/**
 * Patient lobby heartbeat (consult-room-checkin / crc-02).
 *
 * Auth: HMAC consultation token. Stamps appointments.patient_checked_in_at
 * (first hit) and patient_lobby_last_seen_at. No PHI in logs.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';
import { verifyConsultationToken } from '../utils/consultation-token';
import {
  resolveLobbyPresence,
  type LobbyPresence,
} from '../utils/lobby-presence';

export interface LobbyHeartbeatResult {
  checkedInAt: string;
  lastSeenAt: string;
  presence: LobbyPresence;
}

export async function recordLobbyHeartbeat(
  patientToken: string,
  correlationId: string
): Promise<LobbyHeartbeatResult> {
  const { appointmentId } = verifyConsultationToken(patientToken);
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error: fetchErr } = await admin
    .from('appointments')
    .select('id, patient_checked_in_at, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchErr || !apt) {
    logger.warn(
      { correlationId, appointmentId, error: fetchErr?.message },
      'lobby-heartbeat: appointment not found'
    );
    throw new NotFoundError('Appointment not found');
  }

  const nowIso = new Date().toISOString();
  const checkedInAt =
    typeof apt.patient_checked_in_at === 'string' && apt.patient_checked_in_at
      ? apt.patient_checked_in_at
      : nowIso;

  const { error: updateErr } = await admin
    .from('appointments')
    .update({
      patient_checked_in_at: checkedInAt,
      patient_lobby_last_seen_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', appointmentId);

  if (updateErr) {
    logger.warn(
      { correlationId, appointmentId, error: updateErr.message },
      'lobby-heartbeat: update failed'
    );
    throw new InternalError('Failed to record lobby heartbeat');
  }

  const presence = resolveLobbyPresence({
    checkedInAt,
    lastSeenAt: nowIso,
  });

  return {
    checkedInAt,
    lastSeenAt: nowIso,
    presence,
  };
}
