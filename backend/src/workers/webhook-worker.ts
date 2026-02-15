/**
 * Webhook Processing Worker
 *
 * BullMQ worker that processes webhook jobs from the queue.
 * Resolves doctor/patient, get/create conversation, stores messages, detects intent,
 * generates response via AI, sends reply via Instagram service (e-task-3).
 * On failure: retries (BullMQ); after max retries stores in dead letter queue.
 *
 * IMPORTANT:
 * - NEVER log payload content (contains PII/PHI)
 * - Only log metadata (event_id, provider, correlation_id, status)
 * - Worker uses try/catch and throws for retry; dead-letter on job 'failed' event
 *
 * @see WEBHOOKS.md - Retry, dead letter
 * @see COMPLIANCE.md - Audit, no PHI in logs
 */

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { isQueueEnabled, WEBHOOK_QUEUE_NAME } from '../config/queue';
import { logger } from '../config/logger';
import { logAuditEvent } from '../utils/audit-logger';
import { markWebhookProcessed, markWebhookFailed } from '../services/webhook-idempotency-service';
import { storeDeadLetterWebhook } from '../services/dead-letter-service';
import {
  sendInstagramMessage,
  getInstagramMessageSender,
  getSenderFromMostRecentConversation,
} from '../services/instagram-service';
import {
  getDoctorIdByPageIds,
  getInstagramAccessTokenForDoctor,
  getStoredInstagramPageIdForDoctor,
} from '../services/instagram-connect-service';
import { findOrCreatePlaceholderPatient, findPatientByIdWithAdmin } from '../services/patient-service';
import { getAvailableSlots } from '../services/availability-service';
import { bookAppointment, getAppointmentByIdForWorker } from '../services/appointment-service';
import type { AvailableSlot } from '../services/availability-service';
import { ConflictError } from '../utils/errors';
import {
  findConversationByPlatformId,
  createConversation,
  getConversationState,
  updateConversationState,
  getOnlyInstagramConversationSenderId,
} from '../services/conversation-service';
import { createMessage, getRecentMessages, getSenderIdByPlatformMessageId } from '../services/message-service';
import { classifyIntent, generateResponse } from '../services/ai-service';
import {
  getNextCollectionField,
  validateAndApply,
  getInitialCollectionStep,
  hasAllRequiredFields,
} from '../services/collection-service';
import {
  parseConsentReply,
  persistPatientAfterConsent,
  handleConsentDenied,
  handleRevocation,
} from '../services/consent-service';
import { processPaymentSuccess, createPaymentLink } from '../services/payment-service';
import { getDoctorSettings } from '../services/doctor-settings-service';
import {
  sendNewAppointmentToDoctor,
  sendPaymentConfirmationToPatient,
  sendPaymentReceivedToDoctor,
} from '../services/notification-service';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { paypalAdapter } from '../adapters/paypal-adapter';
import { getInstagramPageId, getInstagramPageIds } from '../utils/webhook-event-id';
import type { WebhookJobData } from '../types/queue';
import type { InstagramWebhookPayload } from '../types/webhook';

// ============================================================================
// Constants
// ============================================================================

/** Fallback when resolution returns null (no doctor linked for page) or AI/conversation flow is skipped */
const FALLBACK_REPLY = "Thanks for your message. We'll get back to you soon.";

// ============================================================================
// Connection & Worker Instance
// ============================================================================

let workerConnection: IORedis | null = null;
let workerInstance: Worker<WebhookJobData> | null = null;

/**
 * Create Redis connection for worker (separate from queue connection per BullMQ practice).
 */
function createWorkerConnection(): IORedis {
  const url = env.REDIS_URL?.trim();
  if (!url) {
    throw new Error('REDIS_URL is required for webhook worker');
  }
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  });
}

/**
 * Parse Instagram webhook payload: sender ID, message text, and optional message ID.
 * Returns null if payload has no incoming user message.
 *
 * Supports two formats (see docs/Reference/WEBHOOKS.md, docs/setup/instagram-setup.md):
 * 1. entry[].messaging[] - Business Login / Messenger Platform style
 * 2. entry[].changes[] with field "messages" - Instagram Graph API webhooks
 */
function parseInstagramMessage(
  payload: InstagramWebhookPayload
): { senderId: string; text: string; mid?: string } | null {
  const entries = payload.entry;
  if (!entries?.length) return null;

  // Format 1: entry[].messaging[] (Business Login / Messenger Platform)
  for (const entry of entries) {
    const entryAny = entry as {
      messaging?: unknown[];
      from?: { id?: string };
      sender?: { id?: string };
      id?: string;
    };
    const list = entryAny.messaging;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const m = item as Record<string, unknown> & {
        message?: { mid?: string; text?: string };
        message_edit?: { mid?: string; text?: string; num_edit?: number };
        is_echo?: boolean;
        is_self?: boolean;
      };
      let senderId: string | undefined =
        (m.sender as { id?: string } | undefined)?.id ??
        (m.from as { id?: string } | undefined)?.id ??
        (typeof m.sender_id === 'string' ? m.sender_id : undefined) ??
        (typeof m.from_id === 'string' ? m.from_id : undefined);
      if (!senderId && m.message_edit) {
        senderId = entryAny.from?.id ?? entryAny.sender?.id;
      }
      if (!senderId && m.message_edit) {
        const me = m.message_edit as Record<string, unknown> | undefined;
        senderId =
          (me?.sender as { id?: string } | undefined)?.id ??
          (me?.from as { id?: string } | undefined)?.id ??
          (typeof me?.sender_id === 'string' ? me.sender_id : undefined);
      }
      if (!senderId) continue;
      if (m.is_echo === true || m.is_self === true) continue;
      // Incoming message (new or edited)
      if (m.message) {
        const text = m.message.text ?? '';
        const mid = m.message.mid;
        return { senderId: String(senderId), text, mid };
      }
      if (m.message_edit) {
        const text = m.message_edit.text ?? '';
        const mid = m.message_edit.mid;
        return { senderId: String(senderId), text, mid };
      }
    }
  }

  // Format 2: entry[].changes[] (Instagram Graph API: "messages" or "message_edit")
  for (const entry of entries) {
    const changes = (entry as { changes?: Array<{ field?: string; value?: unknown }> }).changes;
    if (!Array.isArray(changes)) continue;
    for (const c of changes) {
      if (c?.value == null || typeof c.value !== 'object') continue;
      const v = c.value as {
        sender?: { id?: string };
        message?: { mid?: string; text?: string; is_self?: boolean };
        message_edit?: { mid?: string; text?: string; num_edit?: number };
        is_self?: boolean;
      };
      if (!v?.sender?.id) continue;
      if (v.is_self === true) continue;
      if (c.field === 'messages' && v.message) {
        if (v.message.is_self === true) continue;
        const text = v.message.text ?? '';
        const mid = v.message.mid;
        return { senderId: String(v.sender.id), text, mid };
      }
      if (c.field === 'message_edit' && v.message_edit) {
        const text = v.message_edit.text ?? '';
        const mid = v.message_edit.mid;
        return { senderId: String(v.sender.id), text, mid };
      }
    }
  }

  return null;
}

/**
 * Extract first message_edit mid/text from Instagram payload (entry[].messaging[]).
 * Used when Meta sends message_edit without sender so we can try DB fallback.
 */
function getFirstMessageEdit(
  payload: InstagramWebhookPayload
): { mid: string; text: string } | null {
  const entries = payload.entry;
  if (!entries?.length) return null;
  const list = (entries[0] as { messaging?: unknown[] }).messaging;
  if (!Array.isArray(list) || list.length === 0) return null;
  const item = list[0] as { message_edit?: { mid?: string; text?: string } };
  const me = item?.message_edit;
  if (!me || me.mid == null || String(me.mid).length === 0) return null;
  return { mid: String(me.mid), text: me.text ?? '' };
}

/** Reject sender IDs that look like test placeholders (e.g. "12334" from Meta test). Real IG IDs are 15+ digits. */
function isValidInstagramSenderId(senderId: string): boolean {
  return !!senderId && senderId.length >= 15;
}

/**
 * When payload has message_edit but no sender (Meta bug/omission), resolve sender:
 * 1) by message mid from DB (previously stored "message" webhook), or
 * 2) fetch from Graph API (most recent conversation or message lookup) - preferred for real DMs, or
 * 3) when doctor has exactly one Instagram conversation, use that sender (only if it looks like a real ID).
 */
async function tryResolveSenderFromMessageEdit(
  payload: InstagramWebhookPayload,
  correlationId: string
): Promise<{ senderId: string; text: string; mid?: string } | null> {
  const pageIds = getInstagramPageIds(payload);
  if (!pageIds.length) return null;
  const doctorId = await getDoctorIdByPageIds(pageIds, correlationId);
  if (!doctorId) return null;
  const edit = getFirstMessageEdit(payload);
  if (!edit?.mid) return null;
  let senderId = await getSenderIdByPlatformMessageId(doctorId, edit.mid, correlationId);
  if (!senderId) {
    const token = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
    if (token) {
      const igId = await getStoredInstagramPageIdForDoctor(doctorId, correlationId) ?? undefined;
      senderId = await getSenderFromMostRecentConversation(token, correlationId, igId);
      if (!senderId) {
        senderId = await getInstagramMessageSender(edit.mid, token, correlationId);
      }
      if (senderId) {
        logger.info({ correlationId }, 'Instagram message_edit: resolved sender');
      }
    }
  }
  if (!senderId) {
    const fallback = await getOnlyInstagramConversationSenderId(doctorId, correlationId);
    if (fallback && isValidInstagramSenderId(fallback)) {
      senderId = fallback;
    } else if (fallback) {
      logger.info(
        { correlationId, senderIdLength: fallback.length },
        'Ignoring getOnlyInstagramConversationSenderId result (looks like test placeholder)'
      );
    }
  }
  if (!senderId || !isValidInstagramSenderId(senderId)) return null;
  return { senderId, text: edit.text, mid: edit.mid };
}

/** Get tomorrow's date in YYYY-MM-DD format */
function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Format slots for display: "1. 2:00 PM\n2. 2:30 PM" */
function formatSlotsForDisplay(slots: AvailableSlot[], dateStr: string): string {
  if (slots.length === 0) {
    return `No available slots for ${dateStr}. Please try another day.`;
  }
  const lines = slots.map((slot, i) => {
    const start = new Date(slot.start);
    const timeStr = start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${i + 1}. ${timeStr}`;
  });
  const dateFormatted = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `Here are available slots for ${dateFormatted}:\n${lines.join('\n')}\n\nReply with the number (1, 2, 3...) to book.`;
}

/**
 * Format amount for display in DMs (e.g. 50000 paise + INR → "₹500", 500 cents + USD → "$5.00").
 * Amount is in smallest unit (paise for INR, cents for USD/EUR/GBP).
 */
function formatAmountForDisplay(amountMinor: number, currency: string): string {
  const divisor = 100; // paise/cents to main unit
  const value = amountMinor / divisor;
  const symbols: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
  };
  const symbol = symbols[currency.toUpperCase()] ?? currency + ' ';
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Format payment-link DM: date, fee amount, and link so the patient sees the fee before paying. */
function formatPaymentLinkMessage(isoDate: string, paymentUrl: string, amountDisplay: string): string {
  const d = new Date(isoDate);
  const dateTimeStr = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `Your appointment is booked for ${dateTimeStr}. Your appointment fee is ${amountDisplay}. Please pay here to confirm: ${paymentUrl}\n\nWe'll send a reminder before your visit.`;
}

/** Format confirmation message: "Your appointment is confirmed for Feb 5, 2026 at 2:00 PM. We'll send a reminder before your visit." */
function formatConfirmationMessage(isoDate: string): string {
  const d = new Date(isoDate);
  const dateTimeStr = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `Your appointment is confirmed for ${dateTimeStr}. We'll send a reminder before your visit.`;
}

/** Parse slot choice from user message ("1", "2", etc.). Returns 1-based index or null if invalid. */
function parseSlotChoice(text: string): number | null {
  const trimmed = text.trim();
  const n = parseInt(trimmed, 10);
  if (isNaN(n) || n < 1 || n > 99) return null;
  return n;
}

/**
 * Process a single webhook job.
 * - Parse payload (Instagram)
 * - Send placeholder reply via Instagram service
 * - Mark webhook as processed
 * - Audit log (metadata only)
 * Throws on error so BullMQ can retry.
 * Exported for unit testing (Task 7 §3.3).
 */
export async function processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
  const { eventId, provider, payload, correlationId } = job.data;

  // Payment webhooks: razorpay, paypal
  if (provider === 'razorpay' || provider === 'paypal') {
    const adapter = provider === 'razorpay' ? razorpayAdapter : paypalAdapter;
    const parsed = adapter.parseSuccessPayload(payload);
    if (parsed) {
      const result = await processPaymentSuccess(
        provider,
        parsed.gatewayOrderId,
        parsed.gatewayPaymentId,
        parsed.amountMinor,
        parsed.currency,
        correlationId
      );
      if (result?.appointmentId) {
        getAppointmentByIdForWorker(result.appointmentId, correlationId)
          .then((appointment) => {
            if (!appointment) return;
            const dateIso =
              typeof appointment.appointment_date === 'string'
                ? appointment.appointment_date
                : (appointment.appointment_date as Date).toISOString();
            return Promise.all([
              sendPaymentConfirmationToPatient(result.appointmentId, dateIso, correlationId),
              sendPaymentReceivedToDoctor(
                appointment.doctor_id,
                result.appointmentId,
                dateIso,
                correlationId
              ),
            ]);
          })
          .catch((err) => {
            logger.warn(
              {
                correlationId,
                appointmentId: result.appointmentId,
                error: err instanceof Error ? err.message : String(err),
              },
              'Notification after payment failed (non-blocking)'
            );
          });
      }
    }
    await markWebhookProcessed(eventId, provider);
    return;
  }

  // Only Instagram is implemented for messaging; others no-op
  if (provider !== 'instagram') {
    logger.info(
      { eventId, provider, correlationId },
      'Webhook skipped (provider not yet implemented)'
    );
    await markWebhookProcessed(eventId, provider);
    return;
  }

  const instagramPayload = payload as InstagramWebhookPayload;
  // Debug: log payload structure for every Instagram webhook (no PII) to diagnose message vs message_edit
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
  }
  logger.info(
    { eventId, provider, correlationId, payloadStructure: structure },
    'Instagram webhook payload structure (for debugging message vs message_edit)'
  );
  let parsed = parseInstagramMessage(instagramPayload);

  // Fallback: Meta sometimes sends message_edit without sender/recipient; resolve sender from DB
  // using the message mid from a previously stored "message" webhook.
  if (!parsed) {
    const fallback = await tryResolveSenderFromMessageEdit(instagramPayload, correlationId);
    if (fallback) {
      parsed = fallback;
      logger.info(
        { eventId, provider, correlationId, mid: fallback.mid },
        'Instagram message_edit: resolved sender (payload had no sender)'
      );
    }
  }

  if (!parsed) {
    // No message (e.g. delivery, read, or message in unexpected shape) - mark processed and skip reply
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

  const { senderId, text, mid } = parsed;

  const pageIds = getInstagramPageIds(instagramPayload);
  const pageId = getInstagramPageId(instagramPayload); // for logging
  if (!pageIds.length) {
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

  const doctorId = await getDoctorIdByPageIds(pageIds, correlationId);
  if (!doctorId) {
    logger.info(
      { eventId, provider, correlationId, pageIds },
      'Unknown Instagram page (no linked doctor); marking failed'
    );
    try {
      await sendInstagramMessage(senderId, FALLBACK_REPLY, correlationId);
    } catch {
      // Optional fallback reply best-effort (uses env token if set); continue to mark failed and audit
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

  const doctorToken = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
  if (!doctorToken) {
    logger.warn(
      { correlationId, doctorId, eventId, provider },
      'Doctor has no Instagram token; marking webhook failed'
    );
    await markWebhookFailed(eventId, provider, 'No Instagram token for doctor');
    await logAuditEvent({
      correlationId,
      userId: doctorId,
      action: 'webhook_processed',
      resourceType: 'webhook',
      status: 'failure',
      errorMessage: 'No Instagram token for doctor',
      metadata: { event_id: eventId, provider },
    });
    return;
  }

  try {
    const patient = await findOrCreatePlaceholderPatient(
      doctorId,
      'instagram',
      senderId,
      correlationId
    );

    let conversation = await findConversationByPlatformId(
      doctorId,
      'instagram',
      senderId,
      correlationId
    );
    if (!conversation) {
      try {
        conversation = await createConversation(
          {
            doctor_id: doctorId,
            patient_id: patient.id,
            platform: 'instagram',
            platform_conversation_id: senderId,
            status: 'active',
          },
          correlationId
        );
      } catch (err) {
        if (err instanceof ConflictError) {
          conversation = await findConversationByPlatformId(
            doctorId,
            'instagram',
            senderId,
            correlationId
          );
          if (!conversation) throw err;
        } else {
          throw err;
        }
      }
    }

    const intentResult = await classifyIntent(text, correlationId);

    const platformMessageId = mid ?? `evt-${eventId}`;
    try {
      await createMessage(
        {
          conversation_id: conversation.id,
          platform_message_id: platformMessageId,
          sender_type: 'patient',
          content: text,
          intent: intentResult.intent,
        },
        correlationId
      );
    } catch (err) {
      if (err instanceof ConflictError) {
        // Message already stored (duplicate webhook or retry). Continue to send reply -
        // a previous attempt may have failed before sending.
        logger.info(
          { eventId, correlationId, platformMessageId },
          'Message already stored (idempotent); continuing to send reply'
        );
      } else {
        throw err;
      }
    }

    let state = await getConversationState(conversation.id, correlationId);
    const recentMessages = await getRecentMessages(conversation.id, 10, correlationId);

    let replyText: string;
    const isBookIntent = intentResult.intent === 'book_appointment';
    const isRevokeIntent = intentResult.intent === 'revoke_consent';
    const inCollection =
      state.step?.startsWith('collecting_') || state.step === 'consent';
    const justStartingCollection =
      isBookIntent && !state.step && !(state.collectedFields?.length);

    if (isRevokeIntent) {
      replyText = await handleRevocation(
        conversation.id,
        conversation.patient_id,
        correlationId
      );
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (isBookIntent && (justStartingCollection || inCollection)) {
      if (state.step === 'consent') {
        const consentResult = parseConsentReply(text);
        if (consentResult === 'granted') {
          replyText = await persistPatientAfterConsent(
            conversation.id,
            conversation.patient_id,
            'instagram_dm',
            correlationId
          );
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
          await updateConversationState(conversation.id, state, correlationId);
        } else if (consentResult === 'denied') {
          replyText = await handleConsentDenied(
            conversation.id,
            conversation.patient_id,
            correlationId
          );
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
          await updateConversationState(conversation.id, state, correlationId);
        } else {
          replyText = await generateResponse({
            conversationId: conversation.id,
            currentIntent: intentResult.intent,
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
          });
        }
      } else if (justStartingCollection) {
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: getInitialCollectionStep(),
          collectedFields: [],
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        replyText = await generateResponse({
          conversationId: conversation.id,
          currentIntent: intentResult.intent,
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
        });
      } else {
        const nextField = getNextCollectionField(state.collectedFields ?? []);
        if (nextField === null && hasAllRequiredFields(state.collectedFields ?? [])) {
          const now = new Date().toISOString();
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'consent',
            consent_requested_at: now,
            updatedAt: now,
          };
          await updateConversationState(conversation.id, state, correlationId);
          replyText = await generateResponse({
            conversationId: conversation.id,
            currentIntent: intentResult.intent,
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
          });
        } else if (nextField) {
          const result = validateAndApply(
            conversation.id,
            nextField,
            text,
            { ...state, lastIntent: intentResult.intent },
            correlationId
          );
          if (result.success) {
            state = result.newState;
            await updateConversationState(conversation.id, state, correlationId);
            replyText = await generateResponse({
              conversationId: conversation.id,
              currentIntent: intentResult.intent,
              state,
              recentMessages,
              currentUserMessage: text,
              correlationId,
            });
          } else {
            replyText = result.replyOverride ?? FALLBACK_REPLY;
          }
        } else {
          replyText = await generateResponse({
            conversationId: conversation.id,
            currentIntent: intentResult.intent,
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
          });
        }
      }
    } else if (state.step === 'selecting_slot') {
      const slotDate = state.slotSelectionDate ?? getTomorrowDate();
      const choiceIndex = parseSlotChoice(text);

      if (choiceIndex !== null) {
        const slots = await getAvailableSlots(doctorId, slotDate, correlationId);
        const slotIndex = choiceIndex - 1;
        if (slotIndex >= 0 && slotIndex < slots.length) {
          const slot = slots[slotIndex];
          const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
          if (!patient || !patient.name || !patient.phone) {
            replyText = "We couldn't find your contact details. Please start over with 'book appointment'.";
            state = { ...state, step: 'responded', updatedAt: new Date().toISOString() };
          } else if (patient.consent_status !== 'granted') {
            replyText = "Please complete the consent step first.";
            state = { ...state, step: 'responded', updatedAt: new Date().toISOString() };
          } else {
            try {
              const appointment = await bookAppointment(
                {
                  doctorId,
                  patientId: patient.id,
                  patientName: patient.name,
                  patientPhone: patient.phone,
                  appointmentDate: slot.start,
                  notes: undefined,
                },
                correlationId
              );
              const settings = await getDoctorSettings(doctorId);
              const doctorCountry = settings?.country ?? env.DEFAULT_DOCTOR_COUNTRY ?? 'IN';
              const amountMinor = settings?.appointment_fee_minor ?? env.APPOINTMENT_FEE_MINOR ?? 50000;
              const currency = settings?.appointment_fee_currency ?? env.APPOINTMENT_FEE_CURRENCY ?? 'INR';
              try {
                const paymentResult = await createPaymentLink(
                  {
                    appointmentId: appointment.id,
                    amountMinor,
                    currency,
                    doctorCountry,
                    doctorId,
                    patientId: patient.id,
                    patientName: patient.name,
                    patientPhone: patient.phone,
                    description: `Appointment - ${new Date(slot.start).toLocaleString()}`,
                  },
                  correlationId
                );
                const amountDisplay = formatAmountForDisplay(amountMinor, currency);
                replyText = formatPaymentLinkMessage(
                  typeof appointment.appointment_date === 'string'
                    ? appointment.appointment_date
                    : (appointment.appointment_date as Date).toISOString(),
                  paymentResult.url,
                  amountDisplay
                );
              } catch (payErr) {
                replyText = formatConfirmationMessage(
                  typeof appointment.appointment_date === 'string'
                    ? appointment.appointment_date
                    : (appointment.appointment_date as Date).toISOString()
                );
                logger.warn(
                  { error: payErr instanceof Error ? payErr.message : String(payErr), correlationId },
                  'Payment link creation failed - sending confirmation without payment'
                );
              }
              await logAuditEvent({
                correlationId,
                action: 'appointment_booked',
                resourceType: 'appointment',
                resourceId: appointment.id,
                status: 'success',
                metadata: { doctorId, appointmentId: appointment.id },
              });
              sendNewAppointmentToDoctor(
                doctorId,
                appointment.id,
                typeof appointment.appointment_date === 'string'
                  ? appointment.appointment_date
                  : (appointment.appointment_date as Date).toISOString(),
                correlationId
              ).catch((err) => {
                logger.warn(
                  {
                    correlationId,
                    appointmentId: appointment.id,
                    error: err instanceof Error ? err.message : String(err),
                  },
                  'New appointment email failed (non-blocking)'
                );
              });
              state = {
                ...state,
                lastIntent: intentResult.intent,
                step: 'responded',
                updatedAt: new Date().toISOString(),
                slotSelectionDate: undefined,
              };
            } catch (err) {
              if (err instanceof ConflictError) {
                const freshSlots = await getAvailableSlots(doctorId, slotDate, correlationId);
                replyText = "That slot was just taken. " + formatSlotsForDisplay(freshSlots, slotDate);
                state = { ...state, slotSelectionDate: slotDate, updatedAt: new Date().toISOString() };
              } else {
                replyText = "Sorry, we couldn't complete the booking. Please try again or choose another slot.";
                state = { ...state, slotSelectionDate: slotDate, updatedAt: new Date().toISOString() };
              }
            }
          }
        } else {
          const slots = await getAvailableSlots(doctorId, slotDate, correlationId);
          replyText = `Please choose a number between 1 and ${slots.length}.\n\n` + formatSlotsForDisplay(slots, slotDate);
          state = { ...state, slotSelectionDate: slotDate, updatedAt: new Date().toISOString() };
        }
      } else {
        const slots = await getAvailableSlots(doctorId, slotDate, correlationId);
        replyText = "Please reply with the number of your preferred slot (1, 2, 3...).\n\n" + formatSlotsForDisplay(slots, slotDate);
        state = { ...state, slotSelectionDate: slotDate, updatedAt: new Date().toISOString() };
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else if (isBookIntent && state.step === 'responded') {
      const slotDate = getTomorrowDate();
      const slots = await getAvailableSlots(doctorId, slotDate, correlationId);
      replyText = formatSlotsForDisplay(slots, slotDate);
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'selecting_slot',
        slotSelectionDate: slotDate,
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else {
      replyText = await generateResponse({
        conversationId: conversation.id,
        currentIntent: intentResult.intent,
        state,
        recentMessages,
        currentUserMessage: text,
        correlationId,
      });
    }

    const botMessageId = `sys-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await createMessage(
      {
        conversation_id: conversation.id,
        platform_message_id: botMessageId,
        sender_type: 'system',
        content: replyText,
      },
      correlationId
    );

    const stateToPersist =
      (isBookIntent && (justStartingCollection || inCollection)) || state.step === 'selecting_slot'
        ? state
        : {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
    await updateConversationState(conversation.id, stateToPersist, correlationId);

    await sendInstagramMessage(senderId, replyText, correlationId, doctorToken);
  } catch (error) {
    // Duplicate webhook (same event_id retried or re-sent): treat as idempotent
    if (error instanceof ConflictError) {
      logger.info(
        { eventId, provider, correlationId, errorMessage: error.message },
        'Webhook duplicate (Resource already exists); attempting fallback reply'
      );
      // Still try to send reply - a previous attempt may have failed before sending
      try {
        if (
          typeof senderId === 'string' &&
          isValidInstagramSenderId(senderId) &&
          doctorToken
        ) {
          await sendInstagramMessage(senderId, FALLBACK_REPLY, correlationId, doctorToken);
          logger.info({ eventId, correlationId }, 'Fallback reply sent after ConflictError');
        }
      } catch (sendErr) {
        logger.warn(
          { eventId, correlationId, sendError: sendErr instanceof Error ? sendErr.message : String(sendErr) },
          'Fallback reply failed (non-blocking)'
        );
      }
      await markWebhookProcessed(eventId, provider);
      return;
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

/**
 * Handle job 'failed' event: store in dead letter queue after max retries.
 * Exported for unit testing (Task 7 §3.3.4).
 */
export async function handleWebhookJobFailed(
  job: Job<WebhookJobData> | undefined,
  err: Error
): Promise<void> {
  if (!job) return;
  const { eventId, provider, payload, correlationId } = job.data;
  const attempts = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 3;
  if (attempts >= maxAttempts) {
    try {
      await storeDeadLetterWebhook(
        eventId,
        provider,
        payload,
        err.message,
        attempts,
        correlationId
      );
      logger.warn(
        { eventId, provider, correlationId, attempts },
        'Webhook moved to dead letter queue after max retries'
      );
    } catch (dlqError) {
      logger.error(
        {
          error: dlqError instanceof Error ? dlqError.message : String(dlqError),
          eventId,
          provider,
          correlationId,
        },
        'Failed to store webhook in dead letter queue'
      );
    }
  }
}

/**
 * Start the webhook worker. No-op if REDIS_URL is not set.
 * Returns the Worker instance or null (placeholder).
 */
export function startWebhookWorker(): Worker<WebhookJobData> | null {
  if (!isQueueEnabled()) {
    logger.info('Webhook worker skipped (REDIS_URL not set)');
    return null;
  }

  if (workerInstance) {
    return workerInstance;
  }

  try {
    workerConnection = createWorkerConnection();
    const concurrency = Math.max(1, Math.min(env.WEBHOOK_WORKER_CONCURRENCY, 20));

    workerInstance = new Worker<WebhookJobData>(
      WEBHOOK_QUEUE_NAME,
      async (job: Job<WebhookJobData>) => {
        try {
          await processWebhookJob(job);
        } catch (error) {
          logger.warn(
            {
              jobId: job.id,
              eventId: job.data.eventId,
              provider: job.data.provider,
              correlationId: job.data.correlationId,
              attempt: job.attemptsMade + 1,
              error: error instanceof Error ? error.message : String(error),
            },
            'Webhook job failed (will retry or dead-letter)'
          );
          throw error;
        }
      },
      {
        connection: workerConnection,
        concurrency,
      }
    );

    workerInstance.on('failed', (job: Job<WebhookJobData> | undefined, err: Error) => {
      handleWebhookJobFailed(job, err);
    });

    workerInstance.on('error', (err: Error) => {
      logger.error(
        { error: err.message },
        'Webhook worker connection error'
      );
    });

    logger.info(
      { queueName: WEBHOOK_QUEUE_NAME, concurrency },
      'Webhook worker started'
    );
    return workerInstance;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to start webhook worker'
    );
    return null;
  }
}

/**
 * Get current worker instance (if started).
 */
export function getWebhookWorker(): Worker<WebhookJobData> | null {
  return workerInstance;
}

/**
 * Stop the webhook worker and close connection (graceful shutdown).
 */
export async function stopWebhookWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
  if (workerConnection) {
    await workerConnection.quit();
    workerConnection = null;
  }
  logger.info('Webhook worker stopped');
}
