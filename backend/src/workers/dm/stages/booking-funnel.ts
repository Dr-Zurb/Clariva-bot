/**
 * rcp-07: In-flight booking funnel — link-first (MCA-DL-4). Collection / consent /
 * confirm in this thread hand the owned `/book` page. Slot-follow-up stays here.
 */

import { logger } from '../../../config/logger';
import { tryApplyLearningPolicyAutobook } from '../../../services/service-match-learning-autobook';
import { formatBookingAwaitingFollowUpDm } from '../../../utils/booking-link-copy';
import {
  effectiveAskedForConfirm,
  effectiveAskedForConsent,
} from '../../../utils/dm-prompt-context';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import { applyReadyPatientBookingPath } from '../booking-entry-ready-path';
import { isBookingFunnelTurn } from './booking-funnel-predicate';

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
      text,
      recentMessages,
      intentResult,
      doctorSettings,
      lastBotAskedForDetails,
      fallbackReply,
    } = ctx;
    let state = ctx.state;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = fallbackReply;

    const recentForPrompt = recentMessages.map((m) => ({
      sender_type: m.sender_type,
      content: m.content ?? '',
    }));
    const inThreadIntake =
      state.step === 'collecting_all' ||
      Boolean(state.step?.startsWith('collecting_')) ||
      state.step === 'consent' ||
      state.step === 'confirm_details' ||
      effectiveAskedForConsent(state, recentForPrompt) ||
      Boolean(lastBotAskedForDetails && !state.step) ||
      (effectiveAskedForConfirm(state, recentForPrompt) && text.trim().length > 0);

    if (inThreadIntake) {
      const ready = applyReadyPatientBookingPath({
        state,
        intent: intentResult.intent,
        conversationId: conversation.id,
        doctorId,
        doctorSettings,
        patient: null,
        language: ctx.turnLanguage,
      });
      return {
        branch: 'slot_selection',
        reply: ready.replyText,
        nextState: ready.state,
      };
    }

    if (state.step === 'awaiting_slot_selection') {
      dmRoutingBranch = 'slot_selection';
      const trimmed = text.trim().toLowerCase();
      const wantsNewLink =
        /^(change|pick another|different time|new link|another time|different slot)$/.test(trimmed) ||
        /^(change|pick)\s+(my\s+)?(slot|time)$/i.test(text.trim());
      const wantsSelfBooking =
        state.bookingForOther?.pendingSelfBooking &&
        (/^(yes|yeah|yep|ok|okay|sure|please|i'?d?\s+like\s+to|book\s+for\s+myself|book\s+one\s+for\s+me)$/.test(
          trimmed
        ) ||
          /^(yes|yeah|yep),?\s*(i'?d?\s+like\s+to\s+)?(book\s+for\s+myself|book\s+one\s+for\s+me)/.test(
            trimmed
          ));
      const wantsOtherBooking =
        state.bookingForOther?.pendingOtherBooking &&
        (/^(yes|yeah|yep|ok|okay|sure|please)$/.test(trimmed) ||
          new RegExp(
            `book\\s+(for\\s+)?(my\\s+)?${state.bookingForOther?.pendingOtherBooking.relation}`,
            'i'
          ).test(trimmed));
      if (wantsOtherBooking || wantsSelfBooking || wantsNewLink || !state.booking?.bookingLinkSentAt) {
        const ready = applyReadyPatientBookingPath({
          state,
          intent: wantsOtherBooking ? 'book_for_someone_else' : intentResult.intent,
          conversationId: conversation.id,
          doctorId,
          doctorSettings,
          patient: null,
          language: ctx.turnLanguage,
        });
        state = ready.state;
        replyText = ready.replyText;
      } else {
        replyText = formatBookingAwaitingFollowUpDm({ language: ctx.turnLanguage, doctorSettings });
        state = { ...state, updatedAt: new Date().toISOString() };
      }
    }

    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
} as DmStageHandler;
