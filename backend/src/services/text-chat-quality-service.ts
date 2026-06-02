/**
 * Text Chat Quality Service (Sub-batch D · task-text-D4)
 *
 * Ingests 30s chat QoS samples from `useChatQualitySampler` into
 * `text_chat_quality` (Migration 108). Auth mirrors video/voice QoS:
 * doctor Supabase JWT OR patient companion JWT; INSERT via admin client.
 *
 * Rate limit: 1 sample per 25s per (session_id, sender_id). In-memory
 * map — valid for single-instance v1; move to Redis when horizontally
 * scaled.
 *
 * @see backend/migrations/108_text_chat_quality.sql
 */

import jwt from 'jsonwebtoken';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';

const RATE_LIMIT_MS = 25_000;
const RTT_MAX_MS = 60_000;
const COUNTER_MAX = 10_000;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SenderRole = 'doctor' | 'patient';

/** In-memory rate-limit ledger (sessionId + senderId → last accept ms). */
const lastSampleAtByKey = new Map<string, number>();

export interface TextChatQualitySampleBody {
  session_id: string;
  roundtrip_p95_ms?: number | null;
  realtime_reconnects: number;
  presence_flaps: number;
  messages_in_window: number;
}

export interface IngestTextChatQualityOptions {
  pathSessionId: string;
  bearerJwt: string;
  body: unknown;
  correlationId: string;
}

interface ResolvedSender {
  senderId: string;
  senderRole: SenderRole;
}

function rateLimitKey(sessionId: string, senderId: string): string {
  return `${sessionId}:${senderId}`;
}

/** Exported for unit tests — clears the in-memory ledger. */
export function resetTextChatQualityRateLimitForTests(): void {
  lastSampleAtByKey.clear();
}

export function checkTextChatQualityRateLimit(
  sessionId: string,
  senderId: string,
  nowMs = Date.now(),
): boolean {
  const key = rateLimitKey(sessionId, senderId);
  const last = lastSampleAtByKey.get(key);
  if (last != null && nowMs - last < RATE_LIMIT_MS) {
    return false;
  }
  lastSampleAtByKey.set(key, nowMs);
  return true;
}

function validateNonNegativeInt(raw: unknown, fieldName: string, max: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new ValidationError(`Field \`${fieldName}\` must be a finite number`);
  }
  const value = Math.trunc(raw);
  if (value < 0 || value > max) {
    throw new ValidationError(`Field \`${fieldName}\` must be in [0, ${max}]`);
  }
  return value;
}

export function validateTextChatQualityBody(
  raw: unknown,
  pathSessionId: string,
): TextChatQualitySampleBody {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const sessionId = typeof obj.session_id === 'string' ? obj.session_id.trim() : '';
  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    throw new ValidationError('Field `session_id` must be a UUID');
  }
  if (sessionId !== pathSessionId) {
    throw new ForbiddenError('Body session_id does not match path session');
  }

  let roundtripP95: number | null = null;
  if (obj.roundtrip_p95_ms != null) {
    roundtripP95 = validateNonNegativeInt(obj.roundtrip_p95_ms, 'roundtrip_p95_ms', RTT_MAX_MS);
  }

  return {
    session_id: sessionId,
    roundtrip_p95_ms: roundtripP95,
    realtime_reconnects: validateNonNegativeInt(
      obj.realtime_reconnects ?? 0,
      'realtime_reconnects',
      COUNTER_MAX,
    ),
    presence_flaps: validateNonNegativeInt(obj.presence_flaps ?? 0, 'presence_flaps', COUNTER_MAX),
    messages_in_window: validateNonNegativeInt(
      obj.messages_in_window ?? 0,
      'messages_in_window',
      COUNTER_MAX,
    ),
  };
}

async function resolveSenderForSession(
  sessionId: string,
  bearerJwt: string,
): Promise<ResolvedSender> {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalError('SUPABASE_JWT_SECRET is not configured');
  }

  const decodedComplete = jwt.decode(bearerJwt, { complete: true });
  if (!decodedComplete || typeof decodedComplete === 'string') {
    throw new UnauthorizedError('Malformed bearer token');
  }
  const payload = decodedComplete.payload as jwt.JwtPayload & {
    consult_role?: string;
    session_id?: string;
  };
  const consultRole =
    typeof payload.consult_role === 'string' ? payload.consult_role : undefined;

  if (consultRole === 'patient') {
    let verified: jwt.JwtPayload;
    try {
      verified = jwt.verify(bearerJwt, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch (err) {
      throw new UnauthorizedError(
        `Invalid patient token: ${err instanceof Error ? err.message : 'verify failed'}`,
      );
    }
    const claimedSessionId = (verified as { session_id?: unknown }).session_id;
    if (typeof claimedSessionId !== 'string' || claimedSessionId !== sessionId) {
      throw new ForbiddenError('Patient token session mismatch');
    }

    const admin = getSupabaseAdminClient();
    if (!admin) throw new InternalError('Admin client unavailable');
    const { data: sessionRow, error: sessionErr } = await admin
      .from('consultation_sessions')
      .select('patient_id, appointment_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionErr) {
      throw new InternalError(`Session lookup failed: ${sessionErr.message}`);
    }
    if (!sessionRow) {
      throw new NotFoundError('Consultation session not found');
    }
    const row = sessionRow as { patient_id?: string | null; appointment_id?: string };
    const senderId = row.patient_id ?? row.appointment_id;
    if (!senderId || !UUID_REGEX.test(senderId)) {
      throw new InternalError('Could not resolve patient sender_id for session');
    }
    return { senderId, senderRole: 'patient' };
  }

  if (consultRole === 'extra_participant') {
    throw new ForbiddenError('Extra participants cannot post chat quality samples');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data: userData, error: userErr } = await admin.auth.getUser(bearerJwt);
  if (userErr || !userData?.user?.id) {
    throw new UnauthorizedError(
      `Invalid doctor token: ${userErr?.message ?? 'auth.getUser returned no user'}`,
    );
  }
  const doctorId = userData.user.id;
  if (!UUID_REGEX.test(doctorId)) {
    throw new UnauthorizedError('Token user id is not a valid UUID');
  }

  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('id, doctor_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) {
    throw new InternalError(`Session lookup failed: ${sessionErr.message}`);
  }
  if (!sessionRow) {
    throw new NotFoundError('Consultation session not found');
  }
  if ((sessionRow as { doctor_id?: string }).doctor_id !== doctorId) {
    throw new ForbiddenError('Doctor identity mismatch for this session');
  }

  return { senderId: doctorId, senderRole: 'doctor' };
}

export async function ingestTextChatQualitySample(
  options: IngestTextChatQualityOptions,
): Promise<void> {
  const { pathSessionId, bearerJwt, body, correlationId } = options;

  if (!UUID_REGEX.test(pathSessionId)) {
    throw new ValidationError('sessionId path param must be a UUID');
  }

  const sample = validateTextChatQualityBody(body, pathSessionId);
  const sender = await resolveSenderForSession(pathSessionId, bearerJwt);

  if (!checkTextChatQualityRateLimit(pathSessionId, sender.senderId)) {
    throw new TooManyRequestsError(
      'Chat quality samples are limited to one per 25 seconds per participant',
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { error: insertErr } = await admin.from('text_chat_quality').insert({
    session_id: pathSessionId,
    sender_id: sender.senderId,
    sender_role: sender.senderRole,
    sample_at: new Date().toISOString(),
    roundtrip_p95_ms: sample.roundtrip_p95_ms,
    realtime_reconnects: sample.realtime_reconnects,
    presence_flaps: sample.presence_flaps,
    messages_in_window: sample.messages_in_window,
  });

  if (insertErr) {
    logger.warn(
      {
        correlationId,
        sessionId: pathSessionId,
        senderRole: sender.senderRole,
        errCode: insertErr.code,
        errMessage: insertErr.message,
      },
      'text_chat_quality insert failed',
    );
    throw new InternalError(`text_chat_quality insert failed: ${insertErr.message}`);
  }
}
