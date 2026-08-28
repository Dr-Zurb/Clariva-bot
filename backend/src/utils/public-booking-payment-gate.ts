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
  | 'service_selection_not_finalized'
  | 'doctor_not_verified';

export type PublicBookingPaymentGateResult =
  | { allowed: true }
  | { allowed: false; reason: BookingPaymentBlockReason };

export type PublicBookingPaymentGateOptions = {
  /** When false, blocks pay/create (ver-05). Omit / true = not applied. */
  doctorVerified?: boolean;
};

/**
 * Pure policy check for token-scoped book flow (not reschedule).
 * - Blocks when the doctor is not license-verified (ver-05).
 * - Blocks while staff service-review gate is active (ARM-05/06).
 * - Blocks multi-service teleconsult catalog pays until `serviceSelectionFinalized` (ARM-03/07).
 */
export function evaluatePublicBookingPaymentGate(
  state: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  options?: PublicBookingPaymentGateOptions
): PublicBookingPaymentGateResult {
  if (options?.doctorVerified === false) {
    return { allowed: false, reason: 'doctor_not_verified' };
  }

  if (isSlotBookingBlockedPendingStaffReview(state)) {
    return { allowed: false, reason: 'staff_review_pending' };
  }

  const catalog = getActiveServiceCatalog(doctorSettings);
  if (
    catalog &&
    catalog.services.length > 1 &&
    state.booking?.consultationType !== 'in_clinic' &&
    state.serviceMatch?.serviceSelectionFinalized !== true
  ) {
    return { allowed: false, reason: 'service_selection_not_finalized' };
  }

  return { allowed: true };
}
