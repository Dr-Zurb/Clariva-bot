/**
 * Instagram DM send with Redis send-lock, reply throttle, and 2018001 recipient fallback (RBH-04).
 * Single implementation for the main conversation path and conflict-recovery path.
 */

import { logger } from '../config/logger';
import { tryAcquireInstagramSendLock, tryAcquireReplyThrottle } from '../config/queue';
import {
  sendInstagramMessage,
  getSenderFromMostRecentConversation,
} from '../services/instagram-service';
import { recordInstagramLastDmSuccess } from '../services/instagram-connect-service';
import { markWebhookProcessed } from '../services/webhook-idempotency-service';
import { logWebhookConflictRecovery, logWebhookDmThrottleSkip } from '../services/webhook-metrics';
import { logAuditEvent } from '../utils/audit-logger';
import { NotFoundError } from '../utils/errors';
import type { WebhookProvider } from '../types/webhook';

export type WebhookDmSendPathContext = 'default' | 'conflict_recovery';

export type SendInstagramDmWithLocksResult =
  | { status: 'sent'; usedRecipientFallback: boolean }
  | { status: 'throttle_skipped'; reason: 'send_lock' | 'reply_throttle' };

export interface SendInstagramDmWithLocksParams {
  pageId: string | undefined;
  senderId: string;
  replyText: string;
  doctorToken: string;
  /** RBH-10: when set, best-effort update last DM success timestamp */
  doctorId?: string;
  correlationId: string;
  eventId: string;
  provider: WebhookProvider;
  webhookEntryId: string | undefined;
  doctorPageId: string | null;
  pageIds: string[];
  context: WebhookDmSendPathContext;
}

/**
 * Acquire per-event send lock and reply throttle (when pageId is set), send DM, and on NotFound
 * with page mismatch retry using conversation-API recipient id. Marks webhook processed and
 * audit on throttle skip; caller handles success metrics.
 */
export async function sendInstagramDmWithLocksAndFallback(
  params: SendInstagramDmWithLocksParams
): Promise<SendInstagramDmWithLocksResult> {
  const {
    pageId,
    senderId,
    replyText,
    doctorToken,
    doctorId,
    correlationId,
    eventId,
    provider,
    webhookEntryId,
    doctorPageId,
    pageIds,
    context,
  } = params;

  const isRecovery = context === 'conflict_recovery';

  if (pageId) {
    const sendLockAcquired = await tryAcquireInstagramSendLock(pageId, senderId, eventId);
    if (!sendLockAcquired) {
      if (isRecovery) {
        logger.info(
          { correlationId, eventId, provider },
          'Conflict recovery: skipping send (already replied to this message)'
        );
        logWebhookDmThrottleSkip({ correlationId, eventId, reason: 'send_lock' });
        logWebhookConflictRecovery({
          correlationId,
          eventId,
          outcome: 'send_skipped_throttle',
        });
      } else {
        logger.info(
          { correlationId, eventId, provider },
          'Skipping send: already replied to this message (send throttle)'
        );
        logWebhookDmThrottleSkip({ correlationId, eventId, reason: 'send_lock' });
      }
      await markWebhookProcessed(eventId, provider);
      await logAuditEvent({
        correlationId,
        userId: undefined,
        action: 'webhook_processed',
        resourceType: 'webhook',
        status: 'success',
        metadata: {
          event_id: eventId,
          provider,
          recipient_id: senderId,
          ...(isRecovery ? { recovered: true } : {}),
          skipped_send_throttle: true,
        },
      });
      return { status: 'throttle_skipped', reason: 'send_lock' };
    }

    const replyThrottleAcquired = await tryAcquireReplyThrottle(pageId, senderId);
    if (!replyThrottleAcquired) {
      if (isRecovery) {
        logger.info(
          { correlationId, eventId, provider },
          'Conflict recovery: skipping send (reply throttle)'
        );
        logWebhookDmThrottleSkip({ correlationId, eventId, reason: 'reply_throttle' });
        logWebhookConflictRecovery({
          correlationId,
          eventId,
          outcome: 'send_skipped_throttle',
        });
      } else {
        logger.info(
          { correlationId, eventId, provider },
          'Skipping send: reply throttle (already sent to this user recently)'
        );
        logWebhookDmThrottleSkip({ correlationId, eventId, reason: 'reply_throttle' });
      }
      await markWebhookProcessed(eventId, provider);
      await logAuditEvent({
        correlationId,
        userId: undefined,
        action: 'webhook_processed',
        resourceType: 'webhook',
        status: 'success',
        metadata: {
          event_id: eventId,
          provider,
          recipient_id: senderId,
          ...(isRecovery ? { recovered: true } : {}),
          skipped_reply_throttle: true,
        },
      });
      return { status: 'throttle_skipped', reason: 'reply_throttle' };
    }
  }

  if (webhookEntryId && doctorPageId && webhookEntryId !== doctorPageId) {
    logger.info(
      {
        correlationId,
        webhook_entry_id: webhookEntryId,
        doctor_page_id: doctorPageId,
        recipient_id: senderId,
      },
      'Message webhook: page ID mismatch (diagnostic for 2018001)'
    );
  }

  let sendSucceeded = false;
  let usedRecipientFallback = false;
  try {
    await sendInstagramMessage(senderId, replyText, correlationId, doctorToken);
    sendSucceeded = true;
  } catch (sendErr) {
    if (
      sendErr instanceof NotFoundError &&
      webhookEntryId &&
      doctorPageId &&
      webhookEntryId !== doctorPageId
    ) {
      let fallbackId = await getSenderFromMostRecentConversation(
        doctorToken,
        correlationId,
        webhookEntryId
      );
      if (!fallbackId) {
        fallbackId = await getSenderFromMostRecentConversation(
          doctorToken,
          correlationId,
          doctorPageId
        );
      }
      if (fallbackId && fallbackId !== senderId && !pageIds.includes(fallbackId)) {
        try {
          await sendInstagramMessage(fallbackId, replyText, correlationId, doctorToken);
          logger.info(
            { correlationId, api_resolved_id: fallbackId },
            'DM sent via conversation API fallback (2018001: webhook senderId failed)'
          );
          sendSucceeded = true;
          usedRecipientFallback = true;
        } catch {
          /* fallback send failed */
        }
      }
    }
    if (!sendSucceeded) {
      throw sendErr;
    }
  }

  if (doctorId && sendSucceeded) {
    void recordInstagramLastDmSuccess(doctorId, correlationId);
  }

  return { status: 'sent', usedRecipientFallback };
}
