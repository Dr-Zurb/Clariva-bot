/**
 * rcp-07: Collection → consent → confirm → recording → slot funnel — extracted from legacy decide-chain.
 */

import { logger } from '../../../config/logger';
import {
  resolveConsentReplyForBooking,
  resolveConfirmDetailsReplyForBooking,
  type DoctorContext,
} from '../../../services/ai-service';
import {
  getCollectedData,
  clearCollectedData,
  validateAndApplyExtracted,
  buildConfirmDetailsMessage,
  tryRecoverAndSetFromMessages,
} from '../../../services/collection-service';
import {
  persistPatientAfterConsent,
  handleConsentDenied,
} from '../../../services/consent-service';
import { createPatientForBooking } from '../../../services/patient-service';
import { findPossiblePatientMatches } from '../../../services/patient-matching-service';
import { buildBookingPageUrl } from '../../../services/slot-selection-service';
import {
  matchServiceCatalogOffering,
  type ServiceCatalogMatchResult,
} from '../../../services/service-catalog-matcher';
import { tryApplyLearningPolicyAutobook } from '../../../services/service-match-learning-autobook';
import {
  formatBookingLinkDm,
  formatBookingAwaitingFollowUpDm,
} from '../../../utils/booking-link-copy';
import { isSkipExtrasReply } from '../../../utils/booking-consent-context';
import { isSingleFeeMode, logSingleFeeSkip } from '../../../utils/catalog-mode-guard';
import {
  shouldRequestComplaintClarification,
  resolveComplaintClarificationMessage,
} from '../../../utils/complaint-clarification';
import {
  buildConsentOptionalExtrasMessage,
  buildCorrectionFieldClarifierReply,
  buildIntakeRequestMessage,
  buildRecordingConsentAskMessage,
  buildRecordingConsentExplainer,
  RECORDING_CONSENT_COPY_VERSION,
} from '../../../utils/dm-copy';
import {
  effectiveAskedForConfirm,
  effectiveAskedForConsent,
} from '../../../utils/dm-prompt-context';
import {
  extractFieldsFromMessage,
  detectFieldComplaint,
  type ExtractedFields,
  type FieldComplaintField,
} from '../../../utils/extract-patient-fields';
import { localizeReply, detectPatientLanguageHint } from '../../../utils/localize-reply';
import { getActiveServiceCatalog } from '../../../utils/service-catalog-helpers';
import {
  formatAwaitingStaffServiceConfirmationDm,
  formatStaffServiceReviewStillPendingDm,
} from '../../../utils/staff-service-review-dm';
import {
  applyMatcherProposalToConversationState,
  isSlotBookingBlockedPendingStaffReview,
  mergeBooking,
  mergeBookingForOther,
  mergeClarification,
  mergeRecordingConsent,
  mergeTriage,
  setStage,
  type ConversationState,
} from '../../../types/conversation';
import type { DoctorSettingsRow } from '../../../types/doctor-settings';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { Message } from '../../../types';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import {
  buildReturningFollowUpOffer,
  canOfferReturningFollowUpService,
} from '../returning-followup-offer';
import { isBookingFunnelTurn } from './booking-funnel-predicate';

async function enrichStateWithServiceCatalogMatch(
  baseState: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  reasonForVisit: string | null | undefined,
  recentMessages: Message[],
  correlationId: string
): Promise<{ state: ConversationState; match: ServiceCatalogMatchResult | null }> {
  const trimmed = reasonForVisit?.trim();
  if (!trimmed) {
    return { state: baseState, match: null };
  }
  if (!doctorSettings) {
    return { state: baseState, match: null };
  }
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog?.services.length) {
    return { state: baseState, match: null };
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
    catalogMode: doctorSettings.catalog_mode,
    doctorId: doctorSettings.doctor_id,
  });

  if (!match) {
    return { state: baseState, match: null };
  }

  logger.info(
    {
      correlationId,
      serviceCatalogMatchSource: match.source,
      serviceCatalogMatchConfidence: match.confidence,
      catalogServiceKey: match.catalogServiceKey,
      pendingStaffReview: match.pendingStaffReview,
      mixedComplaints: match.mixedComplaints,
    },
    'instagram_dm_service_catalog_match'
  );

  const enriched = applyMatcherProposalToConversationState(baseState, {
    matcherProposedCatalogServiceKey: match.catalogServiceKey,
    matcherProposedCatalogServiceId: match.catalogServiceId,
    matcherProposedConsultationModality: match.suggestedModality,
    serviceCatalogMatchConfidence: match.confidence,
    serviceCatalogMatchReasonCodes: match.reasonCodes,
    matcherCandidateLabels: match.candidateLabels,
    pendingStaffServiceReview: match.pendingStaffReview,
    finalizeSelection: match.autoFinalize,
  });

  return { state: enriched, match };
}

function maybeTriggerComplaintClarification(
  state: ConversationState,
  match: ServiceCatalogMatchResult | null,
  doctorSettings: DoctorSettingsRow | null,
  originalReasonText: string | null | undefined,
  userText: string,
  correlationId: string,
  nextReply: string
): { state: ConversationState; replyText: string; triggered: boolean } {
  const trimmedOriginal = originalReasonText?.trim();
  if (!match || !trimmedOriginal) {
    return { state, replyText: nextReply, triggered: false };
  }
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog?.services.length) {
    return { state, replyText: nextReply, triggered: false };
  }
  const gate = shouldRequestComplaintClarification({
    mixedComplaints: match.mixedComplaints === true,
    confidence: match.confidence,
    catalog,
    pendingStaffServiceReview: state.serviceMatch?.pendingStaffServiceReview === true,
    attemptCount: state.clarification?.complaintClarificationAttemptCount ?? 0,
    catalogMode: doctorSettings?.catalog_mode ?? null,
  });
  if (!gate) {
    if (isSingleFeeMode(doctorSettings?.catalog_mode)) {
      logSingleFeeSkip('clarification', {
        doctorId: doctorSettings?.doctor_id ?? null,
        correlationId,
      });
    }
    return { state, replyText: nextReply, triggered: false };
  }

  const now = new Date().toISOString();
  const concernsForState = match.concerns && match.concerns.length >= 2 ? match.concerns : undefined;
  const nextState = mergeClarification(
    mergeBooking(
      setStage(
        { ...state, lastPromptKind: 'complaint_clarification', updatedAt: now },
        'awaiting_complaint_clarification'
      ),
      { consent_requested_at: undefined }
    ),
    {
      originalReasonForVisit: trimmedOriginal,
      complaintClarificationAttemptCount:
        state.clarification?.complaintClarificationAttemptCount ?? 0,
      complaintClarificationRequestedAt: now,
      complaintClarificationFallbackMatch: {
        catalogServiceKey: match.catalogServiceKey,
        catalogServiceId: match.catalogServiceId,
        consultationModality: match.suggestedModality,
        confidence: match.confidence,
        candidateLabels: match.candidateLabels,
      },
      pendingClarificationConcerns: concernsForState,
    }
  );

  logger.info(
    {
      correlationId,
      conversationStep: 'awaiting_complaint_clarification',
      matcherConfidence: match.confidence,
      fallbackCatalogServiceKey: match.catalogServiceKey,
      clarificationConcernCount: concernsForState?.length ?? 0,
    },
    'instagram_dm_mixed_complaints_clarification_requested'
  );

  return {
    state: nextState,
    replyText: resolveComplaintClarificationMessage(userText, concernsForState),
    triggered: true,
  };
}

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

function resolveRecordingConsentReply(text: string): 'yes' | 'no' | 'unclear' {
  const trimmed = (text ?? '').trim().toLowerCase();
  if (!trimmed) return 'unclear';
  const classify = (input: string): 'yes' | 'no' | 'unclear' => {
    if (/^(no|nope|nah|n)[.!,]?$/.test(input)) return 'no';
    if (/^(yes|yeah|yep|yup|ok|okay|sure|y)[.!,]?$/.test(input)) return 'yes';
    if (/\b(i\s*do\s*not|i\s*don'?t|don'?t\s+record|no\s+recording|decline|disagree|refuse|reject)\b/.test(input)) {
      return 'no';
    }
    if (/\b(i\s+agree|agree|i\s+consent|consent|continue\s+without\s+recording)\b/.test(input)) {
      if (/continue\s+without\s+recording/.test(input)) return 'no';
      return 'yes';
    }
    if (/\b(keep\s+recording\s+on|record\s+it|go\s+ahead|proceed)\b/.test(input)) return 'yes';
    return 'unclear';
  };
  const direct = classify(trimmed);
  if (direct !== 'unclear') return direct;
  const collapsed = trimmed.replace(/([a-z])\1+/g, '$1');
  if (collapsed !== trimmed) {
    return classify(collapsed);
  }
  return 'unclear';
}

function buildBookingLinkReplyWithFollowUp(
  state: ConversationState,
  conversationId: string,
  doctorId: string,
  doctorSettings: DoctorSettingsRow | null | undefined,
): string {
  const slotLink = buildBookingPageUrl(conversationId, doctorId);
  const baseSlotMsg = formatBookingLinkDm(slotLink, '', doctorSettings);
  if (state.bookingForOther?.pendingSelfBooking) {
    return `${baseSlotMsg}\n\nWould you like to book one for yourself now?`;
  }
  if (state.bookingForOther?.pendingOtherBooking?.relation) {
    return `${baseSlotMsg}\n\nWould you like to book for your ${state.bookingForOther?.pendingOtherBooking.relation} now?`;
  }
  return baseSlotMsg;
}

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

function extractExtraNotesFromConsentReply(text: string, consentResult: 'granted' | 'denied' | 'unclear'): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (consentResult === 'denied') return undefined;
  if (isSkipExtrasReply(trimmed)) return undefined;

  if (consentResult === 'granted') {
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

  return trimmed;
}

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
  if (hasExtracted) return false;

  const clarificationPatterns = [
    /\b(?:my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother)\s*\??\s*$/i,
    /\b(?:sister|mother|father)\s+first\b/i,
    /\bfor\s+my\s+(mother|father|sister|brother|wife|husband|son|daughter)\b/i,
    /\b(?:the\s+person\s+i'?m\s+booking\s+for|person\s+I'm\s+booking\s+for)\b/i,
    /\bcan\s+I\s+book\s+for\s+my\s+friend\b/i,
  ];
  if (clarificationPatterns.some((p) => p.test(trimmed))) return true;

  const questionPatterns = [
    /\bwhy\s+(do\s+you\s+need|are\s+you\s+asking)\b/i,
    /\bwhat\s+if\s+I\s+don'?t\s+have\b/i,
    /\bcan\s+I\s+share\b/i,
    /\bdo\s+I\s+have\s+to\s+(provide|give)\b/i,
    /\b(is\s+it\s+)?(really\s+)?necessary\b/i,
  ];
  if (questionPatterns.some((p) => p.test(trimmed))) return true;

  if (trimmed.length < 25 && !/\d{10,}/.test(trimmed) && !/@/.test(trimmed)) return true;

  return false;
}

function formatPatientIdHint(_mrn?: string | null): string {
  return '';
}

async function getPatientIdHintForSlot(
  _patientId: string | undefined,
  _correlationId: string
): Promise<string> {
  return '';
}

export function applyRecordingConsentDetourIfNeeded(
  result: DmTurnResult,
  doctorContext: DoctorContext | undefined
): DmTurnResult {
  const stateToPersist = result.nextState;
  if (
    stateToPersist.step === 'awaiting_slot_selection' &&
    stateToPersist.recordingConsent?.recordingConsentDecision === undefined
  ) {
    return {
      branch: 'recording_consent_injected',
      reply: buildRecordingConsentAskMessage({
        practiceName: doctorContext?.practice_name ?? undefined,
      }),
      nextState: mergeBooking(
        setStage(
          {
            ...stateToPersist,
            lastPromptKind: 'recording_consent_ask',
            updatedAt: new Date().toISOString(),
          },
          'recording_consent'
        ),
        { bookingLinkSentAt: undefined, bookingReminderSent: undefined }
      ),
    };
  }
  return result;
}

export async function applyLearningPolicyAutobookAfterStage(
  result: DmTurnResult,
  ctx: Pick<DmTurnContext, 'doctorId' | 'correlationId' | 'conversation'>
): Promise<DmTurnResult> {
  let { branch, reply, nextState: state } = result;
  const { doctorId, correlationId, conversation } = ctx;

  if (
    state.step === 'awaiting_staff_service_confirmation' &&
    state.serviceMatch?.pendingStaffServiceReview === true &&
    state.serviceMatch?.matcherProposedCatalogServiceKey?.trim()
  ) {
    try {
      const ab = await tryApplyLearningPolicyAutobook({
        doctorId,
        conversationId: conversation.id,
        state,
        candidateLabels: state.serviceMatch?.matcherCandidateLabels ?? [],
        correlationId,
      });
      if (ab.applied) {
        state = ab.nextState;
        reply = ab.replyText;
        branch = 'learning_policy_autobook';
      }
    } catch (e) {
      logger.warn(
        { correlationId, err: e instanceof Error ? e.message : String(e) },
        'learning_policy_autobook_failed'
      );
    }
  }

  return { branch, reply, nextState: state };
}

export const bookingFunnelStage = {
  stage: 'booking_funnel',
  async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
    if (!isBookingFunnelTurn(ctx)) {
      throw new Error('booking_funnel stage invoked but predicate did not match');
    }

    const {
      conversation,
      doctorId,
      correlationId,
      text,
      recentMessages,
      intentResult,
      doctorSettings,
      doctorContext,
      lastBotAskedForDetails,
      timing,
      runGenerateResponse,
      buildAiContextForResponse,
      teleconsultCatalogRowCount,
      fallbackReply,
      returningProfile,
    } = ctx;
    let state = ctx.state;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = fallbackReply;

    if (state.step === 'recording_consent') {
      dmRoutingBranch = 'recording_consent_flow';
      const decision = resolveRecordingConsentReply(text);
      if (decision === 'unclear') {
        replyText = buildRecordingConsentAskMessage({
          practiceName: doctorContext?.practice_name ?? undefined,
        });
        state = { ...state, updatedAt: new Date().toISOString() };
      } else if (decision === 'no' && state.recordingConsent?.recordingConsentRePitched !== true) {
        replyText = buildRecordingConsentExplainer({
          version: RECORDING_CONSENT_COPY_VERSION,
          practiceName: doctorContext?.practice_name ?? undefined,
        });
        state = mergeRecordingConsent(
          {
            ...state,
            lastPromptKind: 'recording_consent_re_pitch',
            updatedAt: new Date().toISOString(),
          },
          { recordingConsentRePitched: true }
        );
      } else {
        const captured = decision === 'yes';
        replyText = buildBookingLinkReplyWithFollowUp(
          state,
          conversation.id,
          doctorId,
          doctorSettings,
        );
        state = mergeRecordingConsent(
          {
            ...state,
            step: 'awaiting_slot_selection',
            lastPromptKind: undefined,
            updatedAt: new Date().toISOString(),
          },
          {
            recordingConsentDecision: captured,
            recordingConsentVersion: RECORDING_CONSENT_COPY_VERSION,
            recordingConsentRePitched: undefined,
          }
        );
      }
    } else if (state.step === 'consent' || effectiveAskedForConsent(state, recentMessages)) {
      const CORRECTION_RE = /\b(wait|wrong|not\s+right|change\s+my|correct\s+my|actually\s+it'?s|my\s+name\s+is|my\s+phone\s+is|my\s+number\s+is|update\s+my)\b/i;
      if (CORRECTION_RE.test(text.trim())) {
        dmRoutingBranch = 'consent_correction_back';
        state = {
          ...state,
          step: 'confirm_details',
          lastPromptKind: 'confirm_details' as const,
          updatedAt: new Date().toISOString(),
        };
        const aiContext = await buildAiContextForResponse(conversation.id, state, recentMessages, correlationId, text, teleconsultCatalogRowCount);
        replyText = await runGenerateResponse({
          conversationId: conversation.id,
          currentIntent: 'book_appointment',
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
          context: {
            ...aiContext,
            idleDialogueHint: 'The patient wants to correct their details before consenting. Ask them to provide the corrected information, then re-confirm all details.',
          },
        });
      } else {
        dmRoutingBranch = 'consent_flow';
        if (!state.step) {
          state = { ...state, step: 'consent', updatedAt: new Date().toISOString() };
        }
        const tConsentResolve = Date.now();
        const consentResult = await resolveConsentReplyForBooking(
          text,
          getLastBotMessage(recentMessages),
          correlationId
        );
        timing.dmGenerateMs += Date.now() - tConsentResolve;
        const hasExtrasOrGranted = consentResult === 'granted';
        if (hasExtrasOrGranted) {
          const extraNotes = extractExtraNotesFromConsentReply(text, consentResult);
          let collectedBeforePersist = await getCollectedData(conversation.id);
          let reasonForVisitFromCollected = collectedBeforePersist?.reason_for_visit?.trim();

          if (state.bookingForOther?.bookingForSomeoneElse) {
            if (!collectedBeforePersist?.name?.trim() || !collectedBeforePersist?.phone?.trim()) {
              const recovered = await tryRecoverAndSetFromMessages(
                conversation.id,
                recentMessages,
                correlationId
              );
              if (recovered) collectedBeforePersist = await getCollectedData(conversation.id);
            }
            if (!collectedBeforePersist?.name?.trim() || !collectedBeforePersist?.phone?.trim()) {
              {
                const knownRelation =
                  state.bookingForOther?.relation && state.bookingForOther?.relation.toLowerCase() !== 'them'
                    ? state.bookingForOther?.relation
                    : undefined;
                replyText = buildIntakeRequestMessage({
                  variant: 'retry-not-received',
                  forRelation: knownRelation,
                  missing: ['name', 'age', 'phone', 'reason_for_visit'],
                  intro: knownRelation
                    ? undefined
                    : "I didn't catch the details for the person you're booking for — could you resend them?",
                });
              }
              state = { ...state, updatedAt: new Date().toISOString() };
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
              const shared: ConversationState = mergeBookingForOther(
                mergeBooking(
                  { ...state, lastIntent: intentResult.intent, updatedAt: new Date().toISOString() },
                  {
                    reasonForVisit: state.booking?.reasonForVisit ?? reasonForVisitFromCollected,
                    extraNotes: extraNotes ?? state.booking?.extraNotes,
                  }
                ),
                { bookingForPatientId: newPatient.id, bookingForSomeoneElse: false }
              );
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
                replyText = shared.bookingForOther?.pendingSelfBooking
                  ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
                  : baseSlotMsg;
                state = setStage(shared, 'awaiting_slot_selection');
              }
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
            const sharedBase: ConversationState = mergeBooking(
              { ...state, lastIntent: intentResult.intent, updatedAt: new Date().toISOString() },
              {
                reasonForVisit: state.booking?.reasonForVisit ?? reasonForVisitFromCollected,
                extraNotes: extraNotes ?? state.booking?.extraNotes,
              }
            );
            if (!persistResult.success) {
              replyText =
                `I had trouble saving your details - please say 'book appointment' to re-share them if needed. Meanwhile, ${baseSlotMsg}`;
              state = setStage(sharedBase, 'awaiting_slot_selection');
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
              replyText = sharedBase.bookingForOther?.pendingOtherBooking
                ? `${baseSlotMsg}\n\nWould you like to book for your ${sharedBase.bookingForOther.pendingOtherBooking.relation} now?`
                : baseSlotMsg;
              state = setStage(sharedBase, 'awaiting_slot_selection');
            }
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
        } else {
          replyText = await localizeReply(
            "I didn't catch that — please reply **Yes** to consent and continue, or **No** to cancel.",
            {},
            detectPatientLanguageHint(text),
            correlationId
          );
          state = { ...state, step: 'consent', updatedAt: new Date().toISOString() };
        }
      }
    } else if (
      (state.step === 'collecting_all' || (lastBotAskedForDetails && !state.step)) &&
      !(
        /^(yes|yeah|yep|ok|okay|correct|looks good|confirmed)$/i.test(text.trim()) &&
        effectiveAskedForConfirm(state, recentMessages)
      )
    ) {
      dmRoutingBranch = 'booking_collection';
      if (!state.step) {
        state = mergeTriage(
          {
            ...state,
            step: 'collecting_all',
            collectedFields: [],
            updatedAt: new Date().toISOString(),
          },
          {
            lastMedicalDeflectionAt: undefined,
            reasonFirstTriagePhase: undefined,
            postMedicalConsultFeeAckSent: undefined,
          }
        );
      }
      if (state.bookingForOther?.bookingForSomeoneElse) {
        const relationMatch = text.match(/\b(?:my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother|parent|spouse)\b/i);
        if (relationMatch) {
          const relation = relationMatch[1].toLowerCase();
          const collected = await getCollectedData(conversation.id);
          const hasAnyData = collected?.name || collected?.phone || collected?.age !== undefined;
          if (!hasAnyData) {
            state = mergeBookingForOther(
              { ...state, lastIntent: intentResult.intent, updatedAt: new Date().toISOString() },
              { relation }
            );
          }
        }
      }
      const wantsMeFirst =
        state.bookingForOther?.pendingSelfBooking &&
        state.bookingForOther?.bookingForSomeoneElse &&
        !state.collectedFields?.length &&
        /^(me\s+first|myself\s+first|book\s+for\s+me\s+first|i\s+want\s+to\s+book\s+for\s+myself\s+first)$/i.test(text.trim());
      if (wantsMeFirst && state.bookingForOther?.relation) {
        await clearCollectedData(conversation.id);
        const relation = state.bookingForOther?.relation;
        state = mergeBookingForOther(
          mergeTriage(
            setStage(
              {
                ...state,
                lastIntent: intentResult.intent,
                collectedFields: [],
                updatedAt: new Date().toISOString(),
              },
              'collecting_all'
            ),
            {
              lastMedicalDeflectionAt: undefined,
              reasonFirstTriagePhase: undefined,
              postMedicalConsultFeeAckSent: undefined,
            }
          ),
          {
            bookingForSomeoneElse: false,
            pendingSelfBooking: false,
            pendingOtherBooking: { relation },
          }
        );
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
        const wantsJustOther =
          state.bookingForOther?.pendingSelfBooking &&
          state.bookingForOther?.bookingForSomeoneElse &&
          /^(actually\s+)?just\s+(my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother)$/i.test(text.trim());
        if (wantsJustOther) {
          const relationMatch = text.match(/\b(mother|father|mom|dad|wife|husband|son|daughter|sister|brother)\b/i);
          const relation = relationMatch ? relationMatch[1].toLowerCase() : state.bookingForOther?.relation ?? 'them';
          state = mergeBookingForOther(
            { ...state, lastIntent: intentResult.intent, updatedAt: new Date().toISOString() },
            { pendingSelfBooking: false, relation }
          );
          replyText = buildIntakeRequestMessage({
            variant: 'initial',
            forRelation: relation,
            missing: ['name', 'age', 'phone', 'reason_for_visit'],
            intro: `Got it, just your **${relation}** then. Please share their details:`,
          });
        } else {
          const extracted = extractFieldsFromMessage(text);
          if (isAmbiguousCollectionMessage(text, extracted)) {
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
                  : buildIntakeRequestMessage({
                      variant: 'still-need',
                      missing: extractResult.missingFields,
                      includeEmail: false,
                    });
            }
          }
        }
      }
    } else if (
      state.step === 'confirm_details' ||
      (effectiveAskedForConfirm(state, recentMessages) && text.trim().length > 0)
    ) {
      dmRoutingBranch = 'confirm_details';
      if (!state.step) {
        state = { ...state, step: 'confirm_details', updatedAt: new Date().toISOString() };
      }
      const tConfirmResolve = Date.now();
      const confirmResolution = await resolveConfirmDetailsReplyForBooking(
        text,
        getLastBotMessage(recentMessages),
        correlationId
      );
      timing.dmGenerateMs += Date.now() - tConfirmResolve;
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

        const matchName = collected?.name?.trim() ?? '';
        const matchPhone = collected?.phone?.trim() ?? '';
        const matches = matchName && matchPhone
          ? await findPossiblePatientMatches(
              doctorId,
              matchPhone,
              matchName,
              collected?.age,
              collected?.gender,
              correlationId
            )
          : [];
        if (matches.length > 0) {
          const ids = matches.slice(0, 2).map((m) => m.patientId);
          state = mergeBookingForOther(
            mergeBooking(
              setStage(
                { ...state, lastIntent: intentResult.intent, updatedAt: new Date().toISOString() },
                'awaiting_match_confirmation'
              ),
              {
                reasonForVisit: collected?.reason_for_visit,
                age: collected?.age,
              }
            ),
            { pendingMatchPatientIds: ids }
          );
          if (canOfferReturningFollowUpService(returningProfile, state, doctorSettings)) {
            const followUpOffer = buildReturningFollowUpOffer(
              state,
              returningProfile,
              doctorSettings,
              intentResult.intent
            );
            if (followUpOffer) {
              state = followUpOffer.state;
              replyText = followUpOffer.replyText;
              dmRoutingBranch = 'returning_followup_confirm_offer';
            }
          }
          if (dmRoutingBranch !== 'returning_followup_confirm_offer') {
          const enrichedForMatch = await enrichStateWithServiceCatalogMatch(
            state,
            doctorSettings,
            collected?.reason_for_visit,
            recentMessages,
            correlationId
          );
          state = enrichedForMatch.state;
          const defaultReplyForMatch: string =
            matches.length === 1
              ? state.bookingForOther?.bookingForSomeoneElse
                ? `We found a record for **${matches[0]!.name}** with this number. Same person? Reply Yes or No.`
                : `We found an existing record matching your details (**${matches[0]!.name}**). Is this you? Reply Yes or No.`
              : `We found ${matches.length} records: ${matches
                  .slice(0, 2)
                  .map((m, i) => `${i + 1}. ${m.name}${m.age != null ? ` (${m.age})` : ''}`)
                  .join(', ')}. Which one? Reply 1 or 2, or No for new patient.`;
          const clarifyForMatch = maybeTriggerComplaintClarification(
            state,
            enrichedForMatch.match,
            doctorSettings,
            collected?.reason_for_visit,
            text,
            correlationId,
            defaultReplyForMatch
          );
          state = clarifyForMatch.state;
          replyText = clarifyForMatch.replyText;
          }
        } else {
          const now = new Date().toISOString();
          state = mergeBooking(
            setStage(
              {
                ...state,
                lastIntent: intentResult.intent,
                updatedAt: now,
                ...(state.bookingForOther?.bookingForSomeoneElse
                  ? {}
                  : { lastPromptKind: 'consent_optional_extras' as const }),
              },
              'consent'
            ),
            {
              consent_requested_at: now,
              reasonForVisit: collected?.reason_for_visit,
              age: collected?.age,
            }
          );
          if (canOfferReturningFollowUpService(returningProfile, state, doctorSettings)) {
            const followUpOffer = buildReturningFollowUpOffer(
              state,
              returningProfile,
              doctorSettings,
              intentResult.intent
            );
            if (followUpOffer) {
              state = followUpOffer.state;
              replyText = followUpOffer.replyText;
              dmRoutingBranch = 'returning_followup_confirm_offer';
            }
          }
          if (dmRoutingBranch !== 'returning_followup_confirm_offer') {
          const enrichedForConsent = await enrichStateWithServiceCatalogMatch(
            state,
            doctorSettings,
            collected?.reason_for_visit,
            recentMessages,
            correlationId
          );
          state = enrichedForConsent.state;
          const resolvedConsentName = collected?.name?.trim() || undefined;
          const defaultReplyForConsent: string = buildConsentOptionalExtrasMessage({
            patientName: state.bookingForOther?.bookingForSomeoneElse ? undefined : resolvedConsentName,
            phoneDisplay,
            bookingForSomeoneElse: !!state.bookingForOther?.bookingForSomeoneElse,
            bookingForName: state.bookingForOther?.bookingForSomeoneElse ? resolvedConsentName ?? name : undefined,
          });
          const clarifyForConsent = maybeTriggerComplaintClarification(
            state,
            enrichedForConsent.match,
            doctorSettings,
            collected?.reason_for_visit,
            text,
            correlationId,
            defaultReplyForConsent
          );
          state = clarifyForConsent.state;
          replyText = clarifyForConsent.replyText;
          }
        }
      } else if (isCorrection) {
        const collectedBefore = (await getCollectedData(conversation.id)) ?? {};
        const complaintField: FieldComplaintField | null =
          detectFieldComplaint(text);
        const extractResult = await validateAndApplyExtracted(
          conversation.id,
          text,
          { ...state, lastIntent: intentResult.intent },
          correlationId,
          {
            lastBotMessage: getLastBotMessage(recentMessages),
            recentMessages,
            isCorrection: true,
          }
        );
        state = extractResult.newState;
        const collected = await getCollectedData(conversation.id);
        const noFieldsChanged =
          collectedBefore.name === collected?.name &&
          collectedBefore.age === collected?.age &&
          collectedBefore.gender === collected?.gender &&
          collectedBefore.phone === collected?.phone &&
          collectedBefore.reason_for_visit === collected?.reason_for_visit &&
          collectedBefore.email === collected?.email;
        if (complaintField && noFieldsChanged) {
          dmRoutingBranch = 'confirm_details_complaint_clarify';
          replyText = buildCorrectionFieldClarifierReply(complaintField);
        } else if (extractResult.missingFields.length === 0) {
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
              : buildIntakeRequestMessage({
                  variant: 'still-need',
                  missing: extractResult.missingFields,
                  includeEmail: false,
                  intro: 'Still need these details:',
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
        state.bookingForOther?.pendingSelfBooking &&
        (/^(yes|yeah|yep|ok|okay|sure|please|i'?d?\s+like\s+to|book\s+for\s+myself|book\s+one\s+for\s+me)$/.test(trimmed) ||
          /^(yes|yeah|yep),?\s*(i'?d?\s+like\s+to\s+)?(book\s+for\s+myself|book\s+one\s+for\s+me)/.test(trimmed));
      const wantsOtherBooking =
        state.bookingForOther?.pendingOtherBooking &&
        (/^(yes|yeah|yep|ok|okay|sure|please)$/.test(trimmed) ||
          new RegExp(`book\\s+(for\\s+)?(my\\s+)?${state.bookingForOther?.pendingOtherBooking.relation}`, 'i').test(trimmed));
      if (wantsOtherBooking) {
        await clearCollectedData(conversation.id);
        const relation = state.bookingForOther?.pendingOtherBooking!.relation;
        state = mergeBookingForOther(
          mergeTriage(
            setStage(
              {
                ...state,
                lastIntent: 'book_for_someone_else',
                collectedFields: [],
                updatedAt: new Date().toISOString(),
              },
              'collecting_all'
            ),
            {
              lastMedicalDeflectionAt: undefined,
              reasonFirstTriagePhase: undefined,
              postMedicalConsultFeeAckSent: undefined,
            }
          ),
          {
            bookingForSomeoneElse: true,
            relation,
            pendingOtherBooking: undefined,
            bookingForPatientId: undefined,
          }
        );
        replyText = buildIntakeRequestMessage({
          variant: 'initial',
          forRelation: relation,
          missing: ['name', 'age', 'phone', 'reason_for_visit'],
          intro: `Got it. I'll help you book for your **${relation}** next. Please share their details:`,
        });
      } else if (wantsSelfBooking) {
        await clearCollectedData(conversation.id);
        state = mergeBookingForOther(
          mergeTriage(
            setStage(
              {
                ...state,
                lastIntent: 'book_appointment',
                collectedFields: [],
                updatedAt: new Date().toISOString(),
              },
              'collecting_all'
            ),
            {
              lastMedicalDeflectionAt: undefined,
              reasonFirstTriagePhase: undefined,
              postMedicalConsultFeeAckSent: undefined,
            }
          ),
          { pendingSelfBooking: false, bookingForPatientId: undefined }
        );
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
          const patientId = state.bookingForOther?.bookingForPatientId ?? conversation.patient_id;
          const mrnHint = await getPatientIdHintForSlot(patientId, correlationId);
          const slotLink = buildBookingPageUrl(conversation.id, doctorId);
          replyText = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
        }
        state = { ...state, updatedAt: new Date().toISOString() };
      } else {
        replyText = formatBookingAwaitingFollowUpDm(doctorSettings);
        state = { ...state, updatedAt: new Date().toISOString() };
      }
    }

    const result: DmTurnResult = { branch: dmRoutingBranch, reply: replyText, nextState: state };
    return applyRecordingConsentDetourIfNeeded(result, doctorContext);
  },
} as DmStageHandler;
