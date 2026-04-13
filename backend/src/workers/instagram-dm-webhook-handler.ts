/**
 * Instagram DM / messaging webhook handler (RBH-05).
 * State machine, locks, AI replies - split from webhook-worker.
 *
 * RBH-17 (three layers):
 * - **Understand:** `classifyIntent` (+ `applyIntentPostClassificationPolicy`) — LLM intent; optional regex fast-paths in ai-service.
 * - **Decide:** This file's branch chain (after classify) — which flow runs; state transitions.
 * - **Say:** Templates / `composeIdleFeeQuoteDmWithMetaAsync` / `composeMidCollectionFeeQuoteDmWithMetaAsync` / `resolveSafetyMessage` / `generateResponse` — tone via LLM, but ₹ + URLs must come from code (see `DoctorContext`, formatters).
 *
 * **Branch order** (keep stable; doc: docs/Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md):
 * revoke → paused → cancel/reschedule step gates → emergency → staff review → consultation channel pick → **reason-first triage (e-task-dm-04)** when `reasonFirstTriagePhase` set or when booking/channel intake would skip confirmed visit reasons → medical (idle) → fee quote (idle) → greeting (idle) → status/cancel/reschedule/book_other → match/consent/collection → default AI. Waiting on **channel pick alone** does not block medical/reason-first (`inCollection` uses resolved pick only).
 */

import { logger } from '../config/logger';
import { env } from '../config/env';
import { logAuditEvent } from '../utils/audit-logger';
import { markWebhookProcessed, markWebhookFailed } from '../services/webhook-idempotency-service';
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
import { findOrCreatePlaceholderPatient, findPatientByIdWithAdmin, createPatientForBooking } from '../services/patient-service';
import { findPossiblePatientMatches } from '../services/patient-matching-service';
import { getAppointmentByIdForWorker } from '../services/appointment-service';
import {
  buildRelatedPatientIdsForWebhook,
  getMergedUpcomingAppointmentsForRelatedPatients,
} from '../services/webhook-appointment-helpers';
import { ConflictError } from '../utils/errors';
import {
  findConversationByPlatformId,
  createConversation,
  getConversationState,
  updateConversationState,
  getOnlyInstagramConversationSenderId,
  normalizeLegacySlotConversationSteps,
} from '../services/conversation-service';
import { createMessage, getRecentMessages, getSenderIdByPlatformMessageId } from '../services/message-service';
import {
  applyEmergencyIntentPostPolicy,
  applyIntentPostClassificationPolicy,
  appendOptionalDmReplyBridge,
  buildClassifyIntentContext,
  classifyIntent,
  classifierSignalsFeeThreadContinuation,
  classifierSignalsPaymentExistence,
  generateResponse,
  generateResponseWithActions,
  intentSignalsFeeOrPricing,
  redactPhiForAI,
  userSignalsReasonFirstWrapUp,
  resolvePostMedicalPaymentExistenceAck,
  resolveVisitReasonSnippetForTriage,
  parseMultiPersonBooking,
  extractBookForSomeoneElseRelationKeyword,
  resolveBookingTargetRelationForDm,
  AI_RECENT_MESSAGES_LIMIT,
  resolveConsentReplyForBooking,
  resolveConfirmDetailsReplyForBooking,
} from '../services/ai-service';
import {
  isEmergencyUserMessage,
  recentThreadHasAssistantEmergencyEscalation,
  resolveSafetyMessage,
  userMessageSignalsPostEmergencyStability,
} from '../utils/safety-messages';
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
  seedCollectedReasonFromStateIfValid,
} from '../services/collection-service';
import { extractFieldsFromMessage, type ExtractedFields } from '../utils/extract-patient-fields';
import { isSkipExtrasReply } from '../utils/booking-consent-context';
import { REQUIRED_COLLECTION_FIELDS } from '../utils/validation';
import {
  persistPatientAfterConsent,
  handleConsentDenied,
  handleRevocation,
} from '../services/consent-service';
import { buildBookingPageUrl, buildReschedulePageUrl } from '../services/slot-selection-service';
import {
  formatBookingLinkDm,
  formatBookingAwaitingFollowUpDm,
  formatRescheduleChoiceLinkDm,
  formatRescheduleLinkDm,
} from '../utils/booking-link-copy';
import { hasCapturedPaymentForAppointment } from '../services/payment-service';
import { getDoctorSettings } from '../services/doctor-settings-service';
import type { DoctorSettingsRow } from '../types/doctor-settings';
import type { DmHandlerBranch } from '../types/dm-instrumentation';
import type { DoctorContext, GenerateResponseContext } from '../services/ai-service';
import { getInstagramPageId, getInstagramPageIds } from '../utils/webhook-event-id';
import { tryAcquireConversationLock, releaseConversationLock } from '../config/queue';
import { sendInstagramDmWithLocksAndFallback } from './webhook-dm-send';
import {
  classifyInstagramDmFailureReason,
  logWebhookConflictRecovery,
  logWebhookInstagramDmDelivery,
  logWebhookInstagramDmPipelineTiming,
} from '../services/webhook-metrics';
import type { InstagramWebhookPayload, WebhookProvider } from '../types/webhook';
import {
  applyMatcherProposalToConversationState,
  conversationLastPromptKindForStep,
  isRecentMedicalDeflectionWindow,
  isSlotBookingBlockedPendingStaffReview,
  type ConversationState,
} from '../types/conversation';
import type { Message } from '../types';
import { getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import {
  candidateLabelsForCatalog,
  matchServiceCatalogOffering,
} from '../services/service-catalog-matcher';
import {
  type ConsultationFeeAmbiguousStaffReview,
  feeThreadHasCompetingVisitTypeBuckets,
  formatAppointmentFeeForAiContext,
  formatServiceCatalogForAiContext,
  isTeleconsultCatalogAuthoritative,
  mergeFeeCatalogMatchText,
  teleconsultCatalogServiceRowCount,
  userExplicitlyWantsToBookNow,
} from '../utils/consultation-fees';
import {
  lastBotAskedForConsultationChannel,
  parseConsultationChannelUserReply,
} from '../utils/dm-consultation-channel';
import {
  composeIdleFeeQuoteDmWithMetaAsync,
  composeMidCollectionFeeQuoteDmWithMetaAsync,
} from '../utils/dm-reply-composer';
import { logInstagramDmRouting } from '../utils/log-instagram-dm-routing';
import {
  formatAwaitingStaffServiceConfirmationDm,
  formatStaffServiceReviewStillPendingDm,
} from '../utils/staff-service-review-dm';
import { tryApplyLearningPolicyAutobook } from '../services/service-match-learning-autobook';
import { upsertPendingStaffServiceReviewRequest } from '../services/service-staff-review-service';
import { buildFeeCatalogMatchText } from '../utils/dm-turn-context';
import {
  bookingShouldDeferToReasonFirstTriage,
  clinicalLedFeeThread,
  feeFollowUpAnaphora,
  formatClinicalReasonAskMoreAfterDeflection,
  formatReasonFirstAskWhatElseToAdd,
  formatReasonFirstConfirmClarify,
  formatReasonFirstConfirmQuestion,
  formatReasonFirstFeePatienceBridgeWhileAskMore,
  formatReasonFirstGateBeforeIntake,
  isVagueConsultationPaymentExistenceQuestion,
  lastAssistantDmContent,
  lastBotAskedAnythingElseBeforeFee,
  parseNothingElseOrSameOnly,
  parseReasonFirstAskMoreAmbiguousYes,
  parseReasonTriageConfirmYes,
  parseReasonTriageNegationForClarify,
  recentPatientThreadHasClinicalReason,
  shouldDeferIdleFeeForReasonFirstTriage,
  userMessageSuggestsClinicalReason,
  userWantsExplicitFullFeeList,
} from '../utils/reason-first-triage';

/** Fallback when resolution returns null or AI/conversation flow is skipped */
const FALLBACK_REPLY = "Thanks for your message. We'll get back to you soon.";

function mergeFeeQuoteMatcherIntoState(
  state: ConversationState,
  fin: {
    matcherProposedCatalogServiceKey: string;
    matcherProposedCatalogServiceId: string;
    matcherProposedConsultationModality?: 'text' | 'voice' | 'video';
    serviceCatalogMatchConfidence: 'high' | 'medium' | 'low';
    serviceCatalogMatchReasonCodes: string[];
  }
): ConversationState {
  return applyMatcherProposalToConversationState(state, {
    matcherProposedCatalogServiceKey: fin.matcherProposedCatalogServiceKey,
    matcherProposedCatalogServiceId: fin.matcherProposedCatalogServiceId,
    matcherProposedConsultationModality: fin.matcherProposedConsultationModality,
    serviceCatalogMatchConfidence: fin.serviceCatalogMatchConfidence,
    serviceCatalogMatchReasonCodes: fin.serviceCatalogMatchReasonCodes,
    finalizeSelection: true,
    pendingStaffServiceReview: false,
  });
}

/** Competing NCD vs acute/general thread: staff assigns visit type; no patient-facing multi-tier fee menu. */
function mergeStateForFeeAmbiguousStaffReview(
  state: ConversationState,
  review: ConsultationFeeAmbiguousStaffReview,
  extra: Partial<ConversationState>,
  candidateLabels?: Array<{ service_key: string; label: string }>
): ConversationState {
  const merged = { ...state, ...extra };
  return {
    ...applyMatcherProposalToConversationState(merged, {
      matcherProposedCatalogServiceKey: review.matcherProposedCatalogServiceKey,
      matcherProposedCatalogServiceId: review.matcherProposedCatalogServiceId,
      serviceCatalogMatchConfidence: review.serviceCatalogMatchConfidence,
      serviceCatalogMatchReasonCodes: review.serviceCatalogMatchReasonCodes,
      matcherCandidateLabels: candidateLabels,
      pendingStaffServiceReview: true,
      finalizeSelection: false,
    }),
    step: 'awaiting_staff_service_confirmation',
    activeFlow: undefined,
    reasonFirstTriagePhase: undefined,
    postMedicalConsultFeeAckSent: undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Fee-deferral staff gate: full-catalog candidate slice for learn-05 pattern_key parity. */
function matcherCandidateLabelsForFeeStaffReview(
  doctorSettings: DoctorSettingsRow | null
): Array<{ service_key: string; label: string }> | undefined {
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog?.services?.length) return undefined;
  return candidateLabelsForCatalog(catalog);
}

/** ARM-04: After details confirm → consent, map reason for visit to catalog row (deterministic + LLM). */
async function enrichStateWithServiceCatalogMatch(
  baseState: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  reasonForVisit: string | null | undefined,
  recentMessages: Message[],
  correlationId: string
): Promise<ConversationState> {
  const trimmed = reasonForVisit?.trim();
  if (!trimmed) {
    return baseState;
  }
  if (!doctorSettings) {
    return baseState;
  }
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog?.services.length) {
    return baseState;
  }
  const recentPatient = recentMessages
    .filter((m) => m.sender_type === 'patient')
    .slice(-5)
    .map((m) => m.content ?? '');

  const match = await matchServiceCatalogOffering({
    catalog,
    reasonForVisitText: trimmed,
    recentUserMessages: recentPatient,
    correlationId,
    doctorProfile: {
      practiceName: doctorSettings.practice_name,
      specialty: doctorSettings.specialty,
    },
  });

  if (!match) {
    return baseState;
  }

  logger.info(
    {
      correlationId,
      serviceCatalogMatchSource: match.source,
      serviceCatalogMatchConfidence: match.confidence,
      catalogServiceKey: match.catalogServiceKey,
      pendingStaffReview: match.pendingStaffReview,
    },
    'instagram_dm_service_catalog_match'
  );

  return applyMatcherProposalToConversationState(baseState, {
    matcherProposedCatalogServiceKey: match.catalogServiceKey,
    matcherProposedCatalogServiceId: match.catalogServiceId,
    matcherProposedConsultationModality: match.suggestedModality,
    serviceCatalogMatchConfidence: match.confidence,
    serviceCatalogMatchReasonCodes: match.reasonCodes,
    matcherCandidateLabels: match.candidateLabels,
    pendingStaffServiceReview: match.pendingStaffReview,
    finalizeSelection: match.autoFinalize,
  });
}

/** ARM-05: intake complete but matcher requires staff — no slot link yet. */
function transitionToAwaitingStaffServiceConfirmation(
  base: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  intent: ConversationState['lastIntent'],
  patch: Partial<ConversationState>
): { state: ConversationState; replyText: string } {
  const merged: ConversationState = {
    ...base,
    ...patch,
    lastIntent: intent,
    step: 'awaiting_staff_service_confirmation',
    updatedAt: new Date().toISOString(),
  };
  return {
    state: merged,
    replyText: formatAwaitingStaffServiceConfirmationDm(doctorSettings, merged),
  };
}

/**
 * RBH-09: Default DM when receptionist automation is paused.
 * Does not promise an immediate human reply (ops/legal).
 */
export const DEFAULT_INSTAGRAM_RECEPTIONIST_PAUSE_MESSAGE =
  'Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.';

function resolveInstagramReceptionistPauseMessage(settings: DoctorSettingsRow | null): string {
  const custom = settings?.instagram_receptionist_pause_message?.trim();
  if (custom) return custom;
  return DEFAULT_INSTAGRAM_RECEPTIONIST_PAUSE_MESSAGE;
}

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
        (c.includes('anything else') && c.includes('say yes to continue')) ||
        (c.includes('consent') &&
          (c.includes('reply') ||
            c.includes('share') ||
            c.includes('scheduling') ||
            c.includes('appointment') ||
            c.includes('details') ||
            c.includes('clinic'))) ||
        /\b(i consent|say yes to consent|grant consent)\b/.test(c)
      );
    }
  }
  return false;
}

/** Last bot message asked for confirm (template or AI wording before consent / slot link). */
function lastBotMessageAskedForConfirm(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      if (c.includes('is this correct') && c.includes('reply yes')) return true;
      // Optional-extras consent ("say Yes to continue") is not detail confirmation
      if (c.includes('anything else') && c.includes('say yes to continue') && !c.includes('detail')) {
        return false;
      }
      const mentionsDetailConfirm =
        (c.includes('confirm') && (c.includes('detail') || c.includes('correct'))) ||
        (c.includes('detail') && c.includes('correct')) ||
        c.includes('is this correct');
      const asksAffirmation =
        (c.includes('reply') && /\b(yes|yeah|yep|confirm|okay|ok)\b/.test(c)) ||
        /\byes,?\s+i\s+confirm\b/.test(c) ||
        c.includes('yes to proceed') ||
        (c.includes('slot') &&
          (c.includes('picker') || c.includes('pick') || c.includes('select') || c.includes('link')) &&
          (c.includes('confirm') || c.includes('correct')));
      return mentionsDetailConfirm && asksAffirmation;
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

/** RBH-07: Prefer structured `lastPromptKind`; legacy conversations fall back to substring heuristics. */
function effectiveAskedForDetails(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  return state.lastPromptKind === 'collect_details' || lastBotMessageAskedForDetails(recentMessages);
}

function effectiveAskedForConsent(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  return state.lastPromptKind === 'consent' || lastBotMessageAskedForConsent(recentMessages);
}

function effectiveAskedForConfirm(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  return state.lastPromptKind === 'confirm_details' || lastBotMessageAskedForConfirm(recentMessages);
}

function effectiveAskedForMatch(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  return state.lastPromptKind === 'match_pick' || lastBotMessageAskedForMatch(recentMessages);
}

/** Parse match confirmation reply: 'yes' | 'no' | '1' | '2' | 'unclear'. Unclear -> treat as No. */
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

/** Extract patient extras from consent reply. Returns trimmed string or undefined if none. */
function extractExtraNotesFromConsentReply(text: string, consentResult: 'granted' | 'denied' | 'unclear'): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (consentResult === 'denied') return undefined;
  if (isSkipExtrasReply(trimmed)) return undefined;

  if (consentResult === 'granted') {
    // "yes, on blood thinners" -> "on blood thinners"
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

  // unclear -> treat as extras (e.g. "I'm on blood thinners")
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
  _correlationId: string,
  currentUserMessage?: string,
  teleconsultCatalogRowCount?: number
): Promise<GenerateResponseContext> {
  const ctx: GenerateResponseContext = {};
  const inCollection =
    state.step?.startsWith('collecting_') ||
    state.step === 'consent' ||
    state.step === 'confirm_details' ||
    state.step === 'awaiting_match_confirmation' ||
    state.step === 'collecting_all' ||
    state.lastPromptKind === 'collect_details' ||
    state.lastPromptKind === 'consent' ||
    state.lastPromptKind === 'confirm_details' ||
    state.lastPromptKind === 'match_pick';

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const content = (recentMessages[i].content ?? '').trim();
      if (content) {
        ctx.lastBotMessage = redactPhiForAI(content);
        break;
      }
    }
  }

  if (currentUserMessage !== undefined) {
    const catalogMatchText = buildFeeCatalogMatchText(currentUserMessage, recentMessages);
    const feeThreadMerged = mergeFeeCatalogMatchText(currentUserMessage, catalogMatchText);
    if (feeThreadHasCompetingVisitTypeBuckets(feeThreadMerged)) {
      ctx.competingVisitTypeBuckets = true;
    }
    if (
      teleconsultCatalogRowCount != null &&
      teleconsultCatalogRowCount > 1 &&
      clinicalLedFeeThread({ state, recentMessages })
    ) {
      ctx.silentAssignmentStrict = true;
    }
  }

  if (!inCollection) {
    const feeIdle =
      state.activeFlow === 'fee_quote' || state.lastPromptKind === 'fee_quote';
    if (state.reasonFirstTriagePhase) {
      ctx.idleDialogueHint =
        'Thread note: The assistant is in reason-first triage (anything else to address at this visit, then confirm a short summary) before consultation fees. Keep replies aligned unless the user clearly changes topic.';
    } else if (feeIdle) {
      ctx.idleDialogueHint =
        'Thread note: The user was recently discussing consultation fees or pricing. Short follow-ups about visit type or channel usually continue that thread unless they clearly change topic.';
    } else if (isRecentMedicalDeflectionWindow(state)) {
      ctx.idleDialogueHint =
        'Thread note: The user recently got the standard message that specific medical advice cannot be given here. Help with booking, fees, or general practice info is appropriate; do not diagnose or treat.';
    }
    const suppressIdleFees =
      !feeIdle &&
      !state.reasonForVisit?.trim() &&
      clinicalLedFeeThread({ state, recentMessages });
    if (suppressIdleFees) {
      ctx.suppressConsultationFeeFacts = true;
    }
    return ctx;
  }

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

  if (state.bookingForSomeoneElse) {
    ctx.bookingForSomeoneElse = true;
    if (state.relation) ctx.relation = state.relation;
  }

  const reasonInRedis =
    collected &&
    typeof (collected as Record<string, unknown>).reason_for_visit === 'string' &&
    String((collected as Record<string, unknown>).reason_for_visit).trim().length > 0;
  const reasonCollected =
    collectedFields.includes('reason_for_visit') ||
    reasonInRedis ||
    Boolean(state.reasonForVisit?.trim());
  if (clinicalLedFeeThread({ state, recentMessages }) && !reasonCollected) {
    ctx.suppressConsultationFeeFacts = true;
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
  if (hasExtracted) return false; // Clear data - use extraction path

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

/** Build doctor context for AI (e-task-4, e-task-2 consultation_types, SFU-08 catalog) */
function getDoctorContextFromSettings(settings: DoctorSettingsRow | null): DoctorContext | undefined {
  if (!settings) return undefined;
  const catalogAi = formatServiceCatalogForAiContext({
    service_offerings_json: settings.service_offerings_json,
    appointment_fee_currency: settings.appointment_fee_currency,
  });
  const catalogAuthority = isTeleconsultCatalogAuthoritative({
    service_offerings_json: settings.service_offerings_json,
    appointment_fee_currency: settings.appointment_fee_currency,
  });
  /** When catalog defines teleconsult offers, do not inject legacy consultation_types / clinic address / flat fee into LLM context. */
  const hasFeeOnFile =
    !catalogAuthority &&
    settings.appointment_fee_minor != null &&
    settings.appointment_fee_minor > 0;
  const hasTeleconsultCatalogPricing = Boolean(catalogAi?.trim());
  const hasAny =
    settings.practice_name ||
    settings.business_hours_summary ||
    settings.welcome_message ||
    settings.specialty ||
    (!catalogAuthority && settings.address_summary) ||
    (!catalogAuthority && settings.consultation_types) ||
    hasFeeOnFile ||
    hasTeleconsultCatalogPricing ||
    (settings.cancellation_policy_hours != null && settings.cancellation_policy_hours > 0);
  if (!hasAny) return undefined;
  return {
    practice_name: settings.practice_name,
    business_hours_summary: settings.business_hours_summary,
    welcome_message: settings.welcome_message,
    specialty: settings.specialty,
    address_summary: catalogAuthority ? null : settings.address_summary,
    cancellation_policy_hours: settings.cancellation_policy_hours,
    consultation_types: catalogAuthority ? null : settings.consultation_types,
    appointment_fee_currency: settings.appointment_fee_currency ?? null,
    appointment_fee_summary: catalogAuthority
      ? null
      : formatAppointmentFeeForAiContext(
          {
            appointment_fee_minor: settings.appointment_fee_minor,
            appointment_fee_currency: settings.appointment_fee_currency,
          },
          { teleconsultCatalogPresent: hasTeleconsultCatalogPricing }
        ),
    service_catalog_summary_for_ai: catalogAi,
    teleconsultCatalogAuthoritative: catalogAuthority || undefined,
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

export async function processInstagramDmWebhook(params: {
  eventId: string;
  correlationId: string;
  provider: WebhookProvider;
  payload: unknown;
}): Promise<void> {
  const { eventId, correlationId, provider, payload } = params;

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
    const handlerT0 = Date.now();
    let dmGenerateMs = 0;
    let greetingFastPath = false;

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

    let state = await getConversationState(conversation.id, correlationId);
    const normalizedState = normalizeLegacySlotConversationSteps(state);
    if (normalizedState !== state) {
      state = normalizedState;
      await updateConversationState(conversation.id, state, correlationId);
    }
    const recentMessages = await getRecentMessages(conversation.id, AI_RECENT_MESSAGES_LIMIT, correlationId);

    const intentStartedAt = Date.now();
    const classifyCtx = buildClassifyIntentContext(state, recentMessages);
    let intentResult = await classifyIntent(
      text,
      correlationId,
      classifyCtx ? { classifyContext: classifyCtx } : undefined
    );
    intentResult = applyIntentPostClassificationPolicy(intentResult, text, state);
    intentResult = applyEmergencyIntentPostPolicy(intentResult, text, recentMessages);
    const intentMs = Date.now() - intentStartedAt;

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

    const doctorSettings = await getDoctorSettings(doctorId);
    const doctorContext = getDoctorContextFromSettings(doctorSettings);
    const recentDmForClinical = recentMessages.map((m) => ({
      sender_type: m.sender_type,
      content: m.content ?? '',
    }));
    const lastAssistantRawForFee = lastAssistantDmContent(recentDmForClinical);
    const teleconsultCatalogRowCount = teleconsultCatalogServiceRowCount(
      doctorSettings?.service_offerings_json
    );
    const clinicalLedForFees = clinicalLedFeeThread({
      state,
      recentMessages: recentDmForClinical,
    });
    const feeComposerClinicalOpts = clinicalLedForFees
      ? ({ clinicalLedFeeThread: true } as const)
      : {};
    /** Clinical-led + multi-row catalog: allow one LLM catalog narrow before staff deferral (see `FEE_DM_CATALOG_LLM_NARROW_ENABLED`). */
    const feeComposerOpts = {
      ...feeComposerClinicalOpts,
      ...(clinicalLedForFees && teleconsultCatalogRowCount > 1
        ? {
            llmCatalogNarrow: {
              correlationId,
              recentUserMessages: recentMessages
                .filter((m) => m.sender_type === 'patient')
                .slice(-8)
                .map((m) => redactPhiForAI(m.content ?? '')),
              doctorProfile: {
                practiceName: doctorSettings?.practice_name ?? null,
                specialty: doctorSettings?.specialty ?? null,
              },
            },
          }
        : {}),
    };

    // -------------------------------------------------------------------------
    // RBH-17: Main reply decision tree (Decide + Say). Understand already ran above.
    // Order: see file header. Prefer deterministic Say for fees/safety; LLM for open wording.
    // -------------------------------------------------------------------------
    const stateStepBefore = state.step ?? null;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = FALLBACK_REPLY;
    const isBookIntent = intentResult.intent === 'book_appointment';
    const isRevokeIntent = intentResult.intent === 'revoke_consent';
    const lastBotAskedForDetails = effectiveAskedForDetails(state, recentMessages);
    const lastBotAskedChannelPick = lastBotAskedForConsultationChannel(recentMessages);
    const channelReplyPick = lastBotAskedChannelPick ? parseConsultationChannelUserReply(text) : null;
    /**
     * Outstanding channel prompt alone is not "collecting PHI" — must not block medical_query / reason-first
     * when the patient sends symptoms instead of text/voice/video.
     */
    const inCollection =
      state.step?.startsWith('collecting_') ||
      state.step === 'consent' ||
      state.step === 'confirm_details' ||
      state.step === 'awaiting_match_confirmation' ||
      state.step === 'awaiting_staff_service_confirmation' ||
      lastBotAskedForDetails ||
      (lastBotAskedChannelPick && channelReplyPick != null) ||
      state.lastPromptKind === 'collect_details' ||
      state.lastPromptKind === 'consent' ||
      state.lastPromptKind === 'confirm_details' ||
      state.lastPromptKind === 'match_pick' ||
      state.lastPromptKind === 'staff_service_pending';
    const justStartingCollection =
      isBookIntent && !state.step && !(state.collectedFields?.length);
    /** RBH-18: Classifier topics / is_fee_question OR keyword fallback; e-task-dm-05/06: regex anaphora + classifier fee-thread continuation */
    const classifierSignalsFeePricing = intentSignalsFeeOrPricing(intentResult, text);
    const classifierFeeThreadCont = classifierSignalsFeeThreadContinuation(
      intentResult,
      lastAssistantRawForFee
    );
    const signalsFeePricing =
      classifierSignalsFeePricing ||
      feeFollowUpAnaphora(text, lastAssistantRawForFee) ||
      classifierFeeThreadCont;
    const feeIdleRoutedByAnaphora =
      !classifierSignalsFeePricing &&
      (feeFollowUpAnaphora(text, lastAssistantRawForFee) || classifierFeeThreadCont);

    const runGenerateResponse = async (input: Parameters<typeof generateResponse>[0]) => {
      const t = Date.now();
      try {
        return await generateResponse({
          ...input,
          classifierSignalsFeeQuestion:
            input.classifierSignalsFeeQuestion ?? signalsFeePricing,
        });
      } finally {
        dmGenerateMs += Date.now() - t;
      }
    };
    const runGenerateResponseWithActions = async (
      input: Parameters<typeof generateResponseWithActions>[0]
    ) => {
      const t = Date.now();
      try {
        return await generateResponseWithActions({
          ...input,
          classifierSignalsFeeQuestion:
            input.classifierSignalsFeeQuestion ?? signalsFeePricing,
        });
      } finally {
        dmGenerateMs += Date.now() - t;
      }
    };

    if (isRevokeIntent) {
      dmRoutingBranch = 'revoke_consent';
      replyText = await handleRevocation(
        conversation.id,
        conversation.patient_id,
        correlationId
      );
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        reasonFirstTriagePhase: undefined,
        postMedicalConsultFeeAckSent: undefined,
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (doctorSettings?.instagram_receptionist_paused === true) {
      // RBH-09: Pause automation - optional handoff copy only (revoke_consent handled above).
      dmRoutingBranch = 'receptionist_paused';
      replyText = resolveInstagramReceptionistPauseMessage(doctorSettings);
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
      logger.info(
        { correlationId, eventId, doctorId, conversationId: conversation.id },
        'Instagram DM: receptionist paused; handoff message only (RBH-09)'
      );
    } else if (state.step === 'awaiting_cancel_choice') {
      dmRoutingBranch = 'cancel_flow_numeric';
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
      dmRoutingBranch = 'cancel_flow_confirm';
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
        const aiResult = await runGenerateResponseWithActions({
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
      dmRoutingBranch = 'reschedule_flow_numeric';
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
          replyText = formatRescheduleChoiceLinkDm(url, doctorSettings);
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
    } else if (
      (isEmergencyUserMessage(text) || intentResult.intent === 'emergency') &&
      !(
        inCollection &&
        intentResult.intent === 'emergency' &&
        !isEmergencyUserMessage(text)
      )
    ) {
      // RBH-15: Pattern-based emergency wins over misclassified medical_query; message in user's language.
      // During booking intake, LLM-only "emergency" on vitals/reason replies is suppressed so we treat
      // the message as collection data (e.g. "200/100 this morning" when we asked for highest BP).
      // Deterministic acute phrases (chest pain, can't breathe, …) always escalate.
      dmRoutingBranch = 'emergency_safety';
      replyText = resolveSafetyMessage('emergency', text);
      state = {
        ...state,
        lastIntent: 'emergency',
        step: 'responded',
        reasonFirstTriagePhase: undefined,
        postMedicalConsultFeeAckSent: undefined,
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (state.step === 'awaiting_staff_service_confirmation') {
      dmRoutingBranch = 'staff_service_review_pending';
      replyText = formatStaffServiceReviewStillPendingDm(doctorSettings);
      state = { ...state, updatedAt: new Date().toISOString() };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (channelReplyPick) {
      dmRoutingBranch = 'consultation_channel_pick';
      const pick = channelReplyPick;
      const teleOnly = isTeleconsultCatalogAuthoritative({
        service_offerings_json: doctorSettings?.service_offerings_json ?? null,
        appointment_fee_currency: doctorSettings?.appointment_fee_currency ?? null,
      });
      if (teleOnly && pick === 'in_clinic') {
        replyText =
          "Right now we offer **teleconsult** only (text, voice, or video) — which works best for you?";
        state = {
          ...state,
          lastIntent: intentResult.intent,
          updatedAt: new Date().toISOString(),
        };
      } else {
        const nextModality: 'text' | 'voice' | 'video' | undefined =
          pick === 'in_clinic' ? undefined : pick;
        const recentChannel = recentMessages.map((m) => ({
          sender_type: m.sender_type,
          content: m.content ?? '',
        }));
        const deferIntakeForReasonFirst = bookingShouldDeferToReasonFirstTriage({
          state,
          text,
          recentMessages: recentChannel,
        });
        if (deferIntakeForReasonFirst) {
          dmRoutingBranch = 'consultation_channel_pick_reason_first';
          const snippet = await resolveVisitReasonSnippetForTriage(recentChannel, text, correlationId);
          replyText = formatReasonFirstGateBeforeIntake(text, snippet);
          state = {
            ...state,
            consultationType: pick,
            consultationModality: nextModality,
            step: 'responded',
            lastIntent: intentResult.intent,
            reasonFirstTriagePhase: 'ask_more',
            updatedAt: new Date().toISOString(),
          };
        } else {
          const nextStep =
            state.step === 'collecting_all' || state.step?.startsWith('collecting_')
              ? state.step!
              : 'collecting_all';
          state = {
            ...state,
            consultationType: pick,
            consultationModality: nextModality,
            step: nextStep,
            collectedFields: state.collectedFields ?? [],
            lastIntent: intentResult.intent,
            updatedAt: new Date().toISOString(),
          };
          const aiContext = await buildAiContextForResponse(
            conversation.id,
            state,
            recentMessages,
            correlationId,
            text,
            teleconsultCatalogRowCount
          );
          replyText = await runGenerateResponse({
            conversationId: conversation.id,
            currentIntent: 'book_appointment',
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
            doctorContext,
            context: aiContext,
          });
        }
      }
    } else if (
      !inCollection &&
      (!state.step || state.step === 'responded') &&
      isRecentMedicalDeflectionWindow(state) &&
      !state.reasonFirstTriagePhase &&
      !state.postMedicalConsultFeeAckSent &&
      (isVagueConsultationPaymentExistenceQuestion(text) ||
        classifierSignalsPaymentExistence(intentResult)) &&
      recentPatientThreadHasClinicalReason(
        recentMessages.map((m) => ({ sender_type: m.sender_type, content: m.content ?? '' }))
      )
    ) {
      dmRoutingBranch = 'post_medical_payment_existence_ack';
      replyText = await resolvePostMedicalPaymentExistenceAck(text, correlationId);
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        postMedicalConsultFeeAckSent: true,
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (
      state.reasonFirstTriagePhase &&
      !inCollection &&
      (!state.step || state.step === 'responded')
    ) {
      const recentForTriage = recentMessages.map((m) => ({
        sender_type: m.sender_type,
        content: m.content ?? '',
      }));
      const runReasonFirstFullFeeEscape = async (): Promise<void> => {
        const feeThread = buildFeeCatalogMatchText(text, recentMessages);
        const idleFeeOut = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
          catalogMatchText: feeThread,
          ...feeComposerOpts,
        });
        replyText = idleFeeOut.reply;
        if (idleFeeOut.feeAmbiguousStaffReview) {
          state = mergeStateForFeeAmbiguousStaffReview(
            state,
            idleFeeOut.feeAmbiguousStaffReview,
            {
              lastIntent: intentResult.intent,
            },
            matcherCandidateLabelsForFeeStaffReview(doctorSettings)
          );
          dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
          return;
        }
        state = {
          ...state,
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
          lastIntent: intentResult.intent,
          step: 'responded',
          activeFlow: 'fee_quote',
          updatedAt: new Date().toISOString(),
        };
        if (idleFeeOut.feeQuoteMatcherFinalize) {
          state = mergeFeeQuoteMatcherIntoState(state, idleFeeOut.feeQuoteMatcherFinalize);
        }
        dmRoutingBranch = feeIdleRoutedByAnaphora
          ? 'fee_follow_up_anaphora_idle'
          : 'fee_deterministic_idle';
      };

      const runReasonFirstFeeNarrowFromTriage = async (): Promise<void> => {
        const feeThreadRf = buildFeeCatalogMatchText(text, recentMessages);
        const idleFeeOutRf = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
          catalogMatchText: feeThreadRf,
          ...feeComposerOpts,
        });
        replyText = idleFeeOutRf.reply;
        const consolidated = (
          await resolveVisitReasonSnippetForTriage(recentForTriage, text, correlationId)
        ).trim();
        const reasonSeed =
          consolidated && consolidated !== 'what you shared' ? consolidated : undefined;
        if (idleFeeOutRf.feeAmbiguousStaffReview) {
          state = mergeStateForFeeAmbiguousStaffReview(
            state,
            idleFeeOutRf.feeAmbiguousStaffReview,
            {
              lastIntent: intentResult.intent,
              ...(reasonSeed ? { reasonForVisit: reasonSeed } : {}),
            },
            matcherCandidateLabelsForFeeStaffReview(doctorSettings)
          );
          dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
          return;
        }
        dmRoutingBranch = 'reason_first_triage_fee_narrow';
        state = {
          ...state,
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
          lastIntent: intentResult.intent,
          step: 'responded',
          activeFlow: 'fee_quote',
          updatedAt: new Date().toISOString(),
          ...(reasonSeed ? { reasonForVisit: reasonSeed } : {}),
        };
        if (idleFeeOutRf.feeQuoteMatcherFinalize) {
          state = mergeFeeQuoteMatcherIntoState(state, idleFeeOutRf.feeQuoteMatcherFinalize);
        }
      };

      if (userWantsExplicitFullFeeList(text)) {
        await runReasonFirstFullFeeEscape();
      } else if (state.reasonFirstTriagePhase === 'ask_more') {
        // Do not quote fees from ask_more: confirm reason (+ anything else) first; fee table runs after confirm (yes) or from confirm phase.
        const lastBotAskMore = lastAssistantDmContent(recentForTriage);
        if (
          lastBotAskedAnythingElseBeforeFee(lastBotAskMore) &&
          parseReasonFirstAskMoreAmbiguousYes(text) &&
          !userMessageSuggestsClinicalReason(text)
        ) {
          dmRoutingBranch = 'reason_first_triage_ask_more_ambiguous_yes';
          replyText = formatReasonFirstAskWhatElseToAdd(text);
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
        } else if (
          signalsFeePricing &&
          !userExplicitlyWantsToBookNow(text) &&
          !userSignalsReasonFirstWrapUp(text, intentResult)
        ) {
          dmRoutingBranch = 'reason_first_triage_ask_more_payment_bridge';
          const bridgeSnippet = (
            await resolveVisitReasonSnippetForTriage(recentForTriage, text, correlationId)
          ).trim();
          replyText = formatReasonFirstFeePatienceBridgeWhileAskMore(text, {
            reasonSnippet: bridgeSnippet,
            recentPostMedicalFeeAck: state.postMedicalConsultFeeAckSent === true,
          });
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
        } else {
          dmRoutingBranch = 'reason_first_triage_confirm';
          const snippet = await resolveVisitReasonSnippetForTriage(
            recentForTriage,
            parseNothingElseOrSameOnly(text) ? '' : text,
            correlationId
          );
          replyText = formatReasonFirstConfirmQuestion(text, snippet);
          state = {
            ...state,
            reasonFirstTriagePhase: 'confirm',
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
        }
      } else if (state.reasonFirstTriagePhase === 'confirm') {
        if (signalsFeePricing && !userExplicitlyWantsToBookNow(text)) {
          await runReasonFirstFeeNarrowFromTriage();
        } else if (parseReasonTriageConfirmYes(text)) {
          await runReasonFirstFeeNarrowFromTriage();
        } else if (parseReasonTriageNegationForClarify(text)) {
          dmRoutingBranch = 'reason_first_triage_confirm';
          replyText = formatReasonFirstConfirmClarify(text);
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
        } else {
          dmRoutingBranch = 'reason_first_triage_confirm';
          const snippetReplay = await resolveVisitReasonSnippetForTriage(
            recentForTriage,
            text,
            correlationId
          );
          replyText = formatReasonFirstConfirmQuestion(text, snippetReplay);
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
        }
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else if (
      intentResult.intent === 'medical_query' &&
      !inCollection &&
      recentThreadHasAssistantEmergencyEscalation(recentDmForClinical) &&
      userMessageSignalsPostEmergencyStability(text)
    ) {
      dmRoutingBranch = 'booking_resume_after_emergency';
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'collecting_all',
        reasonFirstTriagePhase: undefined,
        postMedicalConsultFeeAckSent: undefined,
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
      const baseCtx = await buildAiContextForResponse(
        conversation.id,
        state,
        recentMessages,
        correlationId,
        text,
        teleconsultCatalogRowCount
      );
      const resumeHint =
        'Thread note: The patient previously received emergency (112/108) escalation. They now describe stable or non-crisis vitals. Briefly acknowledge—do NOT repeat emergency instructions unless they report new crisis symptoms or crisis-level readings. Invite them to book a teleconsult: ask for full name, age, gender, mobile, and reason for visit (include current BP if relevant) in one message when details are still missing.';
      const aiContext: GenerateResponseContext = {
        ...baseCtx,
        idleDialogueHint: [baseCtx.idleDialogueHint, resumeHint].filter(Boolean).join('\n'),
      };
      replyText = await runGenerateResponse({
        conversationId: conversation.id,
        currentIntent: 'book_appointment',
        state,
        recentMessages,
        currentUserMessage: text,
        correlationId,
        doctorContext,
        context: aiContext,
      });
    } else if (intentResult.intent === 'medical_query' && !inCollection) {
      dmRoutingBranch = 'medical_safety';
      // Only deflect when NOT in collection flow. Context matters: if we asked for "reason for visit"
      // and the patient replied "Pain Abdomen", that's their answer - not an unsolicited medical query.
      // inCollection = we asked for details; their reply is data. No field-count heuristic (unreliable:
      // a patient could send details + "what should I do?" without booking intent).
      replyText = resolveSafetyMessage('medical_query', text);
      const recentMed = recentMessages.map((m) => ({
        sender_type: m.sender_type,
        content: m.content ?? '',
      }));
      let phase: ConversationState['reasonFirstTriagePhase'] = undefined;
      if (userMessageSuggestsClinicalReason(text)) {
        const snippetMed = await resolveVisitReasonSnippetForTriage(recentMed, text, correlationId);
        replyText = `${replyText}\n\n${formatClinicalReasonAskMoreAfterDeflection(text, snippetMed)}`;
        phase = 'ask_more';
      }
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        lastMedicalDeflectionAt: new Date().toISOString(),
        postMedicalConsultFeeAckSent: undefined,
        ...(phase ? { reasonFirstTriagePhase: phase } : { reasonFirstTriagePhase: undefined }),
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (
      signalsFeePricing &&
      !userExplicitlyWantsToBookNow(text) &&
      inCollection
    ) {
      // RBH-18/19: Pricing during intake — deterministic fee + localized continue line; optional AI bridge (env).
      dmRoutingBranch = 'fee_deterministic_mid_collection';
      const feeThreadMid = buildFeeCatalogMatchText(text, recentMessages);
      const midFeeOut = await composeMidCollectionFeeQuoteDmWithMetaAsync(doctorSettings, text, {
        collectedFields: state.collectedFields,
        catalogMatchText: feeThreadMid,
        ...feeComposerOpts,
      });
      if (midFeeOut.feeAmbiguousStaffReview) {
        replyText = midFeeOut.reply;
        state = mergeStateForFeeAmbiguousStaffReview(
          state,
          midFeeOut.feeAmbiguousStaffReview,
          {
            lastIntent: intentResult.intent,
          },
          matcherCandidateLabelsForFeeStaffReview(doctorSettings)
        );
        dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
      } else {
        replyText = await appendOptionalDmReplyBridge({
          correlationId,
          userText: text,
          baseReply: midFeeOut.reply,
        });
        state = {
          ...state,
          lastIntent: intentResult.intent,
          updatedAt: new Date().toISOString(),
        };
        if (midFeeOut.feeQuoteMatcherFinalize) {
          state = mergeFeeQuoteMatcherIntoState(state, midFeeOut.feeQuoteMatcherFinalize);
        }
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else if (
      signalsFeePricing &&
      !userExplicitlyWantsToBookNow(text) &&
      !inCollection &&
      (!state.step || state.step === 'responded')
    ) {
      const recentForDefer = recentMessages.map((m) => ({
        sender_type: m.sender_type,
        content: m.content ?? '',
      }));
      const deferRf = shouldDeferIdleFeeForReasonFirstTriage({
        state,
        text,
        recentMessages: recentForDefer,
      });
      if (deferRf) {
        // e-task-dm-04: symptom-led thread — confirm reasons before fee amounts; acknowledge fee asks naturally (incl. after post-med pay-existence ack).
        dmRoutingBranch = 'reason_first_triage_ask_more';
        const bridgeSnippetDefer = (
          await resolveVisitReasonSnippetForTriage(recentForDefer, text, correlationId)
        ).trim();
        replyText = formatReasonFirstFeePatienceBridgeWhileAskMore(text, {
          reasonSnippet: bridgeSnippetDefer,
          recentPostMedicalFeeAck: state.postMedicalConsultFeeAckSent === true,
        });
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          reasonFirstTriagePhase: 'ask_more',
          updatedAt: new Date().toISOString(),
        };
      } else {
        // RBH-13 + RBH-18/19: Fee / pricing — structured reply; e-task-dm-04 escape + pure pricing uses full/narrow composer.
        dmRoutingBranch = feeIdleRoutedByAnaphora
          ? 'fee_follow_up_anaphora_idle'
          : 'fee_deterministic_idle';
        const feeThreadIdle = buildFeeCatalogMatchText(text, recentMessages);
        const idleFeeOut = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
          catalogMatchText: feeThreadIdle,
          ...feeComposerOpts,
        });
        replyText = idleFeeOut.reply;
        if (idleFeeOut.feeAmbiguousStaffReview) {
          state = mergeStateForFeeAmbiguousStaffReview(
            state,
            idleFeeOut.feeAmbiguousStaffReview,
            {
              lastIntent: intentResult.intent,
            },
            matcherCandidateLabelsForFeeStaffReview(doctorSettings)
          );
          dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
        } else {
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            activeFlow: 'fee_quote',
            updatedAt: new Date().toISOString(),
          };
          if (idleFeeOut.feeQuoteMatcherFinalize) {
            state = mergeFeeQuoteMatcherIntoState(state, idleFeeOut.feeQuoteMatcherFinalize);
          }
        }
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else if (
      intentResult.intent === 'greeting' &&
      !inCollection &&
      (!state.step || state.step === 'responded')
    ) {
      // RBH-12: Skip second OpenAI call for idle greetings (classify may already be regex-fast).
      dmRoutingBranch = 'greeting_template';
      greetingFastPath = true;
      const practiceName = doctorContext?.practice_name?.trim() || 'the clinic';
      replyText = `Hello! I'm the assistant at **${practiceName}**. How can I help you today - would you like to **book an appointment**, **check availability**, or ask a **general question**?`;
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (intentResult.intent === 'check_appointment_status') {
      dmRoutingBranch = 'check_appointment_status';
      const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
      const askingForSelfOnly = /\b(my\s+appointment|what\s+about\s+my\s+appointment)\b/i.test(text.trim());
      const patientIdsList = askingForSelfOnly
        ? [conversation.patient_id]
        : buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
      const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
        patientIdsList,
        doctorId,
        correlationId
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
      dmRoutingBranch = 'cancel_appointment_intent';
      const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
      const patientIdsList = buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
      const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
        patientIdsList,
        doctorId,
        correlationId
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
      dmRoutingBranch = 'reschedule_appointment_intent';
      const tz = doctorSettings?.timezone ?? 'Asia/Kolkata';
      const patientIdsList = buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
      const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
        patientIdsList,
        doctorId,
        correlationId
      );
      if (upcoming.length === 0) {
        replyText = "You don't have any upcoming appointments. Say 'book appointment' to schedule one.";
        state = { ...state, lastIntent: intentResult.intent, step: 'responded', updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      } else if (upcoming.length === 1) {
        const a = upcoming[0]!;
        const url = buildReschedulePageUrl(conversation.id, doctorId, a.id);
        replyText = formatRescheduleLinkDm(url, doctorSettings);
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
      dmRoutingBranch = 'book_for_someone_else';
      const multiPerson = parseMultiPersonBooking(text);
      if (multiPerson) {
        // e-task-4: Multi-person "me and my X" - other first, then offer self
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
          lastMedicalDeflectionAt: undefined,
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        replyText = `I'll help you book for both. Let's do one at a time - ${relationPhrase} first, then you. Please share: Full name, Age, Mobile, Reason for visit for your ${relation}. Email (optional).`;
      } else {
        // Single-person book for someone else
        await clearCollectedData(conversation.id);
        const explicitSomeoneElse = /\bsomeone\s+else\b/i.test(text);
        let relation: string | null = explicitSomeoneElse
          ? 'them'
          : extractBookForSomeoneElseRelationKeyword(text);
        const needsLlmRelation =
          env.BOOKING_RELATION_LLM_ENABLED && (relation == null || relation === 'them') && !explicitSomeoneElse;
        if (needsLlmRelation) {
          const aiRel = await resolveBookingTargetRelationForDm(text, correlationId);
          if (aiRel) relation = aiRel;
        }
        if (relation == null) relation = 'them';
        const relationPhrase = relation === 'them' ? 'them' : `your ${relation}`;
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'collecting_all',
          collectedFields: [],
          bookingForSomeoneElse: true,
          relation,
          bookingForPatientId: undefined,
          lastMedicalDeflectionAt: undefined,
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        replyText = `I'll help you book for ${relationPhrase}. Please share: Full name, Age, Mobile, Reason for visit for the person you're booking for. Email (optional).`;
      }
    } else if (
      state.step === 'awaiting_match_confirmation' ||
      (effectiveAskedForMatch(state, recentMessages) && state.pendingMatchPatientIds?.length)
    ) {
      dmRoutingBranch = 'patient_match_confirmation';
      // e-task-5: Handle match confirmation. Yes -> use existing; No -> create new; 1/2 -> pick from multi-match.
      const matchIds = state.pendingMatchPatientIds ?? [];
      const matchCount = matchIds.length;
      const parsed = parseMatchConfirmationReply(text, matchCount);
      const useExisting = parsed === 'yes' || parsed === '1';
      const useSecond = parsed === '2' && matchCount >= 2;
      const createNew = parsed === 'no' || parsed === 'unclear';

      if (useExisting || useSecond) {
        const chosenId = useSecond ? matchIds[1]! : matchIds[0]!;
        await clearCollectedData(conversation.id);
        const shared: ConversationState = {
          ...state,
          lastIntent: intentResult.intent,
          bookingForPatientId: chosenId,
          bookingForSomeoneElse: false,
          pendingMatchPatientIds: undefined,
          updatedAt: new Date().toISOString(),
        };
        if (isSlotBookingBlockedPendingStaffReview(shared)) {
          const gate = transitionToAwaitingStaffServiceConfirmation(
            shared,
            doctorSettings,
            intentResult.intent,
            {}
          );
          state = gate.state;
          replyText = gate.replyText;
        } else {
          const slotLink = buildBookingPageUrl(conversation.id, doctorId);
          const mrnHint = await getPatientIdHintForSlot(chosenId, correlationId);
          const baseSlotMsg = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
          replyText = shared.pendingSelfBooking
            ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
            : baseSlotMsg;
          state = { ...shared, step: 'awaiting_slot_selection' };
        }
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
          const shared: ConversationState = {
            ...state,
            lastIntent: intentResult.intent,
            reasonForVisit: state.reasonForVisit ?? collectedBeforePersist.reason_for_visit,
            bookingForPatientId: newPatient.id,
            bookingForSomeoneElse: false,
            pendingMatchPatientIds: undefined,
            updatedAt: new Date().toISOString(),
          };
          if (isSlotBookingBlockedPendingStaffReview(shared)) {
            const gate = transitionToAwaitingStaffServiceConfirmation(
              shared,
              doctorSettings,
              intentResult.intent,
              {}
            );
            state = gate.state;
            replyText = gate.replyText;
          } else {
            const slotLink = buildBookingPageUrl(conversation.id, doctorId);
            const mrnHint = formatPatientIdHint(newPatient.medical_record_number);
            const baseSlotMsg = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
            replyText = shared.pendingSelfBooking
              ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
              : baseSlotMsg;
            state = { ...shared, step: 'awaiting_slot_selection' };
          }
          await updateConversationState(conversation.id, state, correlationId);
        }
      } else {
        replyText =
          "Please reply Yes to use the existing record, or No to create a new patient. Reply 1 or 2 if we found multiple matches.";
        state = { ...state, updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
    } else if (state.step === 'consent' || effectiveAskedForConsent(state, recentMessages)) {
      dmRoutingBranch = 'consent_flow';
      // Handle consent reply regardless of intent (keywords + semantic LLM for paraphrases / any language).
      if (!state.step) {
        state = { ...state, step: 'consent', updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
      const tConsentResolve = Date.now();
      const consentResult = await resolveConsentReplyForBooking(
        text,
        getLastBotMessage(recentMessages),
        correlationId
      );
      dmGenerateMs += Date.now() - tConsentResolve;
      // Denied is handled below; granted + any unclear (incl. "nothing"/skip extras) proceeds to slot link.
      const hasExtrasOrGranted = consentResult === 'granted' || consentResult === 'unclear';
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
            const shared: ConversationState = {
              ...state,
              lastIntent: intentResult.intent,
              reasonForVisit: state.reasonForVisit ?? reasonForVisitFromCollected,
              extraNotes: extraNotes ?? state.extraNotes,
              bookingForPatientId: newPatient.id,
              bookingForSomeoneElse: false,
              updatedAt: new Date().toISOString(),
            };
            if (isSlotBookingBlockedPendingStaffReview(shared)) {
              const gate = transitionToAwaitingStaffServiceConfirmation(
                shared,
                doctorSettings,
                intentResult.intent,
                {}
              );
              state = gate.state;
              replyText = gate.replyText;
            } else {
              const slotLink = buildBookingPageUrl(conversation.id, doctorId);
              const mrnHint = formatPatientIdHint(newPatient.medical_record_number);
              const baseSlotMsg = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
              replyText = shared.pendingSelfBooking
                ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
                : baseSlotMsg;
              state = { ...shared, step: 'awaiting_slot_selection' };
            }
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
          const baseSlotMsg = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
          const sharedBase: ConversationState = {
            ...state,
            lastIntent: intentResult.intent,
            reasonForVisit: state.reasonForVisit ?? reasonForVisitFromCollected,
            extraNotes: extraNotes ?? state.extraNotes,
            updatedAt: new Date().toISOString(),
          };
          if (!persistResult.success) {
            replyText =
              `I had trouble saving your details - please say 'book appointment' to re-share them if needed. Meanwhile, ${baseSlotMsg}`;
            state = { ...sharedBase, step: 'awaiting_slot_selection' };
          } else if (isSlotBookingBlockedPendingStaffReview(sharedBase)) {
            const gate = transitionToAwaitingStaffServiceConfirmation(
              sharedBase,
              doctorSettings,
              intentResult.intent,
              {}
            );
            state = gate.state;
            replyText = gate.replyText;
          } else {
            replyText = sharedBase.pendingOtherBooking
              ? `${baseSlotMsg}\n\nWould you like to book for your ${sharedBase.pendingOtherBooking.relation} now?`
              : baseSlotMsg;
            state = { ...sharedBase, step: 'awaiting_slot_selection' };
          }
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
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
          replyText = await runGenerateResponse({
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
      (state.step === 'collecting_all' || (lastBotAskedForDetails && !state.step)) &&
      !(
        /^(yes|yeah|yep|ok|okay|correct|looks good|confirmed)$/i.test(text.trim()) &&
        effectiveAskedForConfirm(state, recentMessages)
      )
    ) {
      dmRoutingBranch = 'booking_collection';
      // Process as collection data. Context: we asked for details (state or last bot message).
      // E.g. "Pain Abdomen" may be classified as medical_query but we asked - treat as data.
      if (!state.step) {
        state = {
          ...state,
          step: 'collecting_all',
          collectedFields: [],
          lastMedicalDeflectionAt: undefined,
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
      }
      // e-task-3: Relation clarification - update state.relation when detected (for AI context)
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
      // e-task-4: "me first" - switch to self first when no data collected yet
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
          lastMedicalDeflectionAt: undefined,
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
        replyText = await runGenerateResponse({
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
      // e-task-4: "actually just my sister" - cancel multi-person, single-person only
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
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
          replyText = await runGenerateResponse({
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
          const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
          const aiReply = await runGenerateResponse({
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
    } else if (
      state.step === 'confirm_details' ||
      (effectiveAskedForConfirm(state, recentMessages) && text.trim().length > 0)
    ) {
      dmRoutingBranch = 'confirm_details';
      // Deterministic patterns + semantic LLM for multilingual / "yes correct" / paraphrases.
      if (!state.step) {
        state = { ...state, step: 'confirm_details', updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
      const tConfirmResolve = Date.now();
      const confirmResolution = await resolveConfirmDetailsReplyForBooking(
        text,
        getLastBotMessage(recentMessages),
        correlationId
      );
      dmGenerateMs += Date.now() - tConfirmResolve;
      const isCorrectionLegacy =
        /^(no|nope|change|correct)\s*[,:]/i.test(text.trim()) ||
        /^(actually|no,)\s+/i.test(text.trim());
      const isYes = confirmResolution === 'confirm';
      const isCorrection = confirmResolution === 'correction' || isCorrectionLegacy;
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
          // e-task-5: Match check before consent. If matches -> awaiting_match_confirmation; else -> consent.
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
            state = await enrichStateWithServiceCatalogMatch(
              state,
              doctorSettings,
              collected?.reason_for_visit,
              recentMessages,
              correlationId
            );
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
            state = await enrichStateWithServiceCatalogMatch(
              state,
              doctorSettings,
              collected?.reason_for_visit,
              recentMessages,
              correlationId
            );
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
          state = await enrichStateWithServiceCatalogMatch(
            state,
            doctorSettings,
            collected?.reason_for_visit,
            recentMessages,
            correlationId
          );
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
          const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
          const aiReply = await runGenerateResponse({
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
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
        replyText = await runGenerateResponse({
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
      dmRoutingBranch = 'post_booking_ack';
      replyText = "Great - you're all set. Let us know if you need anything else.";
              state = {
                ...state,
                lastIntent: intentResult.intent,
                step: 'responded',
                updatedAt: new Date().toISOString(),
      };
      await updateConversationState(conversation.id, state, correlationId);
    } else if (
      isBookIntent &&
      justStartingCollection &&
      signalsFeePricing &&
      !userExplicitlyWantsToBookNow(text)
    ) {
      const recentBookMis = recentMessages.map((m) => ({
        sender_type: m.sender_type,
        content: m.content ?? '',
      }));
      const deferBookMis = shouldDeferIdleFeeForReasonFirstTriage({
        state,
        text,
        recentMessages: recentBookMis,
      });
      if (deferBookMis) {
        dmRoutingBranch = 'reason_first_triage_ask_more';
        const snippetBookMis = await resolveVisitReasonSnippetForTriage(recentBookMis, text, correlationId);
        replyText = formatReasonFirstFeePatienceBridgeWhileAskMore(text, {
          reasonSnippet: snippetBookMis.trim(),
          recentPostMedicalFeeAck: state.postMedicalConsultFeeAckSent === true,
        });
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          reasonFirstTriagePhase: 'ask_more',
          updatedAt: new Date().toISOString(),
        };
      } else {
        // RBH-13/19: "How much..." misclassified as book_appointment with empty step - fee answer, not intake.
        dmRoutingBranch = 'fee_book_misclassified_idle';
        const feeThreadBookMis = buildFeeCatalogMatchText(text, recentMessages);
        const misFeeOut = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
          catalogMatchText: feeThreadBookMis,
          ...feeComposerOpts,
        });
        replyText = misFeeOut.reply;
        if (misFeeOut.feeAmbiguousStaffReview) {
          state = mergeStateForFeeAmbiguousStaffReview(
            state,
            misFeeOut.feeAmbiguousStaffReview,
            {
              lastIntent: intentResult.intent,
            },
            matcherCandidateLabelsForFeeStaffReview(doctorSettings)
          );
          dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
        } else {
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            activeFlow: 'fee_quote',
            updatedAt: new Date().toISOString(),
          };
          if (misFeeOut.feeQuoteMatcherFinalize) {
            state = mergeFeeQuoteMatcherIntoState(state, misFeeOut.feeQuoteMatcherFinalize);
          }
        }
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else if (isBookIntent && (justStartingCollection || inCollection)) {
      // Note: consent, confirm_details, collecting_all are handled above (regardless of intent).
      dmRoutingBranch = justStartingCollection ? 'booking_start_ai' : 'booking_continue_ai';
      if (justStartingCollection) {
        const recentStart = recentMessages.map((m) => ({
          sender_type: m.sender_type,
          content: m.content ?? '',
        }));
        if (
          bookingShouldDeferToReasonFirstTriage({
            state,
            text,
            recentMessages: recentStart,
          })
        ) {
          dmRoutingBranch = 'booking_start_reason_first';
          const snippetStart = await resolveVisitReasonSnippetForTriage(recentStart, text, correlationId);
          replyText = formatReasonFirstGateBeforeIntake(text, snippetStart);
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            reasonFirstTriagePhase: 'ask_more',
            updatedAt: new Date().toISOString(),
          };
          await updateConversationState(conversation.id, state, correlationId);
        } else {
          const reasonSeedFields = await seedCollectedReasonFromStateIfValid(
            conversation.id,
            state.reasonForVisit
          );
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: getInitialCollectionStep(),
            collectedFields: reasonSeedFields,
            lastMedicalDeflectionAt: undefined,
            reasonFirstTriagePhase: undefined,
            postMedicalConsultFeeAckSent: undefined,
            updatedAt: new Date().toISOString(),
          };
          await updateConversationState(conversation.id, state, correlationId);
          const aiContext = await buildAiContextForResponse(
            conversation.id,
            state,
            recentMessages,
            correlationId,
            text,
            teleconsultCatalogRowCount
          );
          replyText = await runGenerateResponse({
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
      } else {
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
        replyText = await runGenerateResponse({
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
      dmRoutingBranch = 'slot_selection';
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
          lastMedicalDeflectionAt: undefined,
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
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
          lastMedicalDeflectionAt: undefined,
          reasonFirstTriagePhase: undefined,
          postMedicalConsultFeeAckSent: undefined,
          updatedAt: new Date().toISOString(),
        };
        await updateConversationState(conversation.id, state, correlationId);
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
        replyText = await runGenerateResponse({
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
        if (isSlotBookingBlockedPendingStaffReview(state)) {
          replyText = formatStaffServiceReviewStillPendingDm(doctorSettings);
        } else {
          const patientId = state.bookingForPatientId ?? conversation.patient_id;
          const mrnHint = await getPatientIdHintForSlot(patientId, correlationId);
          const slotLink = buildBookingPageUrl(conversation.id, doctorId);
          replyText = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
        }
        state = { ...state, updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
        } else {
        replyText = formatBookingAwaitingFollowUpDm(doctorSettings);
        state = { ...state, updatedAt: new Date().toISOString() };
        await updateConversationState(conversation.id, state, correlationId);
      }
    } else if (isBookIntent && state.step === 'responded') {
      dmRoutingBranch = 'book_responded';
      // e-task-2: Show weekly availability + "When would you like to come?" - never random first-available slots
      const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
      const hasPatientReady =
        patient?.name?.trim() &&
        patient?.phone?.trim() &&
        patient?.consent_status === 'granted';
      const explicitBook = userExplicitlyWantsToBookNow(text);
      const pricingOnly = signalsFeePricing && !explicitBook;

      if (!hasPatientReady && pricingOnly) {
        const recentBookIdle = recentMessages.map((m) => ({
          sender_type: m.sender_type,
          content: m.content ?? '',
        }));
        const deferBookPricing = shouldDeferIdleFeeForReasonFirstTriage({
          state,
          text,
          recentMessages: recentBookIdle,
        });
        if (deferBookPricing) {
          dmRoutingBranch = 'reason_first_triage_ask_more';
          const snippetBookIdle = await resolveVisitReasonSnippetForTriage(recentBookIdle, text, correlationId);
          replyText = formatReasonFirstFeePatienceBridgeWhileAskMore(text, {
            reasonSnippet: snippetBookIdle.trim(),
            recentPostMedicalFeeAck: state.postMedicalConsultFeeAckSent === true,
          });
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            reasonFirstTriagePhase: 'ask_more',
            updatedAt: new Date().toISOString(),
          };
        } else {
          const feeThreadBook = buildFeeCatalogMatchText(text, recentMessages);
          const bookIdleFeeOut = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
            catalogMatchText: feeThreadBook,
            ...feeComposerOpts,
          });
          replyText = bookIdleFeeOut.reply;
          if (bookIdleFeeOut.feeAmbiguousStaffReview) {
            state = mergeStateForFeeAmbiguousStaffReview(
              state,
              bookIdleFeeOut.feeAmbiguousStaffReview,
              {
                lastIntent: intentResult.intent,
              },
              matcherCandidateLabelsForFeeStaffReview(doctorSettings)
            );
            dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
          } else {
            state = {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              activeFlow: 'fee_quote',
              updatedAt: new Date().toISOString(),
            };
            if (bookIdleFeeOut.feeQuoteMatcherFinalize) {
              state = mergeFeeQuoteMatcherIntoState(state, bookIdleFeeOut.feeQuoteMatcherFinalize);
            }
          }
        }
      } else if (hasPatientReady) {
        if (isSlotBookingBlockedPendingStaffReview(state)) {
          const gate = transitionToAwaitingStaffServiceConfirmation(
            state,
            doctorSettings,
            intentResult.intent,
            { consultationType: state.consultationType, activeFlow: undefined }
          );
          state = gate.state;
          replyText = gate.replyText;
        } else {
          const slotLink = buildBookingPageUrl(conversation.id, doctorId);
          const mrnHint = formatPatientIdHint(patient?.medical_record_number);
          replyText = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'awaiting_slot_selection',
            consultationType: state.consultationType,
            activeFlow: undefined,
            updatedAt: new Date().toISOString(),
          };
        }
      } else {
        const recentBookResp = recentMessages.map((m) => ({
          sender_type: m.sender_type,
          content: m.content ?? '',
        }));
        if (
          bookingShouldDeferToReasonFirstTriage({
            state,
            text,
            recentMessages: recentBookResp,
          })
        ) {
          dmRoutingBranch = 'book_responded_reason_first';
          const snippetBook = await resolveVisitReasonSnippetForTriage(recentBookResp, text, correlationId);
          replyText = formatReasonFirstGateBeforeIntake(text, snippetBook);
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            reasonFirstTriagePhase: 'ask_more',
            updatedAt: new Date().toISOString(),
          };
        } else {
          const reasonSeedBook = await seedCollectedReasonFromStateIfValid(
            conversation.id,
            state.reasonForVisit
          );
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: getInitialCollectionStep(),
            collectedFields: reasonSeedBook,
            activeFlow: undefined,
            lastMedicalDeflectionAt: undefined,
            reasonFirstTriagePhase: undefined,
            postMedicalConsultFeeAckSent: undefined,
            updatedAt: new Date().toISOString(),
          };
          const practiceName = doctorContext?.practice_name?.trim() || 'the clinic';
          replyText =
            reasonSeedBook.length > 0
              ? `Sure - happy to help you book at **${practiceName}**. We already have your **reason for visit** from our earlier messages. Please share: Full name, Age, Gender, Mobile number. Email (optional) for receipts.`
              : `Sure - happy to help you book at **${practiceName}**. Please share: Full name, Age, Gender, Mobile number, Reason for visit. Email (optional) for receipts.`;
        }
      }
      await updateConversationState(conversation.id, state, correlationId);
    } else {
      dmRoutingBranch = 'ai_open_response';
      const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
      replyText = await runGenerateResponse({
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

    if (
      state.step === 'awaiting_staff_service_confirmation' &&
      state.pendingStaffServiceReview === true &&
      state.matcherProposedCatalogServiceKey?.trim()
    ) {
      try {
        const ab = await tryApplyLearningPolicyAutobook({
          doctorId,
          conversationId: conversation.id,
          state,
          candidateLabels: state.matcherCandidateLabels ?? [],
          correlationId,
        });
        if (ab.applied) {
          state = ab.nextState;
          replyText = ab.replyText;
          dmRoutingBranch = 'learning_policy_autobook';
        }
      } catch (e) {
        logger.warn(
          { correlationId, err: e instanceof Error ? e.message : String(e) },
          'learning_policy_autobook_failed'
        );
      }
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

    const stateToPersistRaw =
      (isBookIntent && (justStartingCollection || inCollection)) ||
      state.step === 'awaiting_slot_selection' ||
      state.step === 'collecting_all' ||
      state.step === 'confirm_details' ||
      state.step === 'awaiting_match_confirmation' ||
      state.step === 'consent' ||
      state.step === 'awaiting_cancel_choice' ||
      state.step === 'awaiting_cancel_confirmation' ||
      state.step === 'awaiting_reschedule_choice' ||
      state.step === 'awaiting_reschedule_slot' ||
      state.step === 'awaiting_staff_service_confirmation'
        ? state
        : {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
    let stateToPersist = {
      ...stateToPersistRaw,
      lastPromptKind: conversationLastPromptKindForStep(
        stateToPersistRaw.step,
        stateToPersistRaw.activeFlow
      ),
    };

    if (
      stateToPersist.step === 'awaiting_staff_service_confirmation' &&
      stateToPersist.pendingStaffServiceReview === true &&
      stateToPersist.matcherProposedCatalogServiceKey?.trim()
    ) {
      try {
        const ensured = await upsertPendingStaffServiceReviewRequest({
          doctorId,
          conversationId: conversation.id,
          patientId: conversation.patient_id ?? null,
          correlationId,
          state: stateToPersist,
          candidateLabels: stateToPersist.matcherCandidateLabels ?? [],
        });
        stateToPersist = {
          ...stateToPersist,
          staffServiceReviewRequestId: ensured.id,
        };
      } catch (err) {
        logger.error(
          { correlationId, conversationId: conversation.id, err },
          'instagram_dm_staff_review_upsert_failed'
        );
      }
    }

    logInstagramDmRouting({
      correlationId,
      eventId,
      doctorId,
      conversationId: conversation.id,
      branch: dmRoutingBranch,
      intent: intentResult.intent,
      intent_topics: intentResult.topics,
      is_fee_question: intentResult.is_fee_question,
      state_step_before: stateStepBefore,
      state_step_after: stateToPersist.step ?? null,
      greeting_fast_path: greetingFastPath,
    });
    await updateConversationState(conversation.id, stateToPersist, correlationId);

    // Send lock + reply throttle + 2018001 fallback (shared with conflict recovery - RBH-04)
    const pageIdForDm = pageIds[0] ?? getInstagramPageId(instagramPayload);
    const doctorPageIdForDm = (await getStoredInstagramPageIdForDoctor(doctorId, correlationId)) ?? null;
    const handlerPreSendMs = Date.now() - handlerT0;
    const igSendStartedAt = Date.now();
    try {
      const dmSend = await sendInstagramDmWithLocksAndFallback({
        pageId: pageIdForDm,
        senderId,
        replyText,
        doctorToken,
        doctorId,
        correlationId,
        eventId,
        provider,
        webhookEntryId: pageIdForDm,
        doctorPageId: doctorPageIdForDm,
        pageIds,
        context: 'default',
      });
      const igSendMs = Date.now() - igSendStartedAt;
      logWebhookInstagramDmPipelineTiming({
        correlationId,
        eventId,
        doctorId,
        intent: intentResult.intent,
        intentMs,
        generateMs: dmGenerateMs,
        igSendMs,
        handlerPreSendMs,
        greetingFastPath,
        throttleSkipped: dmSend.status === 'throttle_skipped',
      });
      if (dmSend.status === 'throttle_skipped') {
        return;
      }
      logWebhookInstagramDmDelivery({
        correlationId,
        eventId,
        outcome: 'success',
        usedRecipientFallback: dmSend.usedRecipientFallback,
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
          let state = await getConversationState(conversation.id, correlationId);
          const normState = normalizeLegacySlotConversationSteps(state);
          if (normState !== state) {
            state = normState;
            await updateConversationState(conversation.id, state, correlationId);
          }
          const recentMessages = await getRecentMessages(conversation.id, AI_RECENT_MESSAGES_LIMIT, correlationId);
          const classifyCtx = buildClassifyIntentContext(state, recentMessages);
          let intentResult = await classifyIntent(
            text,
            correlationId,
            classifyCtx ? { classifyContext: classifyCtx } : undefined
          );
          intentResult = applyIntentPostClassificationPolicy(intentResult, text, state);
          intentResult = applyEmergencyIntentPostPolicy(intentResult, text, recentMessages);
          const conflictRecoveryDoctorSettings = await getDoctorSettings(doctorId);
          const conflictRecoveryCatalogRows = teleconsultCatalogServiceRowCount(
            conflictRecoveryDoctorSettings?.service_offerings_json
          );
          const aiContext = await buildAiContextForResponse(
            conversation.id,
            state,
            recentMessages,
            correlationId,
            text,
            conflictRecoveryCatalogRows
          );
          const recentDmConflict = recentMessages.map((m) => ({
            sender_type: m.sender_type,
            content: m.content ?? '',
          }));
          const lastAssistantConflict = lastAssistantDmContent(recentDmConflict);
          const conflictClassifierFee =
            intentSignalsFeeOrPricing(intentResult, text) ||
            feeFollowUpAnaphora(text, lastAssistantConflict) ||
            classifierSignalsFeeThreadContinuation(intentResult, lastAssistantConflict);
          const replyText =
            (await generateResponse({
              conversationId: conversation.id,
              currentIntent: intentResult.intent,
              state,
              recentMessages,
              currentUserMessage: text,
              correlationId,
              doctorContext: getDoctorContextFromSettings(conflictRecoveryDoctorSettings),
              context: aiContext,
              classifierSignalsFeeQuestion: conflictClassifierFee,
            })) || FALLBACK_REPLY;
          logInstagramDmRouting({
            correlationId,
            eventId,
            doctorId,
            conversationId: conversation.id,
            branch: 'conflict_recovery_ai',
            intent: intentResult.intent,
            intent_topics: intentResult.topics,
            is_fee_question: intentResult.is_fee_question,
            state_step_before: state.step ?? null,
            state_step_after: state.step ?? null,
          });
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
          const recDoctorPageId = (await getStoredInstagramPageIdForDoctor(doctorId, correlationId)) ?? null;
          const dmSendRecovery = await sendInstagramDmWithLocksAndFallback({
            pageId: pageIdForSend,
            senderId,
            replyText,
            doctorToken,
            doctorId,
            correlationId,
            eventId,
            provider,
            webhookEntryId: pageIdForSend,
            doctorPageId: recDoctorPageId,
            pageIds,
            context: 'conflict_recovery',
          });
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
