/**
 * Platform fee helper — DEPRECATED (billing P0, 2026-08-22).
 *
 * Halo Aid is never in the patient money flow. New captures write
 * platform_fee_minor = 0, gst_minor = 0, doctor_amount_minor = amount.
 * This function stays so leftover callers cannot accidentally take a cut.
 *
 * @see docs/Work/Product plans/billing/plan-p0-billing-demolition.md
 */

export interface PlatformFeeResult {
  platformFeeMinor: number;
  gstMinor: number;
  doctorAmountMinor: number;
}

/**
 * Always zero platform fee. Amount goes entirely to the doctor.
 */
export function computePlatformFee(
  amountMinor: number,
  _currency: string
): PlatformFeeResult {
  return {
    platformFeeMinor: 0,
    gstMinor: 0,
    doctorAmountMinor: amountMinor,
  };
}
