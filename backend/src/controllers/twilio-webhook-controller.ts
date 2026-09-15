/**
 * Twilio Webhook Controller (e-task-4)
 *
 * Handles Twilio Video room status callbacks.
 * POST /webhooks/twilio/room-status - Room and participant events (Twilio sends all to one URL)
 *
 * Twilio sends application/x-www-form-urlencoded. Verify signature,
 * return 200 quickly, process async.
 *
 * @see https://www.twilio.com/docs/video/api/status-callbacks
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { logger } from '../config/logger';
import { handleTwilioStatusCallback } from '../services/consultation-verification-service';
import {
  assertTwilioWebhookSignature,
  formParamsFromRawBody,
  getTwilioRoomStatusCallbackUrl,
} from '../utils/twilio-webhook-verification';

function readTwilioSignature(req: Request): string | undefined {
  const raw = req.headers['x-twilio-signature'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}

/**
 * Handle Twilio Room status callback
 * POST /webhooks/twilio/room-status
 *
 * Twilio sends: StatusCallbackEvent (participant-connected, room-ended, etc.), RoomSid, ParticipantIdentity, etc.
 * Must return 200 quickly; process async to avoid Twilio timeout.
 *
 * voice-C3: `participant-connected` for voice/video sessions fans out a doctor
 * Web Push from `handleParticipantConnected` (consultation-verification-service).
 */
export const handleTwilioRoomStatusWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const publicUrl = getTwilioRoomStatusCallbackUrl();

    await assertTwilioWebhookSignature({
      signature: readTwilioSignature(req),
      rawBody: req.rawBody,
      publicUrl,
      correlationId,
      webhookName: 'twilio room-status',
    });

    const fields = formParamsFromRawBody(req.rawBody as Buffer);

    res.status(200).json(successResponse({ message: 'OK' }, req));

    setImmediate(() => {
      handleTwilioStatusCallback(fields, correlationId).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          {
            correlationId,
            roomSid: fields.RoomSid,
            event: fields.StatusCallbackEvent,
            error: message,
          },
          'Twilio status callback processing failed'
        );
      });
    });
  }
);
