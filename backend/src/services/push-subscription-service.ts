/**
 * Push subscription CRUD (task-text-D6b).
 *
 * Resolves doctor Supabase JWT or patient scoped companion JWT to a
 * principal user_id + user_role for web_push_subscriptions rows.
 */

import jwt from 'jsonwebtoken';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import type {
  PushSubscribeBody,
  PushSubscriptionParams,
} from '../utils/validation';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PushAuthPrincipal {
  userId: string;
  userRole: 'doctor' | 'patient';
}

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function resolvePushAuthFromBearer(bearerJwt: string): Promise<PushAuthPrincipal> {
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

    const sessionId = (verified as { session_id?: unknown }).session_id;
    if (typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
      throw new ForbiddenError('Patient token missing session_id claim');
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
    const userId = row.patient_id ?? row.appointment_id;
    if (!userId || !UUID_REGEX.test(userId)) {
      throw new InternalError('Could not resolve patient user_id for push subscription');
    }

    return { userId, userRole: 'patient' };
  }

  if (consultRole === 'extra_participant') {
    throw new ForbiddenError('Extra participants cannot manage push subscriptions');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data: userData, error: userErr } = await admin.auth.getUser(bearerJwt);
  if (userErr || !userData?.user?.id) {
    throw new UnauthorizedError(
      `Invalid doctor token: ${userErr?.message ?? 'auth.getUser returned no user'}`,
    );
  }

  const userId = userData.user.id;
  if (!UUID_REGEX.test(userId)) {
    throw new UnauthorizedError('Token user id is not a valid UUID');
  }

  return { userId, userRole: 'doctor' };
}

export async function upsertPushSubscription(
  principal: PushAuthPrincipal,
  body: PushSubscribeBody,
): Promise<{ id: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data, error } = await admin
    .from('web_push_subscriptions')
    .upsert(
      {
        user_id: principal.userId,
        user_role: principal.userRole,
        endpoint: body.endpoint,
        p256dh_key: body.p256dhKey,
        auth_key: body.authKey,
        user_agent: body.userAgent ?? null,
        revoked_at: null,
      },
      { onConflict: 'user_id,endpoint' },
    )
    .select('id')
    .single();

  if (error || !data) {
    throw new InternalError(`Push subscription upsert failed: ${error?.message ?? 'no row'}`);
  }

  return { id: (data as { id: string }).id };
}

export async function revokePushSubscription(
  principal: PushAuthPrincipal,
  params: PushSubscriptionParams,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data: row, error: fetchErr } = await admin
    .from('web_push_subscriptions')
    .select('id, user_id')
    .eq('id', params.id)
    .maybeSingle();

  if (fetchErr) {
    throw new InternalError(`Push subscription lookup failed: ${fetchErr.message}`);
  }
  if (!row) {
    throw new NotFoundError('Push subscription not found');
  }
  if ((row as { user_id: string }).user_id !== principal.userId) {
    throw new ForbiddenError('Push subscription does not belong to this user');
  }

  const { error: updateErr } = await admin
    .from('web_push_subscriptions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id);

  if (updateErr) {
    throw new InternalError(`Push subscription revoke failed: ${updateErr.message}`);
  }
}

export async function listActivePushSubscriptions(
  principal: PushAuthPrincipal,
): Promise<PushSubscriptionRecord[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data, error } = await admin
    .from('web_push_subscriptions')
    .select('id, endpoint, user_agent, created_at, last_used_at')
    .eq('user_id', principal.userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new InternalError(`Push subscription list failed: ${error.message}`);
  }

  return (data ?? []) as PushSubscriptionRecord[];
}

export function extractBearerJwt(authHeader: string | undefined): string {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new UnauthorizedError('Bearer token is required');
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new ValidationError('Bearer token is empty');
  }
  return token;
}
