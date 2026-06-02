/**
 * rcp-04: Predicate mirroring legacy chain order for cancel/reschedule/status stage routing.
 * rcp-05: Shared legacy-order helpers exported for idle-fee-triage predicate.
 */

import { classifierSignalsPaymentExistence } from '../../../services/ai-service';
import { isRecentMedicalDeflectionWindow, stageOf } from '../../../types/conversation';
import { userExplicitlyWantsToBookNow } from '../../../utils/consultation-fees';
import { isPostBookingAcknowledgment } from '../../../utils/dm-appointment-status';
import {
  effectiveAskedForConfirm,
  effectiveAskedForConsent,
  effectiveAskedForMatch,
} from '../../../utils/dm-prompt-context';
import {
  isVagueConsultationPaymentExistenceQuestion,
  recentPatientThreadHasClinicalReason,
} from '../../../utils/reason-first-triage';
import {
  recentThreadHasAssistantEmergencyEscalation,
  userMessageSignalsPostEmergencyStability,
} from '../../../utils/safety-messages';
import { emergencyGate } from '../control-gates';
import type { DmTurnContext } from '../stage-router';

export const STATUS_INTENTS = new Set([
  'check_appointment_status',
  'cancel_appointment',
  'reschedule_appointment',
]);

export function recentAsDmShape(recentMessages: DmTurnContext['recentMessages']) {
  return recentMessages.map((m) => ({ sender_type: m.sender_type, content: m.content ?? '' }));
}

/** Emergency, staff review, complaint clarification, channel pick — before idle/fee/triage block. */
export function legacyClaimsBeforeIdleFeeMainBlock(ctx: DmTurnContext): boolean {
  const { state, gateCtx, channelReplyPick } = ctx;

  if (emergencyGate.fires(gateCtx)) return true;
  if (stageOf(state) === 'awaiting_staff_service_confirmation') return true;
  if (stageOf(state) === 'awaiting_complaint_clarification') return true;
  if (channelReplyPick) return true;
  return false;
}

/** Idle fee / reason-first / medical / greeting branches (legacy steps 5–11). */
export function matchesIdleFeeTriageMainBlock(ctx: DmTurnContext): boolean {
  const {
    state,
    intentResult,
    text,
    recentMessages,
    inCollection,
    signalsFeePricing,
    recentDmForClinical,
  } = ctx;
  const recent = recentAsDmShape(recentMessages);

  if (
    !inCollection &&
    (!stageOf(state) || stageOf(state) === 'responded') &&
    isRecentMedicalDeflectionWindow(state) &&
    !state.triage?.reasonFirstTriagePhase &&
    !state.triage?.postMedicalConsultFeeAckSent &&
    (isVagueConsultationPaymentExistenceQuestion(text) ||
      classifierSignalsPaymentExistence(intentResult)) &&
    recentPatientThreadHasClinicalReason(recent)
  ) {
    return true;
  }
  if (state.triage?.reasonFirstTriagePhase && !inCollection && (!stageOf(state) || stageOf(state) === 'responded')) {
    return true;
  }
  if (
    intentResult.intent === 'medical_query' &&
    !inCollection &&
    recentThreadHasAssistantEmergencyEscalation(recentDmForClinical) &&
    userMessageSignalsPostEmergencyStability(text)
  ) {
    return true;
  }
  if (intentResult.intent === 'medical_query' && !inCollection) return true;
  if (signalsFeePricing && !userExplicitlyWantsToBookNow(text) && inCollection) return true;
  if (
    signalsFeePricing &&
    !userExplicitlyWantsToBookNow(text) &&
    !inCollection &&
    (!stageOf(state) || stageOf(state) === 'responded')
  ) {
    return true;
  }
  if (
    intentResult.intent === 'greeting' &&
    !inCollection &&
    (!stageOf(state) || stageOf(state) === 'responded')
  ) {
    return true;
  }
  return false;
}

/** Branches in legacy else-block before check/cancel/reschedule intent handlers. */
export function legacyClaimsBeforeStatusIntents(ctx: DmTurnContext): boolean {
  const { state } = ctx;

  if (legacyClaimsBeforeIdleFeeMainBlock(ctx)) return true;
  if (matchesIdleFeeTriageMainBlock(ctx)) return true;
  if (stageOf(state) === 'recording_consent') return true;
  return false;
}

/** Patient match confirmation (legacy mid-chain; rcp-06 service_match stage). */
export function legacyClaimsPatientMatchConfirmation(ctx: DmTurnContext): boolean {
  const { state, recentMessages } = ctx;
  const recent = recentAsDmShape(recentMessages);
  return (
    stageOf(state) === 'awaiting_match_confirmation' ||
    (effectiveAskedForMatch(state, recent) && (state.bookingForOther?.pendingMatchPatientIds?.length ?? 0) > 0)
  );
}

/** book_for_someone_else mid-chain (rcp-08; not booking funnel). */
export function legacyClaimsBookForSomeoneElse(ctx: DmTurnContext): boolean {
  const { state, intentResult } = ctx;
  return (
    intentResult.intent === 'book_for_someone_else' &&
    (stageOf(state) === 'responded' || stageOf(state) === 'awaiting_slot_selection')
  );
}

/** Book-intent entry branches (rcp-08 booking_entry stage). */
export function legacyClaimsBookingEntrySteps(ctx: DmTurnContext): boolean {
  const { channelReplyPick, isBookIntent, justStartingCollection, inCollection, state } = ctx;
  if (channelReplyPick) return true;
  if (legacyClaimsBookForSomeoneElse(ctx)) return true;
  if (isBookIntent && (justStartingCollection || inCollection)) return true;
  if (isBookIntent && stageOf(state) === 'responded') return true;
  return false;
}

/** In-flight funnel steps (rcp-07 booking_funnel stage). Excludes book-intent entry (rcp-08). */
export function legacyClaimsBookingFunnelSteps(ctx: DmTurnContext): boolean {
  const { state, text, recentMessages, lastBotAskedForDetails } = ctx;
  const recent = recentAsDmShape(recentMessages);

  if (stageOf(state) === 'consent' || effectiveAskedForConsent(state, recent)) return true;
  if (
    (stageOf(state) === 'collecting_all' || (lastBotAskedForDetails && !stageOf(state))) &&
    !(
      /^(yes|yeah|yep|ok|okay|correct|looks good|confirmed)$/i.test(text.trim()) &&
      effectiveAskedForConfirm(state, recent)
    )
  ) {
    return true;
  }
  if (
    stageOf(state) === 'confirm_details' ||
    (effectiveAskedForConfirm(state, recent) && text.trim().length > 0)
  ) {
    return true;
  }
  if (stageOf(state) === 'awaiting_slot_selection') return true;
  return false;
}

/** Branches after status intents, before book-path idle fee and book_responded. */
export function legacyClaimsBetweenStatusIntentsAndCollectionBookPaths(ctx: DmTurnContext): boolean {
  const { isBookIntent, justStartingCollection, inCollection } = ctx;

  if (legacyClaimsBookForSomeoneElse(ctx)) return true;
  if (legacyClaimsPatientMatchConfirmation(ctx)) return true;
  if (legacyClaimsBookingFunnelSteps(ctx)) return true;
  if (isBookIntent && (justStartingCollection || inCollection)) return true;
  return false;
}

/** Misclassified book + pricing-only at empty collection step (legacy `:2437`). */
export function legacyClaimsBookMisclassifiedIdleFee(ctx: DmTurnContext): boolean {
  const { isBookIntent, justStartingCollection, signalsFeePricing, text } = ctx;
  return (
    isBookIntent &&
    justStartingCollection &&
    signalsFeePricing &&
    !userExplicitlyWantsToBookNow(text)
  );
}

/** Branches after status intents and before post_booking_ack in legacy chain. */
function legacyClaimsBetweenStatusIntentsAndPostBookingAck(ctx: DmTurnContext): boolean {
  const { state, isBookIntent } = ctx;

  if (legacyClaimsBetweenStatusIntentsAndCollectionBookPaths(ctx)) return true;
  if (legacyClaimsBookMisclassifiedIdleFee(ctx)) return true;
  if (isBookIntent && stageOf(state) === 'responded') return true;
  return false;
}

export function isCancelRescheduleStatusTurn(ctx: DmTurnContext): boolean {
  const { state, intentResult, text, recentMessages } = ctx;

  if (
    stageOf(state) === 'awaiting_cancel_choice' ||
    stageOf(state) === 'awaiting_cancel_confirmation' ||
    stageOf(state) === 'awaiting_reschedule_choice'
  ) {
    return true;
  }

  if (STATUS_INTENTS.has(intentResult.intent)) {
    return !legacyClaimsBeforeStatusIntents(ctx);
  }

  if (stageOf(state) === 'responded' && isPostBookingAcknowledgment(text, recentMessages)) {
    return (
      !legacyClaimsBeforeStatusIntents(ctx) &&
      !legacyClaimsBetweenStatusIntentsAndPostBookingAck(ctx)
    );
  }

  return false;
}
