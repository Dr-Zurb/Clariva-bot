/**
 * modality-billing-service unit tests (Plan 09 · Task 49)
 *
 * Pins the live Razorpay Orders + Refunds integration against an
 * in-memory fake SDK:
 *
 *   · captureUpgradePayment — creates a Razorpay order with
 *     `notes.kind='mid_consult_upgrade'` and the modality pair;
 *     idempotent if the pending row already has a razorpay_order_id.
 *   · autoRefundDowngrade — calls payments.refund with the correct
 *     Idempotency-Key; stamps the refund id back on the history row;
 *     handles sync failures → queued; detects permanent failures.
 *   · computeUpgradeDelta — reads pricing via the shared helper; zero
 *     delta returns `isFree: true`.
 *   · Error paths — missing Razorpay config, orders.create throws.
 *
 * The live service is exercised directly (no `setModalityBillingServiceForTests`
 * override) with a fake Razorpay factory + a fake Supabase admin
 * client.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (BEFORE SUT import).
// ---------------------------------------------------------------------------

const mockGetSupabaseAdminClient = jest.fn();
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: (...a: unknown[]) => mockGetSupabaseAdminClient(...a),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/payment', () => ({
  isRazorpayConfigured: () => true,
  razorpayConfig: { keyId: 'key_test', keySecret: 'secret_test' },
}));

const mockFetchPendingById = jest.fn<
  (...args: unknown[]) => Promise<{ razorpayOrderId: string | null } | null>
>();
jest.mock('../../../src/services/modality-pending-requests-queries', () => ({
  fetchPendingById: (...a: unknown[]) => mockFetchPendingById(...a),
}));

const mockUpdateRazorpayRefundId = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/modality-history-queries', () => ({
  updateRazorpayRefundId: (...a: unknown[]) => mockUpdateRazorpayRefundId(...a),
}));

const mockGetModalityFees = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/utils/modality-pricing', () => {
  const actual = jest.requireActual('../../../src/utils/modality-pricing') as {
    computeUpgradeDeltaPaise: unknown;
    computeDowngradeRefundPaise: unknown;
    FALLBACK_MODALITY_FEES_PAISE: unknown;
  };
  return {
    ...actual,
    getModalityFeesForDoctor: (...a: unknown[]) => mockGetModalityFees(...a),
  };
});

import {
  __setRazorpayClientFactoryForTests,
  __testOnly__,
  BillingNotConfiguredError,
  getModalityBillingService,
} from '../../../src/services/modality-billing-service';

// ---------------------------------------------------------------------------
// Fake Razorpay client
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CreateFn = (args: any) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RefundFn = (paymentId: string, args: any, headers?: any) => Promise<any>;

interface FakeRazorpay {
  orders:   { create: jest.Mock<CreateFn> };
  payments: { refund: jest.Mock<RefundFn> };
}

function makeFakeRazorpay(): FakeRazorpay {
  const create = jest.fn<CreateFn>();
  create.mockResolvedValue({
    id: 'order_fake_1',
    amount: 1500,
    currency: 'INR',
  });
  const refund = jest.fn<RefundFn>();
  refund.mockResolvedValue({
    id: 'rfnd_fake_1',
    amount: 1500,
  });
  return {
    orders: { create },
    payments: { refund },
  };
}

// ---------------------------------------------------------------------------
// Fake Supabase admin client (session + history lookups).
// ---------------------------------------------------------------------------

function makeStubAdmin(overrides: {
  sessionRow?: { doctor_id: string; appointment_id: string | null } | null;
  appointmentRow?: { fee_paise: number | null } | null;
  historyRefundRow?: { razorpay_refund_id: string | null } | null;
} = {}): unknown {
  const sessionRow = 'sessionRow' in overrides
    ? overrides.sessionRow
    : { doctor_id: 'doc-1', appointment_id: 'apt-1' };
  const appointmentRow = 'appointmentRow' in overrides
    ? overrides.appointmentRow
    : { fee_paise: 30_000 };
  const historyRefundRow = overrides.historyRefundRow ?? null;

  const chain = (table: string) => {
    const calls: Record<string, unknown> = {};
    const self: Record<string, unknown> = {};
    self.select = (_cols: string) => self;
    self.eq = (_col: string, _val: unknown) => {
      calls._lastEq = { col: _col, val: _val };
      return self;
    };
    self.maybeSingle = async () => {
      if (table === 'consultation_sessions') return { data: sessionRow, error: null };
      if (table === 'appointments') return { data: appointmentRow, error: null };
      if (table === 'consultation_modality_history') return { data: historyRefundRow, error: null };
      return { data: null, error: null };
    };
    return self;
  };

  return {
    from: jest.fn((table: string) => chain(table)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('modality-billing-service (live impl)', () => {
  let fakeRazorpay: FakeRazorpay;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeRazorpay = makeFakeRazorpay();
    __setRazorpayClientFactoryForTests(() => fakeRazorpay as never);
    mockGetSupabaseAdminClient.mockReturnValue(makeStubAdmin());
  });

  afterEach(() => {
    __setRazorpayClientFactoryForTests(null);
  });

  // ------------------------------------------------------------------------
  // computeUpgradeDelta
  // ------------------------------------------------------------------------
  describe('computeUpgradeDelta', () => {
    it('returns positive delta for a paid upgrade', async () => {
      mockGetModalityFees.mockResolvedValue({
        text:  { modality: 'text',  feePaise: 10_000, source: 'service_offerings_json' },
        voice: { modality: 'voice', feePaise: 25_000, source: 'service_offerings_json' },
        video: { modality: 'video', feePaise: 80_000, source: 'service_offerings_json' },
      });
      const result = await getModalityBillingService().computeUpgradeDelta({
        sessionId: 'sess-1',
        fromModality: 'text',
        toModality: 'voice',
        correlationId: 'corr-1',
      });
      expect(result.amountPaise).toBe(15_000);
      expect(result.isFree).toBe(false);
    });

    it('returns isFree=true when delta is zero', async () => {
      mockGetModalityFees.mockResolvedValue({
        text:  { modality: 'text',  feePaise: 20_000, source: 'service_offerings_json' },
        voice: { modality: 'voice', feePaise: 20_000, source: 'service_offerings_json' },
        video: { modality: 'video', feePaise: 20_000, source: 'service_offerings_json' },
      });
      const result = await getModalityBillingService().computeUpgradeDelta({
        sessionId: 'sess-1',
        fromModality: 'text',
        toModality: 'voice',
        correlationId: 'corr-1',
      });
      expect(result).toEqual({ amountPaise: 0, isFree: true });
    });

    it('returns isFree=true on from===to (defensive)', async () => {
      mockGetModalityFees.mockResolvedValue({
        text:  { modality: 'text',  feePaise: 10_000, source: 'service_offerings_json' },
        voice: { modality: 'voice', feePaise: 25_000, source: 'service_offerings_json' },
        video: { modality: 'video', feePaise: 80_000, source: 'service_offerings_json' },
      });
      const result = await getModalityBillingService().computeUpgradeDelta({
        sessionId: 'sess-1',
        fromModality: 'voice',
        toModality: 'voice',
        correlationId: 'corr-1',
      });
      expect(result).toEqual({ amountPaise: 0, isFree: true });
    });

    it('throws when direction is misclassified as upgrade but is downgrade', async () => {
      mockGetModalityFees.mockResolvedValue({
        text:  { modality: 'text',  feePaise: 10_000, source: 'service_offerings_json' },
        voice: { modality: 'voice', feePaise: 25_000, source: 'service_offerings_json' },
        video: { modality: 'video', feePaise: 80_000, source: 'service_offerings_json' },
      });
      await expect(
        getModalityBillingService().computeUpgradeDelta({
          sessionId: 'sess-1',
          fromModality: 'video',
          toModality: 'voice',
          correlationId: 'corr-1',
        }),
      ).rejects.toThrow(/not an upgrade/);
    });

    it('throws when session lookup fails', async () => {
      mockGetSupabaseAdminClient.mockReturnValue(makeStubAdmin({ sessionRow: null }));
      await expect(
        getModalityBillingService().computeUpgradeDelta({
          sessionId: 'sess-missing',
          fromModality: 'text',
          toModality: 'voice',
          correlationId: 'corr-1',
        }),
      ).rejects.toThrow(/not found/);
    });
  });

  // ------------------------------------------------------------------------
  // captureUpgradePayment
  // ------------------------------------------------------------------------
  describe('captureUpgradePayment', () => {
    it('creates a Razorpay order with the correct notes.kind + receipt', async () => {
      mockFetchPendingById.mockResolvedValue({ razorpayOrderId: null });

      const result = await getModalityBillingService().captureUpgradePayment({
        sessionId: 'sess-1',
        pendingRequestId: 'pend-1',
        fromModality: 'text',
        toModality: 'voice',
        amountPaise: 15_000,
        correlationId: 'corr-create',
      });

      expect(result.razorpayOrderId).toBe('order_fake_1');
      expect(result.checkoutToken).toBe('order_fake_1');
      expect(result.amountPaise).toBe(15_000);
      expect(fakeRazorpay.orders.create).toHaveBeenCalledTimes(1);
      const callArgs = fakeRazorpay.orders.create.mock.calls[0]![0] as {
        amount: number; currency: string; receipt: string; notes: Record<string, string>;
      };
      expect(callArgs.amount).toBe(15_000);
      expect(callArgs.currency).toBe('INR');
      expect(callArgs.receipt).toBe('modality_change:pend-1');
      expect(callArgs.notes.kind).toBe('mid_consult_upgrade');
      expect(callArgs.notes.sessionId).toBe('sess-1');
      expect(callArgs.notes.fromModality).toBe('text');
      expect(callArgs.notes.toModality).toBe('voice');
      expect(callArgs.notes.correlationId).toBe('corr-create');
    });

    it('returns the existing order id idempotently when the pending row already has one', async () => {
      mockFetchPendingById.mockResolvedValue({ razorpayOrderId: 'order_existing_9' });
      const result = await getModalityBillingService().captureUpgradePayment({
        sessionId: 'sess-1',
        pendingRequestId: 'pend-1',
        fromModality: 'text',
        toModality: 'voice',
        amountPaise: 15_000,
        correlationId: 'corr-create',
      });
      expect(result.razorpayOrderId).toBe('order_existing_9');
      expect(fakeRazorpay.orders.create).not.toHaveBeenCalled();
    });

    it('throws when Razorpay orders.create fails', async () => {
      mockFetchPendingById.mockResolvedValue({ razorpayOrderId: null });
      fakeRazorpay.orders.create.mockRejectedValueOnce(new Error('razorpay down'));
      await expect(
        getModalityBillingService().captureUpgradePayment({
          sessionId: 'sess-1',
          pendingRequestId: 'pend-1',
          fromModality: 'text',
          toModality: 'voice',
          amountPaise: 15_000,
          correlationId: 'corr-create',
        }),
      ).rejects.toThrow(/orders\.create failed/);
    });

    it('throws when Razorpay returns no order id', async () => {
      mockFetchPendingById.mockResolvedValue({ razorpayOrderId: null });
      fakeRazorpay.orders.create.mockResolvedValueOnce({ amount: 15_000 } as never);
      await expect(
        getModalityBillingService().captureUpgradePayment({
          sessionId: 'sess-1',
          pendingRequestId: 'pend-1',
          fromModality: 'text',
          toModality: 'voice',
          amountPaise: 15_000,
          correlationId: 'corr-create',
        }),
      ).rejects.toThrow(/no order id/);
    });
  });

  // ------------------------------------------------------------------------
  // autoRefundDowngrade
  // ------------------------------------------------------------------------
  describe('autoRefundDowngrade', () => {
    it('calls Razorpay refund with amount + idempotency key; stamps DB on success', async () => {
      const result = await getModalityBillingService().autoRefundDowngrade({
        historyRowId: 'hist-1',
        originalRazorpayPaymentId: 'pay_orig_1',
        amountPaise: 55_000,
        reason: 'doctor_downgrade',
        correlationId: 'corr-refund',
      });

      expect(result.status).toBe('sync_success');
      expect(result.razorpayRefundId).toBe('rfnd_fake_1');
      expect(fakeRazorpay.payments.refund).toHaveBeenCalledTimes(1);

      const [paymentId, args, headers] = fakeRazorpay.payments.refund.mock.calls[0] as [
        string,
        Record<string, unknown>,
        Record<string, string> | undefined,
      ];
      expect(paymentId).toBe('pay_orig_1');
      expect(args.amount).toBe(55_000);
      expect(args.speed).toBe('normal');
      const notes = args.notes as Record<string, unknown>;
      expect(notes.reason).toBe('doctor_downgrade');
      expect(notes.historyRowId).toBe('hist-1');
      expect(notes.correlationId).toBe('corr-refund');
      expect(headers?.['Idempotency-Key']).toBe('modality_refund_hist-1_1');

      expect(mockUpdateRazorpayRefundId).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'hist-1', razorpayRefundId: 'rfnd_fake_1' },
      );
    });

    it('uses the attempt number in the idempotency key when the worker retries', async () => {
      await getModalityBillingService().autoRefundDowngrade({
        historyRowId: 'hist-1',
        originalRazorpayPaymentId: 'pay_orig_1',
        amountPaise: 55_000,
        reason: 'doctor_downgrade',
        correlationId: 'corr-refund',
        attemptNumber: 3,
      });
      const [, , headers] = fakeRazorpay.payments.refund.mock.calls[0] as [
        string,
        unknown,
        Record<string, string> | undefined,
      ];
      expect(headers?.['Idempotency-Key']).toBe('modality_refund_hist-1_3');
    });

    it('returns the existing refund id idempotently when the history row already has one', async () => {
      mockGetSupabaseAdminClient.mockReturnValue(
        makeStubAdmin({ historyRefundRow: { razorpay_refund_id: 'rfnd_prior' } }),
      );
      const result = await getModalityBillingService().autoRefundDowngrade({
        historyRowId: 'hist-1',
        originalRazorpayPaymentId: 'pay_orig_1',
        amountPaise: 55_000,
        reason: 'doctor_downgrade',
        correlationId: 'corr-refund',
      });
      expect(result).toEqual({ status: 'sync_success', razorpayRefundId: 'rfnd_prior' });
      expect(fakeRazorpay.payments.refund).not.toHaveBeenCalled();
    });

    it('returns queued on Razorpay error (transient)', async () => {
      fakeRazorpay.payments.refund.mockRejectedValueOnce(new Error('temporarily unavailable'));
      const result = await getModalityBillingService().autoRefundDowngrade({
        historyRowId: 'hist-1',
        originalRazorpayPaymentId: 'pay_orig_1',
        amountPaise: 55_000,
        reason: 'doctor_downgrade',
        correlationId: 'corr-refund',
      });
      expect(result.status).toBe('queued');
      expect(result.permanent).toBe(false);
      expect(result.failureReason).toMatch(/temporarily unavailable/);
    });

    it('flags queued+permanent on "fully refunded" errors', async () => {
      fakeRazorpay.payments.refund.mockRejectedValueOnce(
        new Error('payment already fully refunded'),
      );
      const result = await getModalityBillingService().autoRefundDowngrade({
        historyRowId: 'hist-1',
        originalRazorpayPaymentId: 'pay_orig_1',
        amountPaise: 55_000,
        reason: 'doctor_downgrade',
        correlationId: 'corr-refund',
      });
      expect(result.status).toBe('queued');
      expect(result.permanent).toBe(true);
    });

    it('returns queued when Razorpay returns no refund id', async () => {
      fakeRazorpay.payments.refund.mockResolvedValueOnce({ amount: 55_000 } as never);
      const result = await getModalityBillingService().autoRefundDowngrade({
        historyRowId: 'hist-1',
        originalRazorpayPaymentId: 'pay_orig_1',
        amountPaise: 55_000,
        reason: 'doctor_downgrade',
        correlationId: 'corr-refund',
      });
      expect(result.status).toBe('queued');
      expect(result.failureReason).toMatch(/no refund id/);
    });

    it('uses compensating seed in idempotency key when historyRowId is null', async () => {
      mockGetSupabaseAdminClient.mockReturnValue(null);
      // Because getSupabaseAdminClient returns null, the factory path
      // still needs to succeed — but this time we skip the DB pre-check.
      fakeRazorpay.payments.refund.mockResolvedValueOnce({ id: 'rfnd_x' } as never);
      const result = await getModalityBillingService().autoRefundDowngrade({
        historyRowId: null,
        pendingRequestId: 'pend-zzz',
        originalRazorpayPaymentId: 'pay_orig_9',
        amountPaise: 55_000,
        reason: 'provider_failure',
        correlationId: 'corr-x',
      });
      expect(result.status).toBe('sync_success');
      const [, , headers] = fakeRazorpay.payments.refund.mock.calls[0] as [
        string, unknown, Record<string, string> | undefined,
      ];
      expect(headers?.['Idempotency-Key']).toBe('modality_refund_pend-zzz_1');
    });
  });

  // ------------------------------------------------------------------------
  // Razorpay not configured guard
  // ------------------------------------------------------------------------
  describe('Razorpay configuration', () => {
    it('throws BillingNotConfiguredError if Razorpay keys are missing', async () => {
      jest.doMock('../../../src/config/payment', () => ({
        isRazorpayConfigured: () => false,
        razorpayConfig: { keyId: undefined, keySecret: undefined },
      }));
      // Require the SUT fresh so the new mock is picked up.
      jest.resetModules();
      await expect(async () => {
        const mod = await import('../../../src/services/modality-billing-service');
        await mod.getModalityBillingService().captureUpgradePayment({
          sessionId: 'sess-1',
          pendingRequestId: 'pend-1',
          fromModality: 'text',
          toModality: 'voice',
          amountPaise: 15_000,
          correlationId: 'corr-no-config',
        });
      }).rejects.toThrow(/Razorpay is not configured|not configured/);
    });
  });
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

describe('isPermanentRefundFailure', () => {
  const { isPermanentRefundFailure } = __testOnly__;
  it('detects common terminal error messages', () => {
    expect(isPermanentRefundFailure(new Error('Payment already fully refunded.'))).toBe(true);
    expect(isPermanentRefundFailure(new Error('No such payment'))).toBe(true);
    expect(isPermanentRefundFailure(new Error('Payment not captured'))).toBe(true);
    expect(isPermanentRefundFailure(new Error('invalid_payment_id'))).toBe(true);
  });
  it('returns false for transient errors', () => {
    expect(isPermanentRefundFailure(new Error('timeout'))).toBe(false);
    expect(isPermanentRefundFailure(new Error('5xx'))).toBe(false);
  });
  it('returns false for non-Error throwables', () => {
    expect(isPermanentRefundFailure('fully refunded')).toBe(false);
  });
});

// silence unused-import warning for the exported error class
void BillingNotConfiguredError;
