/**
 * Platform Fee Configuration (monetization - migration 022)
 *
 * Computes Clariva platform fee: 5% or ₹25 flat for consultations < ₹500.
 * GST 18% on platform fee (doctor pays, exclusive).
 *
 * All amounts in smallest unit (paise INR, cents USD).
 */

import { env } from './env';

export interface PlatformFeeResult {
  platformFeeMinor: number;
  gstMinor: number;
  doctorAmountMinor: number;
}

/**
 * Compute platform fee, GST, and doctor amount for a given payment.
 *
 * Logic:
 * - If amountMinor < threshold → platformFee = flat fee
 * - If amountMinor >= threshold → platformFee = amountMinor * percent / 100
 * - gst = round(platformFee * gstPercent / 100)
 * - doctorAmount = amountMinor - platformFee - gst
 *
 * @param amountMinor - Gross amount in smallest unit (paise for INR)
 * @param _currency - Currency code (INR for now; others may defer fee)
 * @returns platformFeeMinor, gstMinor, doctorAmountMinor
 */
export function computePlatformFee(
  amountMinor: number,
  _currency: string
): PlatformFeeResult {
  const percent = env.PLATFORM_FEE_PERCENT;
  const flatMinor = env.PLATFORM_FEE_FLAT_MINOR;
  const thresholdMinor = env.PLATFORM_FEE_THRESHOLD_MINOR;
  const gstPercent = env.PLATFORM_FEE_GST_PERCENT;

  const platformFeeMinor =
    amountMinor < thresholdMinor
      ? flatMinor
      : Math.round((amountMinor * percent) / 100);

  const gstMinor = Math.round((platformFeeMinor * gstPercent) / 100);
  const doctorAmountMinor = amountMinor - platformFeeMinor - gstMinor;

  return {
    platformFeeMinor,
    gstMinor,
    doctorAmountMinor,
  };
}
