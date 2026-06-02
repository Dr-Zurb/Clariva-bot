/**
 * Web Push notification fan-out (task-text-D6a).
 *
 * Sends push payloads to all active browser subscriptions for a user.
 * Used by text consult (D6b/D6c) and voice/video remote-join flows.
 *
 * PHI hygiene: never log payload.body — only aggregate delivery counts.
 *
 * @see docs/Reference/engineering/operations/web-push/web-push-vapid-provisioning.md
 */

import webpush from 'web-push';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';

// ============================================================================
// Types
// ============================================================================

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface SendPushOptions {
  userId: string;
  payload: PushPayload;
  /**
   * If true, no-op when the subscription doesn't exist. Default true; the service
   * logs but doesn't throw on "user has no subscription" — it's a normal case.
   */
  silentMissingSubscription?: boolean;
  /** Optional telemetry dimensions (task-text-D6c). Never log payload.body. */
  sessionId?: string;
  modality?: PushModality;
}

export interface PushDeliveryCounts {
  delivered: number;
  failed: number;
  revoked: number;
}

export type PushModality = 'text' | 'voice' | 'video';

export interface PushTelemetryContext {
  userId: string;
  sessionId?: string;
  modality?: PushModality;
}

interface WebPushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

// ============================================================================
// VAPID setup
// ============================================================================

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const contact = env.WEB_PUSH_CONTACT_EMAIL?.trim();

  if (!publicKey || !privateKey || !contact) {
    return false;
  }

  webpush.setVapidDetails(contact, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** Test hook — reset VAPID memoization between jest cases. */
export function resetPushVapidConfigForTests(): void {
  vapidConfigured = false;
}

function isRevokedStatusCode(statusCode: number | undefined): boolean {
  return statusCode === 410 || statusCode === 404;
}

/** Cross-modality OS notification tag — `${sessionId}:${modality}` (task-text-D6c). */
export function buildPushNotificationTag(sessionId: string, modality: PushModality): string {
  return `${sessionId}:${modality}`;
}

function logPushTelemetry(context: PushTelemetryContext, counts: PushDeliveryCounts): void {
  logger.info(
    {
      timestamp: new Date().toISOString(),
      user_id: context.userId,
      session_id: context.sessionId,
      modality: context.modality,
      delivered: counts.delivered,
      failed: counts.failed,
      revoked: counts.revoked,
    },
    'Web Push send telemetry',
  );
}

// ============================================================================
// sendPushToUser
// ============================================================================

export async function sendPushToUser(opts: SendPushOptions): Promise<PushDeliveryCounts> {
  const { userId, payload, silentMissingSubscription = true, sessionId, modality } = opts;
  const counts: PushDeliveryCounts = { delivered: 0, failed: 0, revoked: 0 };

  if (!ensureVapidConfigured()) {
    logger.warn({ user_id: userId }, 'Web Push skipped — VAPID env vars not configured');
    return counts;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error({ user_id: userId }, 'Web Push skipped — Supabase admin client unavailable');
    return counts;
  }

  const { data: rows, error } = await admin
    .from('web_push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) {
    logger.error({ user_id: userId, err: error.message }, 'Web Push subscription load failed');
    return counts;
  }

  const subscriptions = (rows ?? []) as WebPushSubscriptionRow[];

  if (subscriptions.length === 0) {
    if (!silentMissingSubscription) {
      logger.info({ user_id: userId }, 'Web Push — no active subscriptions for user');
    }
    return counts;
  }

  const payloadJson = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        },
        payloadJson,
      );

      const { error: touchErr } = await admin
        .from('web_push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id);

      if (touchErr) {
        logger.warn(
          { user_id: userId, subscription_id: sub.id, err: touchErr.message },
          'Web Push delivered but last_used_at update failed',
        );
      }

      counts.delivered += 1;
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;

      if (isRevokedStatusCode(statusCode)) {
        const { error: revokeErr } = await admin
          .from('web_push_subscriptions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', sub.id);

        if (revokeErr) {
          logger.warn(
            { user_id: userId, subscription_id: sub.id, err: revokeErr.message },
            'Web Push subscription revoke update failed',
          );
        }

        counts.revoked += 1;
      } else {
        logger.warn(
          { user_id: userId, subscription_id: sub.id, status_code: statusCode },
          'Web Push delivery failed',
        );
        counts.failed += 1;
      }
    }
  }

  logger.info(
    {
      user_id: userId,
      delivered: counts.delivered,
      failed: counts.failed,
      revoked: counts.revoked,
    },
    'Web Push fan-out complete',
  );

  logPushTelemetry({ userId, sessionId, modality }, counts);

  return counts;
}

// ============================================================================
// sendPushToSession
// ============================================================================

export async function sendPushToSession(opts: {
  sessionId: string;
  senderRole: 'doctor' | 'patient';
  payload: PushPayload;
  modality?: PushModality;
}): Promise<PushDeliveryCounts> {
  const { sessionId, senderRole, modality = 'text' } = opts;
  const payload: PushPayload = {
    ...opts.payload,
    tag: opts.payload.tag ?? buildPushNotificationTag(sessionId, modality),
  };
  const totals: PushDeliveryCounts = { delivered: 0, failed: 0, revoked: 0 };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error({ session_id: sessionId }, 'Web Push session fan-out skipped — admin unavailable');
    return totals;
  }

  const { data: session, error } = await admin
    .from('consultation_sessions')
    .select('doctor_id, patient_id')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    logger.warn({ session_id: sessionId, err: error?.message }, 'Web Push session lookup failed');
    return totals;
  }

  const recipientId =
    senderRole === 'doctor' ? session.patient_id : session.doctor_id;

  if (!recipientId) {
    logger.info(
      { session_id: sessionId, sender_role: senderRole },
      'Web Push session fan-out skipped — recipient id missing',
    );
    return totals;
  }

  const result = await sendPushToUser({
    userId: recipientId,
    payload,
    sessionId,
    modality,
  });
  totals.delivered += result.delivered;
  totals.failed += result.failed;
  totals.revoked += result.revoked;

  return totals;
}
