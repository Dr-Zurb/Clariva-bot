/**
 * Twilio Composition status webhook (recording-governance-v2 · rec-01).
 *
 * POST /webhooks/twilio/composition-status
 *
 * Verify Twilio signature → Zod-parse form fields from raw bytes → 200
 * → process in `setImmediate`. Orchestrates only; no database access.
 */

import { z } from 'zod';
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { logger } from '../config/logger';
import { handleCompositionStatusCallback } from '../services/twilio-composition-status-service';
import {
  assertTwilioWebhookSignature,
  formParamsFromRawBody,
  getTwilioCompositionStatusCallbackUrl,
} from '../utils/twilio-webhook-verification';

const COMPOSITION_SID_RE = /^CJ[a-zA-Z0-9]{10,}$/;
const ROOM_SID_RE = /^RM[a-zA-Z0-9]{10,}$/;

export const twilioCompositionStatusBodySchema = z.object({
  CompositionSid: z
    .string()
    .regex(COMPOSITION_SID_RE, 'CompositionSid must be a Twilio Composition SID (starts with CJ)'),
  RoomSid: z.string().regex(ROOM_SID_RE, 'RoomSid must be a Twilio Room SID (starts with RM)'),
  StatusCallbackEvent: z.string().optional(),
  Status: z.string().optional(),
});

function readTwilioSignature(req: Request): string | undefined {
  const raw = req.headers['x-twilio-signature'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}

/**
 * Handle Twilio Composition status callback.
 * POST /webhooks/twilio/composition-status
 */
export const handleTwilioCompositionStatusWebhook = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const publicUrl = getTwilioCompositionStatusCallbackUrl();

    await assertTwilioWebhookSignature({
      signature: readTwilioSignature(req),
      rawBody: req.rawBody,
      publicUrl,
      correlationId,
    });

    const fields = formParamsFromRawBody(req.rawBody as Buffer);
    const parsed = twilioCompositionStatusBodySchema.parse(fields);

    res.status(200).json(successResponse({ message: 'OK' }, req));

    setImmediate(() => {
      handleCompositionStatusCallback(
        {
          compositionSid: parsed.CompositionSid,
          roomSid: parsed.RoomSid,
          statusCallbackEvent: parsed.StatusCallbackEvent,
          status: parsed.Status,
        },
        correlationId
      ).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          {
            correlationId,
            compositionSid: parsed.CompositionSid,
            roomSid: parsed.RoomSid,
            error: message,
          },
          'twilio-composition-status: processing failed after 200'
        );
      });
    });
  }
);
