/**
 * ARM-10: Public /book + select-slot-and-pay must not capture payment before staff gate clears
 * and multi-service catalog selections are conversation-final.
 */

import type { DoctorSettingsRow } from '../types/doctor-settings';
import type { ConversationState } from '../types/conversation';
import { isSlotBookingBlockedPendingStaffReview } from '../types/conversation';
import { getActiveServiceCatalog } from './service-catalog-helpers';

export type BookingPaymentBlockReason =
  | 'staff_review_pending'
  | 'service_selection_not_finalized';

export type PublicBookingPaymentGateResult =
  | { allowed: true }
  | { allowed: false; reason: BookingPaymentBlockReason };

/**
 * Pure policy check for token-scoped book flow (not reschedule).
 * - Blocks while staff service-review gate is active (ARM-05/06).
 * - Blocks multi-service teleconsult catalog pays until `serviceSelectionFinalized` (ARM-03/07).
 */
export function evaluatePublicBookingPaymentGate(
  state: ConversationState,
  doctorSettings: DoctorSettingsRow | null
): PublicBookingPaymentGateResult {
  if (isSlotBookingBlockedPendingStaffReview(state)) {
    return { allowed: false, reason: 'staff_review_pending' };
  }

  const catalog = getActiveServiceCatalog(doctorSettings);
  if (
    catalog &&
    catalog.services.length > 1 &&
    state.consultationType !== 'in_clinic' &&
    state.serviceSelectionFinalized !== true
  ) {
    return { allowed: false, reason: 'service_selection_not_finalized' };
  }

  return { allowed: true };
}
