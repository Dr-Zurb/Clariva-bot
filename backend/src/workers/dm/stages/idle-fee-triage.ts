/**
 * rcp-05: Idle fee / reason-first triage / medical / greeting stage — extracted from legacy decide-chain.
 * Clinical-advice asks (prescribe / refill / Rx) use the medical_safety path, not the LLM.
 */

import {
  classifierSignalsPaymentExistence,
  resolvePostMedicalPaymentExistenceAck,
  resolveVisitReasonSnippetForTriage,
} from '../../../services/ai-service';
import { findPatientByIdWithAdmin } from '../../../services/patient-service';
import { userExplicitlyWantsToBookNow } from '../../../utils/consultation-fees';
import { composeDmReplySegments } from '../../../utils/dm-reply-composer';
import { isPostBookingAcknowledgment } from '../../../utils/dm-appointment-status';
import {
  formatReasonFirstFeePatienceBridgeWhileAskMore,
  isVagueConsultationPaymentExistenceQuestion,
  recentPatientThreadHasClinicalReason,
  userWantsExplicitFullFeeList,
} from '../../../utils/reason-first-triage';
import {
  recentThreadHasAssistantEmergencyEscalation,
  resolveSafetyMessage,
  userMessageSignalsPostEmergencyStability,
} from '../../../utils/safety-messages';
import {
  isOpenEmergencyCrisis,
  isRecentMedicalDeflectionWindow,
  mergeBooking,
  mergeSafety,
  mergeTriage,
  type ConversationState,
} from '../../../types/conversation';
import type { ReturningRecencyBucket } from '../../../types/returning-patient';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import { extractPatientFirstName, shouldUseReturningPatientMemory } from '../returning-patient';
import {
  applyLeadPlusPageLink,
  applyReadyPatientBookingPath,
  applyReceptionistFeeReply,
} from '../booking-entry-ready-path';
import { isIdleFeeTriageTurn } from './idle-fee-triage-predicate';
import { buildReceptionistGreetingMessage } from '../../../utils/instagram-greeting-copy';
import { getConnectedInstagramDisplayName } from '../../../services/instagram-connect-service';
import { isTeleconsultCatalogAuthoritative } from '../../../utils/consultation-fees';
import {
  buildHoursMissingLead,
  buildHoursQuoteLead,
  buildAddressNotSharedLead,
  buildLocationQuoteLead,
  buildOnlineOnlyNoAddressLead,
  instagramAddressToShare,
  buildPaymentOnBookingPageLead,
  buildReceptionistThanksMessage,
  isClinicalAdviceUserMessage,
  isHoursFaqUserMessage,
  isLocationFaqUserMessage,
  isOpsPaymentFaqUserMessage,
  isThanksOnlyUserMessage,
} from '../../../utils/instagram-faq-copy';

interface ReasonFirstFeePartial {
  branch: DmHandlerBranch;
  reply: string;
  nextState: ConversationState;
}

function pricesOnBookingPageReply(
  ctx: DmTurnContext,
  state: ConversationState,
  intent: ConversationState['lastIntent'],
  wantsToBook = false
): { state: ConversationState; replyText: string } {
  return applyReceptionistFeeReply({
    state: mergeTriage(
      {
        ...state,
        lastIntent: intent,
        updatedAt: new Date().toISOString(),
      },
      {
        reasonFirstTriagePhase: undefined,
        postMedicalConsultFeeAckSent: undefined,
        activeFlow: undefined,
      }
    ),
    intent,
    conversationId: ctx.conversation.id,
    doctorId: ctx.doctorId,
    doctorSettings: ctx.doctorSettings,
    patient: null,
    language: ctx.turnLanguage,
    wantsToBook,
  });
}

async function runReasonFirstFullFeeEscape(
  ctx: DmTurnContext,
  state: ConversationState
): Promise<ReasonFirstFeePartial> {
  const ready = pricesOnBookingPageReply(ctx, state, ctx.intentResult.intent);
  return {
    branch: ctx.feeIdleRoutedByAnaphora ? 'fee_follow_up_anaphora_idle' : 'fee_deterministic_idle',
    reply: ready.replyText,
    nextState: ready.state,
  };
}

async function runReasonFirstFeeNarrowFromTriage(
  ctx: DmTurnContext,
  state: ConversationState,
  recentForTriage: { sender_type: string; content: string }[]
): Promise<ReasonFirstFeePartial> {
  const { intentResult, correlationId } = ctx;
  const ready = pricesOnBookingPageReply(ctx, state, intentResult.intent);
  const consolidated = (
    await resolveVisitReasonSnippetForTriage(recentForTriage, ctx.text, correlationId)
  ).trim();
  const reasonSeed = consolidated && consolidated !== 'what you shared' ? consolidated : undefined;
  return {
    branch: 'reason_first_triage_fee_narrow',
    reply: ready.replyText,
    nextState: reasonSeed ? mergeBooking(ready.state, { reasonForVisit: reasonSeed }) : ready.state,
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
      inCollection,
      isBookIntent,
      justStartingCollection,
      signalsFeePricing,
      feeIdleRoutedByAnaphora,
      recentDmForClinical,
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
      replyText = await resolvePostMedicalPaymentExistenceAck(
        text,
        correlationId,
        ctx.turnLanguage
      );
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
      } else if (signalsFeePricing && !userExplicitlyWantsToBookNow(text)) {
        if (state.triage?.reasonFirstTriagePhase === 'ask_more') {
          dmRoutingBranch = 'reason_first_triage_ask_more_payment_bridge';
          const bridgeSnippet = (
            await resolveVisitReasonSnippetForTriage(recentForTriage, text, correlationId)
          ).trim();
          replyText = formatReasonFirstFeePatienceBridgeWhileAskMore(ctx.turnLanguage, {
            reasonSnippet: bridgeSnippet,
            recentPostMedicalFeeAck: state.triage?.postMedicalConsultFeeAckSent === true,
          });
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              updatedAt: new Date().toISOString(),
            },
            { reasonFirstTriagePhase: undefined }
          );
        } else {
          const narrowed = await runReasonFirstFeeNarrowFromTriage(ctx, state, recentForTriage);
          dmRoutingBranch = narrowed.branch;
          replyText = narrowed.reply;
          state = narrowed.nextState;
        }
      } else {
        const ready = applyReadyPatientBookingPath({
          state: mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              updatedAt: new Date().toISOString(),
            },
            { reasonFirstTriagePhase: undefined }
          ),
          intent: intentResult.intent,
          conversationId: conversation.id,
          doctorId: ctx.doctorId,
          doctorSettings,
          patient: null,
          language: ctx.turnLanguage,
        });
        dmRoutingBranch = 'booking_start_link_first';
        state = ready.state;
        replyText = ready.replyText;
      }
    } else if (
      intentResult.intent === 'medical_query' &&
      !inCollection &&
      (isOpenEmergencyCrisis(state) ||
        recentThreadHasAssistantEmergencyEscalation(recentDmForClinical)) &&
      userMessageSignalsPostEmergencyStability(text)
    ) {
      dmRoutingBranch = 'booking_resume_after_emergency';
      const ready = applyReadyPatientBookingPath({
        state: mergeSafety(
          mergeTriage(
            {
              ...state,
              lastIntent: 'book_appointment',
              updatedAt: new Date().toISOString(),
            },
            { reasonFirstTriagePhase: undefined, postMedicalConsultFeeAckSent: undefined }
          ),
          { clearedAt: new Date().toISOString() }
        ),
        intent: 'book_appointment',
        conversationId: conversation.id,
        doctorId: ctx.doctorId,
        doctorSettings,
        patient: null,
        language: ctx.turnLanguage,
      });
      state = ready.state;
      replyText = ready.replyText;
    } else if (
      (intentResult.intent === 'medical_query' || isClinicalAdviceUserMessage(text)) &&
      !inCollection &&
      !userExplicitlyWantsToBookNow(text)
    ) {
      dmRoutingBranch = 'medical_safety';
      replyText = resolveSafetyMessage('medical_query', ctx.turnLanguage);
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
          reasonFirstTriagePhase: undefined,
        }
      );
    } else if (
      !inCollection &&
      (!state.step || state.step === 'responded') &&
      isThanksOnlyUserMessage(text) &&
      !isPostBookingAcknowledgment(
        text,
        recentMessages.map((m) => ({ sender_type: m.sender_type, content: m.content ?? '' }))
      )
    ) {
      dmRoutingBranch = 'greeting_template';
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
      replyText = buildReceptionistThanksMessage(ctx.turnLanguage);
    } else if (
      !inCollection &&
      (!state.step || state.step === 'responded') &&
      isHoursFaqUserMessage(text)
    ) {
      const hours = doctorSettings?.business_hours_summary?.trim();
      if (hours) {
        dmRoutingBranch = 'booking_start_link_first';
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        };
        replyText = buildHoursQuoteLead(ctx.turnLanguage, hours);
      } else {
        dmRoutingBranch = 'booking_start_link_first';
        const readyHours = applyLeadPlusPageLink({
          state: mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              updatedAt: new Date().toISOString(),
            },
            { activeFlow: undefined }
          ),
          intent: intentResult.intent,
          conversationId: conversation.id,
          doctorId: ctx.doctorId,
          doctorSettings,
          patient: null,
          language: ctx.turnLanguage,
          lead: buildHoursMissingLead(ctx.turnLanguage),
        });
        state = readyHours.state;
        replyText = readyHours.replyText;
      }
    } else if (
      !inCollection &&
      (!state.step || state.step === 'responded') &&
      isLocationFaqUserMessage(text)
    ) {
      const sharedAddress = instagramAddressToShare(doctorSettings);
      if (sharedAddress) {
        dmRoutingBranch = 'booking_start_link_first';
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        };
        replyText = buildLocationQuoteLead(ctx.turnLanguage, sharedAddress);
      } else {
        dmRoutingBranch = 'booking_start_link_first';
        const onlineOnly = isTeleconsultCatalogAuthoritative({
          service_offerings_json: doctorSettings?.service_offerings_json,
          appointment_fee_currency: doctorSettings?.appointment_fee_currency,
        });
        state = mergeTriage(
          {
            ...state,
            lastIntent: intentResult.intent,
            step: 'responded',
            updatedAt: new Date().toISOString(),
          },
          { activeFlow: undefined }
        );
        replyText = onlineOnly
          ? buildOnlineOnlyNoAddressLead(ctx.turnLanguage)
          : buildAddressNotSharedLead(ctx.turnLanguage);
      }
    } else if (
      !inCollection &&
      (!state.step || state.step === 'responded') &&
      isOpsPaymentFaqUserMessage(text) &&
      !userExplicitlyWantsToBookNow(text)
    ) {
      dmRoutingBranch = 'booking_start_link_first';
      const readyPay = applyLeadPlusPageLink({
        state: mergeTriage(
          {
            ...state,
            lastIntent: intentResult.intent,
            updatedAt: new Date().toISOString(),
          },
          { activeFlow: undefined }
        ),
        intent: intentResult.intent,
        conversationId: conversation.id,
        doctorId: ctx.doctorId,
        doctorSettings,
        patient: null,
        language: ctx.turnLanguage,
        lead: buildPaymentOnBookingPageLead(ctx.turnLanguage),
      });
      state = readyPay.state;
      replyText = readyPay.replyText;
    } else if (signalsFeePricing && !userExplicitlyWantsToBookNow(text) && inCollection) {
      dmRoutingBranch = 'fee_deterministic_mid_collection';
      const midPrices = pricesOnBookingPageReply(ctx, state, intentResult.intent);
      state = midPrices.state;
      replyText = midPrices.replyText;
    } else if (
      signalsFeePricing &&
      !userExplicitlyWantsToBookNow(text) &&
      !inCollection &&
      (!state.step || state.step === 'responded')
    ) {
      dmRoutingBranch = feeIdleRoutedByAnaphora
        ? 'fee_follow_up_anaphora_idle'
        : 'fee_deterministic_idle';
      const idlePrices = pricesOnBookingPageReply(ctx, state, intentResult.intent);
      state = idlePrices.state;
      replyText = idlePrices.replyText;
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
        | {
            kind: 'welcome_back';
            language: typeof ctx.turnLanguage;
            firstName?: string;
            recencyBucket?: ReturningRecencyBucket;
          }
        | undefined;
      if (shouldUseReturningPatientMemory(ctx.returningProfile)) {
        let firstName: string | undefined;
        if (ctx.returningProfile.hasName && conversation.patient_id) {
          const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
          firstName = extractPatientFirstName(patient?.name);
        }
        welcomeBackSegment = {
          kind: 'welcome_back',
          language: ctx.turnLanguage,
          firstName,
          recencyBucket: ctx.returningProfile.priorVisits.recencyBucket,
        };
      }

      const accountName =
        conversation.platform === 'instagram'
          ? await getConnectedInstagramDisplayName(ctx.doctorId, correlationId)
          : null;
      const greetingReply = isThanksOnlyUserMessage(text)
        ? buildReceptionistThanksMessage(ctx.turnLanguage)
        : buildReceptionistGreetingMessage(ctx.turnLanguage, {
            catalogMode: doctorSettings?.catalog_mode,
            hasAddress: Boolean(instagramAddressToShare(doctorSettings)),
            accountName,
          });
      replyText =
        welcomeBackSegment != null && !isThanksOnlyUserMessage(text)
          ? composeDmReplySegments([
              welcomeBackSegment,
              { kind: 'markdown', content: greetingReply },
            ])
          : greetingReply;
    } else if (
      isBookIntent &&
      justStartingCollection &&
      signalsFeePricing &&
      !userExplicitlyWantsToBookNow(text)
    ) {
      dmRoutingBranch = 'fee_book_misclassified_idle';
      const misPrices = pricesOnBookingPageReply(ctx, state, intentResult.intent);
      state = misPrices.state;
      replyText = misPrices.replyText;
    }

    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
};
