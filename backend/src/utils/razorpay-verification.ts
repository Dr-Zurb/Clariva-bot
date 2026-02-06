/**
 * Razorpay Webhook Signature Verification
 *
 * Verifies X-Razorpay-Signature using HMAC-SHA256 with webhook secret.
 * MANDATORY before any Razorpay webhook processing (COMPLIANCE H).
 *
 * IMPORTANT:
 * - Use raw request body (Buffer), not parsed JSON
 * - Never log signature or raw body
 * - Razorpay event ID: X-Razorpay-Event-Id header (for idempotency)
 *
 * @see WEBHOOKS.md - Signature verification rules
 * @see Razorpay docs: https://razorpay.com/docs/webhooks/validate-test/
 */

import Razorpay from 'razorpay';
import { logger } from '../config/logger';
import { env } from '../config/env';

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify Razorpay webhook signature
 *
 * @param signature - From X-Razorpay-Signature header
 * @param rawBody - Raw request body as Buffer
 * @param correlationId - Request correlation ID for logging
 * @returns true if valid, false otherwise
 */
export function verifyRazorpaySignature(
  signature: string | undefined,
  rawBody: Buffer,
  correlationId?: string
): boolean {
  const cid = correlationId ?? 'razorpay-webhook';
  if (!signature) {
    logger.warn(
      { correlationId: cid, header: 'X-Razorpay-Signature' },
      'Missing Razorpay webhook signature header'
    );
    return false;
  }

  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error(
      { correlationId: cid },
      'RAZORPAY_WEBHOOK_SECRET not configured - cannot verify signature'
    );
    return false;
  }

  try {
    const isValid = Razorpay.validateWebhookSignature(
      rawBody.toString('utf8'),
      signature,
      secret
    );

    if (!isValid) {
      logger.warn(
        { correlationId: cid },
        'Razorpay webhook signature verification failed'
      );
    }

    return isValid;
  } catch (error) {
    logger.error(
      { error, correlationId: cid },
      'Error during Razorpay webhook signature verification'
    );
    return false;
  }
}
