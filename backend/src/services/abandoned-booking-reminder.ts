/**
 * Abandoned booking reminder: sends a one-time DM ~1 hour after booking link
 * was sent when the patient hasn't completed payment. Cron-driven.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { getInstagramAccessTokenForDoctor } from './instagram-connect-service';
import { sendInstagramMessage } from './instagram-service';
import type { ConversationState } from '../types/conversation';

const REMINDER_DELAY_MS = 60 * 60_000; // 1 hour

export interface AbandonedBookingReminderResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runAbandonedBookingReminderJob(
  correlationId: string
): Promise<AbandonedBookingReminderResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { checked: 0, sent: 0, skipped: 0, failed: 0 };

  // Find conversations where bookingLinkSentAt is set and old enough.
  // metadata->>step = 'awaiting_slot_selection' ensures the patient hasn't moved on.
  const cutoff = new Date(Date.now() - REMINDER_DELAY_MS).toISOString();
  const { data: rows, error } = await admin
    .from('conversations')
    .select('id, doctor_id, platform, platform_conversation_id, metadata')
    .eq('platform', 'instagram')
    .eq('status', 'active')
    .limit(50);

  if (error || !rows?.length) {
    if (error) logger.warn({ correlationId, err: error }, 'Abandoned booking reminder query failed');
    return { checked: 0, sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let checked = 0;

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as ConversationState;
    if (meta.step !== 'awaiting_slot_selection') continue;
    if (!meta.bookingLinkSentAt) continue;
    if (meta.bookingReminderSent === true) continue;
    if (new Date(meta.bookingLinkSentAt) > new Date(cutoff)) continue;

    checked++;
    const token = await getInstagramAccessTokenForDoctor(row.doctor_id, correlationId);
    if (!token) { skipped++; continue; }

    try {
      const msg = "Just checking in — your booking link is still active if you'd like to complete it. Reply anytime if you need help.";
      await sendInstagramMessage(row.platform_conversation_id, msg, correlationId, token);

      // Mark reminder sent in metadata.
      const updatedMeta: ConversationState = { ...meta, bookingReminderSent: true };
      await admin
        .from('conversations')
        .update({ metadata: updatedMeta as unknown as Record<string, unknown> })
        .eq('id', row.id);

      sent++;
    } catch (e) {
      logger.warn({ err: e, correlationId, conversationId: row.id }, 'Abandoned booking reminder DM failed');
      failed++;
    }
  }

  return { checked, sent, skipped, failed };
}
