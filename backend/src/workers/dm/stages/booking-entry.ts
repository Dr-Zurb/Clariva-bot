/**
 * rcp-08: Book-intent entry stage — channel pick, book-for-someone-else, collection start, book_responded.
 */

import { findPatientByIdWithAdmin } from '../../../services/patient-service';
import {
  applyReadyPatientBookingPath,
  applyReceptionistFeeReply,
  isPatientReadyForSlotLink,
} from '../booking-entry-ready-path';
import {
  isTeleconsultCatalogAuthoritative,
  userExplicitlyWantsToBookNow,
} from '../../../utils/consultation-fees';
import { buildTeleconsultChannelPickMessage } from '../../../utils/dm-copy';
import {
  mergeBooking,
  mergeServiceMatch,
  mergeTriage,
  type ConversationState,
} from '../../../types/conversation';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import { isBookingEntryTurn } from './booking-entry-predicate';
import { lastAssistantDmContent } from '../../../utils/reason-first-triage';

function feeTurnContext(ctx: Pick<DmTurnContext, 'text' | 'recentMessages'>): {
  userText: string;
  lastBotMessage: string | undefined;
} {
  return {
    userText: ctx.text,
    lastBotMessage: lastAssistantDmContent(
      ctx.recentMessages.map((m) => ({
        sender_type: m.sender_type,
        content: m.content ?? '',
      }))
    ),
  };
}

/** mca-15: FAQ + booking link only — no name / phone / reason / consent in the thread. */
function applyLinkFirstBooking(
  state: ConversationState,
  ctx: Pick<DmTurnContext, 'conversation' | 'doctorId' | 'doctorSettings' | 'turnLanguage'>,
  intent: ConversationState['lastIntent']
): { state: ConversationState; replyText: string } {
  return applyReadyPatientBookingPath({
    state: mergeTriage(
      {
        ...state,
        lastIntent: intent,
        updatedAt: new Date().toISOString(),
      },
      {
        lastMedicalDeflectionAt: undefined,
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
  });
}

export const bookingEntryStage = {
  stage: 'booking_entry',
  async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
    if (!isBookingEntryTurn(ctx)) {
      throw new Error('booking_entry stage invoked but predicate did not match');
    }

    const {
      conversation,
      doctorId,
      correlationId,
      text,
      intentResult,
      doctorSettings,
      isBookIntent,
      justStartingCollection,
      inCollection,
      signalsFeePricing,
      teleconsultCatalogRowCount,
      channelReplyPick,
      fallbackReply,
    } = ctx;
    let state = ctx.state;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = fallbackReply;

    if (channelReplyPick) {
      dmRoutingBranch = 'consultation_channel_pick';
      const pick = channelReplyPick;
      const teleOnly = isTeleconsultCatalogAuthoritative({
        service_offerings_json: doctorSettings?.service_offerings_json ?? null,
        appointment_fee_currency: doctorSettings?.appointment_fee_currency ?? null,
      });
      if (teleOnly && pick === 'in_clinic') {
        replyText = buildTeleconsultChannelPickMessage({ language: ctx.turnLanguage });
        state = {
          ...state,
          lastIntent: intentResult.intent,
          lastPromptKind: 'consultation_channel_pick',
          updatedAt: new Date().toISOString(),
        };
      } else {
        const nextModality: 'text' | 'voice' | 'video' | undefined =
          pick === 'in_clinic' ? undefined : pick;
        const hasMultipleModalities = teleOnly && teleconsultCatalogRowCount == null;
        const modalityForState = hasMultipleModalities ? undefined : nextModality;
        const afterPick = mergeBooking(
          mergeServiceMatch(
            {
              ...state,
              lastIntent: intentResult.intent,
              updatedAt: new Date().toISOString(),
            },
            { consultationModality: modalityForState }
          ),
          { consultationType: pick }
        );
        const ready = applyLinkFirstBooking(afterPick, ctx, intentResult.intent);
        state = ready.state;
        replyText = ready.replyText;
      }
    } else if (
      intentResult.intent === 'book_for_someone_else' &&
      (!state.step || state.step === 'responded' || state.step === 'awaiting_slot_selection')
    ) {
      dmRoutingBranch = 'book_for_someone_else';
      const readyOther = applyLinkFirstBooking(state, ctx, intentResult.intent);
      state = readyOther.state;
      replyText = readyOther.replyText;
    } else if (
      intentResult.intent === 'check_availability' &&
      (!state.step || state.step === 'responded')
    ) {
      dmRoutingBranch = 'booking_start_link_first';
      const readyAvail = applyLinkFirstBooking(state, ctx, intentResult.intent);
      state = readyAvail.state;
      replyText = readyAvail.replyText;
    } else if (isBookIntent && (justStartingCollection || inCollection)) {
      dmRoutingBranch = 'booking_start_link_first';
      if (signalsFeePricing) {
        const feeStart = applyReceptionistFeeReply({
          state,
          intent: intentResult.intent,
          conversationId: conversation.id,
          doctorId,
          doctorSettings,
          patient: null,
          language: ctx.turnLanguage,
          wantsToBook: userExplicitlyWantsToBookNow(text),
          ...feeTurnContext(ctx),
        });
        state = feeStart.state;
        replyText = feeStart.replyText;
      } else {
        const readyStart = applyLinkFirstBooking(state, ctx, intentResult.intent);
        state = readyStart.state;
        replyText = readyStart.replyText;
      }
    } else if (isBookIntent && state.step === 'responded') {
      dmRoutingBranch = 'book_responded';
      const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
      const hasPatientReady = isPatientReadyForSlotLink(patient);
      const explicitBook = userExplicitlyWantsToBookNow(text);
      const pricingOnly = signalsFeePricing && !explicitBook;

      if (!hasPatientReady && pricingOnly) {
        dmRoutingBranch = 'fee_deterministic_idle';
        const prices = applyReceptionistFeeReply({
          state,
          intent: intentResult.intent,
          conversationId: conversation.id,
          doctorId,
          doctorSettings,
          patient: null,
          language: ctx.turnLanguage,
          wantsToBook: false,
          ...feeTurnContext(ctx),
        });
        state = prices.state;
        replyText = prices.replyText;
      } else if (hasPatientReady) {
        dmRoutingBranch = 'book_responded';
        if (signalsFeePricing) {
          const feeReady = applyReceptionistFeeReply({
            state,
            intent: intentResult.intent,
            conversationId: conversation.id,
            doctorId,
            doctorSettings,
            patient,
            language: ctx.turnLanguage,
            wantsToBook: true,
            ...feeTurnContext(ctx),
          });
          state = feeReady.state;
          replyText = feeReady.replyText;
        } else {
          const ready = applyReadyPatientBookingPath({
            state,
            intent: intentResult.intent,
            conversationId: conversation.id,
            doctorId,
            doctorSettings,
            patient,
            language: ctx.turnLanguage,
          });
          state = ready.state;
          replyText = ready.replyText;
        }
      } else {
        dmRoutingBranch = 'book_responded';
        if (signalsFeePricing) {
          const feeNew = applyReceptionistFeeReply({
            state,
            intent: intentResult.intent,
            conversationId: conversation.id,
            doctorId,
            doctorSettings,
            patient: null,
            language: ctx.turnLanguage,
            wantsToBook: explicitBook,
            ...feeTurnContext(ctx),
          });
          state = feeNew.state;
          replyText = feeNew.replyText;
        } else {
          const readyNew = applyLinkFirstBooking(state, ctx, intentResult.intent);
          state = readyNew.state;
          replyText = readyNew.replyText;
        }
      }
    }

    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
} as DmStageHandler;
