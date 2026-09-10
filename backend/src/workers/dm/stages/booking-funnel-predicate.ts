/**
 * rcp-07: Predicate for collection → consent → confirm → slot funnel.
 */

import {
  legacyClaimsBeforeStatusIntents,
  legacyClaimsBookForSomeoneElse,
  legacyClaimsBookingFunnelSteps,
  legacyClaimsPatientMatchConfirmation,
  STATUS_INTENTS,
} from './cancel-reschedule-status-predicate';
import { isCancelRescheduleStatusTurn } from './cancel-reschedule-status-predicate';
import { isIdleFeeTriageTurn } from './idle-fee-triage-predicate';
import { isServiceMatchTurn } from './service-match-predicate';
import type { DmTurnContext } from '../stage-router';

export function isBookingFunnelTurn(ctx: DmTurnContext): boolean {
  if (isCancelRescheduleStatusTurn(ctx)) return false;
  if (isServiceMatchTurn(ctx)) return false;
  if (isIdleFeeTriageTurn(ctx)) return false;

  if (!legacyClaimsBookingFunnelSteps(ctx)) return false;

  if (legacyClaimsBeforeStatusIntents(ctx)) return false;
  if (STATUS_INTENTS.has(ctx.intentResult.intent)) return false;
  if (legacyClaimsBookForSomeoneElse(ctx)) return false;
  if (legacyClaimsPatientMatchConfirmation(ctx)) return false;
  return true;
}
