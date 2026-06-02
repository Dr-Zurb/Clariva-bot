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
import { DEFAULT_RECEPTIONIST_PAUSE_MESSAGE, type DmGateContext } from './control-gates';
import { executeDmTurn } from './handle-turn';
import type { DmTurnContext, DmTurnResult } from './stage-router';

export const FALLBACK_REPLY = "Thanks for your message. We'll get back to you soon.";

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
    const has = collectedFields.includes(f) || (collected && (collected as Record<string, unknown>)[f] != null && (collected as Record<string, unknown>)[f] !== '');
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

  let conversation = deps.existingConversation;
  if (!conflictRecovery) {
    const patient = await resolvePatientForChannelSender({
      doctorId,
      channel: inbound.channel,
      senderId,
      correlationId,
    });
    conversation =
      (await findConversationByPlatformId(doctorId, inbound.channel, senderId, correlationId)) ??
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

  const returningProfile = conversation.patient_id
    ? await loadReturningPatientProfile({
        doctorId,
        patientId: conversation.patient_id,
        correlationId,
      })
    : undefined;

  if (
    returningProfile &&
    conversation.patient_id &&
    shouldUseReturningPatientMemory(returningProfile)
  ) {
    await auditReturningPatientRecognized(
      correlationId,
      doctorId,
      conversation.patient_id,
      returningProfile
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

  if (!conflictRecovery) {
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
  }

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
    ? {}
    : {
        ...feeComposerClinicalOpts,
        showModalityBreakdown: true as const,
        ...feeComposerLlmNarrow,
      };
  const bookingFeeComposerOpts = conflictRecovery
    ? {}
    : {
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
  const justStartingCollection =
    isBookIntent && !state.step && !(state.collectedFields?.length);
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

  const runGenerateResponse = async (input: Parameters<typeof generateResponse>[0]) => {
    const t = Date.now();
    try {
      const reply = await generateResponse({
        ...input,
        classifierSignalsFeeQuestion:
          input.classifierSignalsFeeQuestion ?? signalsFeePricing,
      });
      return conflictRecovery ? reply || FALLBACK_REPLY : reply;
    } finally {
      timing.dmGenerateMs += Date.now() - t;
    }
  };
  const runGenerateResponseWithActions = async (
    input: Parameters<typeof generateResponseWithActions>[0]
  ) => {
    if (conflictRecovery) {
      return { reply: FALLBACK_REPLY };
    }
    const t = Date.now();
    try {
      return await generateResponseWithActions({
        ...input,
        classifierSignalsFeeQuestion:
          input.classifierSignalsFeeQuestion ?? signalsFeePricing,
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
    inCollection,
    conversationId: conversation.id,
    patientId: conversation.patient_id ?? null,
    correlationId,
  };

  const turnCtx: DmTurnContext = {
    state,
    conversation,
    doctorId,
    correlationId,
    text,
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
    fallbackReply: FALLBACK_REPLY,
  };

  const stageResult = await executeDmTurn(turnCtx, conflictRecovery ? { conflictRecovery: true } : undefined);
  if (!conflictRecovery && stageResult.branch === 'receptionist_paused') {
    logger.info(
      { correlationId, eventId, doctorId, conversationId: conversation.id },
      'Instagram DM: receptionist paused; handoff message only (RBH-09)'
    );
  }

  const dmRoutingBranch: DmHandlerBranch = conflictRecovery
    ? 'conflict_recovery_ai'
    : stageResult.branch;
  let replyText = stageResult.reply;
  state = stageResult.nextState;

  await createMessage(
    {
      conversation_id: conversation.id,
      platform_message_id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sender_type: 'system',
      content: replyText,
    },
    correlationId
  );

  let stateStepAfter = state.step ?? null;

  if (!conflictRecovery) {
    const stateToPersistRaw =
      (isBookIntent && (justStartingCollection || inCollection)) ||
      state.step === 'awaiting_slot_selection' ||
      state.step === 'collecting_all' ||
      state.step === 'confirm_details' ||
      state.step === 'awaiting_match_confirmation' ||
      state.step === 'consent' ||
      state.step === 'recording_consent' ||
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
    await updateConversationState(conversation.id, stateToPersist, correlationId);
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
    },
  };
}

/** @deprecated Import from `./control-gates` — kept for existing test imports. */
export const DEFAULT_INSTAGRAM_RECEPTIONIST_PAUSE_MESSAGE = DEFAULT_RECEPTIONIST_PAUSE_MESSAGE;
