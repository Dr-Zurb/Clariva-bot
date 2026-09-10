/**
 * Twilio webhook signature verification (recording-governance-v2 · rec-01).
 *
 * Twilio signs form-encoded POSTs with `X-Twilio-Signature` over the
 * public URL plus the posted fields (not a raw-body HMAC). We still
 * start from the exact request bytes — `querystring.parse` of `rawBody`
 * — and never from sanitized `req.body`.
 *
 * Fail closed: missing auth token, missing public URL, missing raw
 * body, missing signature, or a mismatch all reject. No fall-through.
 *
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */

import { parse as parseQuerystring } from 'querystring';
import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { logSecurityEvent } from './audit-logger';
import { InternalError, UnauthorizedError } from './errors';

export const TWILIO_COMPOSITION_STATUS_PATH = '/webhooks/twilio/composition-status';
export const TWILIO_ROOM_STATUS_PATH = '/webhooks/twilio/room-status';

const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';

export interface TwilioWebhookSignatureInput {
  signature: string | undefined;
  rawBody: Buffer | undefined;
  publicUrl: string;
  correlationId: string;
  /** Audit/log label. Defaults to composition-status (rec-01 callers). */
  webhookName?: string;
}

/**
 * Public URL Twilio is configured to POST composition-status to.
 * Must match the Composition Hook `statusCallback` exactly (no
 * trailing slash on the base, no query string).
 */
export function getTwilioCompositionStatusCallbackUrl(): string {
  const base = env.WEBHOOK_BASE_URL?.trim();
  if (!base) {
    logger.error(
      {},
      'twilio-webhook-verification: WEBHOOK_BASE_URL is not configured — cannot verify callbacks'
    );
    throw new InternalError('WEBHOOK_BASE_URL is not configured — cannot verify Twilio callbacks');
  }
  return `${base.replace(/\/$/, '')}${TWILIO_COMPOSITION_STATUS_PATH}`;
}

export function getTwilioRoomStatusCallbackUrl(): string {
  const base = env.WEBHOOK_BASE_URL?.trim();
  if (!base) {
    logger.error(
      {},
      'twilio-webhook-verification: WEBHOOK_BASE_URL is not configured — cannot verify callbacks'
    );
    throw new InternalError('WEBHOOK_BASE_URL is not configured — cannot verify Twilio callbacks');
  }
  return `${base.replace(/\/$/, '')}${TWILIO_ROOM_STATUS_PATH}`;
}

/**
 * Parse form-encoded raw bytes into a flat string map for both
 * Twilio `validateRequest` and Zod. Duplicate keys keep the first value.
 */
export function formParamsFromRawBody(rawBody: Buffer): Record<string, string> {
  const parsed = parseQuerystring(rawBody.toString('utf8'));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      out[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === 'string') {
      out[key] = value[0];
    }
  }
  return out;
}

function readTwilioAuthToken(): string {
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) {
    logger.error(
      {},
      'twilio-webhook-verification: TWILIO_AUTH_TOKEN is not configured — failing closed'
    );
    throw new InternalError('Twilio webhook signature verification is not configured');
  }
  return token;
}

/**
 * Verify a Twilio form-encoded webhook. Throws on any failure.
 */
export async function assertTwilioWebhookSignature(
  input: TwilioWebhookSignatureInput
): Promise<void> {
  const correlationId = input.correlationId?.trim() || 'unknown';
  const webhookName = input.webhookName?.trim() || 'twilio composition-status';
  const authToken = readTwilioAuthToken();
  const publicUrl = input.publicUrl?.trim();

  if (!publicUrl) {
    logger.error(
      { correlationId },
      'twilio-webhook-verification: public URL missing — failing closed'
    );
    throw new InternalError('Twilio webhook public URL is not configured');
  }

  if (!input.rawBody || !Buffer.isBuffer(input.rawBody)) {
    logger.warn(
      { correlationId, check: 'missing_raw_body' },
      'twilio-webhook-verification: raw body missing — rejecting'
    );
    await logSecurityEvent(
      correlationId,
      undefined,
      'webhook_signature_failed',
      'high',
      undefined,
      `${webhookName}: missing raw body`
    );
    throw new UnauthorizedError('Invalid Twilio webhook signature');
  }

  const signature = typeof input.signature === 'string' ? input.signature.trim() : '';
  if (!signature) {
    logger.warn(
      { correlationId, check: 'missing_signature', header: TWILIO_SIGNATURE_HEADER },
      'twilio-webhook-verification: signature header missing — rejecting'
    );
    await logSecurityEvent(
      correlationId,
      undefined,
      'webhook_signature_failed',
      'high',
      undefined,
      `${webhookName}: missing signature`
    );
    throw new UnauthorizedError('Invalid Twilio webhook signature');
  }

  const params = formParamsFromRawBody(input.rawBody);
  const ok = twilio.validateRequest(authToken, signature, publicUrl, params);
  if (!ok) {
    logger.warn(
      { correlationId, check: 'signature_mismatch' },
      'twilio-webhook-verification: signature mismatch — rejecting'
    );
    await logSecurityEvent(
      correlationId,
      undefined,
      'webhook_signature_failed',
      'high',
      undefined,
      `${webhookName}: signature mismatch`
    );
    throw new UnauthorizedError('Invalid Twilio webhook signature');
  }
}
