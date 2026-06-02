/**
 * rcp-06: Predicate mirroring legacy chain order for service-match / staff-review / clarification stage.
 */

import { stageOf } from '../../../types/conversation';
import type { DmTurnContext } from '../stage-router';
import {
  STATUS_INTENTS,
  isCancelRescheduleStatusTurn,
  legacyClaimsBeforeStatusIntents,
  legacyClaimsPatientMatchConfirmation,
} from './cancel-reschedule-status-predicate';

/** Branches after status intents and before match confirmation in legacy chain. */
function legacyClaimsBeforePatientMatchConfirmation(ctx: DmTurnContext): boolean {
  if (legacyClaimsBeforeStatusIntents(ctx)) return true;
  if (STATUS_INTENTS.has(ctx.intentResult.intent)) return true;
  if (
    ctx.intentResult.intent === 'book_for_someone_else' &&
    (stageOf(ctx.state) === 'responded' || stageOf(ctx.state) === 'awaiting_slot_selection')
  ) {
    return true;
  }
  return false;
}

export function isServiceMatchTurn(ctx: DmTurnContext): boolean {
  if (isCancelRescheduleStatusTurn(ctx)) return false;

  const { state } = ctx;

  if (state.step === 'awaiting_staff_service_confirmation') return true;
  if (state.step === 'awaiting_complaint_clarification') return true;
  if (state.step === 'awaiting_followup_service_confirmation') return true;

  if (
    legacyClaimsPatientMatchConfirmation(ctx) &&
    !legacyClaimsBeforePatientMatchConfirmation(ctx)
  ) {
    return true;
  }

  return false;
}
