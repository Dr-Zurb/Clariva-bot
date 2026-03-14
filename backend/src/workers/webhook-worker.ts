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

import { createHash } from 'crypto';
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
import { bookAppointment, getAppointmentByIdForWorker } from '../services/appointment-service';
import { ConflictError } from '../utils/errors';
import {
  findConversationByPlatformId,
  createConversation,
  getConversationState,
  updateConversationState,
  getOnlyInstagramConversationSenderId,
} from '../services/conversation-service';
import { createMessage, getRecentMessages, getSenderIdByPlatformMessageId } from '../services/message-service';
import {
  classifyIntent,
  generateResponse,
  MEDICAL_QUERY_RESPONSE,
  EMERGENCY_RESPONSE,
} from '../services/ai-service';
import {
  getInitialCollectionStep,
  getCollectedData,
  validateAndApplyExtracted,
  buildConfirmDetailsMessage,
  tryRecoverAndSetFromMessages,
} from '../services/collection-service';
import {
  parseConsentReply,
  persistPatientAfterConsent,
  handleConsentDenied,
  handleRevocation,
} from '../services/consent-service';
import { buildBookingPageUrl } from '../services/slot-selection-service';
import { processPaymentSuccess, createPaymentLink } from '../services/payment-service';
import { getDoctorSettings } from '../services/doctor-settings-service';
import type { DoctorSettingsRow } from '../types/doctor-settings';
import type { DoctorContext } from '../services/ai-service';
import {
  sendNewAppointmentToDoctor,
  sendPaymentConfirmationToPatient,
  sendPaymentReceivedToDoctor,
} from '../services/notification-service';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { paypalAdapter } from '../adapters/paypal-adapter';
import { getInstagramPageId, getInstagramPageIds } from '../utils/webhook-event-id';
import {
  tryAcquireConversationLock,
  releaseConversationLock,
  tryAcquireInstagramSendLock,
  tryAcquireReplyThrottle,
} from '../config/queue';
import type { WebhookJobData } from '../types/queue';
import type { InstagramWebhookPayload } from '../types/webhook';

// ============================================================================
// Constants
// ============================================================================

/** Fallback when resolution returns null (no doctor linked for page) or AI/conversation flow is skipped */
const FALLBACK_REPLY = "Thanks for your message. We'll get back to you soon.";

/** Hash user message for send lock (per-content throttle). Normalized: trim + lowercase. */
function contentHashForSendLock(text: string): string {
  const normalized = (text ?? '').trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

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

  const pageIds = getInstagramPageIds(payload);

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
        message?: { mid?: string; text?: string; is_echo?: boolean };
        message_edit?: { mid?: string; text?: string; num_edit?: number };
        recipient?: { id?: string };
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
      // When sender is the page (e.g. business edited message), use recipient as reply target
      if (senderId && pageIds.includes(senderId) && m.recipient) {
        const recipientId = (m.recipient as { id?: string })?.id ?? (typeof m.recipient_id === 'string' ? m.recipient_id : undefined);
        if (recipientId && !pageIds.includes(recipientId)) {
          senderId = recipientId;
        } else {
          continue; // cannot determine customer
        }
      }
      if (!senderId) continue;
      if (m.is_echo === true || m.is_self === true) continue;
      if ((m.message as { is_echo?: boolean } | undefined)?.is_echo === true) continue;
      // Never use page ID as recipient (Meta returns "No matching user found")
      if (pageIds.includes(senderId)) continue;
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

/** User sent acknowledgment after booking (ok, thanks, all set, etc.). No "message didn't come through". */
const ACKNOWLEDGMENT_REGEX =
  /^(ok|all\s+set|thanks|thank\s+you|confirmed|done|got\s+it|ok\s+thanks|thanks\s+ok|ok\s+thank\s+you)[\s!?.]*$/i;

/** Last bot message asked for booking details (Full name, Age, Reason for visit, etc.). */
function lastBotMessageAskedForDetails(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return (
        c.includes('reason for visit') ||
        c.includes('full name') ||
        (c.includes('age') && c.includes('gender')) ||
        c.includes('mobile number')
      );
    }
  }
  return false;
}

/** Last bot message asked for consent (Ready to pick a time? Do I have your consent? etc.). */
function lastBotMessageAskedForConsent(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return (
        c.includes('ready to pick a time') ||
        c.includes('do i have your consent') ||
        c.includes('consent to use these details')
      );
    }
  }
  return false;
}

/** Last bot message asked for confirm (Is this correct? Reply Yes to see available slots). */
function lastBotMessageAskedForConfirm(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return c.includes('is this correct') && c.includes('reply yes');
    }
  }
  return false;
}

function isPostBookingAcknowledgment(
  text: string,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  const trimmed = (text ?? '').trim();
  if (trimmed.length > 30) return false;
  if (!ACKNOWLEDGMENT_REGEX.test(trimmed)) return false;
  // Last system message should be a booking confirmation (appointment confirmed, payment link, etc.)
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type === 'system') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return (
        (c.includes('appointment') && (c.includes('confirmed') || c.includes('booked') || c.includes('pay'))) ||
        c.includes('please pay here')
      );
    }
  }
  return false;
}

/**
 * Experimental: Decode message_edit.mid (base64) to inspect structure.
 * Meta may encode sender/recipient in internal format. The mid is binary with embedded ASCII IDs.
 * Extract digit sequences from hex (pairs 30-39 = ASCII '0'-'9') since binary layout varies.
 * @returns Decoded prefix and any candidate numeric IDs (15+ digits) that could be sender IDs
 */
function decodeMidExperimental(mid: string): { decoded: string; candidateIds: string[] } | null {
  if (!mid || typeof mid !== 'string' || mid.length < 10) return null;
  try {
    const buf = Buffer.from(mid, 'base64');
    if (buf.length === 0) return null;
    const hex = buf.toString('hex');
    // Hex pairs 31-39 (0x31-0x39) = ASCII '1'-'9'; 30 = '0'. Find runs of 15+ digit-hex-pairs.
    const digitHexPairs = hex.match(/(3[0-9]){15,}/g);
    const allIds = (digitHexPairs ?? []).map((run) =>
      run.replace(/(..)/g, (_, pair) => String.fromCharCode(parseInt(pair, 16)))
    );
    // Only consider 15-17 digit IDs (typical Instagram user ID length); exclude 30+ digit (message/snowflake IDs)
    const candidateIds = allIds.filter((id) => id.length >= 15 && id.length <= 20);
    const decoded = buf.toString('utf8').slice(0, 80).replace(/[^\x20-\x7e]/g, '.');
    return { decoded, candidateIds };
  } catch {
    return null;
  }
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
  if (senderId && pageIds.includes(senderId)) senderId = null; // DB may have stored page ID by mistake
  if (!senderId) {
    const token = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
    if (token) {
      const igId = await getStoredInstagramPageIdForDoctor(doctorId, correlationId) ?? undefined;
      senderId = await getSenderFromMostRecentConversation(token, correlationId, igId);
      if (senderId && pageIds.includes(senderId)) senderId = null;
      if (!senderId) {
        senderId = await getInstagramMessageSender(edit.mid, token, correlationId);
        if (senderId && pageIds.includes(senderId)) senderId = null;
      }
      if (senderId) {
        logger.info({ correlationId }, 'Instagram message_edit: resolved sender');
      }
    }
  }
  if (!senderId) {
    const fallback = await getOnlyInstagramConversationSenderId(doctorId, correlationId);
    if (fallback && isValidInstagramSenderId(fallback) && !pageIds.includes(fallback)) {
      senderId = fallback;
    } else if (fallback) {
      logger.info(
        { correlationId, senderIdLength: fallback.length, isPageId: pageIds.includes(fallback) },
        'Ignoring getOnlyInstagramConversationSenderId result (looks like test placeholder or page ID)'
      );
    }
  }

  // Experimental: try decoding mid to extract sender (see troubleshooting doc option 6)
  if (!senderId && edit.mid) {
    const decoded = decodeMidExperimental(edit.mid);
    if (decoded) {
      const candidateIds = decoded.candidateIds.filter((id) => !pageIds.includes(id));
      logger.info(
        {
          correlationId,
          midLength: edit.mid.length,
          decodedLength: decoded.decoded.length,
          decodedPrefix: decoded.decoded.slice(0, 80),
          candidateIdsCount: candidateIds.length,
          candidateIds: candidateIds.slice(0, 5),
        },
        'Experimental: mid decode (check if any candidateId is sender)'
      );
      const firstCandidate = candidateIds.find((id) => isValidInstagramSenderId(id));
      if (firstCandidate) {
        logger.info(
          { correlationId, candidateId: firstCandidate },
          'Experimental: trying decoded mid candidate as sender'
        );
        senderId = firstCandidate;
      }
    }
  }

  // Never return page ID as sender (Meta returns "No matching user found" when sending to page)
  if (senderId && pageIds.includes(senderId)) {
    logger.info({ correlationId, senderId }, 'Rejecting resolved sender (is page ID, cannot send to self)');
    return null;
  }
  if (!senderId || !isValidInstagramSenderId(senderId)) return null;
  return { senderId, text: edit.text, mid: edit.mid };
}

/** Build doctor context for AI (e-task-4, e-task-2 consultation_types) */
function getDoctorContextFromSettings(settings: DoctorSettingsRow | null): DoctorContext | undefined {
  if (!settings) return undefined;
  const hasAny =
    settings.practice_name ||
    settings.business_hours_summary ||
    settings.welcome_message ||
    settings.specialty ||
    settings.address_summary ||
    settings.consultation_types ||
    (settings.cancellation_policy_hours != null && settings.cancellation_policy_hours > 0);
  if (!hasAny) return undefined;
  return {
    practice_name: settings.practice_name,
    business_hours_summary: settings.business_hours_summary,
    welcome_message: settings.welcome_message,
    specialty: settings.specialty,
    address_summary: settings.address_summary,
    cancellation_policy_hours: settings.cancellation_policy_hours,
    consultation_types: settings.consultation_types,
  };
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
function formatPaymentLinkMessage(
  isoDate: string,
  paymentUrl: string,
  amountDisplay: string,
  timezone: string = 'Asia/Kolkata'
): string {
  const d = new Date(isoDate);
  const dateTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `Your appointment is booked for ${dateTimeStr}. Your appointment fee is ${amountDisplay}. Please pay here to confirm: ${paymentUrl}\n\nWe'll send a reminder before your visit.`;
}

/** Format confirmation message: "Your appointment is confirmed for Feb 5, 2026 at 2:00 PM. We'll send a reminder before your visit." */
function formatConfirmationMessage(isoDate: string, timezone: string = 'Asia/Kolkata'): string {
  const d = new Date(isoDate);
  const dateTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `Your appointment is confirmed for ${dateTimeStr}. We'll send a reminder before your visit.`;
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
              sendNewAppointmentToDoctor(
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
    // Debug: also check if sender/recipient are nested inside message_edit (Meta may use different structure)
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

  // Skip blank messages (e-task-2): prevents "message came through blank" from duplicate/empty webhooks
  if (!text?.trim()) {
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

  const pageIds = getInstagramPageIds(instagramPayload);
  const pageId = getInstagramPageId(instagramPayload); // for logging

  // Never send to page ID (Meta returns "No matching user found"); prevents duplicate fallback spam
  if (pageIds.includes(senderId)) {
    logger.warn(
      { eventId, provider, correlationId, senderId },
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

  const lockPageId = pageIds[0]!;
  const lockAcquired = await tryAcquireConversationLock(lockPageId, senderId);
  if (!lockAcquired) {
    throw new Error('Conversation locked by another job - retrying');
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
    }

    const intentResult = await classifyIntent(text, correlationId);

    const platformMessageId = mid ?? `evt-${eventId}`;
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

    let state = await getConversationState(conversation.id, correlationId);
    const recentMessages = await getRecentMessages(conversation.id, 10, correlationId);

    const doctorSettings = await getDoctorSettings(doctorId);
    const doctorContext = getDoctorContextFromSettings(doctorSettings);

    let replyText: string;
    const isBookIntent = intentResult.intent === 'book_appointment';
    const isRevokeIntent = intentResult.intent === 'revoke_consent';
    const lastBotAskedForDetails = lastBotMessageAskedForDetails(recentMessages);
    const inCollection =
      state.step?.startsWith('collecting_') ||
      state.step === 'consent' ||
      state.step === 'confirm_details' ||
      lastBotAskedForDetails;
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
    } else if (intentResult.intent === 'medical_query' && !inCollection) {
      // Only deflect when NOT in collection flow. Context matters: if we asked for "reason for visit"
      // and the patient replied "Pain Abdomen", that's their answer—not an unsolicited medical query.
      // inCollection = we asked for details; their reply is data. No field-count heuristic (unreliable:
      // a patient could send details + "what should I do?" without booking intent).
      replyText = MEDICAL_QUERY_RESPONSE;
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (intentResult.intent === 'emergency') {
      replyText = EMERGENCY_RESPONSE;
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (intentResult.intent === 'check_appointment_status') {
      replyText =
        "For your appointment status, please check your confirmation message or contact the clinic directly.";
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (state.step === 'consent' || (lastBotMessageAskedForConsent(recentMessages) && parseConsentReply(text) === 'granted')) {
      // Handle consent reply regardless of intent. Fallback: last bot asked for consent + user said yes.
      if (!state.step) {
        state = { ...state, step: 'consent', updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
      const consentResult = parseConsentReply(text);
      if (consentResult === 'granted') {
        let persistResult = await persistPatientAfterConsent(
          conversation.id,
          conversation.patient_id,
          'instagram_dm',
          correlationId
        );
        // Fallback: if Redis/in-memory lost data, try to recover from recent messages
        if (!persistResult.success) {
          const recovered = await tryRecoverAndSetFromMessages(
            conversation.id,
            recentMessages,
            correlationId
          );
          if (recovered) {
            persistResult = await persistPatientAfterConsent(
              conversation.id,
              conversation.patient_id,
              'instagram_dm',
              correlationId
            );
          }
        }
        const slotLink = buildBookingPageUrl(conversation.id, doctorId);
        if (!persistResult.success) {
          replyText =
            `I had trouble saving your details—please say 'book appointment' to re-share them if needed. Meanwhile, pick your slot: ${slotLink}\n\nYou'll be redirected back here after you choose.`;
        } else {
          replyText =
            `Pick your slot: ${slotLink}\n\nYou'll be redirected back here after you choose.`;
        }
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'awaiting_slot_selection',
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
          doctorContext,
        });
      }
    } else if (state.step === 'collecting_all' || (lastBotAskedForDetails && !state.step)) {
      // Process as collection data. Context: we asked for details (state or last bot message).
      // E.g. "Pain Abdomen" may be classified as medical_query but we asked—treat as data.
      if (!state.step) {
        state = {
          ...state,
          step: 'collecting_all',
          collectedFields: [],
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
      }
      const extractResult = await validateAndApplyExtracted(
        conversation.id,
        text,
        { ...state, lastIntent: intentResult.intent },
        correlationId
      );
      state = extractResult.newState;
      await updateConversationState(conversation.id, state, correlationId);
      if (extractResult.missingFields.length === 0) {
        const collected = await getCollectedData(conversation.id);
        replyText = buildConfirmDetailsMessage(collected ?? {});
      } else {
        const missingLabels = extractResult.missingFields.map((f) => {
          const labels: Record<string, string> = { name: 'full name', phone: 'phone number', age: 'age', gender: 'gender', reason_for_visit: 'reason for visit' };
          return labels[f] ?? f;
        });
        replyText = `Got it. Still need: ${missingLabels.join(', ')}. Please share.`;
      }
    } else if (state.step === 'confirm_details' || (lastBotMessageAskedForConfirm(recentMessages) && /^(yes|yeah|yep|ok|okay|correct|looks good|confirmed)$/.test(text.trim().toLowerCase()))) {
      // Handle confirm reply regardless of intent. Fallback: last bot asked for confirm + user said yes.
      if (!state.step) {
        state = { ...state, step: 'confirm_details', updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
      const trimmed = text.trim().toLowerCase();
      const isYes = /^(yes|yeah|yep|ok|okay|correct|looks good|confirmed)$/.test(trimmed);
      const isCorrection = /^(no|nope|change|correct)\s*[,:]/i.test(text.trim()) || /^(actually|no,)\s+/i.test(text.trim());
      if (isYes) {
        let collected = await getCollectedData(conversation.id);
        if (!collected?.name || !collected?.phone) {
          const recovered = await tryRecoverAndSetFromMessages(
            conversation.id,
            recentMessages,
            correlationId
          );
          if (recovered) collected = await getCollectedData(conversation.id);
        }
        const now = new Date().toISOString();
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'consent',
          consent_requested_at: now,
          updatedAt: now,
          reasonForVisit: collected?.reason_for_visit,
          age: collected?.age,
        };
        await updateConversationState(conversation.id, state, correlationId);
        const name = collected?.name?.trim() || 'there';
        const phone = collected?.phone?.trim() || '';
        const phoneDisplay = phone ? `**${phone}**` : 'your number';
        replyText = `Thanks, ${name}. We'll use ${phoneDisplay} to confirm your appointment by call or text. Ready to pick a time?`;
      } else if (isCorrection) {
        const extractResult = await validateAndApplyExtracted(
          conversation.id,
          text,
          { ...state, lastIntent: intentResult.intent },
          correlationId
        );
        state = extractResult.newState;
        await updateConversationState(conversation.id, state, correlationId);
        const collected = await getCollectedData(conversation.id);
        if (extractResult.missingFields.length === 0) {
          replyText = buildConfirmDetailsMessage(collected ?? {});
        } else {
          const missingLabels = extractResult.missingFields.map((f) => {
            const labels: Record<string, string> = { name: 'full name', phone: 'phone number', age: 'age', gender: 'gender', reason_for_visit: 'reason for visit' };
            return labels[f] ?? f;
          });
          replyText = `Still need: ${missingLabels.join(', ')}. Please share.`;
        }
      } else {
        replyText = await generateResponse({
          conversationId: conversation.id,
          currentIntent: intentResult.intent,
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
        });
      }
    } else if (
      state.step === 'responded' &&
      isPostBookingAcknowledgment(text, recentMessages)
    ) {
      replyText = "Great—you're all set. Let us know if you need anything else.";
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (isBookIntent && (justStartingCollection || inCollection)) {
      // Note: consent, confirm_details, collecting_all are handled above (regardless of intent).
      if (justStartingCollection) {
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
          doctorContext,
        });
      } else {
        replyText = await generateResponse({
          conversationId: conversation.id,
          currentIntent: intentResult.intent,
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
        });
      }
    } else if (state.step === 'awaiting_slot_selection') {
      const trimmed = text.trim().toLowerCase();
      const wantsNewLink =
        /^(change|pick another|different time|new link|another time|different slot)$/.test(trimmed) ||
        /^(change|pick)\s+(my\s+)?(slot|time)$/i.test(text.trim());
      if (wantsNewLink) {
        const slotLink = buildBookingPageUrl(conversation.id, doctorId);
        replyText =
          `Pick your slot: ${slotLink}\n\nYou'll be redirected back here after you choose.`;
      } else {
        replyText =
          "Pick your slot using the link above, or say 'change' to get a new link.";
      }
      state = { ...state, updatedAt: new Date().toISOString() };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (state.step === 'confirming_slot') {
      const confirmTrimmed = text.trim().toLowerCase();
      const isConfirm =
        /^(yes|yeah|yep|ok|okay|1|confirm|confirmed|book\s+it|please)$/.test(confirmTrimmed);
      if (isConfirm && state.slotToConfirm) {
        const slot = state.slotToConfirm;
        const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
        if (!patient || !patient.name || !patient.phone) {
          replyText = "We couldn't find your contact details. Please start over with 'book appointment'.";
          state = { ...state, step: 'responded', slotToConfirm: undefined, updatedAt: new Date().toISOString() };
        } else if (patient.consent_status !== 'granted') {
          replyText = "Please complete the consent step first.";
          state = { ...state, step: 'responded', slotToConfirm: undefined, updatedAt: new Date().toISOString() };
        } else {
          try {
            const notes =
              state.reasonForVisit && doctorSettings?.default_notes
                ? `Reason: ${state.reasonForVisit}. ${doctorSettings.default_notes}`
                : state.reasonForVisit ?? doctorSettings?.default_notes ?? undefined;
            const appointment = await bookAppointment(
              {
                doctorId,
                patientId: patient.id,
                patientName: patient.name,
                patientPhone: patient.phone,
                appointmentDate: slot.start,
                notes,
                consultationType: state.consultationType,
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
              const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
              replyText = formatPaymentLinkMessage(
                typeof appointment.appointment_date === 'string'
                  ? appointment.appointment_date
                  : (appointment.appointment_date as Date).toISOString(),
                paymentResult.url,
                amountDisplay,
                tz
              );
            } catch (payErr) {
              const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
              replyText = formatConfirmationMessage(
                typeof appointment.appointment_date === 'string'
                  ? appointment.appointment_date
                  : (appointment.appointment_date as Date).toISOString(),
                tz
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
            // Doctor confirmation email is sent AFTER payment (in payment webhook handler)
            state = {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              slotToConfirm: undefined,
              slotSelectionDate: undefined,
              updatedAt: new Date().toISOString(),
            };
          } catch (err) {
            if (err instanceof ConflictError) {
              const slotLink = buildBookingPageUrl(conversation.id, doctorId);
              replyText =
                "That slot was just taken. Pick another: " +
                slotLink;
              state = {
                ...state,
                step: 'awaiting_slot_selection',
                slotToConfirm: undefined,
                updatedAt: new Date().toISOString(),
              };
            } else {
              replyText = "Sorry, we couldn't complete the booking. Please try again.";
              state = { ...state, step: 'awaiting_slot_selection', slotToConfirm: undefined, updatedAt: new Date().toISOString() };
            }
          }
        }
      } else {
        const slotLink = buildBookingPageUrl(conversation.id, doctorId);
        replyText =
          `No problem. Pick another time: ${slotLink}`;
        state = {
          ...state,
          step: 'awaiting_slot_selection',
          slotToConfirm: undefined,
          updatedAt: new Date().toISOString(),
        };
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else if (state.step === 'selecting_slot') {
      // Legacy: redirect to external slot picker (e-task-5)
      const slotLink = buildBookingPageUrl(conversation.id, doctorId);
      replyText =
        `Pick your slot: ${slotLink}\n\nYou'll be redirected back here after you choose.`;
      state = {
        ...state,
        step: 'awaiting_slot_selection',
        slotSelectionDate: undefined,
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (isBookIntent && state.step === 'responded') {
      // e-task-2: Show weekly availability + "When would you like to come?" — never random first-available slots
      const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
      const hasPatientReady =
        patient?.name?.trim() &&
        patient?.phone?.trim() &&
        patient?.consent_status === 'granted';
      if (hasPatientReady) {
        const slotLink = buildBookingPageUrl(conversation.id, doctorId);
        replyText =
          `Pick your slot: ${slotLink}\n\nYou'll be redirected back here after you choose.`;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'awaiting_slot_selection',
          consultationType: state.consultationType,
          updatedAt: new Date().toISOString(),
        };
      } else {
        // No patient data — start collection
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
          doctorContext,
        });
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else {
      replyText = await generateResponse({
        conversationId: conversation.id,
        currentIntent: intentResult.intent,
        state,
        recentMessages,
        currentUserMessage: text,
        correlationId,
        doctorContext,
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
      (isBookIntent && (justStartingCollection || inCollection)) ||
      state.step === 'selecting_slot' ||
      state.step === 'awaiting_slot_selection' ||
      state.step === 'confirming_slot'
        ? state
        : {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
    await updateConversationState(conversation.id, stateToPersist, correlationId);

    // Send throttle: one reply per (user, message content). Per-user throttle: max 1 send per 12 sec (stops Meta duplicate webhook spam).
    const pageId = pageIds[0] ?? getInstagramPageId(instagramPayload);
    if (pageId) {
      const contentHash = contentHashForSendLock(text);
      const sendLockAcquired = await tryAcquireInstagramSendLock(pageId, senderId, contentHash);
      if (!sendLockAcquired) {
        logger.info(
          { correlationId, eventId, provider },
          'Skipping send: already replied to this message (send throttle)'
        );
        await markWebhookProcessed(eventId, provider);
        await logAuditEvent({
          correlationId,
          userId: undefined,
          action: 'webhook_processed',
          resourceType: 'webhook',
          status: 'success',
          metadata: { event_id: eventId, provider, recipient_id: senderId, skipped_send_throttle: true },
        });
        return;
      }
      const replyThrottleAcquired = await tryAcquireReplyThrottle(pageId, senderId);
      if (!replyThrottleAcquired) {
        logger.info(
          { correlationId, eventId, provider },
          'Skipping send: reply throttle (already sent to this user recently)'
        );
        await markWebhookProcessed(eventId, provider);
        await logAuditEvent({
          correlationId,
          userId: undefined,
          action: 'webhook_processed',
          resourceType: 'webhook',
          status: 'success',
          metadata: { event_id: eventId, provider, recipient_id: senderId, skipped_reply_throttle: true },
        });
        return;
      }
    }
    await sendInstagramMessage(senderId, replyText, correlationId, doctorToken);
  } catch (error) {
    const isConflict =
      error instanceof ConflictError ||
      (error instanceof Error && /Resource already exists|23505|duplicate/i.test(error.message));

    if (isConflict) {
      // Resource already exists (e.g. retry, duplicate webhook, race). Find conversation;
      // may need retries for replication lag after createConversation race.
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
          const intentResult = await classifyIntent(text, correlationId);
          const state = await getConversationState(conversation.id, correlationId);
          const recentMessages = await getRecentMessages(conversation.id, 10, correlationId);
          const replyText =
            (await generateResponse({
              conversationId: conversation.id,
              currentIntent: intentResult.intent,
              state,
              recentMessages,
              currentUserMessage: text,
              correlationId,
              doctorContext: getDoctorContextFromSettings(
                await getDoctorSettings(doctorId)
              ),
            })) || FALLBACK_REPLY;
          await createMessage(
            {
              conversation_id: conversation.id,
              platform_message_id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              sender_type: 'system',
              content: replyText,
            },
            correlationId
          );
          const pageIdForSend = pageIds[0] ?? getInstagramPageId(instagramPayload);
          if (pageIdForSend) {
            const contentHash = contentHashForSendLock(text);
            const sendAcquired = await tryAcquireInstagramSendLock(pageIdForSend, senderId, contentHash);
            if (!sendAcquired) {
              logger.info({ correlationId, eventId, provider }, 'Conflict recovery: skipping send (already replied to this message)');
              await markWebhookProcessed(eventId, provider);
              await logAuditEvent({
                correlationId,
                userId: undefined,
                action: 'webhook_processed',
                resourceType: 'webhook',
                status: 'success',
                metadata: { event_id: eventId, provider, recipient_id: senderId, recovered: true, skipped_send_throttle: true },
              });
              return;
            }
            const replyAcquired = await tryAcquireReplyThrottle(pageIdForSend, senderId);
            if (!replyAcquired) {
              logger.info({ correlationId, eventId, provider }, 'Conflict recovery: skipping send (reply throttle)');
              await markWebhookProcessed(eventId, provider);
              return;
            }
          }
          await sendInstagramMessage(senderId, replyText, correlationId, doctorToken);
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
