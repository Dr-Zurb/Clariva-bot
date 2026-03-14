/**
 * Booking Token Utility (e-task-3)
 *
 * Signed token for external slot picker link. Payload: { conversationId, doctorId, exp }.
 * Token is passed in URL; no PHI. Verify before any slot selection API call.
 */

import crypto from 'crypto';
import { env } from '../config/env';
import { UnauthorizedError } from './errors';

const BOOKING_TOKEN_EXPIRY_SEC = 3600; // 1 hour

export interface BookingTokenPayload {
  conversationId: string;
  doctorId: string;
  exp: number;
}

/**
 * Generate signed booking token for slot picker link.
 *
 * @param conversationId - Conversation UUID
 * @param doctorId - Doctor UUID
 * @param expiresInSeconds - Optional; default 1 hour
 * @returns Base64url-encoded token (payload.signature)
 */
export function generateBookingToken(
  conversationId: string,
  doctorId: string,
  expiresInSeconds: number = BOOKING_TOKEN_EXPIRY_SEC
): string {
  const secret = env.BOOKING_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new UnauthorizedError('BOOKING_TOKEN_SECRET must be set and at least 16 characters');
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload: BookingTokenPayload = { conversationId, doctorId, exp };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verify booking token and return payload.
 *
 * @param token - Token from query param
 * @returns { conversationId, doctorId }
 * @throws UnauthorizedError if token invalid or expired
 */
export function verifyBookingToken(token: string): { conversationId: string; doctorId: string } {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('Missing or invalid booking token');
  }
  const secret = env.BOOKING_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new UnauthorizedError('Booking token verification not configured');
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new UnauthorizedError('Invalid booking token format');
  }
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sigB64, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new UnauthorizedError('Invalid booking token (signature mismatch)');
  }
  const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  let payload: BookingTokenPayload;
  try {
    payload = JSON.parse(payloadStr) as BookingTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid booking token (malformed payload)');
  }
  if (!payload.conversationId || !payload.doctorId || typeof payload.exp !== 'number') {
    throw new UnauthorizedError('Invalid booking token (missing fields)');
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new UnauthorizedError('Booking token has expired');
  }
  return { conversationId: payload.conversationId, doctorId: payload.doctorId };
}

/**
 * Verify booking token and return payload, allowing expired tokens.
 * Used for redirect-url (success page) so user can still redirect after payment.
 *
 * @param token - Token from query param
 * @returns { conversationId, doctorId }
 * @throws UnauthorizedError if token invalid (signature mismatch)
 */
export function verifyBookingTokenAllowExpired(
  token: string
): { conversationId: string; doctorId: string } {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('Missing or invalid booking token');
  }
  const secret = env.BOOKING_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new UnauthorizedError('Booking token verification not configured');
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new UnauthorizedError('Invalid booking token format');
  }
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sigB64, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new UnauthorizedError('Invalid booking token (signature mismatch)');
  }
  const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  let payload: BookingTokenPayload;
  try {
    payload = JSON.parse(payloadStr) as BookingTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid booking token (malformed payload)');
  }
  if (!payload.conversationId || !payload.doctorId || typeof payload.exp !== 'number') {
    throw new UnauthorizedError('Invalid booking token (missing fields)');
  }
  return { conversationId: payload.conversationId, doctorId: payload.doctorId };
}
