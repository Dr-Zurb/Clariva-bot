/**
 * Twilio Webhook Controller (e-task-4)
 *
 * Handles Twilio Video room status callbacks.
 * POST /webhooks/twilio/room-status - Room and participant events (Twilio sends all to one URL)
 *
 * Twilio sends application/x-www-form-urlencoded. Returns 200 quickly; processes async.
 *
 * @see https://www.twilio.com/docs/video/api/status-callbacks
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { handleTwilioStatusCallback } from '../services/consultation-verification-service';

/**
 * Handle Twilio Room status callback
 * POST /webhooks/twilio/room-status
 *
 * Twilio sends: StatusCallbackEvent (participant-connected, room-ended, etc.), RoomSid, ParticipantIdentity, etc.
 * Must return 200 quickly; process async to avoid Twilio timeout.
 */
export const handleTwilioRoomStatusWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';

    res.status(200).json(successResponse({ message: 'OK' }, req));

    setImmediate(() => {
      const body = req.body as Record<string, unknown>;
      if (!body || typeof body !== 'object') {
        return;
      }
      handleTwilioStatusCallback(body, correlationId).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const { logger } = require('../config/logger');
        logger.error(
          { correlationId, roomSid: body.RoomSid, event: body.StatusCallbackEvent, error: message },
          'Twilio status callback processing failed'
        );
      });
    });
  }
);
