/**
 * History-form token (clk-10, HL-DL-4, HL-DL-5).
 *
 * token = base64url(payload).hmac
 * payload = { appointmentId, exp, kind: 'history-form' }
 *
 * Not a booking token and not a join token. The payload has no name,
 * phone, age, or clinical text. Do not log the token.
 */

import crypto from 'crypto';
import { env } from '../config/env';
import { UnauthorizedError, ValidationError } from './errors';

const KIND = 'history-form' as const;
const TWO_HOURS_SEC = 2 * 60 * 60;

export type HistoryFormKind = typeof KIND;

export interface HistoryFormAppointment {
  id: string;
  status: string;
  /** Scheduled end. Null for a walk-in: the token then lasts 2 hours from mint. */
  scheduledEnd: Date | string | null;
}

export type HistoryFormDenyReason =
  | 'missing_token'
  | 'missing_secret'
  | 'malformed'
  | 'invalid_signature'
  | 'wrong_kind'
  | 'wrong_appointment'
  | 'expired'
  | 'visit_closed';

export type HistoryFormVerifyResult =
  | { ok: true; appointmentId: string }
  | { ok: false; reason: HistoryFormDenyReason };

interface HistoryFormPayload {
  appointmentId: string;
  exp: number;
  kind: HistoryFormKind;
}

function secretOrThrow(): string {
  const secret = env.BOOKING_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new UnauthorizedError('BOOKING_TOKEN_SECRET must be set and at least 16 characters');
  }
  return secret;
}

function isClosed(status: string): boolean {
  return status === 'cancelled' || status === 'no_show';
}

/** Unix seconds. Booked visits end 2 hours after the scheduled end. */
export function historyFormExpiresAt(appointment: HistoryFormAppointment, now: Date = new Date()): number {
  if (appointment.scheduledEnd) {
    const endMs = new Date(appointment.scheduledEnd).getTime();
    if (Number.isNaN(endMs)) {
      throw new ValidationError('This visit has no end time');
    }
    return Math.floor(endMs / 1000) + TWO_HOURS_SEC;
  }
  return Math.floor(now.getTime() / 1000) + TWO_HOURS_SEC;
}

/**
 * Expired and closed visits are 410, the same not-available result as a share link.
 * A bad or wrong-kind token is 401.
 */
export function historyFormDenyStatus(reason: HistoryFormDenyReason): 401 | 410 {
  if (reason === 'expired' || reason === 'visit_closed') return 410;
  return 401;
}

export function mintHistoryFormToken(appointment: HistoryFormAppointment, now: Date = new Date()): string {
  if (!appointment.id || typeof appointment.id !== 'string') {
    throw new ValidationError('Appointment is required');
  }
  if (isClosed(appointment.status)) {
    throw new ValidationError('This visit is not available for prep');
  }
  const secret = secretOrThrow();
  const payload: HistoryFormPayload = {
    appointmentId: appointment.id,
    exp: historyFormExpiresAt(appointment, now),
    kind: KIND,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

type ParsedHistoryForm =
  | { ok: true; payload: HistoryFormPayload }
  | { ok: false; reason: HistoryFormDenyReason };

function parseHistoryFormToken(token: string | undefined | null): ParsedHistoryForm {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing_token' };
  }
  let secret: string;
  try {
    secret = secretOrThrow();
  } catch {
    return { ok: false, reason: 'missing_secret' };
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigB64, 'base64url');
    expectedBuf = Buffer.from(expectedSig, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload: HistoryFormPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as HistoryFormPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.kind !== KIND || typeof payload.appointmentId !== 'string' || !payload.appointmentId) {
    return { ok: false, reason: 'wrong_kind' };
  }
  return { ok: true, payload };
}

/** Signature and kind only. The caller loads the visit, then calls verify. */
export function readHistoryFormAppointmentId(
  token: string | undefined | null
): { ok: true; appointmentId: string } | { ok: false; reason: HistoryFormDenyReason } {
  const parsed = parseHistoryFormToken(token);
  if (!parsed.ok) return parsed;
  return { ok: true, appointmentId: parsed.payload.appointmentId };
}

export function verifyHistoryFormToken(
  token: string | undefined | null,
  appointment: HistoryFormAppointment,
  now: Date = new Date()
): HistoryFormVerifyResult {
  const parsed = parseHistoryFormToken(token);
  if (!parsed.ok) return parsed;
  const payload = parsed.payload;
  if (payload.appointmentId !== appointment.id) {
    return { ok: false, reason: 'wrong_appointment' };
  }
  if (isClosed(appointment.status)) {
    return { ok: false, reason: 'visit_closed' };
  }
  const nowSec = Math.floor(now.getTime() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    return { ok: false, reason: 'expired' };
  }
  if (appointment.scheduledEnd) {
    const windowEnd = historyFormExpiresAt(appointment, now);
    if (nowSec > windowEnd) {
      return { ok: false, reason: 'expired' };
    }
  }
  return { ok: true, appointmentId: payload.appointmentId };
}
