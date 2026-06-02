/**
 * Realtime chat-message INSERT → Web Push fan-out (task-text-D6b).
 *
 * Subscribes to consultation_messages INSERT via Supabase Realtime
 * (service-role client). Active-tab suppression runs in the SW (D6c).
 *
 * Scaling note: every horizontally scaled backend instance would
 * subscribe and fire duplicate pushes until a leader-election layer
 * ships — documented for D6c follow-up.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { sendPushToSession } from './push-notification-service';

const CHANNEL_NAME = 'chat-push-listener';
const PUSH_BODY_MAX_LEN = 80;

interface ConsultationMessageRow {
  session_id: string;
  sender_role: string;
  body: string | null;
  kind: string;
}

let channel: RealtimeChannel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function redactBodyForPush(body: string | null | undefined): string {
  const trimmed = (body ?? '').trim();
  if (!trimmed) return 'New message';
  if (trimmed.length <= PUSH_BODY_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, PUSH_BODY_MAX_LEN - 1)}…`;
}

export function senderDisplayName(
  senderRole: 'doctor' | 'patient',
  sessionDoctorName?: string,
): string {
  if (senderRole === 'doctor') {
    return sessionDoctorName ? `${sessionDoctorName} sent a message` : 'Your doctor sent a message';
  }
  return 'Your patient sent a message';
}

async function resolveDoctorDisplayName(doctorId: string): Promise<string | undefined> {
  const admin = getSupabaseAdminClient();
  if (!admin) return undefined;

  try {
    const { data, error } = await admin.auth.admin.getUserById(doctorId);
    if (error || !data?.user) return undefined;

    const meta = data.user.user_metadata as Record<string, unknown> | undefined;
    const fullName =
      typeof meta?.full_name === 'string'
        ? meta.full_name.trim()
        : typeof meta?.name === 'string'
          ? meta.name.trim()
          : '';

    if (fullName) return fullName;

    const email = data.user.email?.trim();
    if (email) {
      const local = email.split('@')[0];
      return local || undefined;
    }
  } catch {
    // Non-fatal — fall back to generic title.
  }

  return undefined;
}

async function handleMessageInsert(row: ConsultationMessageRow): Promise<void> {
  if (row.kind === 'system' || row.sender_role === 'system') return;
  if (row.sender_role !== 'doctor' && row.sender_role !== 'patient') return;

  const sessionId = row.session_id;
  const senderRole = row.sender_role;

  let sessionDoctorName: string | undefined;
  if (senderRole === 'doctor') {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { data: session } = await admin
        .from('consultation_sessions')
        .select('doctor_id')
        .eq('id', sessionId)
        .maybeSingle();
      const doctorId = (session as { doctor_id?: string } | null)?.doctor_id;
      if (doctorId) {
        sessionDoctorName = await resolveDoctorDisplayName(doctorId);
      }
    }
  }

  const pushBody = redactBodyForPush(row.body);

  const counts = await sendPushToSession({
    sessionId,
    senderRole,
    modality: 'text',
    payload: {
      title: senderDisplayName(senderRole, sessionDoctorName),
      body: pushBody,
      data: { sessionId, deeplink: `/c/text/${sessionId}`, modality: 'text' },
    },
  });

  logger.info(
    {
      session_id: sessionId,
      sender_role: senderRole,
      delivered: counts.delivered,
      failed: counts.failed,
      revoked: counts.revoked,
    },
    'Chat push listener fan-out',
  );
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    logger.warn('Chat push listener reconnecting Realtime channel');
    stopChatPushListener();
    startChatPushListener();
  }, 5_000);
}

export function startChatPushListener(): void {
  if (channel) return;

  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const contact = env.WEB_PUSH_CONTACT_EMAIL?.trim();

  if (!publicKey || !privateKey || !contact) {
    logger.warn('Chat push listener skipped — WEB_PUSH_VAPID_* env vars not configured');
    return;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error('Chat push listener skipped — Supabase admin client unavailable');
    return;
  }

  channel = admin
    .channel(CHANNEL_NAME)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'consultation_messages' },
      (payload) => {
        const row = payload.new as ConsultationMessageRow;
        void handleMessageInsert(row).catch((err: unknown) => {
          logger.error(
            {
              session_id: row.session_id,
              err: err instanceof Error ? err.message : String(err),
            },
            'Chat push listener handler failed',
          );
        });
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        logger.info('Chat push listener Realtime channel subscribed');
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        logger.warn({ status }, 'Chat push listener Realtime channel disconnected');
        scheduleReconnect();
      }
    });
}

export function stopChatPushListener(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (!channel) return;

  const admin = getSupabaseAdminClient();
  if (admin) {
    void admin.removeChannel(channel);
  }
  channel = null;
}

/** Test hook — reset module state between jest cases. */
export function resetChatPushListenerForTests(): void {
  stopChatPushListener();
}
