/**
 * Platform Fee Config Unit Tests (e-task-2, monetization)
 *
 * Tests computePlatformFee: hybrid logic (< threshold → flat; >= threshold → percent).
 * Mocks env for deterministic results.
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: {
    PLATFORM_FEE_PERCENT: 5,
    PLATFORM_FEE_FLAT_MINOR: 2500,
    PLATFORM_FEE_THRESHOLD_MINOR: 50000,
    PLATFORM_FEE_GST_PERCENT: 18,
  },
}));

import { computePlatformFee } from '../../../src/config/platform-fee';

describe('Platform Fee Config (e-task-2)', () => {
  describe('computePlatformFee', () => {
    it('uses flat fee when amount < threshold (₹250 = 25000 paise)', () => {
      const result = computePlatformFee(25000, 'INR');
      expect(result.platformFeeMinor).toBe(2500);
      expect(result.gstMinor).toBe(450);
      expect(result.doctorAmountMinor).toBe(22050);
    });

    it('uses percent when amount = threshold (₹500 = 50000 paise)', () => {
      const result = computePlatformFee(50000, 'INR');
      expect(result.platformFeeMinor).toBe(2500);
      expect(result.gstMinor).toBe(450);
      expect(result.doctorAmountMinor).toBe(47050);
    });

    it('uses percent when amount > threshold (₹1000 = 100000 paise)', () => {
      const result = computePlatformFee(100000, 'INR');
      expect(result.platformFeeMinor).toBe(5000);
      expect(result.gstMinor).toBe(900);
      expect(result.doctorAmountMinor).toBe(94100);
    });

    it('boundary: amount just below threshold (49999 paise)', () => {
      const result = computePlatformFee(49999, 'INR');
      expect(result.platformFeeMinor).toBe(2500);
      expect(result.gstMinor).toBe(450);
      expect(result.doctorAmountMinor).toBe(47049);
    });

    it('boundary: amount just above threshold (50001 paise)', () => {
      const result = computePlatformFee(50001, 'INR');
      expect(result.platformFeeMinor).toBe(2500); // 50001 * 5% = 2500.05 → 2500
      expect(result.gstMinor).toBe(450);
      expect(result.doctorAmountMinor).toBe(47051);
    });
  });
});
