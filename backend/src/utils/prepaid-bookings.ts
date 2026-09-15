/**
 * billing P2b — bookings_only zeroes the payable amount so slot selection
 * returns paymentUrl null. prepaid=true passes the quoted amount through.
 */

export function resolvePayableAmountMinor(
  quotedAmountMinor: number,
  prepaidBookingsEnabled: boolean
): number {
  if (!prepaidBookingsEnabled) return 0;
  return quotedAmountMinor;
}
