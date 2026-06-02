/**
 * rcp-08: Predicate mirroring legacy chain order for book-intent entry stage routing.
 */

import type { DmTurnContext } from '../stage-router';
import {
  isCancelRescheduleStatusTurn,
  legacyClaimsBookingEntrySteps,
} from './cancel-reschedule-status-predicate';
import { isBookingFunnelTurn } from './booking-funnel-predicate';
import { isIdleFeeTriageTurn } from './idle-fee-triage-predicate';
import { isServiceMatchTurn } from './service-match-predicate';

export function isBookingEntryTurn(ctx: DmTurnContext): boolean {
  if (isCancelRescheduleStatusTurn(ctx)) return false;
  if (isServiceMatchTurn(ctx)) return false;
  if (isBookingFunnelTurn(ctx)) return false;
  if (isIdleFeeTriageTurn(ctx)) return false;
  return legacyClaimsBookingEntrySteps(ctx);
}
