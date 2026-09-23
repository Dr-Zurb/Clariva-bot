/**
 * rcp-04: Cancel / reschedule / status stage — extracted from legacy decide-chain.
 */

import {
  buildRelatedPatientIdsForWebhook,
  getMergedUpcomingAppointmentsForRelatedPatients,
} from '../../../services/webhook-appointment-helpers';
import { buildBookingPageUrl } from '../../../services/slot-selection-service';
import { buildPostBookingAckMessage } from '../../../utils/dm-copy';
import {
  formatCancelOnPageDm,
  formatRescheduleOnPageDm,
  formatUpcomingVisitsOnPageDm,
} from '../../../utils/booking-link-copy';
import {
  isPostBookingAcknowledgment,
  resolveNoUpcomingAppointmentsMessage,
} from '../../../utils/dm-appointment-status';
import type { ConversationState } from '../../../types/conversation';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import { isCancelRescheduleStatusTurn } from './cancel-reschedule-status-predicate';
import type { ConversationLanguage } from '../../../utils/conversation-language';

/** No visit on this Instagram sender. Do not offer a booking link or start a booking. */
function replyNoUpcomingAppointments(
  state: ConversationState,
  intent: ConversationState['lastIntent'],
  language: ConversationLanguage
): { replyText: string; state: ConversationState } {
  return {
    replyText: resolveNoUpcomingAppointmentsMessage(language),
    state: {
      ...state,
      lastIntent: intent,
      step: 'responded',
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Hand cancel or reschedule to the owned page. Do not name a visit or cancel in the chat. */
function replyContinueOnOwnedPage(
  state: ConversationState,
  intent: ConversationState['lastIntent'],
  language: ConversationLanguage,
  conversationId: string,
  doctorId: string,
  kind: 'cancel' | 'reschedule'
): { replyText: string; state: ConversationState } {
  const slotLink = buildBookingPageUrl(conversationId, doctorId);
  const replyText =
    kind === 'cancel'
      ? formatCancelOnPageDm({ language, slotLink, doctorSettings: null })
      : formatRescheduleOnPageDm({ language, slotLink, doctorSettings: null });
  return {
    replyText,
    state: {
      ...state,
      lastIntent: intent,
      step: 'responded',
      cancel: undefined,
      reschedule: undefined,
      updatedAt: new Date().toISOString(),
    },
  };
}

export const cancelRescheduleStatusStage: DmStageHandler = {
  stage: 'cancel_reschedule_status',
  async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
    if (!isCancelRescheduleStatusTurn(ctx)) {
      throw new Error('cancel_reschedule_status stage invoked but predicate did not match');
    }
    const {
      conversation,
      doctorId,
      correlationId,
      text,
      recentMessages,
      intentResult,
      fallbackReply,
      turnLanguage,
    } = ctx;
    let state = ctx.state;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = fallbackReply;

    if (state.step === 'awaiting_cancel_choice' || state.step === 'awaiting_cancel_confirmation') {
      dmRoutingBranch =
        state.step === 'awaiting_cancel_choice' ? 'cancel_flow_numeric' : 'cancel_flow_confirm';
      const handed = replyContinueOnOwnedPage(
        state,
        intentResult.intent,
        turnLanguage,
        conversation.id,
        doctorId,
        'cancel'
      );
      replyText = handed.replyText;
      state = handed.state;
    } else if (
      state.step === 'awaiting_reschedule_choice' ||
      state.step === 'awaiting_reschedule_slot'
    ) {
      dmRoutingBranch =
        state.step === 'awaiting_reschedule_choice'
          ? 'reschedule_flow_numeric'
          : 'reschedule_appointment_intent';
      const handed = replyContinueOnOwnedPage(
        state,
        intentResult.intent,
        turnLanguage,
        conversation.id,
        doctorId,
        'reschedule'
      );
      replyText = handed.replyText;
      state = handed.state;
    } else if (intentResult.intent === 'check_appointment_status') {
      dmRoutingBranch = 'check_appointment_status';
      const patientIdsList = buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
      const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
        patientIdsList,
        doctorId,
        correlationId
      );
      if (upcoming.length === 0) {
        const empty = replyNoUpcomingAppointments(state, intentResult.intent, turnLanguage);
        replyText = empty.replyText;
        state = empty.state;
      } else {
        replyText = formatUpcomingVisitsOnPageDm({
          language: turnLanguage,
          slotLink: buildBookingPageUrl(conversation.id, doctorId),
        });
        state = {
          ...state,
          lastIntent: intentResult.intent,
          step: 'responded',
          updatedAt: new Date().toISOString(),
        };
      }
    } else if (intentResult.intent === 'cancel_appointment') {
      dmRoutingBranch = 'cancel_appointment_intent';
      const patientIdsList = buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
      const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
        patientIdsList,
        doctorId,
        correlationId
      );
      if (upcoming.length === 0) {
        const empty = replyNoUpcomingAppointments(state, intentResult.intent, turnLanguage);
        replyText = empty.replyText;
        state = empty.state;
      } else {
        const handed = replyContinueOnOwnedPage(
          state,
          intentResult.intent,
          turnLanguage,
          conversation.id,
          doctorId,
          'cancel'
        );
        replyText = handed.replyText;
        state = handed.state;
      }
    } else if (intentResult.intent === 'reschedule_appointment') {
      dmRoutingBranch = 'reschedule_appointment_intent';
      const patientIdsList = buildRelatedPatientIdsForWebhook(conversation.patient_id, state);
      const upcoming = await getMergedUpcomingAppointmentsForRelatedPatients(
        patientIdsList,
        doctorId,
        correlationId
      );
      if (upcoming.length === 0) {
        const empty = replyNoUpcomingAppointments(state, intentResult.intent, turnLanguage);
        replyText = empty.replyText;
        state = empty.state;
      } else {
        const handed = replyContinueOnOwnedPage(
          state,
          intentResult.intent,
          turnLanguage,
          conversation.id,
          doctorId,
          'reschedule'
        );
        replyText = handed.replyText;
        state = handed.state;
      }
    } else if (state.step === 'responded' && isPostBookingAcknowledgment(text, recentMessages)) {
      dmRoutingBranch = 'post_booking_ack';
      replyText = buildPostBookingAckMessage({ language: turnLanguage });
      state = {
        ...state,
        lastIntent: intentResult.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      };
    }

    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
};
