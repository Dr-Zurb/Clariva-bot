import { describe, it, expect } from '@jest/globals';
import {
  BASE_MINOR,
  CAP_MINOR,
  computeMonthlyBill,
  consultsUntilCap,
  gstInclusiveRupees,
  PER_CONSULT_MINOR,
} from '../../../src/config/billing-levels';

describe('billing-levels', () => {
  it('quotes GST-inclusive rupees as ₹1,179 · ₹58 · ₹14,749', () => {
    expect(gstInclusiveRupees(BASE_MINOR)).toBe(1179);
    expect(gstInclusiveRupees(PER_CONSULT_MINOR)).toBe(58);
    expect(gstInclusiveRupees(CAP_MINOR)).toBe(14749);
  });

  it('cap binds at 255 billable consults', () => {
    const at254 = computeMonthlyBill({ billableCount: 254 });
    const at255 = computeMonthlyBill({ billableCount: 255 });
    expect(at254.capReached).toBe(false);
    expect(at254.cappedMinor).toBeLessThan(CAP_MINOR);
    expect(at255.capReached).toBe(true);
    expect(at255.cappedMinor).toBe(CAP_MINOR);
  });

  it('never exceeds the cap and is monotonic in count', () => {
    let prev = 0;
    for (const n of [0, 1, 20, 21, 60, 100, 254, 255, 400, 1000]) {
      const bill = computeMonthlyBill({ billableCount: n });
      expect(bill.cappedMinor).toBeLessThanOrEqual(CAP_MINOR);
      expect(bill.cappedMinor).toBeGreaterThanOrEqual(prev);
      prev = bill.cappedMinor;
    }
  });

  it('counts remaining consults until the cap', () => {
    expect(consultsUntilCap(254)).toBe(1);
    expect(consultsUntilCap(255)).toBe(0);
    expect(consultsUntilCap(0)).toBe(255);
  });

  it('includes the first 20 consults in the base', () => {
    const at20 = computeMonthlyBill({ billableCount: 20 });
    const at21 = computeMonthlyBill({ billableCount: 21 });
    expect(at20.meteredMinor).toBe(0);
    expect(at20.cappedMinor).toBe(BASE_MINOR);
    expect(at21.meteredMinor).toBe(PER_CONSULT_MINOR);
  });
});
