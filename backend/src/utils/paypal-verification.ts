/**
 * PayPal Webhook Signature Verification
 *
 * Verifies PayPal webhook via REST API (POST /v1/notifications/verify-webhook-signature).
 * MANDATORY before any PayPal webhook processing (COMPLIANCE H).
 *
 * IMPORTANT:
 * - Use raw request body (Buffer), not parsed JSON
 * - Never log signature or raw body
 * - PayPal uses OAuth + Verify API for verification
 *
 * @see WEBHOOKS.md - Signature verification rules
 * @see PayPal docs: https://developer.paypal.com/api/rest/webhooks/
 */

import axios from 'axios';
import { logger } from '../config/logger';
import { env } from '../config/env';

// ============================================================================
// OAuth Token
// ============================================================================

async function getPayPalAccessToken(): Promise<string> {
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  const baseUrl =
    env.PAYPAL_MODE === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET required');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const { data } = await axios.post<{ access_token: string }>(
    `${baseUrl}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    }
  );

  return data.access_token;
}

// ============================================================================
// Webhook Verification
// ============================================================================

/**
 * Verify PayPal webhook signature via REST API
 *
 * @param headers - Request headers (paypal-auth-algo, paypal-cert-url, etc.)
 * @param rawBody - Raw request body as Buffer
 * @param correlationId - Request correlation ID for logging
 * @returns true if valid, false otherwise
 */
export async function verifyPayPalWebhook(
  headers: Record<string, string | undefined>,
  rawBody: Buffer,
  correlationId?: string
): Promise<boolean> {
  const cid = correlationId ?? 'paypal-webhook';

  const authAlgo = headers['paypal-auth-algo'];
  const certUrl = headers['paypal-cert-url'];
  const transmissionId = headers['paypal-transmission-id'];
  const transmissionSig = headers['paypal-transmission-sig'];
  const transmissionTime = headers['paypal-transmission-time'];

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    logger.warn(
      { correlationId: cid },
      'Missing PayPal webhook verification headers'
    );
    return false;
  }

  const webhookId = env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    logger.error(
      { correlationId: cid },
      'PAYPAL_WEBHOOK_ID not configured - cannot verify webhook'
    );
    return false;
  }

  try {
    const accessToken = await getPayPalAccessToken();
    const baseUrl =
      env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const webhookEvent = JSON.parse(rawBody.toString('utf8'));

    const { data } = await axios.post<{ verification_status: string }>(
      `${baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const isValid = data.verification_status === 'SUCCESS';

    if (!isValid) {
      logger.warn(
        { correlationId: cid, verification_status: data.verification_status },
        'PayPal webhook signature verification failed'
      );
    }

    return isValid;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        correlationId: cid,
      },
      'Error during PayPal webhook signature verification'
    );
    return false;
  }
}
