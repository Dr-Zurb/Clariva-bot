/**
 * Consultation Token Utility (e-task-3)
 *
 * Signed token for patient join link. Payload: { appointmentId, exp, role: 'patient' }.
 * Token is passed in URL; no PHI. Verify before granting patient Video access token.
 */

import crypto from 'crypto';
import { env } from '../config/env';
import { UnauthorizedError } from './errors';

const CONSULTATION_TOKEN_EXPIRY_SEC = 24 * 60 * 60; // 24 hours

export interface ConsultationTokenPayload {
  appointmentId: string;
  exp: number;
  role: 'patient';
}

export interface VerifiedConsultationToken {
  appointmentId: string;
}

/**
 * Generate signed consultation token for patient join link.
 *
 * @param appointmentId - Appointment UUID
 * @param options - Optional expiresInSeconds
 * @returns Base64url-encoded token (payload.signature)
 */
export function generateConsultationToken(
  appointmentId: string,
  options?: number | { expiresInSeconds?: number }
): string {
  const secret = env.CONSULTATION_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new UnauthorizedError('CONSULTATION_TOKEN_SECRET must be set and at least 16 characters');
  }
  const expiresInSeconds =
    typeof options === 'number' ? options : options?.expiresInSeconds ?? CONSULTATION_TOKEN_EXPIRY_SEC;
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload: ConsultationTokenPayload = { appointmentId, exp, role: 'patient' };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verify consultation token and return payload.
 *
 * @param token - Token from query param
 * @returns { appointmentId }
 * @throws UnauthorizedError if token invalid or expired
 */
export function verifyConsultationToken(token: string): VerifiedConsultationToken {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('Missing or invalid consultation token');
  }
  const secret = env.CONSULTATION_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new UnauthorizedError('Consultation token verification not configured');
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new UnauthorizedError('Invalid consultation token format');
  }
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sigB64, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new UnauthorizedError('Invalid consultation token (signature mismatch)');
  }
  const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  let payload: ConsultationTokenPayload;
  try {
    payload = JSON.parse(payloadStr) as ConsultationTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid consultation token (malformed payload)');
  }
  if (!payload.appointmentId || payload.role !== 'patient' || typeof payload.exp !== 'number') {
    throw new UnauthorizedError('Invalid consultation token (missing fields)');
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new UnauthorizedError('Consultation token has expired');
  }
  return { appointmentId: payload.appointmentId };
}

/**
 * Verify consultation token signature but allow expired `exp` (read-only session snapshot / polling).
 * Same secret and payload shape as {@link verifyConsultationToken}.
 */
export function verifyConsultationTokenAllowExpired(token: string): VerifiedConsultationToken {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('Missing or invalid consultation token');
  }
  const secret = env.CONSULTATION_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new UnauthorizedError('Consultation token verification not configured');
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new UnauthorizedError('Invalid consultation token format');
  }
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sigB64, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new UnauthorizedError('Invalid consultation token (signature mismatch)');
  }
  const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
  let payload: ConsultationTokenPayload;
  try {
    payload = JSON.parse(payloadStr) as ConsultationTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid consultation token (malformed payload)');
  }
  if (!payload.appointmentId || payload.role !== 'patient' || typeof payload.exp !== 'number') {
    throw new UnauthorizedError('Invalid consultation token (missing fields)');
  }
  return { appointmentId: payload.appointmentId };
}
