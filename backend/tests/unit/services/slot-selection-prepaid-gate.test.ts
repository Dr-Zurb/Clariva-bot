/**
 * billing P1.0 — prepaid gate forces bookings-only (amount 0) when the flag is off.
 */

import { describe, it, expect } from '@jest/globals';
import { resolvePayableAmountMinor } from '../../../src/utils/prepaid-bookings';

describe('resolvePayableAmountMinor (billing P1.0)', () => {
  it('returns 0 when prepaid bookings are disabled, even if the quote has a fee', () => {
    expect(resolvePayableAmountMinor(70_000, false)).toBe(0);
  });

  it('passes the quoted amount through when prepaid bookings are enabled', () => {
    expect(resolvePayableAmountMinor(70_000, true)).toBe(70_000);
  });

  it('stays 0 when the quote is already 0', () => {
    expect(resolvePayableAmountMinor(0, false)).toBe(0);
    expect(resolvePayableAmountMinor(0, true)).toBe(0);
  });
});
