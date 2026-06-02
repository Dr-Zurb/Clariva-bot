/**
 * Consultation mute-notification service (voice T1.8 / task-voice-A7)
 *
 * Posts a `mute_changed` system row into the companion chat when a
 * participant toggles their local microphone. Both doctor and patient
 * JWTs may call this route — unlike the doctor-only auto-fallback
 * banner service.
 *
 * System rows are written via `emitMuteChanged` → service-role admin
 * client (Migration 063 — frontend direct INSERT is blocked by RLS).
 *
 * @see backend/src/services/consultation-message-service.ts · emitMuteChanged
 * @see frontend/components/consultation/VoiceConsultRoom.tsx
 * @see frontend/components/consultation/VideoRoom.tsx
 */

import jwt from 'jsonwebtoken';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { emitMuteChanged } from './consultation-message-service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTOR_NAME_MAX_LEN = 80;

export interface PostMuteChangedOptions {
  sessionId: string;
  bearerJwt: string;
  body: unknown;
  correlationId: string;
}

export interface PostMuteChangedResult {
  muted: boolean;
  emittedAt: string;
}

interface ResolvedMuteCaller {
  actorRole: 'doctor' | 'patient';
  /** Matches frontend `currentUserId` for self-vs-other copy. */
  actorId: string;
}

function validateBody(raw: unknown): { muted: boolean; actorName?: string } {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const muted = obj.muted;
  if (typeof muted !== 'boolean') {
    throw new ValidationError('Field `muted` is required and must be a boolean');
  }
  let actorName: string | undefined;
  if (obj.actorName !== undefined && obj.actorName !== null) {
    if (typeof obj.actorName !== 'string') {
      throw new ValidationError('Field `actorName` must be a string when provided');
    }
    const trimmed = obj.actorName.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Field `actorName` must not be empty when provided');
    }
    if (trimmed.length > ACTOR_NAME_MAX_LEN) {
      throw new ValidationError(
        `Field \`actorName\` must be at most ${ACTOR_NAME_MAX_LEN} characters`,
      );
    }
    actorName = trimmed;
  }
  return { muted, actorName };
}

async function resolveMuteCaller(
  sessionId: string,
  bearerJwt: string,
): Promise<ResolvedMuteCaller> {
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

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('id, doctor_id, patient_id, appointment_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) {
    throw new InternalError(`Session lookup failed: ${sessionErr.message}`);
  }
  if (!sessionRow) {
    throw new NotFoundError('Consultation session not found');
  }
  const status = (sessionRow as { status?: string }).status;
  if (status !== 'live') {
    throw new ForbiddenError('Mute notifications are only allowed during a live session');
  }

  if (consultRole === 'patient') {
    let verified: jwt.JwtPayload;
    try {
      verified = jwt.verify(bearerJwt, secret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
    } catch (err) {
      throw new UnauthorizedError(
        `Invalid patient token: ${err instanceof Error ? err.message : 'verify failed'}`,
      );
    }
    const claimedSessionId = (verified as { session_id?: unknown }).session_id;
    if (typeof claimedSessionId !== 'string' || claimedSessionId !== sessionId) {
      throw new ForbiddenError('Patient token session mismatch');
    }
    const patientId = (sessionRow as { patient_id?: string | null }).patient_id;
    const appointmentId = (sessionRow as { appointment_id?: string }).appointment_id;
    const actorId = patientId ?? appointmentId;
    if (!actorId || !UUID_REGEX.test(actorId)) {
      throw new InternalError('Session is missing a valid patient sender id');
    }
    return { actorRole: 'patient', actorId };
  }

  if (consultRole === 'extra_participant') {
    throw new ForbiddenError('Extra participants cannot post mute notifications');
  }

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
  if ((sessionRow as { doctor_id?: string }).doctor_id !== doctorId) {
    throw new ForbiddenError('Doctor identity mismatch for this session');
  }

  return { actorRole: 'doctor', actorId: doctorId };
}

export async function postMuteChanged(
  options: PostMuteChangedOptions,
): Promise<PostMuteChangedResult> {
  const { sessionId, bearerJwt, body: rawBody, correlationId } = options;

  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId path param must be a UUID');
  }
  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }

  const body = validateBody(rawBody);
  const caller = await resolveMuteCaller(sessionId, bearerJwt);

  const actorName =
    body.actorName ??
    (caller.actorRole === 'doctor' ? 'Doctor' : 'Patient');

  await emitMuteChanged({
    sessionId,
    actorId: caller.actorId,
    actorRole: caller.actorRole,
    actorName,
    muted: body.muted,
    correlationId,
  });

  logger.info(
    {
      correlationId,
      sessionId,
      actorRole: caller.actorRole,
      muted: body.muted,
    },
    'postMuteChanged: mute_changed banner emitted',
  );

  return {
    muted: body.muted,
    emittedAt: new Date().toISOString(),
  };
}
