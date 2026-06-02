/**
 * voice-C3 · T5.32 — Web Push when a patient joins a voice/video Twilio room.
 *
 * Doctor-only for v1 (decision §12). Thin wrapper over push-notification-service.
 */

import { logger } from '../config/logger';
import { sendPushToUser } from './push-notification-service';
import type { Modality } from '../types/consultation-session';

/**
 * Notify the doctor (browser Web Push) when a patient connects to a live
 * voice or video room. Fire-and-forget at the Twilio webhook call site.
 */
export async function sendPatientJoinedCallPushToDoctor(input: {
  sessionId: string;
  doctorId: string;
  modality: Extract<Modality, 'voice' | 'video'>;
  correlationId: string;
}): Promise<void> {
  const { sessionId, doctorId, modality, correlationId } = input;
  const deeplinkPath = `/dashboard/consult/${sessionId}`;

  const counts = await sendPushToUser({
    userId: doctorId,
    payload: {
      title: 'Patient joined your call',
      body: 'Your patient is in the waiting room. Tap to join.',
      tag: `${sessionId}:${modality}`,
      data: { sessionId, deeplink: deeplinkPath, modality },
    },
  });

  logger.info(
    {
      correlationId,
      session_id: sessionId,
      modality,
      delivered: counts.delivered,
      failed: counts.failed,
      revoked: counts.revoked,
    },
    'Patient joined call — Web Push fan-out',
  );
}
