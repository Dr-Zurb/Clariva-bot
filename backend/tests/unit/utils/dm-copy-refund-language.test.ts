/**
 * lang-11: refund DM builders — ₹ amount invariant across language args (LANG3-D6).
 */

import { describe, expect, it } from '@jest/globals';
import { buildRefundProcessingDm } from '../../../src/utils/dm-copy';

describe('buildRefundProcessingDm — language plumbing', () => {
  it('renders identical ₹ amount for en vs hi language args', () => {
    const en = buildRefundProcessingDm({ language: 'en', amountInr: 499, expectedDays: 3 });
    const hi = buildRefundProcessingDm({ language: 'hi', amountInr: 499, expectedDays: 3 });
    const pa = buildRefundProcessingDm({ language: 'pa', amountInr: 499, expectedDays: 3 });
    expect(hi).not.toBe(en);
    expect(pa).not.toBe(en);
    expect(en).toContain('₹499');
    expect(hi).toContain('₹499');
    expect(pa).toContain('₹499');
  });
});
