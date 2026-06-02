/**
 * rcp-07: Predicate for collection → consent → confirm → recording → slot funnel.
 */

import {
  legacyClaimsBeforeIdleFeeMainBlock,
  legacyClaimsBeforeStatusIntents,
  legacyClaimsBookForSomeoneElse,
  legacyClaimsBookingFunnelSteps,
  legacyClaimsPatientMatchConfirmation,
  STATUS_INTENTS,
} from './cancel-reschedule-status-predicate';
import { isCancelRescheduleStatusTurn } from './cancel-reschedule-status-predicate';
import { isIdleFeeTriageTurn } from './idle-fee-triage-predicate';
import { isServiceMatchTurn } from './service-match-predicate';
import { stageOf } from '../../../types/conversation';
import type { DmTurnContext } from '../stage-router';

export function isBookingFunnelTurn(ctx: DmTurnContext): boolean {
  if (isCancelRescheduleStatusTurn(ctx)) return false;
  if (isServiceMatchTurn(ctx)) return false;
  if (isIdleFeeTriageTurn(ctx)) return false;

  // `recording_consent` sits after staff-review / complaint-clarify / channel-pick in the
  // legacy chain, so it must defer to them. (Emergency is now a head gate evaluated before
  // `resolveStage` — rcp-08 — so the emergency arm of this guard is redundant but harmless.)
  if (stageOf(ctx.state) === 'recording_consent') {
    return !legacyClaimsBeforeIdleFeeMainBlock(ctx);
  }

  if (!legacyClaimsBookingFunnelSteps(ctx)) return false;

  if (legacyClaimsBeforeStatusIntents(ctx)) return false;
  if (STATUS_INTENTS.has(ctx.intentResult.intent)) return false;
  if (legacyClaimsBookForSomeoneElse(ctx)) return false;
  if (legacyClaimsPatientMatchConfirmation(ctx)) return false;
  return true;
}
