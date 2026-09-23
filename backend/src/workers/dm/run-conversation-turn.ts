/**
 * rcp-12: Channel-free conversation turn — understand → decide → persist once.
 * No instagram-service or channel adapter imports.
 */

import { logger } from '../../config/logger';
import type { IntentDetectionResult } from '../../types/ai';
import type { Conversation } from '../../types/database';
import type { DmHandlerBranch } from '../../types/dm-instrumentation';
import type { DoctorSettingsRow } from '../../types/doctor-settings';
import {
  conversationLastPromptKindForStep,
  isRecentMedicalDeflectionWindow,
  mergeBooking,
  mergeServiceMatch,
  normalizePersistedStep,
  type ConversationLastPromptKind,
  type ConversationStage,
  type ConversationState,
} from '../../types/conversation';
import { resolvePatientForChannelSender } from '../../services/patient-identity-service';
import { maybeLinkCommentLeadAfterDm } from '../../services/comment-lead-service';
import {
  findPatientByIdWithAdmin,
  setPatientPlatformUsernameIfEmpty,
} from '../../services/patient-service';
import { fetchMessengerUserProfile } from '../../services/instagram-service';
import { setCachedPlatformAvatar } from '../../services/platform-avatar-cache';
import { getInstagramAccessTokenForDoctor } from '../../services/instagram-connect-service';
import { getFacebookPageAccessTokenForDoctor } from '../../services/facebook-connect-service';
import {
  buildReturningPatientSummary,
  loadReturningPatientProfile,
  shouldUseReturningPatientMemory,
} from './returning-patient';
import { auditReturningPatientRecognized } from './returning-patient-audit';
import type { ReturningPatientProfile } from '../../types/returning-patient';
import {
  findConversationByPlatformId,
  createConversation,
  getConversationState,
  updateConversationState,
  normalizeLegacySlotConversationSteps,
} from '../../services/conversation-service';
import { createMessage, getRecentMessages } from '../../services/message-service';
import {
  logDmEmergencyIntentDowngraded,
  logDmLanguageDecision,
} from '../../services/webhook-metrics';
import {
  applyEmergencyIntentPostPolicy,
  applyIntentPostClassificationPolicy,
  buildClassifyIntentContext,
  classifyIntent,
  classifierSignalsFeeThreadContinuation,
  generateResponse,
  generateResponseWithActions,
  intentSignalsFeeOrPricing,
  redactPhiForAI,
  AI_RECENT_MESSAGES_LIMIT,
  type DoctorContext,
  type GenerateResponseContext,
} from '../../services/ai-service';
import { getCollectedData } from '../../services/collection-service';
import { REQUIRED_COLLECTION_FIELDS } from '../../utils/validation';
import { getDoctorSettings } from '../../services/doctor-settings-service';
import { instagramAddressToShare } from '../../utils/instagram-faq-copy';
import {
  feeThreadHasCompetingVisitTypeBuckets,
  formatAppointmentFeeForAiContext,
  formatServiceCatalogForAiContext,
  isTeleconsultCatalogAuthoritative,
  mergeFeeCatalogMatchText,
  teleconsultCatalogServiceRowCount,
} from '../../utils/consultation-fees';
import {
  lastBotAskedForConsultationChannel,
  parseConsultationChannelUserReply,
} from '../../utils/dm-consultation-channel';
import { buildFeeCatalogMatchText } from '../../utils/dm-turn-context';
import { effectiveAskedForDetails } from '../../utils/dm-prompt-context';
import {
  clinicalLedFeeThread,
  feeFollowUpAnaphora,
  lastAssistantDmContent,
} from '../../utils/reason-first-triage';
import { logInstagramDmRouting } from '../../utils/log-instagram-dm-routing';
import { upsertPendingStaffServiceReviewRequest } from '../../services/service-staff-review-service';
import type { InboundMessage, OutboundReply } from '../channels/types';
import {
  applyClassifierLanguageRatchet,
  coerceClassifierLanguage,
  countLatinLanguageMarkers,
  detectLanguageSignal,
  LANGUAGE_ACCUMULATION_WINDOW,
  resolveTurnLanguage,
  type ConversationLanguage,
} from '../../utils/conversation-language';
import { buildFallbackReplyMessage, FALLBACK_REPLY_EN } from '../../utils/dm-copy';
import { isEmergencyUserMessage } from '../../utils/safety-messages';
import { DEFAULT_RECEPTIONIST_PAUSE_MESSAGE, type DmGateContext } from './control-gates';
import { executeDmTurn } from './handle-turn';
import type { DmTurnContext, DmTurnResult } from './stage-router';

/** English exception constant for no-doctor path (lang-23 §1.4). */
export const FALLBACK_REPLY = FALLBACK_REPLY_EN;

export interface ConversationTurnDeps {
  /** Conflict recovery: skip routing; always AI open response with conflict branch label. */
  conflictRecovery?: boolean;
  /** When set, skip patient/conversation create (recovery after ConflictError). */
  existingConversation?: Conversation;
}

export interface ConversationTurnMeta {
  conversationId: string;
  doctorId: string;
  eventId: string;
  intentMs: number;
  timing: { dmGenerateMs: number };
  dmRoutingBranch: DmHandlerBranch;
  intentResult: IntentDetectionResult;
  greetingFastPath: boolean;
  stateStepBefore: string | null;
  stateStepAfter: string | null;
  handlerStartedAt: number;
  /** Sticky turn language — reused by throttle ack (no extra DB read). */
  turnLanguage: ConversationLanguage;
}

export type RunConversationTurnResult =
  | { reply: OutboundReply; result: DmTurnResult; meta: ConversationTurnMeta }
  | { skip: true; reason: string };

async function buildAiContextForResponse(
  conversationId: string,
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[],
  _correlationId: string,
  currentUserMessage?: string,
  teleconsultCatalogRowCount?: number,
  returningProfile?: ReturningPatientProfile
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
      state.triage?.activeFlow === 'fee_quote' || state.lastPromptKind === 'fee_quote';
    if (state.triage?.reasonFirstTriagePhase) {
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
      !state.booking?.reasonForVisit?.trim() &&
      clinicalLedFeeThread({ state, recentMessages });
    if (suppressIdleFees) {
      ctx.suppressConsultationFeeFacts = true;
    }
    if (shouldUseReturningPatientMemory(returningProfile)) {
      ctx.returningPatientSummary = buildReturningPatientSummary(returningProfile);
    }
    return ctx;
  }

  const collected = await getCollectedData(conversationId);
  const collectedFields = state.collectedFields ?? [];
  const allFields = ['name', 'phone', 'age', 'gender', 'reason_for_visit', 'email'] as const;
  const summaryParts = allFields.map((f) => {
    const has =
      collectedFields.includes(f) ||
      (collected &&
        (collected as Record<string, unknown>)[f] != null &&
        (collected as Record<string, unknown>)[f] !== '');
    return `${f}: [${has ? 'provided' : 'missing'}]`;
  });
  ctx.collectedDataSummary = summaryParts.join(', ');
  ctx.missingFields = REQUIRED_COLLECTION_FIELDS.filter((f) => !collectedFields.includes(f));
  if (ctx.missingFields.length === 0) ctx.missingFields = undefined;

  if (state.bookingForOther?.bookingForSomeoneElse) {
    ctx.bookingForSomeoneElse = true;
    if (state.bookingForOther?.relation) ctx.relation = state.bookingForOther?.relation;
  }

  const reasonInRedis =
    collected &&
    typeof (collected as Record<string, unknown>).reason_for_visit === 'string' &&
    String((collected as Record<string, unknown>).reason_for_visit).trim().length > 0;
  const reasonCollected =
    collectedFields.includes('reason_for_visit') ||
    reasonInRedis ||
    Boolean(state.booking?.reasonForVisit?.trim());
  if (clinicalLedFeeThread({ state, recentMessages }) && !reasonCollected) {
    ctx.suppressConsultationFeeFacts = true;
  }

  return ctx;
}

function getDoctorContextFromSettings(
  settings: DoctorSettingsRow | null
): DoctorContext | undefined {
  if (!settings) return undefined;
  const catalogAi = formatServiceCatalogForAiContext({
    service_offerings_json: settings.service_offerings_json,
    appointment_fee_currency: settings.appointment_fee_currency,
  });
  const catalogAuthority = isTeleconsultCatalogAuthoritative({
    service_offerings_json: settings.service_offerings_json,
    appointment_fee_currency: settings.appointment_fee_currency,
  });
  const hasFeeOnFile =
    !catalogAuthority &&
    settings.appointment_fee_minor != null &&
    settings.appointment_fee_minor > 0;
  const hasTeleconsultCatalogPricing = Boolean(catalogAi?.trim());
  const sharedAddress = catalogAuthority ? null : instagramAddressToShare(settings);
  const hasAny =
    settings.practice_name ||
    settings.business_hours_summary ||
    settings.welcome_message ||
    settings.specialty ||
    sharedAddress ||
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
    address_summary: sharedAddress,
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

export async function runConversationTurn(
  inbound: InboundMessage,
  deps: ConversationTurnDeps = {}
): Promise<RunConversationTurnResult> {
  const tenant = inbound.tenant;
  const text = inbound.text;
  if (!tenant || text == null) {
    return { skip: true, reason: 'missing_tenant_or_text' };
  }

  const conflictRecovery = deps.conflictRecovery === true;
  const { doctorId } = tenant;
  const { correlationId, providerEventId: eventId, senderId, platformMessageId: mid } = inbound;
  const handlerStartedAt = Date.now();
  const timing: { dmGenerateMs: number } = { dmGenerateMs: 0 };
  const greetingFastPath = false;

  // lat-04: doctorId-only read — start early; awaited with the post-conversation batch.
  const doctorSettingsPromise = getDoctorSettings(doctorId);

  let conversation = deps.existingConversation;
  if (!conflictRecovery) {
    // Patient resolve and conversation lookup are independent; create needs patient.id.
    const [patient, existingConv] = await Promise.all([
      resolvePatientForChannelSender({
        doctorId,
        channel: inbound.channel,
        senderId,
        correlationId,
      }),
      findConversationByPlatformId(doctorId, inbound.channel, senderId, correlationId),
    ]);
    conversation =
      existingConv ??
      (await createConversation(
        {
          doctor_id: doctorId,
          patient_id: patient.id,
          platform: inbound.channel,
          platform_conversation_id: senderId,
          status: 'active',
        },
        correlationId
      ));
  }

  if (!conversation) {
    return { skip: true, reason: 'no_conversation' };
  }

  // Inbox identity: @username + avatar (Meta profile_pic) — never block the DM reply path.
  if (
    conversation.patient_id &&
    (inbound.channel === 'instagram' || inbound.channel === 'facebook')
  ) {
    const patientIdForUsername = conversation.patient_id;
    const channelForUsername = inbound.channel;
    void (async () => {
      try {
        const p = await findPatientByIdWithAdmin(patientIdForUsername, correlationId);
        if (!p) return;
        const needsUsername = !p.platform_username?.trim();
        const token =
          channelForUsername === 'instagram'
            ? await getInstagramAccessTokenForDoctor(doctorId, correlationId)
            : await getFacebookPageAccessTokenForDoctor(doctorId, correlationId);
        if (!token) return;
        const profile = await fetchMessengerUserProfile(senderId, token, correlationId);
        if (needsUsername && profile.username) {
          await setPatientPlatformUsernameIfEmpty(
            patientIdForUsername,
            profile.username,
            correlationId
          );
        }
        if (profile.profilePic) {
          await setCachedPlatformAvatar(channelForUsername, senderId, profile.profilePic);
        }
      } catch (err) {
        logger.debug(
          {
            correlationId,
            error: err instanceof Error ? err.message : String(err),
          },
          'DM profile enrichment skipped'
        );
      }
    })();
  }

  const conversationId = conversation.id;
  const patientIdForReturning = conversation.patient_id;

  // lat-04: independent post-conversation reads (+ comment-lead link side effect).
  // Returning-profile load is optional — failure must not fail the turn.
  const [, returningProfile, stateRaw, recentMessages, doctorSettings] = await Promise.all([
    maybeLinkCommentLeadAfterDm({
      doctorId,
      channel: inbound.channel,
      senderId,
      conversationId,
      correlationId,
    }),
    patientIdForReturning
      ? loadReturningPatientProfile({
          doctorId,
          patientId: patientIdForReturning,
          correlationId,
        }).catch((err: unknown) => {
          logger.debug(
            {
              correlationId,
              error: err instanceof Error ? err.message : String(err),
            },
            'returning patient profile load skipped'
          );
          return undefined;
        })
      : Promise.resolve(undefined),
    getConversationState(conversationId, correlationId),
    getRecentMessages(conversationId, AI_RECENT_MESSAGES_LIMIT, correlationId),
    doctorSettingsPromise,
  ]);

  if (
    returningProfile &&
    patientIdForReturning &&
    shouldUseReturningPatientMemory(returningProfile)
  ) {
    await auditReturningPatientRecognized(
      correlationId,
      doctorId,
      patientIdForReturning,
      returningProfile
    );
  }

  let state = stateRaw;
  const normalizedState = normalizeLegacySlotConversationSteps(state);
  if (normalizedState !== state) {
    state = normalizedState;
    // Language not resolved yet (needs classifier for lang-17 ratchet) — state only.
    await updateConversationState(conversationId, state, correlationId);
  }

  const intentStartedAt = Date.now();
  const classifyCtx = buildClassifyIntentContext(state, recentMessages);
  let intentResult = await classifyIntent(
    text,
    correlationId,
    classifyCtx ? { classifyContext: classifyCtx } : undefined
  );
  intentResult = applyIntentPostClassificationPolicy(intentResult, text, state);
  const intentBeforeEmergencyPolicy = intentResult.intent;
  intentResult = applyEmergencyIntentPostPolicy(intentResult, text, recentMessages, state);
  if (intentBeforeEmergencyPolicy === 'emergency' && intentResult.intent === 'medical_query') {
    logDmEmergencyIntentDowngraded({
      correlationId,
      reason: 'post_escalation_stability',
    });
  }
  const intentMs = Date.now() - intentStartedAt;

  // lang-03 / lang-16 / lang-17: resolve sticky reply language once before gates.
  // After classifyIntent so the LANG4-D4 ratchet can consume classifier.language.
  // recentMessages already loaded — no second DB round-trip. Patient-only, last N,
  // oldest-first — assistant copy must not feed detection.
  const priorPatientTexts = recentMessages
    .filter((m) => m.sender_type === 'patient')
    .map((m) => m.content ?? '')
    .slice(-LANGUAGE_ACCUMULATION_WINDOW);
  const storedLanguage = conversation.language ?? null;
  const markerResolution = resolveTurnLanguage(storedLanguage, text, priorPatientTexts, {
    acuteEmergency: isEmergencyUserMessage(text),
  });
  const classifierLanguage = coerceClassifierLanguage(intentResult.language);
  const languageResolution = applyClassifierLanguageRatchet(
    markerResolution,
    storedLanguage,
    classifierLanguage,
    {
      markerConfidence: detectLanguageSignal(text).confidence,
      messageText: text,
    }
  );
  const turnLanguage = languageResolution.language;
  const languagePersist = languageResolution.changed ? { language: turnLanguage } : undefined;
  const markerCounts = countLatinLanguageMarkers(text);
  const classifierAgreed =
    classifierLanguage === 'unknown' ? null : classifierLanguage === turnLanguage;
  logDmLanguageDecision({
    correlationId,
    storedBefore: storedLanguage,
    resolved: turnLanguage,
    changed: languageResolution.changed,
    reason: languageResolution.reason,
    hiMarkerCount: markerCounts.hiMarkerCount,
    paMarkerCount: markerCounts.paMarkerCount,
    paExclusiveCount: markerCounts.paExclusiveCount,
    accumulationWindowSize: priorPatientTexts.length,
    classifierLanguage: classifierLanguage === 'unknown' ? null : classifierLanguage,
    classifierAgreed,
  });
  // In-memory only: gates/stages always see a concrete language (never null).
  conversation = { ...conversation, language: turnLanguage };

  if (!conflictRecovery) {
    const platformMessageId = mid ?? `evt-${eventId}`;
    await createMessage(
      {
        conversation_id: conversationId,
        platform_message_id: platformMessageId,
        sender_type: 'patient',
        content: text,
        intent: intentResult.intent,
      },
      correlationId
    );
  }

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

  const feeComposerClinicalOpts = conflictRecovery
    ? {}
    : clinicalLedForFees
      ? ({ clinicalLedFeeThread: true } as const)
      : {};
  const feeComposerLlmNarrow =
    !conflictRecovery && clinicalLedForFees && teleconsultCatalogRowCount > 1
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
      : {};
  const feeComposerOpts = conflictRecovery
    ? { language: turnLanguage }
    : {
        language: turnLanguage,
        ...feeComposerClinicalOpts,
        showModalityBreakdown: true as const,
        ...feeComposerLlmNarrow,
      };
  const bookingFeeComposerOpts = conflictRecovery
    ? { language: turnLanguage }
    : {
        language: turnLanguage,
        ...feeComposerClinicalOpts,
        showModalityBreakdown: false as const,
        ...feeComposerLlmNarrow,
      };

  const stateStepBefore = state.step ?? null;
  const isBookIntent = intentResult.intent === 'book_appointment';
  const lastBotAskedForDetails = effectiveAskedForDetails(state, recentMessages);
  const lastBotAskedChannelPick = lastBotAskedForConsultationChannel(recentMessages);
  const channelReplyPick = lastBotAskedChannelPick ? parseConsultationChannelUserReply(text) : null;
  const inCollection =
    state.step?.startsWith('collecting_') ||
    state.step === 'consent' ||
    state.step === 'confirm_details' ||
    state.step === 'awaiting_match_confirmation' ||
    state.step === 'awaiting_staff_service_confirmation' ||
    state.step === 'awaiting_complaint_clarification' ||
    lastBotAskedForDetails ||
    (lastBotAskedChannelPick && channelReplyPick != null) ||
    state.lastPromptKind === 'collect_details' ||
    state.lastPromptKind === 'consent' ||
    state.lastPromptKind === 'consent_optional_extras' ||
    state.lastPromptKind === 'confirm_details' ||
    state.lastPromptKind === 'match_pick' ||
    state.lastPromptKind === 'staff_service_pending' ||
    state.lastPromptKind === 'complaint_clarification';
  const justStartingCollection = isBookIntent && !state.step && !state.collectedFields?.length;
  const classifierSignalsFeePricing = intentSignalsFeeOrPricing(intentResult, text);
  const classifierFeeThreadCont = classifierSignalsFeeThreadContinuation(
    intentResult,
    lastAssistantRawForFee
  );
  const signalsFeePricing =
    classifierSignalsFeePricing ||
    feeFollowUpAnaphora(text, lastAssistantRawForFee) ||
    classifierFeeThreadCont;
  const feeIdleRoutedByAnaphora = conflictRecovery
    ? false
    : !classifierSignalsFeePricing &&
      (feeFollowUpAnaphora(text, lastAssistantRawForFee) || classifierFeeThreadCont);

  const runGenerateResponse = async (
    input: Omit<Parameters<typeof generateResponse>[0], 'turnLanguage'>
  ) => {
    const t = Date.now();
    try {
      const reply = await generateResponse({
        ...input,
        turnLanguage,
        classifierSignalsFeeQuestion: input.classifierSignalsFeeQuestion ?? signalsFeePricing,
      });
      return conflictRecovery
        ? reply || buildFallbackReplyMessage({ language: turnLanguage })
        : reply;
    } finally {
      timing.dmGenerateMs += Date.now() - t;
    }
  };
  const runGenerateResponseWithActions = async (
    input: Omit<Parameters<typeof generateResponseWithActions>[0], 'turnLanguage'>
  ) => {
    if (conflictRecovery) {
      return { reply: buildFallbackReplyMessage({ language: turnLanguage }) };
    }
    const t = Date.now();
    try {
      return await generateResponseWithActions({
        ...input,
        turnLanguage,
        classifierSignalsFeeQuestion: input.classifierSignalsFeeQuestion ?? signalsFeePricing,
      });
    } finally {
      timing.dmGenerateMs += Date.now() - t;
    }
  };

  const gateCtx: DmGateContext = {
    state,
    recentMessages,
    intentResult,
    doctorSettings,
    text,
    turnLanguage,
    inCollection,
    conversationId: conversation.id,
    patientId: conversation.patient_id ?? null,
    correlationId,
    automatedMessagingOptedOutAt: conversation.automated_messaging_opted_out_at ?? null,
  };

  const turnCtx: DmTurnContext = {
    state,
    conversation,
    doctorId,
    correlationId,
    text,
    turnLanguage,
    recentMessages,
    intentResult,
    doctorSettings,
    doctorContext,
    gateCtx,
    inCollection,
    isBookIntent,
    justStartingCollection,
    signalsFeePricing,
    feeIdleRoutedByAnaphora,
    feeComposerOpts,
    bookingFeeComposerOpts,
    teleconsultCatalogRowCount,
    channelReplyPick,
    lastBotAskedForDetails,
    recentDmForClinical,
    timing,
    returningProfile,
    runGenerateResponse,
    runGenerateResponseWithActions,
    buildAiContextForResponse: (
      conversationId,
      turnState,
      turnRecentMessages,
      turnCorrelationId,
      turnText,
      turnTeleconsultCatalogRowCount
    ) =>
      buildAiContextForResponse(
        conversationId,
        turnState,
        turnRecentMessages,
        turnCorrelationId,
        turnText,
        turnTeleconsultCatalogRowCount ?? undefined,
        returningProfile
      ),
    fallbackReply: buildFallbackReplyMessage({ language: turnLanguage }),
  };

  const stageResult = await executeDmTurn(
    turnCtx,
    conflictRecovery ? { conflictRecovery: true } : undefined
  );
  if (!conflictRecovery && stageResult.branch === 'receptionist_paused') {
    logger.info(
      { correlationId, eventId, doctorId, conversationId: conversation.id },
      'Instagram DM: receptionist paused; handoff message only (RBH-09)'
    );
  }

  const dmRoutingBranch: DmHandlerBranch = conflictRecovery
    ? 'conflict_recovery_ai'
    : stageResult.branch;
  const replyText = stageResult.reply;
  state = stageResult.nextState;

  if (replyText.trim()) {
    await createMessage(
      {
        conversation_id: conversation.id,
        platform_message_id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        sender_type: 'system',
        content: replyText,
      },
      correlationId
    );
  }

  let stateStepAfter = state.step ?? null;

  if (!conflictRecovery) {
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
      state.step === 'awaiting_staff_service_confirmation' ||
      state.step === 'awaiting_complaint_clarification'
        ? state
        : {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
    const persistedStep: ConversationStage | undefined = stateToPersistRaw.step
      ? normalizePersistedStep(stateToPersistRaw.step)
      : undefined;
    const stepDerivedKind = conversationLastPromptKindForStep(
      persistedStep,
      stateToPersistRaw.triage?.activeFlow
    );
    const granularPersistKinds: ConversationLastPromptKind[] = [
      'consent_optional_extras',
      'consultation_channel_pick',
    ];
    const explicitKind = stateToPersistRaw.lastPromptKind;
    const lastPromptKindResolved =
      explicitKind && granularPersistKinds.includes(explicitKind) ? explicitKind : stepDerivedKind;
    let stateToPersist: ConversationState = {
      ...stateToPersistRaw,
      step: persistedStep,
      lastPromptKind: lastPromptKindResolved,
    };

    if (
      stateToPersist.step === 'awaiting_slot_selection' &&
      !stateToPersist.booking?.bookingLinkSentAt
    ) {
      stateToPersist = mergeBooking(stateToPersist, {
        bookingLinkSentAt: new Date().toISOString(),
        bookingReminderSent: undefined,
      });
    } else if (
      stateToPersist.step !== 'awaiting_slot_selection' &&
      stateToPersist.booking?.bookingLinkSentAt
    ) {
      stateToPersist = mergeBooking(stateToPersist, {
        bookingLinkSentAt: undefined,
        bookingReminderSent: undefined,
      });
    }

    if (
      stateToPersist.step === 'awaiting_staff_service_confirmation' &&
      stateToPersist.serviceMatch?.pendingStaffServiceReview === true &&
      stateToPersist.serviceMatch?.matcherProposedCatalogServiceKey?.trim()
    ) {
      try {
        const ensured = await upsertPendingStaffServiceReviewRequest({
          doctorId,
          conversationId: conversation.id,
          patientId: conversation.patient_id ?? null,
          correlationId,
          state: stateToPersist,
          candidateLabels: stateToPersist.serviceMatch?.matcherCandidateLabels ?? [],
          catalogMode: doctorSettings?.catalog_mode ?? null,
        });
        if (ensured.id) {
          stateToPersist = mergeServiceMatch(stateToPersist, {
            staffServiceReviewRequestId: ensured.id,
          });
        }
      } catch (err) {
        logger.error(
          { correlationId, conversationId: conversation.id, err },
          'instagram_dm_staff_review_upsert_failed'
        );
      }
    }

    stateStepAfter = stateToPersist.step ?? null;
    await updateConversationState(conversation.id, stateToPersist, correlationId, languagePersist);
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
    state_step_after: stateStepAfter,
    greeting_fast_path: greetingFastPath,
  });

  return {
    reply: { text: replyText },
    result: stageResult,
    meta: {
      conversationId: conversation.id,
      doctorId,
      eventId,
      intentMs,
      timing,
      dmRoutingBranch,
      intentResult,
      greetingFastPath,
      stateStepBefore,
      stateStepAfter,
      handlerStartedAt,
      turnLanguage,
    },
  };
}

/** @deprecated Import from `./control-gates` — kept for existing test imports. */
export const DEFAULT_INSTAGRAM_RECEPTIONIST_PAUSE_MESSAGE = DEFAULT_RECEPTIONIST_PAUSE_MESSAGE;
