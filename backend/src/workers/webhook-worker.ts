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
  replyToInstagramComment,
  COMMENT_PUBLIC_REPLY_TEXT,
} from '../services/instagram-service';
import {
  getDoctorIdByPageIds,
  getInstagramAccessTokenForDoctor,
  getStoredInstagramPageIdForDoctor,
} from '../services/instagram-connect-service';
import { findOrCreatePlaceholderPatient, findPatientByIdWithAdmin, createPatientForBooking } from '../services/patient-service';
import { findPossiblePatientMatches } from '../services/patient-matching-service';
import {
  getAppointmentByIdForWorker,
  listAppointmentsForPatient,
} from '../services/appointment-service';
import { ConflictError, NotFoundError } from '../utils/errors';
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
  classifyCommentIntent,
  generateResponse,
  generateResponseWithActions,
  redactPhiForAI,
  parseMultiPersonBooking,
  AI_RECENT_MESSAGES_LIMIT,
  MEDICAL_QUERY_RESPONSE,
  EMERGENCY_RESPONSE,
} from '../services/ai-service';
import {
  executeAction,
  parseToolCallToAction,
} from '../services/action-executor-service';
import {
  getInitialCollectionStep,
  getCollectedData,
  clearCollectedData,
  validateAndApplyExtracted,
  buildConfirmDetailsMessage,
  tryRecoverAndSetFromMessages,
} from '../services/collection-service';
import { extractFieldsFromMessage, type ExtractedFields } from '../utils/extract-patient-fields';
import { REQUIRED_COLLECTION_FIELDS } from '../utils/validation';
import {
  parseConsentReply,
  persistPatientAfterConsent,
  handleConsentDenied,
  handleRevocation,
} from '../services/consent-service';
import { buildBookingPageUrl, buildReschedulePageUrl } from '../services/slot-selection-service';
import { processPaymentSuccess, hasCapturedPaymentForAppointment } from '../services/payment-service';
import { getDoctorSettings } from '../services/doctor-settings-service';
import type { DoctorSettingsRow } from '../types/doctor-settings';
import type { DoctorContext, GenerateResponseContext } from '../services/ai-service';
import {
  sendNewAppointmentToDoctor,
  sendPaymentConfirmationToPatient,
  sendPaymentReceivedToDoctor,
  sendCommentLeadToDoctor,
} from '../services/notification-service';
import { getRecentCommentLeadsWithDmSent } from '../services/comment-lead-service';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { paypalAdapter } from '../adapters/paypal-adapter';
import {
  getInstagramPageId,
  getInstagramPageIds,
  isInstagramCommentPayload,
  parseInstagramCommentPayload,
} from '../utils/webhook-event-id';
import { resolveDoctorIdFromComment } from '../services/comment-media-service';
import { createCommentLead } from '../services/comment-lead-service';
import type { CommentIntent } from '../types/ai';
import {
  tryAcquireConversationLock,
  releaseConversationLock,
  tryAcquireInstagramSendLock,
  tryAcquireReplyThrottle,
} from '../config/queue';
import type { WebhookJobData } from '../types/queue';
import type { InstagramWebhookPayload } from '../types/webhook';
import type { ConversationState } from '../types/conversation';

// ============================================================================
// Constants
// ============================================================================

/** Fallback when resolution returns null (no doctor linked for page) or AI/conversation flow is skipped */
const FALLBACK_REPLY = "Thanks for your message. We'll get back to you soon.";

/** e-task-7: High-intent comment intents (reply + DM per COMMENTS_MANAGEMENT_PLAN). */
const HIGH_INTENT_COMMENT: Set<CommentIntent> = new Set([
  'book_appointment',
  'check_availability',
  'pricing_inquiry',
  'general_inquiry',
  'medical_query',
]);

/** e-task-7: Skip intents (no storage, no outreach). */
const SKIP_INTENT_COMMENT: Set<CommentIntent> = new Set(['spam', 'joke', 'unrelated', 'vulgar']);


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

/** Last bot message asked for consent (Ready to pick a time? Do I have your consent? Anything else? etc.). */
function lastBotMessageAskedForConsent(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return (
        c.includes('ready to pick a time') ||
        c.includes('do i have your consent') ||
        c.includes('consent to use these details') ||
        (c.includes('anything else') && c.includes('say yes to continue'))
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

/** Last bot message asked for match confirmation (Same person? Reply Yes or No). */
function lastBotMessageAskedForMatch(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return c.includes('same person') && (c.includes('reply yes') || c.includes('yes or no'));
    }
  }
  return false;
}

/** Parse match confirmation reply: 'yes' | 'no' | '1' | '2' | 'unclear'. Unclear → treat as No. */
function parseMatchConfirmationReply(text: string, matchCount: number): 'yes' | 'no' | '1' | '2' | 'unclear' {
  const t = text.trim().toLowerCase();
  if (/^(yes|yeah|yep|ok|okay|sure|correct)$/.test(t)) return 'yes';
  if (/^(no|nope|new|different)$/.test(t)) return 'no';
  if (matchCount >= 1 && /^1$/.test(t)) return '1';
  if (matchCount >= 2 && /^2$/.test(t)) return '2';
  return 'unclear';
}

/** e-task-7: Build Patient ID hint when MRN available. */
function formatPatientIdHint(mrn?: string | null): string {
  if (!mrn?.trim()) return '';
  return `\n\nYour patient ID: **${mrn}**. Save this for future bookings.`;
}

/** e-task-7: Fetch patient and return MRN hint for slot message. */
async function getPatientIdHintForSlot(
  patientId: string | undefined,
  correlationId: string
): Promise<string> {
  if (!patientId) return '';
  const patient = await findPatientByIdWithAdmin(patientId, correlationId);
  return formatPatientIdHint(patient?.medical_record_number);
}

/** e-task-7: Build proactive DM by intent per COMMENTS_MANAGEMENT_PLAN. */
function buildCommentDMMessage(
  intent: CommentIntent,
  settings: DoctorSettingsRow | null
): string {
  const practiceName = settings?.practice_name?.trim() || 'Our practice';
  const specialty = settings?.specialty?.trim() || '';
  const address = settings?.address_summary?.trim() || '';
  const detailsBlock = `\n\n${practiceName}${specialty ? ` — ${specialty}` : ''}${address ? `. ${address}` : ''}`;

  const templates: Record<string, { ack: string; cta: string }> = {
    book_appointment: {
      ack: 'You expressed interest in booking.',
      cta: 'Reply here if you\'d like to schedule.',
    },
    check_availability: {
      ack: 'You asked about availability.',
      cta: 'Reply here if you\'d like to schedule a consultation.',
    },
    pricing_inquiry: {
      ack: 'You asked about pricing.',
      cta: 'Reply here if you\'d like more details.',
    },
    general_inquiry: {
      ack: 'You had a question.',
      cta: 'Reply here if you\'d like to connect.',
    },
    medical_query: {
      ack: 'Our doctor may be able to help with your query.',
      cta: 'If you\'d like to schedule a consultation, reply here.',
    },
  };

  const t = templates[intent] ?? templates.general_inquiry;
  return `${t.ack}${detailsBlock}\n\n${t.cta}`;
}

/** AI Receptionist: Get last bot message content for extraction context. */
function getLastBotMessage(
  recentMessages: { sender_type: string; content: string }[]
): string | undefined {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').trim();
      return c || undefined;
    }
  }
  return undefined;
}

/** Skip phrases for optional "Anything else?" — user declines to add extras. */
const SKIP_EXTRAS_PHRASES = [
  'nothing', 'skip', 'nope', 'no thanks', 'no thank you', 'all good', "that's all",
  'thats all', 'no', 'that\'s it', 'thats it', 'none', 'no extras', 'im good', "i'm good",
];

function isSkipExtrasReply(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  return SKIP_EXTRAS_PHRASES.some((p) => t === p || t === p + '.' || t.startsWith(p + ','));
}

/** Extract patient extras from consent reply. Returns trimmed string or undefined if none. */
function extractExtraNotesFromConsentReply(text: string, consentResult: 'granted' | 'denied' | 'unclear'): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (consentResult === 'denied') return undefined;
  if (isSkipExtrasReply(trimmed)) return undefined;

  if (consentResult === 'granted') {
    // "yes, on blood thinners" → "on blood thinners"
    const lower = trimmed.toLowerCase();
    for (const kw of ['yes', 'yeah', 'yep', 'agree', 'ok', 'okay', 'sure', 'i agree', 'i consent']) {
      if (lower === kw) return undefined;
      const prefix = kw + ',';
      if (lower.startsWith(prefix)) return trimmed.slice(prefix.length).trim() || undefined;
      const prefix2 = kw + ' ';
      if (lower.startsWith(prefix2)) return trimmed.slice(prefix2.length).trim() || undefined;
    }
    return undefined;
  }

  // unclear → treat as extras (e.g. "I'm on blood thinners")
  return trimmed;
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

/** Build AI context for generateResponse (e-task-1 Bot Intelligence). No PHI in output. */
async function buildAiContextForResponse(
  conversationId: string,
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[],
  _correlationId: string
): Promise<GenerateResponseContext> {
  const ctx: GenerateResponseContext = {};
  const inCollection =
    state.step?.startsWith('collecting_') ||
    state.step === 'consent' ||
    state.step === 'confirm_details' ||
    state.step === 'awaiting_match_confirmation' ||
    state.step === 'collecting_all';
  if (!inCollection) return ctx;

  const collected = await getCollectedData(conversationId);
  const collectedFields = state.collectedFields ?? [];
  const allFields = ['name', 'phone', 'age', 'gender', 'reason_for_visit', 'email'] as const;
  const summaryParts = allFields.map((f) => {
    const has = collectedFields.includes(f) || (collected && (collected as Record<string, unknown>)[f] != null && (collected as Record<string, unknown>)[f] !== '');
    return `${f}: [${has ? 'provided' : 'missing'}]`;
  });
  ctx.collectedDataSummary = summaryParts.join(', ');
  ctx.missingFields = REQUIRED_COLLECTION_FIELDS.filter((f) => !collectedFields.includes(f));
  if (ctx.missingFields.length === 0) ctx.missingFields = undefined;

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const content = (recentMessages[i].content ?? '').trim();
      if (content) {
        ctx.lastBotMessage = redactPhiForAI(content);
        break;
      }
    }
  }

  if (state.bookingForSomeoneElse) {
    ctx.bookingForSomeoneElse = true;
    if (state.relation) ctx.relation = state.relation;
  }
  return ctx;
}

/**
 * e-task-3: Heuristic for ambiguous collection messages. Route to AI when extraction returns empty
 * AND message looks like clarification, question, or short non-data. Don't break extraction for clear data.
 */
function isAmbiguousCollectionMessage(text: string, extracted: ExtractedFields): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const hasExtracted = !!(
    extracted.name ||
    extracted.phone ||
    (extracted.age !== undefined && extracted.age !== null) ||
    extracted.gender ||
    extracted.reason_for_visit ||
    extracted.email
  );
  if (hasExtracted) return false; // Clear data — use extraction path

  // Clarification: relation, who we're booking for
  const clarificationPatterns = [
    /\b(?:my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother)\s*\??\s*$/i,
    /\b(?:sister|mother|father)\s+first\b/i,
    /\bfor\s+my\s+(mother|father|sister|brother|wife|husband|son|daughter)\b/i,
    /\b(?:the\s+person\s+i'?m\s+booking\s+for|person\s+I'm\s+booking\s+for)\b/i,
    /\bcan\s+I\s+book\s+for\s+my\s+friend\b/i,
  ];
  if (clarificationPatterns.some((p) => p.test(trimmed))) return true;

  // Question: why, what if, can I share
  const questionPatterns = [
    /\bwhy\s+(do\s+you\s+need|are\s+you\s+asking)\b/i,
    /\bwhat\s+if\s+I\s+don'?t\s+have\b/i,
    /\bcan\s+I\s+share\b/i,
    /\bdo\s+I\s+have\s+to\s+(provide|give)\b/i,
    /\b(is\s+it\s+)?(really\s+)?necessary\b/i,
  ];
  if (questionPatterns.some((p) => p.test(trimmed))) return true;

  // Short message (< 25 chars) that doesn't look like structured data
  if (trimmed.length < 25 && !/\d{10,}/.test(trimmed) && !/@/.test(trimmed)) return true;

  return false;
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

/** Format appointment status for check_appointment_status: "Tue, Mar 14, 2026 at 2:00 PM (pending)" */
function formatAppointmentStatusLine(
  isoDate: string,
  status: string,
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
  return `${dateTimeStr} (${status})`;
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

  // Comment webhooks: entry[].changes[] with field "comments" → comment handler (e-task-7)
  if (isInstagramCommentPayload(payload)) {
    const parsed = parseInstagramCommentPayload(payload);
    if (!parsed) {
      logger.info(
        { eventId, provider, correlationId },
        'Instagram comment webhook: unparseable payload, marking processed'
      );
      await markWebhookProcessed(eventId, provider);
      return;
    }

    const { commentId, commenterIgId, commentText, mediaId, entryId } = parsed;
    const doctorId = entryId
      ? await resolveDoctorIdFromComment(entryId, mediaId, correlationId)
      : null;

    if (!doctorId) {
      logger.info(
        { eventId, provider, correlationId, entryId, mediaId },
        'Comment: no doctor resolved, marking processed'
      );
      await markWebhookProcessed(eventId, provider);
      return;
    }

    const intentResult = await classifyCommentIntent(commentText, correlationId);
    const intent = intentResult.intent;

    if (SKIP_INTENT_COMMENT.has(intent)) {
      logger.info(
        { eventId, provider, correlationId, intent },
        'Comment: skip intent, no outreach'
      );
      await markWebhookProcessed(eventId, provider);
      return;
    }

    const settings = await getDoctorSettings(doctorId);
    const isHighIntent = HIGH_INTENT_COMMENT.has(intent);
    let dmSent = false;
    let publicReplySent = false;

    await createCommentLead(
      {
        doctorId,
        commentId,
        commenterIgId,
        commentText,
        mediaId,
        intent,
        confidence: intentResult.confidence,
        publicReplySent: false,
        dmSent: false,
      },
      correlationId
    );

    if (isHighIntent) {
      const doctorToken = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
      if (doctorToken) {
        const dmMessage = buildCommentDMMessage(intent, settings);
        try {
          await sendInstagramMessage(commenterIgId, dmMessage, correlationId, doctorToken);
          dmSent = true;
        } catch (dmErr) {
          logger.warn(
            {
              correlationId,
              commentId,
              error: dmErr instanceof Error ? dmErr.message : String(dmErr),
            },
            'Comment: proactive DM failed (user may have blocked)'
          );
        }

        try {
          const replyResult = await replyToInstagramComment(
            commentId,
            COMMENT_PUBLIC_REPLY_TEXT,
            doctorToken,
            correlationId
          );
          publicReplySent = !!replyResult;
        } catch (replyErr) {
          logger.warn(
            {
              correlationId,
              commentId,
              error: replyErr instanceof Error ? replyErr.message : String(replyErr),
            },
            'Comment: public reply failed'
          );
        }

        if (dmSent || publicReplySent) {
          await createCommentLead(
            {
              doctorId,
              commentId,
              commenterIgId,
              commentText,
              mediaId,
              intent,
              confidence: intentResult.confidence,
              publicReplySent,
              dmSent,
            },
            correlationId
          );
        }
      }
    }

    sendCommentLeadToDoctor(
      doctorId,
      { intent, commentPreview: commentText },
      correlationId
    ).catch((err) => {
      logger.warn(
        { correlationId, doctorId, error: err instanceof Error ? err.message : String(err) },
        'Comment lead email failed (non-blocking)'
      );
    });

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
        type: 'comment',
        comment_id: commentId,
        intent,
        dm_sent: dmSent,
        public_reply_sent: publicReplySent,
      },
    });
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
    const recentMessages = await getRecentMessages(conversation.id, AI_RECENT_MESSAGES_LIMIT, correlationId);

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
      state.step === 'awaiting_match_confirmation' ||
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
    } else if (state.step === 'awaiting_cancel_choice') {
      // Cancel flow: user picks which appointment (1, 2, 3...)
      const ids = state.pendingCancelAppointmentIds ?? [];
      const trimmed = text.trim();
      const num = parseInt(trimmed, 10);
      if (num >= 1 && num <= ids.length) {
        const chosenId = ids[num - 1]!;
        const appointment = await getAppointmentByIdForWorker(chosenId, correlationId);
        if (!appointment || appointment.doctor_id !== doctorId) {
          replyText = "That appointment wasn't found. Please try again or say 'cancel appointment' to start over.";
          state = { ...state, step: 'responded', updatedAt: new Date().toISOString() };
        } else {
          const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
          const iso = typeof appointment.appointment_date === 'string'
            ? appointment.appointment_date
            : (appointment.appointment_date as Date).toISOString();
          const dateStr = formatAppointmentStatusLine(iso, '', tz).replace(' ()', '');
          replyText = `Cancel appointment on ${dateStr}? Reply **Yes** or **No**.`;
          state = {
            ...state,
            step: 'awaiting_cancel_confirmation',
            cancelAppointmentId: chosenId,
            pendingCancelAppointmentIds: undefined,
            updatedAt: new Date().toISOString(),
          };
        }
        await updateConversationState(conversation.id, state, correlationId);
      } else {
        replyText = `Please reply 1, 2, or ${ids.length}.`;
        await updateConversationState(conversation.id, state, correlationId);
      }
    } else if (state.step === 'awaiting_cancel_confirmation') {
      // Fast-path: clear yes/no executes immediately (no AI). Prevents AI returning text without tool call.
      const lower = text.trim().toLowerCase();
      const isYes = /^(yes|yeah|yep|ok|okay|cancel|confirm)$/.test(lower);
      const isNo = /^(no|nope|keep|don't|dont)$/.test(lower);
      let executedReply: string | undefined;
      let executedStateUpdate: Partial<ConversationState> | undefined;

      if (state.cancelAppointmentId && (isYes || isNo)) {
        const action = { type: 'confirm_cancel' as const, confirm: isYes };
        const result = await executeAction(action, {
          conversationId: conversation.id,
          doctorId,
          conversation,
          state,
          correlationId,
          timezone: doctorSettings?.timezone ?? undefined,
        });
        if (result.success && result.replyOverride) {
          executedReply = result.replyOverride;
          executedStateUpdate = result.stateUpdate;
        }
      }

      if (!executedReply) {
        // AI path: natural language (2737, go ahead, etc.)
        const aiResult = await generateResponseWithActions({
          conversationId: conversation.id,
          currentIntent: intentResult.intent,
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
          availableTools: ['confirm_cancel'],
        });
        if (aiResult.toolCalls?.length) {
          for (const tc of aiResult.toolCalls) {
            if (tc.name !== 'confirm_cancel') continue;
            const action = parseToolCallToAction(tc);
            if (!action || action.type !== 'confirm_cancel') continue;
            const result = await executeAction(action, {
              conversationId: conversation.id,
              doctorId,
              conversation,
              state,
              correlationId,
              timezone: doctorSettings?.timezone ?? undefined,
            });
            if (result.success && result.replyOverride) {
              executedReply = result.replyOverride;
              executedStateUpdate = result.stateUpdate;
              break;
            }
          }
        }
        if (!executedReply) {
          executedReply = aiResult.reply;
        }
      }

      replyText = executedReply || "Please reply **Yes** to cancel or **No** to keep your appointment.";
      if (executedStateUpdate) {
        state = { ...state, ...executedStateUpdate };
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else if (state.step === 'awaiting_reschedule_choice') {
      // Reschedule flow: user picks which appointment (1, 2, 3...)
      const ids = state.pendingRescheduleAppointmentIds ?? [];
      const trimmed = text.trim();
      const num = parseInt(trimmed, 10);
      if (num >= 1 && num <= ids.length) {
        const chosenId = ids[num - 1]!;
        const appointment = await getAppointmentByIdForWorker(chosenId, correlationId);
        if (!appointment || appointment.doctor_id !== doctorId) {
          replyText = "That appointment wasn't found. Please try again or say 'reschedule appointment' to start over.";
          state = { ...state, step: 'responded', updatedAt: new Date().toISOString() };
        } else {
          const url = buildReschedulePageUrl(conversation.id, doctorId, chosenId);
          replyText = `Pick a new date and time: [Choose new slot](${url})`;
          state = {
            ...state,
            step: 'awaiting_reschedule_slot',
            rescheduleAppointmentId: chosenId,
            pendingRescheduleAppointmentIds: undefined,
            updatedAt: new Date().toISOString(),
          };
        }
        await updateConversationState(conversation.id, state, correlationId);
      } else {
        replyText = `Please reply 1, 2, or ${ids.length}.`;
        await updateConversationState(conversation.id, state, correlationId);
      }
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
      const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
      const askingForSelfOnly = /\b(my\s+appointment|what\s+about\s+my\s+appointment)\b/i.test(text.trim());
      const patientIdsList = askingForSelfOnly
        ? [conversation.patient_id]
        : (() => {
            const ids = [conversation.patient_id];
            if (state.lastBookingPatientId && state.lastBookingPatientId !== conversation.patient_id) ids.push(state.lastBookingPatientId);
            if (state.bookingForPatientId && !ids.includes(state.bookingForPatientId)) ids.push(state.bookingForPatientId);
            return ids;
          })();
      const allAppointments: Awaited<ReturnType<typeof listAppointmentsForPatient>> = [];
      const seen = new Set<string>();
      for (const pid of patientIdsList) {
        const list = await listAppointmentsForPatient(pid, doctorId, correlationId);
        for (const a of list) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            allAppointments.push(a);
          }
        }
      }
      allAppointments.sort((a, b) => {
        const da = new Date(a.appointment_date).getTime();
        const db = new Date(b.appointment_date).getTime();
        return da - db;
      });
      const now = new Date();
      const upcoming = allAppointments.filter(
        (a) =>
          new Date(a.appointment_date) >= now &&
          (a.status === 'pending' || a.status === 'confirmed')
      );
      const resolveStatus = async (a: (typeof upcoming)[0]): Promise<string> => {
        if (a.status === 'confirmed') return 'confirmed';
        const paid = await hasCapturedPaymentForAppointment(a.id, correlationId);
        return paid ? 'confirmed' : a.status;
      };
      const formatWithName = (a: (typeof upcoming)[0], displayStatus: string) => {
        const iso = typeof a.appointment_date === 'string' ? a.appointment_date : a.appointment_date.toISOString();
        const line = formatAppointmentStatusLine(iso, displayStatus, tz);
        const isForSelf = a.patient_id === conversation.patient_id;
        return isForSelf ? line : `For **${a.patient_name || 'them'}**: ${line}`;
      };
      const hasSelfAppointment = upcoming.some((a) => a.patient_id === conversation.patient_id);
      if (upcoming.length === 0) {
        replyText =
          "You don't have any upcoming appointments. Say 'book appointment' to schedule one.";
      } else if (askingForSelfOnly && !hasSelfAppointment) {
        const other = upcoming[0];
        const iso = typeof other.appointment_date === 'string' ? other.appointment_date : other.appointment_date.toISOString();
        const displayStatus = await resolveStatus(other);
        const line = formatAppointmentStatusLine(iso, displayStatus, tz);
        replyText = `You don't have an appointment for yourself yet. The appointment on ${line} is for **${other.patient_name || 'someone else'}**. Would you like to book one for yourself?`;
      } else if (upcoming.length === 1) {
        const a = upcoming[0];
        const displayStatus = await resolveStatus(a);
        replyText = `Your next appointment is on ${formatWithName(a, displayStatus)}.`;
      } else {
        const a = upcoming[0];
        const displayStatus = await resolveStatus(a);
        replyText = `You have ${upcoming.length} upcoming appointments. Next: ${formatWithName(a, displayStatus)}.`;
      }
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (intentResult.intent === 'cancel_appointment') {
      const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
      const patientIdsList = (() => {
        const ids = [conversation.patient_id];
        if (state.lastBookingPatientId && state.lastBookingPatientId !== conversation.patient_id) ids.push(state.lastBookingPatientId);
        if (state.bookingForPatientId && !ids.includes(state.bookingForPatientId)) ids.push(state.bookingForPatientId);
        return ids.filter((p): p is string => !!p);
      })();
      const allAppointments: Awaited<ReturnType<typeof listAppointmentsForPatient>> = [];
      const seen = new Set<string>();
      for (const pid of patientIdsList) {
        const list = await listAppointmentsForPatient(pid, doctorId, correlationId);
        for (const a of list) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            allAppointments.push(a);
          }
        }
      }
      allAppointments.sort((a, b) => {
        const da = new Date(a.appointment_date).getTime();
        const db = new Date(b.appointment_date).getTime();
        return da - db;
      });
      const now = new Date();
      const upcoming = allAppointments.filter(
        (a) =>
          new Date(a.appointment_date) >= now &&
          (a.status === 'pending' || a.status === 'confirmed')
      );
      if (upcoming.length === 0) {
        replyText = "You don't have any upcoming appointments. Say 'book appointment' to schedule one.";
        state = { ...state, lastIntent: intentResult.intent, step: 'responded', updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      } else if (upcoming.length === 1) {
        const a = upcoming[0]!;
        const iso = typeof a.appointment_date === 'string' ? a.appointment_date : (a.appointment_date as Date).toISOString();
        const dateStr = formatAppointmentStatusLine(iso, '', tz).replace(' ()', '');
        replyText = `Your appointment is on ${dateStr}. Reply **Yes** to cancel, or **No** to keep it.`;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'awaiting_cancel_confirmation',
          cancelAppointmentId: a.id,
          pendingCancelAppointmentIds: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
      } else {
        const lines = upcoming.map((a, i) => {
          const iso = typeof a.appointment_date === 'string' ? a.appointment_date : (a.appointment_date as Date).toISOString();
          return `${i + 1}) ${formatAppointmentStatusLine(iso, '', tz).replace(' ()', '')}`;
        });
        replyText = `Which appointment would you like to cancel?\n\n${lines.join('\n')}\n\nReply 1, 2, or ${upcoming.length}.`;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'awaiting_cancel_choice',
          cancelAppointmentId: undefined,
          pendingCancelAppointmentIds: upcoming.map((a) => a.id),
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
      }
    } else if (intentResult.intent === 'reschedule_appointment') {
      const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
      const patientIdsList = (() => {
        const ids = [conversation.patient_id];
        if (state.lastBookingPatientId && state.lastBookingPatientId !== conversation.patient_id) ids.push(state.lastBookingPatientId);
        if (state.bookingForPatientId && !ids.includes(state.bookingForPatientId)) ids.push(state.bookingForPatientId);
        return ids.filter((p): p is string => !!p);
      })();
      const allAppointments: Awaited<ReturnType<typeof listAppointmentsForPatient>> = [];
      const seen = new Set<string>();
      for (const pid of patientIdsList) {
        const list = await listAppointmentsForPatient(pid, doctorId, correlationId);
        for (const a of list) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            allAppointments.push(a);
          }
        }
      }
      allAppointments.sort((a, b) => {
        const da = new Date(a.appointment_date).getTime();
        const db = new Date(b.appointment_date).getTime();
        return da - db;
      });
      const now = new Date();
      const upcoming = allAppointments.filter(
        (a) =>
          new Date(a.appointment_date) >= now &&
          (a.status === 'pending' || a.status === 'confirmed')
      );
      if (upcoming.length === 0) {
        replyText = "You don't have any upcoming appointments. Say 'book appointment' to schedule one.";
        state = { ...state, lastIntent: intentResult.intent, step: 'responded', updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      } else if (upcoming.length === 1) {
        const a = upcoming[0]!;
        const url = buildReschedulePageUrl(conversation.id, doctorId, a.id);
        replyText = `Pick a new date and time: [Reschedule](${url})`;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'awaiting_reschedule_slot',
          rescheduleAppointmentId: a.id,
          pendingRescheduleAppointmentIds: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
      } else {
        const lines = upcoming.map((a, i) => {
          const iso = typeof a.appointment_date === 'string' ? a.appointment_date : (a.appointment_date as Date).toISOString();
          return `${i + 1}) ${formatAppointmentStatusLine(iso, '', tz).replace(' ()', '')}`;
        });
        replyText = `Which appointment would you like to reschedule?\n\n${lines.join('\n')}\n\nReply 1, 2, or ${upcoming.length}.`;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'awaiting_reschedule_choice',
          rescheduleAppointmentId: undefined,
          pendingRescheduleAppointmentIds: upcoming.map((a) => a.id),
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
      }
    } else if (intentResult.intent === 'book_for_someone_else' && (state.step === 'responded' || state.step === 'awaiting_slot_selection')) {
      const multiPerson = parseMultiPersonBooking(text);
      if (multiPerson) {
        // e-task-4: Multi-person "me and my X" — other first, then offer self
        await clearCollectedData(conversation.id);
        const relation = multiPerson.relation;
        const relationPhrase = `your ${relation}`;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'collecting_all',
          collectedFields: [],
          bookingForSomeoneElse: true,
          relation,
          pendingSelfBooking: true,
          pendingOtherBooking: undefined,
          bookingForPatientId: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        replyText = `I'll help you book for both. Let's do one at a time—${relationPhrase} first, then you. Please share: Full name, Age, Mobile, Reason for visit for your ${relation}. Email (optional).`;
      } else {
        // Single-person book for someone else
        await clearCollectedData(conversation.id);
        const relationMatch = text.match(/\b(?:my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother|parent|spouse)\b/i);
        const relation = relationMatch ? relationMatch[1].toLowerCase() : 'them';
        const relationPhrase = relation === 'them' ? 'them' : `your ${relation}`;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'collecting_all',
          collectedFields: [],
          bookingForSomeoneElse: true,
          relation,
          bookingForPatientId: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        replyText = `I'll help you book for ${relationPhrase}. Please share: Full name, Age, Mobile, Reason for visit for the person you're booking for. Email (optional).`;
      }
    } else if (state.step === 'awaiting_match_confirmation' || (lastBotMessageAskedForMatch(recentMessages) && state.pendingMatchPatientIds?.length)) {
      // e-task-5: Handle match confirmation. Yes → use existing; No → create new; 1/2 → pick from multi-match.
      const matchIds = state.pendingMatchPatientIds ?? [];
      const matchCount = matchIds.length;
      const parsed = parseMatchConfirmationReply(text, matchCount);
      const useExisting = parsed === 'yes' || parsed === '1';
      const useSecond = parsed === '2' && matchCount >= 2;
      const createNew = parsed === 'no' || parsed === 'unclear';

      if (useExisting || useSecond) {
        const chosenId = useSecond ? matchIds[1]! : matchIds[0]!;
        await clearCollectedData(conversation.id);
        const slotLink = buildBookingPageUrl(conversation.id, doctorId);
        const mrnHint = await getPatientIdHintForSlot(chosenId, correlationId);
        const baseSlotMsg = `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
        replyText = state.pendingSelfBooking
          ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
          : baseSlotMsg;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'awaiting_slot_selection',
          bookingForPatientId: chosenId,
          bookingForSomeoneElse: false,
          pendingMatchPatientIds: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
      } else if (createNew) {
        let collectedBeforePersist = await getCollectedData(conversation.id);
        if (!collectedBeforePersist?.name?.trim() || !collectedBeforePersist?.phone?.trim()) {
          const recovered = await tryRecoverAndSetFromMessages(
            conversation.id,
            recentMessages,
            correlationId
          );
          if (recovered) collectedBeforePersist = await getCollectedData(conversation.id);
        }
        if (!collectedBeforePersist?.name?.trim() || !collectedBeforePersist?.phone?.trim()) {
          replyText =
            "I didn't receive the details. Please share: Full name, Age, Mobile, Reason for visit.";
          state = { ...state, updatedAt: new Date().toISOString() };
          await updateConversationState(conversation.id, state, correlationId);
        } else {
          const newPatient = await createPatientForBooking(
            doctorId,
            {
              name: collectedBeforePersist.name.trim(),
              phone: collectedBeforePersist.phone.trim(),
              age: collectedBeforePersist.age,
              gender: collectedBeforePersist.gender,
              email: collectedBeforePersist.email,
            },
            correlationId
          );
          await clearCollectedData(conversation.id);
          const slotLink = buildBookingPageUrl(conversation.id, doctorId);
          const mrnHint = formatPatientIdHint(newPatient.medical_record_number);
          const baseSlotMsg = `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
          replyText = state.pendingSelfBooking
            ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
            : baseSlotMsg;
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'awaiting_slot_selection',
            reasonForVisit: state.reasonForVisit ?? collectedBeforePersist.reason_for_visit,
            bookingForPatientId: newPatient.id,
            bookingForSomeoneElse: false,
            pendingMatchPatientIds: undefined,
            updatedAt: new Date().toISOString(),
          };
          await updateConversationState(conversation.id, state, correlationId);
        }
      } else {
        replyText =
          "Please reply Yes to use the existing record, or No to create a new patient. Reply 1 or 2 if we found multiple matches.";
        state = { ...state, updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
    } else if (state.step === 'consent' || (lastBotMessageAskedForConsent(recentMessages) && parseConsentReply(text) === 'granted')) {
      // Handle consent reply regardless of intent. Fallback: last bot asked for consent + user said yes.
      if (!state.step) {
        state = { ...state, step: 'consent', updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
        const consentResult = parseConsentReply(text);
      const hasExtrasOrGranted =
        consentResult === 'granted' ||
        (consentResult === 'unclear' && !isSkipExtrasReply(text));
      if (hasExtrasOrGranted) {
        const extraNotes = extractExtraNotesFromConsentReply(text, consentResult);
        let collectedBeforePersist = await getCollectedData(conversation.id);
        let reasonForVisitFromCollected = collectedBeforePersist?.reason_for_visit?.trim();

        if (state.bookingForSomeoneElse) {
          if (!collectedBeforePersist?.name?.trim() || !collectedBeforePersist?.phone?.trim()) {
            const recovered = await tryRecoverAndSetFromMessages(
              conversation.id,
              recentMessages,
              correlationId
            );
            if (recovered) collectedBeforePersist = await getCollectedData(conversation.id);
          }
          if (!collectedBeforePersist?.name?.trim() || !collectedBeforePersist?.phone?.trim()) {
            replyText =
              "I didn't receive the details for the person you're booking for. Please share: Full name, Age, Mobile, Reason for visit.";
            state = { ...state, updatedAt: new Date().toISOString() };
            await updateConversationState(conversation.id, state, correlationId);
          } else {
            const newPatient = await createPatientForBooking(
              doctorId,
              {
                name: collectedBeforePersist.name.trim(),
                phone: collectedBeforePersist.phone.trim(),
                age: collectedBeforePersist.age,
                gender: collectedBeforePersist.gender,
                email: collectedBeforePersist.email,
              },
              correlationId
            );
            await clearCollectedData(conversation.id);
            const slotLink = buildBookingPageUrl(conversation.id, doctorId);
            const mrnHint = formatPatientIdHint(newPatient.medical_record_number);
            const baseSlotMsg = `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
            replyText = state.pendingSelfBooking
              ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
              : baseSlotMsg;
            state = {
              ...state,
              lastIntent: intentResult.intent,
              step: 'awaiting_slot_selection',
              reasonForVisit: state.reasonForVisit ?? reasonForVisitFromCollected,
              extraNotes: extraNotes ?? state.extraNotes,
              bookingForPatientId: newPatient.id,
              bookingForSomeoneElse: false,
              updatedAt: new Date().toISOString(),
            };
            await updateConversationState(conversation.id, state, correlationId);
          }
        } else {
          let persistResult = await persistPatientAfterConsent(
            conversation.id,
            conversation.patient_id,
            'instagram_dm',
            correlationId
          );
          if (!persistResult.success) {
            const recovered = await tryRecoverAndSetFromMessages(
              conversation.id,
              recentMessages,
              correlationId
            );
            if (recovered) {
              collectedBeforePersist = await getCollectedData(conversation.id);
              reasonForVisitFromCollected = collectedBeforePersist?.reason_for_visit?.trim();
              persistResult = await persistPatientAfterConsent(
                conversation.id,
                conversation.patient_id,
                'instagram_dm',
                correlationId
              );
            }
          }
          const slotLink = buildBookingPageUrl(conversation.id, doctorId);
          const mrnHint = await getPatientIdHintForSlot(conversation.patient_id, correlationId);
          const baseSlotMsg = `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
          if (!persistResult.success) {
            replyText =
              `I had trouble saving your details—please say 'book appointment' to re-share them if needed. Meanwhile, ${baseSlotMsg}`;
          } else {
            replyText = state.pendingOtherBooking
              ? `${baseSlotMsg}\n\nWould you like to book for your ${state.pendingOtherBooking.relation} now?`
              : baseSlotMsg;
          }
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'awaiting_slot_selection',
            reasonForVisit: state.reasonForVisit ?? reasonForVisitFromCollected,
            extraNotes: extraNotes ?? state.extraNotes,
            updatedAt: new Date().toISOString(),
          };
          await updateConversationState(conversation.id, state, correlationId);
        }
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
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
          replyText = await generateResponse({
            conversationId: conversation.id,
            currentIntent: intentResult.intent,
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
          doctorContext,
          context: aiContext,
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
      // e-task-3: Relation clarification — update state.relation when detected (for AI context)
      if (state.bookingForSomeoneElse) {
        const relationMatch = text.match(/\b(?:my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother|parent|spouse)\b/i);
        if (relationMatch) {
          const relation = relationMatch[1].toLowerCase();
          const collected = await getCollectedData(conversation.id);
          const hasAnyData = collected?.name || collected?.phone || collected?.age !== undefined;
          if (!hasAnyData) {
            state = { ...state, lastIntent: intentResult.intent, relation, updatedAt: new Date().toISOString() };
            await updateConversationState(conversation.id, state, correlationId);
          }
        }
      }
      // e-task-4: "me first" — switch to self first when no data collected yet
      const wantsMeFirst =
        state.pendingSelfBooking &&
        state.bookingForSomeoneElse &&
        !state.collectedFields?.length &&
        /^(me\s+first|myself\s+first|book\s+for\s+me\s+first|i\s+want\s+to\s+book\s+for\s+myself\s+first)$/i.test(text.trim());
      if (wantsMeFirst && state.relation) {
        await clearCollectedData(conversation.id);
        const relation = state.relation;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'collecting_all',
          collectedFields: [],
          bookingForSomeoneElse: false,
          pendingSelfBooking: false,
          pendingOtherBooking: { relation },
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
        replyText = await generateResponse({
          conversationId: conversation.id,
          currentIntent: 'book_appointment',
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
          context: aiContext,
        });
      } else {
      // e-task-4: "actually just my sister" — cancel multi-person, single-person only
      const wantsJustOther =
        state.pendingSelfBooking &&
        state.bookingForSomeoneElse &&
        /^(actually\s+)?just\s+(my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother)$/i.test(text.trim());
      if (wantsJustOther) {
        const relationMatch = text.match(/\b(mother|father|mom|dad|wife|husband|son|daughter|sister|brother)\b/i);
        const relation = relationMatch ? relationMatch[1].toLowerCase() : state.relation ?? 'them';
          state = {
            ...state,
            lastIntent: intentResult.intent,
          pendingSelfBooking: false,
          relation,
          updatedAt: new Date().toISOString(),
          };
          await updateConversationState(conversation.id, state, correlationId);
        replyText = `Got it, just your ${relation} then. Please share: Full name, Age, Mobile, Reason for visit for your ${relation}. Email (optional).`;
      } else {
      const extracted = extractFieldsFromMessage(text);
      if (isAmbiguousCollectionMessage(text, extracted)) {
        // e-task-3: Route ambiguous (questions, clarifications, short non-data) to AI with full context
        if (
          extracted.name ||
          extracted.phone ||
          (extracted.age !== undefined && extracted.age !== null) ||
          extracted.gender ||
          extracted.reason_for_visit ||
          extracted.email
        ) {
          const extractResult = await validateAndApplyExtracted(
            conversation.id,
            text,
            { ...state, lastIntent: intentResult.intent },
            correlationId,
            { lastBotMessage: getLastBotMessage(recentMessages), recentMessages }
          );
          state = extractResult.newState;
          await updateConversationState(conversation.id, state, correlationId);
        }
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
          replyText = await generateResponse({
            conversationId: conversation.id,
            currentIntent: intentResult.intent,
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
          doctorContext,
          context: aiContext,
          });
      } else {
        const extractResult = await validateAndApplyExtracted(
            conversation.id,
            text,
            { ...state, lastIntent: intentResult.intent },
          correlationId,
          { lastBotMessage: getLastBotMessage(recentMessages), recentMessages }
          );
        state = extractResult.newState;
            await updateConversationState(conversation.id, state, correlationId);
        if (extractResult.missingFields.length === 0) {
          const collected = await getCollectedData(conversation.id);
          replyText = buildConfirmDetailsMessage(collected ?? {});
        } else {
          const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
          const aiReply = await generateResponse({
              conversationId: conversation.id,
              currentIntent: intentResult.intent,
              state,
              recentMessages,
              currentUserMessage: text,
              correlationId,
            doctorContext,
            context: { ...aiContext, missingFields: extractResult.missingFields },
          });
          replyText =
            aiReply && aiReply.length > 20 && !aiReply.includes("didn't quite get that")
              ? aiReply
              : (() => {
                  const labels: Record<string, string> = { name: 'full name', phone: 'phone number', age: 'age', gender: 'gender', reason_for_visit: 'reason for visit' };
                  return `Got it. Still need: ${extractResult.missingFields.map((f) => labels[f] ?? f).join(', ')}. Please share.`;
                })();
        }
      }
      }
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
        const name = collected?.name?.trim() || 'there';
        const phone = collected?.phone?.trim() || '';
        const phoneDisplay = phone ? `**${phone}**` : 'your number';

        if (state.bookingForSomeoneElse && collected?.name?.trim() && collected?.phone?.trim()) {
          // e-task-5: Match check before consent. If matches → awaiting_match_confirmation; else → consent.
          const matches = await findPossiblePatientMatches(
            doctorId,
            collected.phone.trim(),
            collected.name.trim(),
            collected.age,
            collected.gender,
            correlationId
          );
          if (matches.length > 0) {
            const ids = matches.slice(0, 2).map((m) => m.patientId);
            state = {
              ...state,
              lastIntent: intentResult.intent,
              step: 'awaiting_match_confirmation',
              pendingMatchPatientIds: ids,
              reasonForVisit: collected?.reason_for_visit,
              age: collected?.age,
              updatedAt: new Date().toISOString(),
            };
            await updateConversationState(conversation.id, state, correlationId);
            if (matches.length === 1) {
              replyText = `We found a record for **${matches[0]!.name}** with this number. Same person? Reply Yes or No.`;
          } else {
              const list = matches.slice(0, 2).map((m, i) => `${i + 1}. ${m.name}${m.age != null ? ` (${m.age})` : ''}`).join(', ');
              replyText = `We found ${matches.length} records: ${list}. Which one? Reply 1 or 2, or No for new patient.`;
          }
        } else {
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
            replyText = `Thanks. We'll use ${phoneDisplay} to confirm the appointment for **${name}**. Do I have your consent to use these details to schedule? Reply Yes to continue.`;
          }
        } else {
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
          if (state.bookingForSomeoneElse) {
            replyText = `Thanks. We'll use ${phoneDisplay} to confirm the appointment for **${name}**. Do I have your consent to use these details to schedule? Reply Yes to continue.`;
          } else {
            replyText = `Thanks, ${name}. We'll use ${phoneDisplay} to confirm your appointment by call or text. Anything else you'd like the doctor to know before your visit? (optional) Reply with your extras, or say Yes to continue.`;
          }
        }
      } else if (isCorrection) {
        const extractResult = await validateAndApplyExtracted(
          conversation.id,
          text,
          { ...state, lastIntent: intentResult.intent },
          correlationId,
          { lastBotMessage: getLastBotMessage(recentMessages), recentMessages }
        );
        state = extractResult.newState;
        await updateConversationState(conversation.id, state, correlationId);
        const collected = await getCollectedData(conversation.id);
        if (extractResult.missingFields.length === 0) {
          replyText = buildConfirmDetailsMessage(collected ?? {});
        } else {
          const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
          const aiReply = await generateResponse({
            conversationId: conversation.id,
            currentIntent: intentResult.intent,
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
            doctorContext,
            context: { ...aiContext, missingFields: extractResult.missingFields },
          });
          const labels: Record<string, string> = { name: 'full name', phone: 'phone number', age: 'age', gender: 'gender', reason_for_visit: 'reason for visit' };
          replyText =
            aiReply && aiReply.length > 20 && !aiReply.includes("didn't quite get that")
              ? aiReply
              : `Still need: ${extractResult.missingFields.map((f) => labels[f] ?? f).join(', ')}. Please share.`;
        }
          } else {
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
        replyText = await generateResponse({
          conversationId: conversation.id,
          currentIntent: intentResult.intent,
          state,
          recentMessages,
          currentUserMessage: text,
                correlationId,
          doctorContext,
          context: aiContext,
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
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
        replyText = await generateResponse({
          conversationId: conversation.id,
          currentIntent: intentResult.intent,
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
          context: aiContext,
        });
              } else {
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
        replyText = await generateResponse({
          conversationId: conversation.id,
          currentIntent: intentResult.intent,
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
          context: aiContext,
        });
      }
    } else if (state.step === 'awaiting_slot_selection') {
      const trimmed = text.trim().toLowerCase();
      const wantsNewLink =
        /^(change|pick another|different time|new link|another time|different slot)$/.test(trimmed) ||
        /^(change|pick)\s+(my\s+)?(slot|time)$/i.test(text.trim());
      const wantsSelfBooking =
        state.pendingSelfBooking &&
        (/^(yes|yeah|yep|ok|okay|sure|please|i'?d?\s+like\s+to|book\s+for\s+myself|book\s+one\s+for\s+me)$/.test(trimmed) ||
          /^(yes|yeah|yep),?\s*(i'?d?\s+like\s+to\s+)?(book\s+for\s+myself|book\s+one\s+for\s+me)/.test(trimmed));
      const wantsOtherBooking =
        state.pendingOtherBooking &&
        (/^(yes|yeah|yep|ok|okay|sure|please)$/.test(trimmed) ||
          new RegExp(`book\\s+(for\\s+)?(my\\s+)?${state.pendingOtherBooking.relation}`, 'i').test(trimmed));
      if (wantsOtherBooking) {
        // e-task-4: User said yes to booking for other after self booking
        await clearCollectedData(conversation.id);
        const relation = state.pendingOtherBooking!.relation;
        state = {
          ...state,
          lastIntent: 'book_for_someone_else',
          step: 'collecting_all',
          collectedFields: [],
          bookingForSomeoneElse: true,
          relation,
          pendingOtherBooking: undefined,
          bookingForPatientId: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        replyText = `Got it. Please share: Full name, Age, Mobile, Reason for visit for your ${relation}. Email (optional).`;
      } else if (wantsSelfBooking) {
        // e-task-4: User said yes to booking for self after first booking
        await clearCollectedData(conversation.id);
        state = {
          ...state,
          lastIntent: 'book_appointment',
          step: 'collecting_all',
          collectedFields: [],
          pendingSelfBooking: false,
          bookingForPatientId: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
        replyText = await generateResponse({
          conversationId: conversation.id,
          currentIntent: 'book_appointment',
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
          context: aiContext,
        });
      } else if (wantsNewLink) {
        const patientId = state.bookingForPatientId ?? conversation.patient_id;
        const mrnHint = await getPatientIdHintForSlot(patientId, correlationId);
        const slotLink = buildBookingPageUrl(conversation.id, doctorId);
        replyText =
          `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
        state = { ...state, updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
        } else {
        replyText =
          "Pick your slot and complete payment using the link above, or say 'change' to get a new link.";
        state = { ...state, updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
    } else if (state.step === 'confirming_slot') {
      // Unified flow: no chat confirmation. Migrate to awaiting_slot_selection with new link.
      const patientId = state.bookingForPatientId ?? conversation.patient_id;
      const mrnHint = await getPatientIdHintForSlot(patientId, correlationId);
      const slotLink = buildBookingPageUrl(conversation.id, doctorId);
      replyText =
        `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
      state = {
        ...state,
        step: 'awaiting_slot_selection',
        slotToConfirm: undefined,
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (state.step === 'selecting_slot') {
      // Legacy: redirect to external slot picker (e-task-5)
      const patientId = state.bookingForPatientId ?? conversation.patient_id;
      const mrnHint = await getPatientIdHintForSlot(patientId, correlationId);
      const slotLink = buildBookingPageUrl(conversation.id, doctorId);
      replyText =
        `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
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
        const mrnHint = formatPatientIdHint(patient.medical_record_number);
        replyText =
          `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
      state = {
        ...state,
        lastIntent: intentResult.intent,
          step: 'awaiting_slot_selection',
          consultationType: state.consultationType,
          updatedAt: new Date().toISOString(),
        };
      } else {
        // No patient data — start collection. Use deterministic all-at-once prompt (never one-by-one).
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: getInitialCollectionStep(),
          collectedFields: [],
        updatedAt: new Date().toISOString(),
      };
        await updateConversationState(conversation.id, state, correlationId);
        const practiceName = doctorContext?.practice_name?.trim() || 'the clinic';
        replyText = `Sure—happy to help you book at **${practiceName}**. Please share: Full name, Age, Gender, Mobile number, Reason for visit. Email (optional) for receipts.`;
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else {
      const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
      replyText = await generateResponse({
        conversationId: conversation.id,
        currentIntent: intentResult.intent,
        state,
        recentMessages,
        currentUserMessage: text,
        correlationId,
        doctorContext,
        context: aiContext,
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
      state.step === 'collecting_all' ||
      state.step === 'confirm_details' ||
      state.step === 'awaiting_match_confirmation' ||
      state.step === 'consent' ||
      state.step === 'awaiting_cancel_choice' ||
      state.step === 'awaiting_cancel_confirmation' ||
      state.step === 'awaiting_reschedule_choice' ||
      state.step === 'awaiting_reschedule_slot'
        ? state
        : {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
    await updateConversationState(conversation.id, stateToPersist, correlationId);

    // Send lock: one reply per webhook event (eventId). Allows "yes" twice in flow (confirm then consent).
    const pageId = pageIds[0] ?? getInstagramPageId(instagramPayload);
    if (pageId) {
      const sendLockAcquired = await tryAcquireInstagramSendLock(pageId, senderId, eventId);
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
    const webhookEntryId = pageIds[0] ?? getInstagramPageId(instagramPayload);
    const doctorPageId = await getStoredInstagramPageIdForDoctor(doctorId, correlationId) ?? null;
    if (webhookEntryId && doctorPageId && webhookEntryId !== doctorPageId) {
      logger.info(
        { correlationId, webhook_entry_id: webhookEntryId, doctor_page_id: doctorPageId, recipient_id: senderId },
        'Message webhook: page ID mismatch (diagnostic for 2018001)'
      );
    }
    let sendSucceeded = false;
    try {
      await sendInstagramMessage(senderId, replyText, correlationId, doctorToken);
      sendSucceeded = true;
    } catch (sendErr) {
      if (sendErr instanceof NotFoundError && webhookEntryId && doctorPageId && webhookEntryId !== doctorPageId) {
        const leads = await getRecentCommentLeadsWithDmSent(doctorId, 3, 10, correlationId);
        for (const lead of leads) {
          try {
            await sendInstagramMessage(lead.commenter_ig_id, replyText, correlationId, doctorToken);
            logger.info(
              { correlationId, commenter_ig_id: lead.commenter_ig_id },
              'DM sent via comment_lead fallback (2018001: message webhook senderId failed)'
            );
            sendSucceeded = true;
            break;
          } catch {
            // Try next lead
          }
        }
      }
      if (!sendSucceeded) throw sendErr;
    }
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
          const recentMessages = await getRecentMessages(conversation.id, AI_RECENT_MESSAGES_LIMIT, correlationId);
          const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId);
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
              context: aiContext,
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
            const sendAcquired = await tryAcquireInstagramSendLock(pageIdForSend, senderId, eventId);
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
          const recoveryEntryId = pageIds[0] ?? getInstagramPageId(instagramPayload);
          const recoveryDoctorPageId = await getStoredInstagramPageIdForDoctor(doctorId, correlationId) ?? null;
          let recoverySendSucceeded = false;
          try {
            await sendInstagramMessage(senderId, replyText, correlationId, doctorToken);
            recoverySendSucceeded = true;
          } catch (recoverySendErr) {
            if (recoverySendErr instanceof NotFoundError && recoveryEntryId && recoveryDoctorPageId && recoveryEntryId !== recoveryDoctorPageId) {
              const leads = await getRecentCommentLeadsWithDmSent(doctorId, 3, 10, correlationId);
              for (const lead of leads) {
                try {
                  await sendInstagramMessage(lead.commenter_ig_id, replyText, correlationId, doctorToken);
                  recoverySendSucceeded = true;
                  break;
                } catch {
                  // Try next lead
                }
              }
            }
            if (!recoverySendSucceeded) throw recoverySendErr;
          }
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
