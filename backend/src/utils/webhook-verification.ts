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
 * @throws InternalError if INSTAGRAM_APP_SECRET is not configured
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
  // 1. Check if signature header exists
  if (!signature) {
    logger.warn(
      { correlationId, header: 'X-Hub-Signature-256' },
      'Missing webhook signature header'
    );
    return false;
  }

  // 2. Validate signature format (must start with "sha256=")
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    logger.warn(
      { correlationId, signatureFormat: signature.substring(0, 20) + '...' },
      'Invalid webhook signature format'
    );
    return false;
  }

  // 3. Extract hash from signature (remove "sha256=" prefix)
  const receivedHash = signature.substring(SIGNATURE_PREFIX.length);

  // 4. Check if app secret is configured
  if (!env.INSTAGRAM_APP_SECRET) {
    logger.error(
      { correlationId },
      'INSTAGRAM_APP_SECRET not configured - cannot verify signature'
    );
    throw new InternalError('Webhook signature verification not configured');
  }

  try {
    // 5. Compute HMAC-SHA256 hash of raw body
    const computedHash = createHmac(ALGORITHM, env.INSTAGRAM_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    // 6. Compare hashes using constant-time comparison (prevents timing attacks)
    const isValid = timingSafeEqual(
      Buffer.from(receivedHash, 'hex'),
      Buffer.from(computedHash, 'hex')
    );

    if (!isValid) {
      logger.warn(
        { correlationId },
        'Webhook signature verification failed'
      );
    }

    return isValid;
  } catch (error) {
    // Handle errors during hash computation or comparison
    logger.error(
      { error, correlationId },
      'Error during webhook signature verification'
    );
    return false;
  }
}

/**
 * Verify Facebook webhook signature
 *
 * Facebook uses the same signature format as Instagram (Meta platform).
 * This is an alias for verifyInstagramSignature for clarity.
 *
 * @param signature - Signature from X-Hub-Signature-256 header
 * @param rawBody - Raw request body as Buffer
 * @param correlationId - Request correlation ID for logging
 * @returns true if signature is valid, false otherwise
 */
export function verifyFacebookSignature(
  signature: string | undefined,
  rawBody: Buffer,
  correlationId: string
): boolean {
  return verifyInstagramSignature(signature, rawBody, correlationId);
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
