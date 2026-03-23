/**
 * Payout Service Unit Tests (e-task-4, e-task-5)
 *
 * Tests processPayoutForPayment: skips when no linked account, non-INR, etc.
 * Tests getPeriodForSchedule, processBatchedPayouts.
 */
// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  processPayoutForPayment,
  getPeriodForSchedule,
  processBatchedPayouts,
} from '../../../src/services/payout-service';
import * as database from '../../../src/config/database';
import { createTransferFromPayment } from '../../../src/adapters/razorpay-route-adapter';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/adapters/razorpay-route-adapter');
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn().mockResolvedValue(undefined),
}));

const mockFrom = jest.fn();
const mockedDb = database as jest.Mocked<typeof database>;
const mockedCreateTransfer = createTransferFromPayment as jest.MockedFunction<typeof createTransferFromPayment>;

const correlationId = 'corr-payout';

function createChain(responses: Array<{ data?: unknown; error: unknown }>) {
  let idx = 0;
  const next = () => responses[idx++] ?? { data: null, error: null };
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockImplementation(() => Promise.resolve(next())),
        maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(next())),
        or: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(next())),
            }),
          }),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  };
}

describe('Payout Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockFrom } as any);
  });

  it('skips when no database', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    const result = await processPayoutForPayment('pmt-1', correlationId);
    expect(result.success).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('skips when payment not found', async () => {
    const chain = createChain([{ data: null, error: { message: 'not found' } }]);
    mockFrom.mockReturnValue(chain);

    const result = await processPayoutForPayment('pmt-1', correlationId);
    expect(result.success).toBe(false);
    expect(mockedCreateTransfer).not.toHaveBeenCalled();
  });

  it('skips when doctor has no linked account', async () => {
    const payment = {
      id: 'pmt-1',
      appointment_id: 'apt-1',
      gateway: 'razorpay',
      gateway_payment_id: 'pay_xxx',
      status: 'captured',
      payout_status: 'pending',
      doctor_amount_minor: 50000,
      currency: 'INR',
    };
    const appointment = { doctor_id: 'doc-1' };
    const chain = createChain([
      { data: payment, error: null },
      { data: appointment, error: null },
      { data: { payout_schedule: 'per_appointment', razorpay_linked_account_id: null }, error: null },
    ]);
    mockFrom.mockReturnValue(chain);

    const result = await processPayoutForPayment('pmt-1', correlationId);
    expect(result.success).toBe(false);
    expect(mockedCreateTransfer).not.toHaveBeenCalled();
  });

  it('skips when gateway is not razorpay', async () => {
    const payment = {
      id: 'pmt-1',
      appointment_id: 'apt-1',
      gateway: 'paypal',
      status: 'captured',
      payout_status: 'pending',
      doctor_amount_minor: 50000,
      currency: 'USD',
    };
    const chain = createChain([{ data: payment, error: null }]);
    mockFrom.mockReturnValue(chain);

    const result = await processPayoutForPayment('pmt-1', correlationId);
    expect(result.success).toBe(false);
    expect(mockedCreateTransfer).not.toHaveBeenCalled();
  });

  it('skips when payout_status is already paid', async () => {
    const payment = {
      id: 'pmt-1',
      appointment_id: 'apt-1',
      gateway: 'razorpay',
      status: 'captured',
      payout_status: 'paid',
      doctor_amount_minor: 50000,
      currency: 'INR',
    };
    const chain = createChain([{ data: payment, error: null }]);
    mockFrom.mockReturnValue(chain);

    const result = await processPayoutForPayment('pmt-1', correlationId);
    expect(result.success).toBe(false);
    expect(mockedCreateTransfer).not.toHaveBeenCalled();
  });

  it('completes payout when all conditions met', async () => {
    const payment = {
      id: 'pmt-1',
      appointment_id: 'apt-1',
      gateway: 'razorpay',
      gateway_payment_id: 'pay_xxx',
      status: 'captured',
      payout_status: 'pending',
      doctor_amount_minor: 50000,
      currency: 'INR',
    };
    const appointment = { doctor_id: 'doc-1' };
    const settings = {
      payout_schedule: 'per_appointment',
      payout_minor: null,
      razorpay_linked_account_id: 'acc_yyy',
    };
    mockedCreateTransfer.mockResolvedValue({ transferId: 'trf_123' });

    const chain = createChain([
      { data: payment, error: null },
      { data: appointment, error: null },
      { data: settings, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    mockFrom.mockReturnValue(chain);

    const result = await processPayoutForPayment('pmt-1', correlationId);
    expect(result.success).toBe(true);
    expect(mockedCreateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        razorpayPaymentId: 'pay_xxx',
        linkedAccountId: 'acc_yyy',
        amountMinor: 50000,
        currency: 'INR',
      }),
      correlationId
    );
  });
});

describe('getPeriodForSchedule (e-task-5)', () => {
  it('daily: returns yesterday 00:00–23:59 in tz', () => {
    const ref = new Date('2026-03-24T12:00:00Z'); // noon UTC
    const r = getPeriodForSchedule('daily', 'Asia/Kolkata', ref);
    expect(r.startIso).toMatch(/2026-03-23T/);
    expect(r.endIso).toMatch(/2026-03-23T/);
    expect(new Date(r.start).getTime()).toBeLessThan(new Date(r.end).getTime());
  });

  it('weekly: returns last Mon–Sun', () => {
    const ref = new Date('2026-03-24T12:00:00Z'); // Tuesday
    const r = getPeriodForSchedule('weekly', 'UTC', ref);
    expect(r.startIso).toMatch(/2026-03-16/); // Mon
    expect(r.endIso).toMatch(/2026-03-22/); // Sun
  });

  it('monthly: returns last month 1st–last day', () => {
    const ref = new Date('2026-03-15T12:00:00Z');
    const r = getPeriodForSchedule('monthly', 'UTC', ref);
    expect(r.startIso).toMatch(/2026-02-01/);
    expect(r.endIso).toMatch(/2026-02-28/);
  });
});

describe('processBatchedPayouts (e-task-5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips when no database', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    const r = await processBatchedPayouts('daily', correlationId);
    expect(r.doctorsProcessed).toBe(0);
    expect(r.paymentsProcessed).toBe(0);
  });

  it('returns zero counts when no doctors with schedule', async () => {
    const chain = createChain([{ data: [], error: null }]);
    mockFrom.mockReturnValue(chain);

    const r = await processBatchedPayouts('daily', correlationId);
    expect(r.doctorsProcessed).toBe(0);
    expect(r.paymentsProcessed).toBe(0);
  });

  it('skips doctor with no pending payments in period', async () => {
    const doctors = [
      { doctor_id: 'doc-1', timezone: 'Asia/Kolkata', payout_minor: null },
    ];
    const chain = createChain([
      { data: doctors, error: null },
      { data: [], error: null }, // aptIds empty = no appointments in period
    ]);
    mockFrom.mockReturnValue(chain);

    const r = await processBatchedPayouts('daily', correlationId);
    expect(r.doctorsProcessed).toBe(0);
    expect(r.paymentsProcessed).toBe(0);
  });
});
