/**
 * Instagram-only signpost. Facebook keeps the stage router.
 */

import { buildBookingPageUrl } from '../../../utils/booking-page-url';
import { isTeleconsultCatalogAuthoritative } from '../../../utils/consultation-fees';
import { instagramAddressToShare } from '../../../utils/instagram-faq-copy';
import {
  classifyInstagramVisitTurn,
  renderInstagramVisitReply,
  singleVisitFeeAmount,
  type InstagramVisitKind,
} from '../../../utils/instagram-visit-replies';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmTurnContext, DmTurnResult } from '../stage-router';

function branchFor(kind: InstagramVisitKind): DmHandlerBranch {
  switch (kind) {
    case 'health':
      return 'medical_safety';
    case 'fee':
    case 'fees':
      return 'fee_deterministic_idle';
    case 'visits':
      return 'book_responded';
    case 'change':
      return 'reschedule_appointment_intent';
    case 'cancel':
      return 'cancel_appointment_intent';
    case 'view':
      return 'check_appointment_status';
    case 'silent':
    case 'menu':
    case 'times':
    case 'payment':
    case 'address':
    case 'address_hidden':
    case 'online':
    case 'non_text':
      return 'greeting_template';
    default:
      return 'greeting_template';
  }
}

function isFirstAutomatedReply(ctx: DmTurnContext): boolean {
  return !ctx.recentMessages.some(
    (message) => message.sender_type === 'system' || message.sender_type === 'doctor'
  );
}

export async function handleInstagramVisitTurn(ctx: DmTurnContext): Promise<DmTurnResult> {
  const address = instagramAddressToShare(ctx.doctorSettings);
  const feeAmount = singleVisitFeeAmount(ctx.doctorSettings);
  const kind = classifyInstagramVisitTurn({
    text: ctx.text,
    intent: ctx.intentResult.intent,
    signalsFeePricing: ctx.signalsFeePricing,
    hasSingleFee: Boolean(feeAmount),
    hasSharedAddress: Boolean(address),
    onlineOnly: isTeleconsultCatalogAuthoritative({
      service_offerings_json: ctx.doctorSettings?.service_offerings_json,
      appointment_fee_currency: ctx.doctorSettings?.appointment_fee_currency,
    }),
  });
  const url = buildBookingPageUrl(
    ctx.conversation.id,
    ctx.doctorId,
    ctx.doctorSettings?.public_slug
  );
  const firstReply = isFirstAutomatedReply(ctx);
  const reply = renderInstagramVisitReply({
    kind,
    language: ctx.turnLanguage,
    url,
    address,
    feeAmount,
    greet: kind === 'menu' && firstReply,
    includeStopHint: kind !== 'silent' && firstReply,
  });
  return {
    branch: branchFor(kind),
    reply,
    nextState: {
      ...ctx.state,
      lastIntent: ctx.intentResult.intent,
      step: 'responded',
      updatedAt: new Date().toISOString(),
    },
  };
}
