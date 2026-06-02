/**
 * rcp-05: Predicate mirroring legacy chain order for idle fee / reason-first / medical / greeting stage.
 */

import type { DmTurnContext } from '../stage-router';
import {
  STATUS_INTENTS,
  isCancelRescheduleStatusTurn,
  legacyClaimsBeforeIdleFeeMainBlock,
  legacyClaimsBeforeStatusIntents,
  legacyClaimsBetweenStatusIntentsAndCollectionBookPaths,
  legacyClaimsBookMisclassifiedIdleFee,
  matchesIdleFeeTriageMainBlock,
} from './cancel-reschedule-status-predicate';

/** Legacy branches that fire before the book-path `fee_book_misclassified_idle` branch. */
function legacyClaimsBeforeBookMisclassifiedIdleFee(ctx: DmTurnContext): boolean {
  if (legacyClaimsBeforeStatusIntents(ctx)) return true;
  if (STATUS_INTENTS.has(ctx.intentResult.intent)) return true;
  if (legacyClaimsBetweenStatusIntentsAndCollectionBookPaths(ctx)) return true;
  return false;
}

export function isIdleFeeTriageTurn(ctx: DmTurnContext): boolean {
  if (isCancelRescheduleStatusTurn(ctx)) return false;

  if (matchesIdleFeeTriageMainBlock(ctx) && !legacyClaimsBeforeIdleFeeMainBlock(ctx)) {
    return true;
  }

  if (
    legacyClaimsBookMisclassifiedIdleFee(ctx) &&
    !legacyClaimsBeforeBookMisclassifiedIdleFee(ctx)
  ) {
    return true;
  }

  return false;
}
