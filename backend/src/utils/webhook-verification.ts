/**
 * Webhook Signature Verification Utilities
 *
 * Provides signature verification for webhook requests from Meta platforms
 * (Facebook, Instagram, WhatsApp) using HMAC-SHA256.
 *
 * IMPORTANT:
 * - Signature verification is MANDATORY before any webhook processing
 * - Invalid signatures MUST result in 401 Unauthorized
 * - NEVER log signatures or raw payloads (security risk)
 * - Use raw request body (Buffer) for verification, not parsed JSON
 *
 * Security:
 * - Uses HMAC-SHA256 with app secret
 * - Constant-time comparison to prevent timing attacks
 * - Validates signature format before comparison
 *
 * @see WEBHOOKS.md - Webhook security rules
 * @see COMPLIANCE.md - Webhook security requirements (section H)
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError } from './errors';

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = 'sha256';
const SIGNATURE_PREFIX = 'sha256=';

/** App secret for Instagram webhook signature (INSTAGRAM_APP_SECRET or META_APP_SECRET). */
function getInstagramWebhookAppSecret(): string | null {
  const raw =
    (env.INSTAGRAM_APP_SECRET && env.INSTAGRAM_APP_SECRET.trim()) ||
    (env.META_APP_SECRET && env.META_APP_SECRET.trim()) ||
    null;
  return raw && raw.length > 0 ? raw : null;
}

/** App secret for Facebook Page webhook signature (FACEBOOK_APP_SECRET). */
function getFacebookWebhookAppSecret(): string | null {
  const raw = env.FACEBOOK_APP_SECRET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function verifyHmacSha256Signature(
  signature: string | undefined,
  rawBody: Buffer,
  appSecret: string,
  correlationId: string,
  secretLabel: string
): boolean {
  if (!signature) {
    logger.warn(
      { correlationId, header: 'X-Hub-Signature-256' },
      'Missing webhook signature header'
    );
    return false;
  }

  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    logger.warn(
      { correlationId, signatureFormat: signature.substring(0, 20) + '...' },
      'Invalid webhook signature format'
    );
    return false;
  }

  const receivedHash = signature.substring(SIGNATURE_PREFIX.length);

  try {
    const computedHash = createHmac(ALGORITHM, appSecret)
      .update(rawBody)
      .digest('hex');

    const receivedBuf = Buffer.from(receivedHash, 'hex');
    const computedBuf = Buffer.from(computedHash, 'hex');

    if (receivedBuf.length !== computedBuf.length) {
      logger.warn(
        {
          correlationId,
          receivedHashLength: receivedHash.length,
          computedHashLength: computedHash.length,
          rawBodyLength: rawBody?.length ?? 0,
          secretLabel,
        },
        'Webhook signature verification failed: hash length mismatch'
      );
      return false;
    }

    const isValid = timingSafeEqual(receivedBuf, computedBuf);

    if (!isValid) {
      logger.warn(
        {
          correlationId,
          receivedHashLength: receivedHash.length,
          rawBodyLength: rawBody?.length ?? 0,
          secretLabel,
        },
        'Webhook signature verification failed'
      );
    }

    return isValid;
  } catch (error) {
    logger.error(
      { error, correlationId, secretLabel },
      'Error during webhook signature verification'
    );
    return false;
  }
}

// ============================================================================
// Signature Verification Functions
// ============================================================================

/**
 * Verify Instagram/Facebook webhook signature
 *
 * Verifies that a webhook request came from the legitimate provider by comparing
 * the computed HMAC-SHA256 hash with the signature in the X-Hub-Signature-256 header.
 *
 * @param signature - Signature from X-Hub-Signature-256 header (format: "sha256=<hash>")
 * @param rawBody - Raw request body as Buffer (not parsed JSON)
 * @param correlationId - Request correlation ID for logging
 * @returns true if signature is valid, false otherwise
 *
 * @throws InternalError if app secret is not configured (INSTAGRAM_APP_SECRET or META_APP_SECRET)
 *
 * @example
 * ```typescript
 * const signature = req.headers['x-hub-signature-256'];
 * const isValid = verifyInstagramSignature(signature, req.body, correlationId);
 * if (!isValid) {
 *   throw new UnauthorizedError('Invalid webhook signature');
 * }
 * ```
 *
 * @see WEBHOOKS.md - Signature verification rules
 * @see COMPLIANCE.md - Webhook security requirements
 */
export function verifyInstagramSignature(
  signature: string | undefined,
  rawBody: Buffer,
  correlationId: string
): boolean {
  const appSecret = getInstagramWebhookAppSecret();
  if (!appSecret) {
    logger.error(
      { correlationId },
      'App secret not configured (INSTAGRAM_APP_SECRET or META_APP_SECRET) - cannot verify signature'
    );
    throw new InternalError('Webhook signature verification not configured');
  }
  return verifyHmacSha256Signature(
    signature,
    rawBody,
    appSecret,
    correlationId,
    'instagram'
  );
}

/** Returns whether Instagram app secret is configured (for logging). */
export function isWebhookSecretConfigured(): boolean {
  return getInstagramWebhookAppSecret() != null;
}

/** Returns Instagram app secret length (for debugging, never the secret itself). */
export function getWebhookSecretLength(): number {
  const s = getInstagramWebhookAppSecret();
  return s?.length ?? 0;
}

/**
 * Verify Facebook Page webhook signature with FACEBOOK_APP_SECRET (fbm-05).
 * Strict: does not fall back to Instagram/Meta secrets.
 */
export function verifyFacebookSignature(
  signature: string | undefined,
  rawBody: Buffer,
  correlationId: string
): boolean {
  const appSecret = getFacebookWebhookAppSecret();
  if (!appSecret) {
    logger.error(
      { correlationId },
      'FACEBOOK_APP_SECRET not configured - cannot verify Page webhook signature'
    );
    throw new InternalError('Facebook webhook signature verification not configured');
  }
  return verifyHmacSha256Signature(
    signature,
    rawBody,
    appSecret,
    correlationId,
    'facebook'
  );
}

/** True when FACEBOOK_APP_SECRET is set (Page webhook ingress). */
export function isFacebookWebhookSecretConfigured(): boolean {
  return getFacebookWebhookAppSecret() != null;
}

export function getFacebookWebhookSecretLength(): number {
  return getFacebookWebhookAppSecret()?.length ?? 0;
}

/**
 * Verify WhatsApp webhook signature
 *
 * WhatsApp uses the same signature format as Instagram/Facebook (Meta platform).
 * This is an alias for verifyInstagramSignature for clarity.
 *
 * @param signature - Signature from X-Hub-Signature-256 header
 * @param rawBody - Raw request body as Buffer
 * @param correlationId - Request correlation ID for logging
 * @returns true if signature is valid, false otherwise
 */
export function verifyWhatsAppSignature(
  signature: string | undefined,
  rawBody: Buffer,
  correlationId: string
): boolean {
  return verifyInstagramSignature(signature, rawBody, correlationId);
}
