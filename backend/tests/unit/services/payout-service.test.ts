/**
 * Payout Service — deprecated no-op (billing P0).
 * process* functions must not transfer. getPeriodForSchedule stays date math.
 */
// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  processPayoutForPayment,
  getPeriodForSchedule,
  processBatchedPayouts,
} from '../../../src/services/payout-service';
import { createTransferFromPayment } from '../../../src/adapters/razorpay-route-adapter';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/adapters/razorpay-route-adapter');
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const mockedCreateTransfer = createTransferFromPayment as jest.MockedFunction<typeof createTransferFromPayment>;
const correlationId = 'corr-payout';

describe('Payout Service (deprecated P0)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processPayoutForPayment is a no-op and never transfers', async () => {
    const result = await processPayoutForPayment('pmt-1', correlationId);
    expect(result.success).toBe(true);
    expect(result.skipped).toBe('deprecated');
    expect(mockedCreateTransfer).not.toHaveBeenCalled();
  });

  it('processBatchedPayouts returns zeros and never transfers', async () => {
    const r = await processBatchedPayouts('daily', correlationId);
    expect(r.skipped).toBe('deprecated');
    expect(r.doctorsProcessed).toBe(0);
    expect(r.paymentsProcessed).toBe(0);
    expect(mockedCreateTransfer).not.toHaveBeenCalled();
  });
});

describe('getPeriodForSchedule (e-task-5)', () => {
  it('daily: returns yesterday 00:00–23:59 in tz', () => {
    const ref = new Date('2026-03-24T12:00:00Z');
    const r = getPeriodForSchedule('daily', 'Asia/Kolkata', ref);
    expect(r.startIso).toMatch(/2026-03-23T/);
    expect(r.endIso).toMatch(/2026-03-23T/);
    expect(new Date(r.start).getTime()).toBeLessThan(new Date(r.end).getTime());
  });

  it('weekly: returns last Mon–Sun', () => {
    const ref = new Date('2026-03-24T12:00:00Z');
    const r = getPeriodForSchedule('weekly', 'UTC', ref);
    expect(r.startIso).toMatch(/2026-03-16/);
    expect(r.endIso).toMatch(/2026-03-22/);
  });

  it('monthly: returns last month 1st–last day', () => {
    const ref = new Date('2026-03-15T12:00:00Z');
    const r = getPeriodForSchedule('monthly', 'UTC', ref);
    expect(r.startIso).toMatch(/2026-02-01/);
    expect(r.endIso).toMatch(/2026-02-28/);
  });
});
