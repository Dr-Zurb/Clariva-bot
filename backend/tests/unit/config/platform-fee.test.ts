/**
 * Platform fee is deprecated (billing P0). Always zero — never a cut of the patient payment.
 */

import { describe, it, expect } from '@jest/globals';
import { computePlatformFee } from '../../../src/config/platform-fee';

describe('Platform Fee Config (deprecated P0)', () => {
  describe('computePlatformFee', () => {
    it('returns zero fee and the full amount for any INR amount', () => {
      const result = computePlatformFee(100000, 'INR');
      expect(result.platformFeeMinor).toBe(0);
      expect(result.gstMinor).toBe(0);
      expect(result.doctorAmountMinor).toBe(100000);
    });

    it('returns zero fee below the old threshold too', () => {
      const result = computePlatformFee(25000, 'INR');
      expect(result.platformFeeMinor).toBe(0);
      expect(result.gstMinor).toBe(0);
      expect(result.doctorAmountMinor).toBe(25000);
    });
  });
});
