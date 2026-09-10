/**
 * Refund policy table (P2.6 / P2-D2).
 * Pure function — amounts come from this table, never from AI.
 * Not wired into the DM cancel path until B-Q5 is answered (paste-your-keys
 * can refund; OAuth may not). Launch defaults: 100% except no-show.
 */

export type RefundCancelledBy = 'doctor' | 'patient' | 'platform';

export type RefundReasonClass =
  | 'emergency'
  | 'duplicate_charge'
  | 'platform_failure'
  | 'patient_cancel'
  | 'no_show'
  | 'other';

export interface RefundPolicyInput {
  cancelledBy: RefundCancelledBy;
  hoursBeforeAppointment: number | null;
  reasonClass: RefundReasonClass;
}

export interface RefundPolicyResult {
  refundPercent: number;
  requiresReview: boolean;
}

export function resolveRefundPolicy(input: RefundPolicyInput): RefundPolicyResult {
  if (
    input.cancelledBy === 'doctor' ||
    input.reasonClass === 'emergency' ||
    input.reasonClass === 'platform_failure' ||
    input.reasonClass === 'duplicate_charge'
  ) {
    return { refundPercent: 100, requiresReview: false };
  }

  if (input.reasonClass === 'no_show') {
    return { refundPercent: 0, requiresReview: false };
  }

  if (input.cancelledBy === 'patient' || input.reasonClass === 'patient_cancel') {
    return { refundPercent: 100, requiresReview: false };
  }

  return { refundPercent: 100, requiresReview: true };
}
