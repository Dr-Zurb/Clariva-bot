/**
 * Instagram DM webhook handler (RBH-05) — thin glue after rcp-12.
 * parseInbound → runConversationTurn → adapter.send
 */

import { logger } from '../config/logger';
import { logAuditEvent } from '../utils/audit-logger';
import { markWebhookProcessed, markWebhookFailed } from '../services/webhook-idempotency-service';
import { sendInstagramMessage } from '../services/instagram-service';
import { ConflictError } from '../utils/errors';
import {
  findConversationByPlatformId,
  getConversationState,
} from '../services/conversation-service';
import { instagramChannelAdapter } from './channels/instagram';
import type { ParseInboundSkip } from './channels/types';
import { tryAcquireConversationLock, releaseConversationLock, tryAcquireThrottleAck } from '../config/queue';
import { DEFAULT_RECEPTIONIST_PAUSE_MESSAGE } from './dm/control-gates';
import {
  FALLBACK_REPLY,
  runConversationTurn,
} from './dm/run-conversation-turn';
import {
  classifyInstagramDmFailureReason,
  logWebhookConflictRecovery,
  logWebhookInstagramDmDelivery,
  logWebhookInstagramDmPipelineTiming,
} from '../services/webhook-metrics';
import type { InstagramWebhookPayload, WebhookProvider } from '../types/webhook';
import { buildNonTextAckMessage } from '../utils/dm-copy';

/** @deprecated Import from `./dm/control-gates` — kept for existing test imports. */
export const DEFAULT_INSTAGRAM_RECEPTIONIST_PAUSE_MESSAGE = DEFAULT_RECEPTIONIST_PAUSE_MESSAGE;

async function handleParseInboundSkip(
  skip: ParseInboundSkip,
  params: {
    eventId: string;
    correlationId: string;
    provider: WebhookProvider;
    entry0: Record<string, unknown> | undefined;
  }
): Promise<void> {
  const { eventId, correlationId, provider, entry0 } = params;
  const pageId = skip.pageId;

  if (skip.reason === 'no_message') {
    const hasMessaging = Array.isArray(entry0?.messaging);
    const messagingLen = hasMessaging ? (entry0!.messaging as unknown[]).length : 0;
    const changes = Array.isArray(entry0?.changes) ? (entry0.changes as unknown[]) : [];
    const firstMessagingKeys =
      hasMessaging && messagingLen > 0 && typeof (entry0!.messaging as unknown[])[0] === 'object' && (entry0!.messaging as unknown[])[0] !== null
        ? Object.keys((entry0!.messaging as unknown[])[0] as object)
        : [];
    const firstChangeField = changes.length > 0 && typeof changes[0] === 'object' && changes[0] !== null
      ? (changes[0] as { field?: string }).field
      : undefined;
    const entry0Keys = entry0 && typeof entry0 === 'object' ? Object.keys(entry0) : [];
    const hint =
      firstMessagingKeys.includes('message_edit') && !firstMessagingKeys.includes('message')
        ? ' Only message_edit received (no sender in payload). If you subscribe to "messages" and send a new DM (not edit), we expect a "message" event. Check payloadStructure logs to see what Meta sends.'
        : '';
    logger.info(
      {
        eventId,
        provider,
        correlationId,
        hasEntry: !!entry0,
        entry0Keys,
        messagingLength: messagingLen,
        firstMessagingKeys,
        changesLength: changes.length,
        firstChangeField,
      },
      `Webhook has no message to reply to (marked processed).${hint}`
    );
    await markWebhookProcessed(eventId, provider);
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'webhook_processed',
      resourceType: 'webhook',
      status: 'success',
      metadata: { event_id: eventId, provider, status: 'no_message' },
    });
    return;
  }

  if (skip.reason === 'blank_message') {
    logger.info(
      { eventId, provider, correlationId },
      'Skipping blank message; marking processed'
    );
    await markWebhookProcessed(eventId, provider);
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'webhook_processed',
      resourceType: 'webhook',
      status: 'success',
      metadata: { event_id: eventId, provider, status: 'skipped_blank_message' },
    });
    return;
  }

  if (skip.reason === 'sender_is_page') {
    logger.warn(
      { eventId, provider, correlationId, senderId: skip.senderId },
      'Skipping send: senderId is page ID (cannot reply to self); marking processed'
    );
    await markWebhookProcessed(eventId, provider);
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'webhook_processed',
      resourceType: 'webhook',
      status: 'success',
      metadata: { event_id: eventId, provider, status: 'skipped_page_id_recipient' },
    });
    return;
  }

  if (skip.reason === 'no_page_ids') {
    logger.info(
      { eventId, provider, correlationId },
      'Instagram webhook missing page ID; marking failed'
    );
    await markWebhookFailed(eventId, provider, 'Missing page ID in payload');
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'webhook_processed',
      resourceType: 'webhook',
      status: 'failure',
      errorMessage: 'Missing page ID in payload',
      metadata: { event_id: eventId, provider },
    });
    return;
  }

  if (skip.reason === 'no_doctor') {
    logger.info(
      { eventId, provider, correlationId, pageIds: skip.pageIds },
      'Unknown Instagram page (no linked doctor); marking failed'
    );
    if (skip.senderId) {
      try {
        await sendInstagramMessage(skip.senderId, FALLBACK_REPLY, correlationId);
      } catch {
        // Optional fallback reply best-effort (uses env token if set); continue to mark failed and audit
      }
    }
    await markWebhookFailed(eventId, provider, 'No doctor linked for page');
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'webhook_processed',
      resourceType: 'webhook',
      status: 'failure',
      errorMessage: 'No doctor linked for page',
      metadata: { event_id: eventId, provider, page_id: pageId },
    });
    return;
  }

  if (skip.reason === 'no_doctor_token') {
    logger.warn(
      { correlationId, doctorId: skip.doctorId, eventId, provider },
      'Doctor has no Instagram token; marking webhook failed'
    );
    await markWebhookFailed(eventId, provider, 'No Instagram token for doctor');
    await logAuditEvent({
      correlationId,
      userId: skip.doctorId,
      action: 'webhook_processed',
      resourceType: 'webhook',
      status: 'failure',
      errorMessage: 'No Instagram token for doctor',
      metadata: { event_id: eventId, provider },
    });
  }
}

export async function processInstagramDmWebhook(params: {
  eventId: string;
  correlationId: string;
  provider: WebhookProvider;
  payload: unknown;
}): Promise<void> {
  const { eventId, correlationId, provider, payload } = params;

  const instagramPayload = payload as InstagramWebhookPayload;
  const entry0 = instagramPayload.entry?.[0] as Record<string, unknown> | undefined;
  const messagingList = Array.isArray(entry0?.messaging) ? (entry0!.messaging as unknown[]) : [];
  const changesList = Array.isArray(entry0?.changes) ? (entry0.changes as unknown[]) : [];
  const structure: Record<string, unknown> = {
    entry0Keys: entry0 && typeof entry0 === 'object' ? Object.keys(entry0) : [],
    changesLength: changesList.length,
    firstChangeField: changesList.length > 0 && typeof changesList[0] === 'object' && changesList[0] !== null
      ? (changesList[0] as { field?: string }).field
      : undefined,
    messagingLength: messagingList.length,
  };
  if (messagingList.length > 0) {
    const first = messagingList[0] as Record<string, unknown> | undefined;
    structure.firstItemKeys = first && typeof first === 'object' ? Object.keys(first) : [];
    structure.hasMessage = first && 'message' in first && first.message != null;
    structure.hasMessageEdit = first && 'message_edit' in first && first.message_edit != null;
    structure.hasSender = first && ((first.sender as { id?: string })?.id ?? first.sender_id) != null;
    structure.hasRecipient = first && ((first.recipient as { id?: string })?.id ?? first.recipient_id) != null;
    const me = first?.message_edit as Record<string, unknown> | undefined;
    if (me && typeof me === 'object') {
      structure.messageEditKeys = Object.keys(me);
      structure.messageEditHasSender = ((me.sender as { id?: string })?.id ?? me.sender_id) != null;
      structure.messageEditHasRecipient = ((me.recipient as { id?: string })?.id ?? me.recipient_id) != null;
    }
  }
  logger.info(
    { eventId, provider, correlationId, payloadStructure: structure },
    'Instagram webhook payload structure (for debugging message vs message_edit)'
  );

  const parseResult = await instagramChannelAdapter.parseInbound(instagramPayload, {
    eventId,
    correlationId,
  });

  if ('skip' in parseResult) {
    await handleParseInboundSkip(parseResult, { eventId, correlationId, provider, entry0 });
    return;
  }

  const inbound = parseResult;

  if (inbound.text === null && inbound.attachments?.length) {
    const { senderId } = inbound;
    const doctorId = inbound.tenant?.doctorId ?? null;

    let suppressAck = false;
    if (doctorId) {
      const existing = await findConversationByPlatformId(doctorId, 'instagram', senderId, correlationId);
      if (existing) {
        const cs = await getConversationState(existing.id, correlationId);
        const activeStep = cs?.step;
        if (activeStep && activeStep !== 'responded') {
          suppressAck = true;
          logger.info(
            { eventId, provider, correlationId, senderId, step: activeStep },
            'Suppressing non-text ack — conversation is in active flow; likely phantom attachment webhook'
          );
        }
      }
    }

    if (!suppressAck) {
      logger.info(
        { eventId, provider, correlationId, senderId },
        'Non-text message received (attachment/sticker/reaction); sending text-only acknowledgement'
      );
      const doctorToken = inbound.tenant?.doctorToken;
      if (doctorId && doctorToken) {
        const nonTextAck = buildNonTextAckMessage();
        try {
          await sendInstagramMessage(senderId, nonTextAck, correlationId, doctorToken);
        } catch (e) {
          logger.warn({ err: e, correlationId }, 'Failed to send non-text ack DM');
        }
      }
    }
    await markWebhookProcessed(eventId, provider);
    return;
  }

  const { senderId, pageIds, tenant } = inbound;
  if (!tenant || inbound.text == null) {
    throw new Error('Instagram DM inbound missing tenant or text after parse');
  }
  const { doctorId, doctorToken } = tenant;

  const lockPageId = pageIds[0]!;
  const lockAcquired = await tryAcquireConversationLock(lockPageId, senderId);
  if (!lockAcquired) {
    throw new Error('Conversation locked by another job - retrying');
  }

  try {
    let turnOut;
    try {
      turnOut = await runConversationTurn(inbound);
    } catch (error) {
      const isConflict =
        error instanceof ConflictError ||
        (error instanceof Error && /Resource already exists|23505|duplicate/i.test(error.message));

      if (isConflict) {
        let conversation = await findConversationByPlatformId(
          doctorId,
          'instagram',
          senderId,
          correlationId
        );
        for (let r = 0; !conversation && r < 5; r++) {
          await new Promise((resolve) => setTimeout(resolve, [500, 1000, 2000, 4000, 6000][r]));
          conversation = await findConversationByPlatformId(
            doctorId,
            'instagram',
            senderId,
            correlationId
          );
        }
        if (conversation && doctorToken) {
          try {
            turnOut = await runConversationTurn(inbound, {
              conflictRecovery: true,
              existingConversation: conversation,
            });
            if ('skip' in turnOut) {
              return;
            }
            const dmSendRecovery = await instagramChannelAdapter.send(
              turnOut.reply,
              inbound,
              { context: 'conflict_recovery' }
            );
            if (dmSendRecovery.status === 'throttle_skipped') {
              return;
            }
            logWebhookConflictRecovery({ correlationId, eventId, outcome: 'success' });
            await markWebhookProcessed(eventId, provider);
            await logAuditEvent({
              correlationId,
              userId: undefined,
              action: 'webhook_processed',
              resourceType: 'webhook',
              status: 'success',
              metadata: { event_id: eventId, provider, recipient_id: senderId, recovered: true },
            });
            return;
          } catch (recoveryErr) {
            logger.warn(
              {
                correlationId,
                eventId,
                error: recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr),
              },
              'Conflict recovery failed; marking webhook failed'
            );
            logWebhookConflictRecovery({ correlationId, eventId, outcome: 'failed' });
          }
        }
      }

      await markWebhookFailed(
        eventId,
        provider,
        error instanceof Error ? error.message : 'Conversation flow failed'
      );
      await logAuditEvent({
        correlationId,
        userId: undefined,
        action: 'webhook_processed',
        resourceType: 'webhook',
        status: 'failure',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        metadata: { event_id: eventId, provider },
      });
      throw error;
    }

    if ('skip' in turnOut) {
      return;
    }

    const pageIdForDm = pageIds[0] ?? inbound.webhookEntryId;
    const handlerPreSendMs = Date.now() - turnOut.meta.handlerStartedAt;
    const igSendStartedAt = Date.now();
    try {
      const dmSend = await instagramChannelAdapter.send(turnOut.reply, inbound, { context: 'default' });
      const igSendMs = Date.now() - igSendStartedAt;
      logWebhookInstagramDmPipelineTiming({
        correlationId,
        eventId,
        doctorId,
        intent: turnOut.meta.intentResult.intent,
        intentMs: turnOut.meta.intentMs,
        generateMs: turnOut.meta.timing.dmGenerateMs,
        igSendMs,
        handlerPreSendMs,
        greetingFastPath: turnOut.meta.greetingFastPath,
        throttleSkipped: dmSend.status === 'throttle_skipped',
      });
      if (dmSend.status === 'throttle_skipped') {
        if (pageIdForDm) {
          const shouldAck = await tryAcquireThrottleAck(pageIdForDm, senderId);
          if (shouldAck) {
            try {
              await sendInstagramMessage(senderId, "I see your messages — give me a moment to respond.", correlationId, doctorToken);
            } catch (ackErr) {
              logger.warn({ err: ackErr, correlationId }, 'Failed to send throttle ack DM');
            }
          }
        }
        return;
      }
      logWebhookInstagramDmDelivery({
        correlationId,
        eventId,
        outcome: 'success',
        usedRecipientFallback: dmSend.status === 'sent' ? dmSend.usedRecipientFallback : false,
      });
    } catch (sendErr) {
      logWebhookInstagramDmDelivery({
        correlationId,
        eventId,
        outcome: 'failure',
        reason: classifyInstagramDmFailureReason(sendErr),
      });
      throw sendErr;
    }
  } finally {
    await releaseConversationLock(lockPageId, senderId);
  }

  await markWebhookProcessed(eventId, provider);
  await logAuditEvent({
    correlationId,
    userId: undefined,
    action: 'webhook_processed',
    resourceType: 'webhook',
    status: 'success',
    metadata: { event_id: eventId, provider, recipient_id: senderId },
  });
}
