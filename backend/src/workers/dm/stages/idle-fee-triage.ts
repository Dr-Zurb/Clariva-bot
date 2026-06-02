/**
 * rcp-05: Idle fee / reason-first triage / medical / greeting stage — extracted from legacy decide-chain.
 */

import {
  appendOptionalDmReplyBridge,
  classifierSignalsPaymentExistence,
  resolvePostMedicalPaymentExistenceAck,
  resolveVisitReasonSnippetForTriage,
  userSignalsReasonFirstWrapUp,
  type GenerateResponseContext,
} from '../../../services/ai-service';
import { findPatientByIdWithAdmin } from '../../../services/patient-service';
import { getActiveServiceCatalog } from '../../../utils/service-catalog-helpers';
import { candidateLabelsForCatalog } from '../../../services/service-catalog-matcher';
import {
  type ConsultationFeeAmbiguousStaffReview,
  userExplicitlyWantsToBookNow,
} from '../../../utils/consultation-fees';
import {
  composeDmReplySegments,
  composeIdleFeeQuoteDmWithMetaAsync,
  composeMidCollectionFeeQuoteDmWithMetaAsync,
} from '../../../utils/dm-reply-composer';
import { buildFeeCatalogMatchText } from '../../../utils/dm-turn-context';
import {
  formatClinicalReasonAskMoreAfterDeflection,
  formatReasonFirstAskWhatElseToAdd,
  formatReasonFirstConfirmClarify,
  formatReasonFirstConfirmQuestion,
  formatReasonFirstFeePatienceBridgeWhileAskMore,
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
} from '../../../utils/reason-first-triage';
import {
  recentThreadHasAssistantEmergencyEscalation,
  resolveSafetyMessage,
  userMessageSignalsPostEmergencyStability,
} from '../../../utils/safety-messages';
import {
  applyMatcherProposalToConversationState,
  isRecentMedicalDeflectionWindow,
  mergeBooking,
  mergeTriage,
  type ConversationState,
  type ReasonFirstTriagePhase,
} from '../../../types/conversation';
import type { DoctorSettingsRow } from '../../../types/doctor-settings';
import type { ReturningRecencyBucket } from '../../../types/returning-patient';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import {
  extractPatientFirstName,
  shouldUseReturningPatientMemory,
} from '../returning-patient';
import { isIdleFeeTriageTurn } from './idle-fee-triage-predicate';

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

function mergeStateForFeeAmbiguousStaffReview(
  state: ConversationState,
  review: ConsultationFeeAmbiguousStaffReview,
  extra: Partial<ConversationState>,
  candidateLabels?: Array<{ service_key: string; label: string }>
): ConversationState {
  const merged = { ...state, ...extra };
  return mergeTriage(
    {
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
      updatedAt: new Date().toISOString(),
    },
    {
      activeFlow: undefined,
      reasonFirstTriagePhase: undefined,
      postMedicalConsultFeeAckSent: undefined,
    }
  );
}

function matcherCandidateLabelsForFeeStaffReview(
  doctorSettings: DoctorSettingsRow | null
): Array<{ service_key: string; label: string }> | undefined {
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog?.services?.length) return undefined;
  return candidateLabelsForCatalog(catalog);
}

interface ReasonFirstFeePartial {
  branch: DmHandlerBranch;
  reply: string;
  nextState: ConversationState;
}

async function runReasonFirstFullFeeEscape(
  ctx: DmTurnContext,
  state: ConversationState
): Promise<ReasonFirstFeePartial> {
  const { doctorSettings, text, recentMessages, intentResult, feeComposerOpts, feeIdleRoutedByAnaphora } =
    ctx;
  const feeThread = buildFeeCatalogMatchText(text, recentMessages);
  const idleFeeOut = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
    catalogMatchText: feeThread,
    ...feeComposerOpts,
  });
  let branch: DmHandlerBranch = feeIdleRoutedByAnaphora
    ? 'fee_follow_up_anaphora_idle'
    : 'fee_deterministic_idle';
  let nextState = state;
  if (idleFeeOut.feeAmbiguousStaffReview) {
    nextState = mergeStateForFeeAmbiguousStaffReview(
      state,
      idleFeeOut.feeAmbiguousStaffReview,
      { lastIntent: intentResult.intent },
      matcherCandidateLabelsForFeeStaffReview(doctorSettings)
    );
    branch = 'fee_ambiguous_visit_type_staff';
    return { branch, reply: idleFeeOut.reply, nextState };
  }
  nextState = mergeTriage(
    {
      ...state,
      lastIntent: intentResult.intent,
      step: 'responded',
      updatedAt: new Date().toISOString(),
    },
    {
      reasonFirstTriagePhase: undefined,
      postMedicalConsultFeeAckSent: undefined,
      activeFlow: 'fee_quote',
    }
  );
  if (idleFeeOut.feeQuoteMatcherFinalize) {
    nextState = mergeFeeQuoteMatcherIntoState(nextState, idleFeeOut.feeQuoteMatcherFinalize);
  }
  return { branch, reply: idleFeeOut.reply, nextState };
}

async function runReasonFirstFeeNarrowFromTriage(
  ctx: DmTurnContext,
  state: ConversationState,
  recentForTriage: { sender_type: string; content: string }[]
): Promise<ReasonFirstFeePartial> {
  const { doctorSettings, text, recentMessages, intentResult, bookingFeeComposerOpts, correlationId } =
    ctx;
  const feeThreadRf = buildFeeCatalogMatchText(text, recentMessages);
  const idleFeeOutRf = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
    catalogMatchText: feeThreadRf,
    ...bookingFeeComposerOpts,
  });
  const consolidated = (
    await resolveVisitReasonSnippetForTriage(recentForTriage, text, correlationId)
  ).trim();
  const reasonSeed = consolidated && consolidated !== 'what you shared' ? consolidated : undefined;
  if (idleFeeOutRf.feeAmbiguousStaffReview) {
    const nextState = mergeStateForFeeAmbiguousStaffReview(
      state,
      idleFeeOutRf.feeAmbiguousStaffReview,
      {
        lastIntent: intentResult.intent,
      },
      matcherCandidateLabelsForFeeStaffReview(doctorSettings)
    );
    return {
      branch: 'fee_ambiguous_visit_type_staff',
      reply: idleFeeOutRf.reply,
      nextState: reasonSeed
        ? mergeBooking(nextState, { reasonForVisit: reasonSeed })
        : nextState,
    };
  }
  let nextState: ConversationState = mergeTriage(
    {
      ...state,
      lastIntent: intentResult.intent,
      step: 'responded',
      updatedAt: new Date().toISOString(),
    },
    {
      reasonFirstTriagePhase: undefined,
      postMedicalConsultFeeAckSent: undefined,
      activeFlow: 'fee_quote',
    }
  );
  if (idleFeeOutRf.feeQuoteMatcherFinalize) {
    nextState = mergeFeeQuoteMatcherIntoState(nextState, idleFeeOutRf.feeQuoteMatcherFinalize);
  }
  if (reasonSeed) {
    nextState = mergeBooking(nextState, { reasonForVisit: reasonSeed });
  }
  return {
    branch: 'reason_first_triage_fee_narrow',
    reply: idleFeeOutRf.reply,
    nextState,
  };
}

export const idleFeeTriageStage: DmStageHandler = {
  stage: 'idle_fee_triage',
  async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
    if (!isIdleFeeTriageTurn(ctx)) {
      throw new Error('idle_fee_triage stage invoked but predicate did not match');
    }

    const {
      conversation,
      correlationId,
      text,
      recentMessages,
      intentResult,
      doctorSettings,
      doctorContext,
      inCollection,
      isBookIntent,
      justStartingCollection,
      signalsFeePricing,
      feeIdleRoutedByAnaphora,
      feeComposerOpts,
      bookingFeeComposerOpts,
      teleconsultCatalogRowCount,
      recentDmForClinical,
      timing,
      runGenerateResponse,
      buildAiContextForResponse,
      fallbackReply,
    } = ctx;
    let state = ctx.state;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = fallbackReply;

    if (
      !inCollection &&
      (!state.step || state.step === 'responded') &&
      isRecentMedicalDeflectionWindow(state) &&
      !state.triage?.reasonFirstTriagePhase &&
      !state.triage?.postMedicalConsultFeeAckSent &&
      (isVagueConsultationPaymentExistenceQuestion(text) ||
        classifierSignalsPaymentExistence(intentResult)) &&
      recentPatientThreadHasClinicalReason(
        recentMessages.map((m) => ({ sender_type: m.sender_type, content: m.content ?? '' }))
      )
    ) {
      dmRoutingBranch = 'post_medical_payment_existence_ack';
      replyText = await resolvePostMedicalPaymentExistenceAck(text, correlationId);
      state = mergeTriage(
        {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        },
        { postMedicalConsultFeeAckSent: true }
      );
    } else if (
      state.triage?.reasonFirstTriagePhase &&
      !inCollection &&
      (!state.step || state.step === 'responded')
    ) {
      const recentForTriage = recentMessages.map((m) => ({
        sender_type: m.sender_type,
        content: m.content ?? '',
      }));

      if (userWantsExplicitFullFeeList(text)) {
        const escaped = await runReasonFirstFullFeeEscape(ctx, state);
        dmRoutingBranch = escaped.branch;
        replyText = escaped.reply;
        state = escaped.nextState;
      } else if (state.triage?.reasonFirstTriagePhase === 'ask_more') {
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
            recentPostMedicalFeeAck: state.triage?.postMedicalConsultFeeAckSent === true,
          });
          state = {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          };
        } else if (userSignalsReasonFirstWrapUp(text, intentResult)) {
          const narrowed = await runReasonFirstFeeNarrowFromTriage(ctx, state, recentForTriage);
          dmRoutingBranch = narrowed.branch;
          replyText = narrowed.reply;
          state = narrowed.nextState;
        } else {
          dmRoutingBranch = 'reason_first_triage_confirm';
          const snippet = await resolveVisitReasonSnippetForTriage(
            recentForTriage,
            parseNothingElseOrSameOnly(text) ? '' : text,
            correlationId
          );
          replyText = formatReasonFirstConfirmQuestion(text, snippet);
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              updatedAt: new Date().toISOString(),
            },
            { reasonFirstTriagePhase: 'confirm' }
          );
        }
      } else if (state.triage?.reasonFirstTriagePhase === 'confirm') {
        if (signalsFeePricing && !userExplicitlyWantsToBookNow(text)) {
          const narrowed = await runReasonFirstFeeNarrowFromTriage(ctx, state, recentForTriage);
          dmRoutingBranch = narrowed.branch;
          replyText = narrowed.reply;
          state = narrowed.nextState;
        } else if (parseReasonTriageConfirmYes(text)) {
          const narrowed = await runReasonFirstFeeNarrowFromTriage(ctx, state, recentForTriage);
          dmRoutingBranch = narrowed.branch;
          replyText = narrowed.reply;
          state = narrowed.nextState;
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
    } else if (
      intentResult.intent === 'medical_query' &&
      !inCollection &&
      recentThreadHasAssistantEmergencyEscalation(recentDmForClinical) &&
      userMessageSignalsPostEmergencyStability(text)
    ) {
      dmRoutingBranch = 'booking_resume_after_emergency';
      state = mergeTriage(
        {
          ...state,
          lastIntent: intentResult.intent,
          step: 'collecting_all',
          updatedAt: new Date().toISOString(),
        },
        { reasonFirstTriagePhase: undefined, postMedicalConsultFeeAckSent: undefined }
      );
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
      replyText = resolveSafetyMessage('medical_query', text);
      const recentMed = recentMessages.map((m) => ({
        sender_type: m.sender_type,
        content: m.content ?? '',
      }));
      let phase: ReasonFirstTriagePhase | undefined = undefined;
      if (userMessageSuggestsClinicalReason(text)) {
        const snippetMed = await resolveVisitReasonSnippetForTriage(recentMed, text, correlationId);
        replyText = `${replyText}\n\n${formatClinicalReasonAskMoreAfterDeflection(text, snippetMed)}`;
        phase = 'ask_more';
      }
      state = mergeTriage(
        {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        },
        {
          lastMedicalDeflectionAt: new Date().toISOString(),
          postMedicalConsultFeeAckSent: undefined,
          reasonFirstTriagePhase: phase,
        }
      );
    } else if (
      signalsFeePricing &&
      !userExplicitlyWantsToBookNow(text) &&
      inCollection
    ) {
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
          { lastIntent: intentResult.intent },
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
        dmRoutingBranch = 'reason_first_triage_ask_more';
        const bridgeSnippetDefer = (
          await resolveVisitReasonSnippetForTriage(recentForDefer, text, correlationId)
        ).trim();
        replyText = formatReasonFirstFeePatienceBridgeWhileAskMore(text, {
          reasonSnippet: bridgeSnippetDefer,
          recentPostMedicalFeeAck: state.triage?.postMedicalConsultFeeAckSent === true,
        });
        state = mergeTriage(
          {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          },
          { reasonFirstTriagePhase: 'ask_more' }
        );
      } else {
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
            { lastIntent: intentResult.intent },
            matcherCandidateLabelsForFeeStaffReview(doctorSettings)
          );
          dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
        } else {
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              updatedAt: new Date().toISOString(),
            },
            { activeFlow: 'fee_quote' }
          );
          if (idleFeeOut.feeQuoteMatcherFinalize) {
            state = mergeFeeQuoteMatcherIntoState(state, idleFeeOut.feeQuoteMatcherFinalize);
          }
        }
      }
    } else if (
      intentResult.intent === 'greeting' &&
      !inCollection &&
      (!state.step || state.step === 'responded')
    ) {
      dmRoutingBranch = 'greeting_template';
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };

      let welcomeBackSegment:
        | { kind: 'welcome_back'; firstName?: string; recencyBucket?: ReturningRecencyBucket }
        | undefined;
      if (shouldUseReturningPatientMemory(ctx.returningProfile)) {
        let firstName: string | undefined;
        if (ctx.returningProfile.hasName && conversation.patient_id) {
          const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
          firstName = extractPatientFirstName(patient?.name);
        }
        welcomeBackSegment = {
          kind: 'welcome_back',
          firstName,
          recencyBucket: ctx.returningProfile.priorVisits.recencyBucket,
        };
      }

      const aiContext = await buildAiContextForResponse(
        conversation.id,
        state,
        recentMessages,
        correlationId,
        text,
        teleconsultCatalogRowCount
      );
      const tGreeting = Date.now();
      const aiReply = await runGenerateResponse({
        conversationId: conversation.id,
        currentIntent: intentResult.intent,
        state,
        recentMessages,
        currentUserMessage: text,
        correlationId,
        doctorContext,
        context: aiContext,
      });
      replyText =
        welcomeBackSegment != null
          ? composeDmReplySegments([welcomeBackSegment, { kind: 'markdown', content: aiReply }])
          : aiReply;
      timing.dmGenerateMs += Date.now() - tGreeting;
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
          recentPostMedicalFeeAck: state.triage?.postMedicalConsultFeeAckSent === true,
        });
        state = mergeTriage(
          {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          },
          { reasonFirstTriagePhase: 'ask_more' }
        );
      } else {
        dmRoutingBranch = 'fee_book_misclassified_idle';
        const feeThreadBookMis = buildFeeCatalogMatchText(text, recentMessages);
        const misFeeOut = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
          catalogMatchText: feeThreadBookMis,
          ...bookingFeeComposerOpts,
        });
        replyText = misFeeOut.reply;
        if (misFeeOut.feeAmbiguousStaffReview) {
          state = mergeStateForFeeAmbiguousStaffReview(
            state,
            misFeeOut.feeAmbiguousStaffReview,
            { lastIntent: intentResult.intent },
            matcherCandidateLabelsForFeeStaffReview(doctorSettings)
          );
          dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
        } else {
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              updatedAt: new Date().toISOString(),
            },
            { activeFlow: 'fee_quote' }
          );
          if (misFeeOut.feeQuoteMatcherFinalize) {
            state = mergeFeeQuoteMatcherIntoState(state, misFeeOut.feeQuoteMatcherFinalize);
          }
        }
      }
    }

    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
};
