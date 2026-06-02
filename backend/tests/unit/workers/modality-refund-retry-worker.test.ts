/**
 * modality-refund-retry-worker unit tests (Plan 09 · Task 49).
 *
 * Pins the backoff ladder, sentinel-at-attempt-6, idempotent-key
 * attempt threading, and DM fan-out for the Razorpay refund retry
 * worker. The Supabase client + Razorpay client are faked; we
 * assert against the billing-service layer (mocked with
 * `setModalityBillingServiceForTests`) + the UPDATE / INSERT chains.
 *
 *   1. Backoff gate skips rows too young for the next attempt.
 *   2. Happy-path: sync_success clears bookkeeping + stamps retry count.
 *   3. First-attempt DM fires exactly once regardless of outcome.
 *   4. Transient failure → requeued with failure_reason set.
 *   5. Permanent failure flag → sentinels + writes admin_payment_alerts
 *      + emits the "couldn't automatically refund" DM.
 *   6. Retry exhaustion (attempt 6 still queued) → sentinels.
 *   7. Missing razorpay_payment_id → looked up from appointments join;
 *      sentinels if still missing.
 *   8. No admin client → returns zeroed result.
 *   9. Scan query failure → records error and returns.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (BEFORE SUT import)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockEmitSystemMessage = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/consultation-message-service', () => ({
  emitSystemMessage: (...a: unknown[]) => mockEmitSystemMessage(...a),
}));

import * as database from '../../../src/config/database';
import {
  setModalityBillingServiceForTests,
  type AutoRefundDowngradeResult,
  type ModalityBillingService,
} from '../../../src/services/modality-billing-service';
import {
  REFUND_RETRY_PERMANENT_SENTINEL,
  REFUND_RETRY_STUCK_ATTEMPT,
  runModalityRefundRetryJob,
} from '../../../src/workers/modality-refund-retry-worker';

const mockedDb = database as jest.Mocked<typeof database>;

// ---------------------------------------------------------------------------
// Fake Supabase admin client
// ---------------------------------------------------------------------------

interface FakeAdminState {
  /** Rows returned by the primary history-scan call. */
  historyRows: Array<Record<string, unknown>>;
  /** Optional: lookup-by-id fallback for the appointment_id join. */
  sessionAppointment: Record<string, string | null>;
  /** Optional: appointment → razorpay_payment_id resolution. */
  appointmentPaymentId: Record<string, string | null>;
  /** Records writes performed against each table. */
  updates: Array<{ table: string; patch: Record<string, unknown>; id?: string }>;
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  /** Force scan error. */
  scanShouldThrow?: boolean;
}

function makeAdmin(state: FakeAdminState): unknown {
  const admin = {
    from: jest.fn((table: string) => {
      const ctx: {
        mode?: 'select' | 'update' | 'insert';
        patch?: Record<string, unknown>;
        isNullCol?: string;
        eqCol?: string;
        eqVal?: unknown;
      } = {};

      const ret: Record<string, unknown> = {};
      ret.select = (_cols: string) => {
        ctx.mode = 'select';
        return ret;
      };
      ret.update = (p: Record<string, unknown>) => {
        ctx.mode = 'update';
        ctx.patch = p;
        return ret;
      };
      ret.insert = async (p: Record<string, unknown>) => {
        state.inserts.push({ table, payload: p });
        return { data: null, error: null };
      };
      ret.eq = (col: string, val: unknown) => {
        ctx.eqCol = col;
        ctx.eqVal = val;
        if (ctx.mode === 'update') {
          state.updates.push({ table, patch: ctx.patch ?? {}, id: String(val) });
          ctx.patch = {};
          return Promise.resolve({ data: null, error: null });
        }
        return ret;
      };
      ret.is = (col: string) => {
        ctx.isNullCol = col;
        return ret;
      };
      ret.lt = () => ret;
      ret.order = () => ret;
      ret.limit = async () => {
        if (table === 'consultation_modality_history' && ctx.mode === 'select') {
          if (state.scanShouldThrow) {
            return { data: null, error: { message: 'pg timeout' } };
          }
          return { data: state.historyRows, error: null };
        }
        return { data: [], error: null };
      };
      ret.maybeSingle = async () => {
        if (table === 'consultation_sessions') {
          const sid = String(ctx.eqVal);
          const apt = state.sessionAppointment[sid];
          return {
            data: apt !== undefined ? { appointment_id: apt } : null,
            error: null,
          };
        }
        if (table === 'appointments') {
          const aid = String(ctx.eqVal);
          const pid = state.appointmentPaymentId[aid];
          return {
            data: pid !== undefined ? { razorpay_payment_id: pid } : null,
            error: null,
          };
        }
        return { data: null, error: null };
      };
      return ret;
    }),
  };
  return admin;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS  = 60 * 1000;

function historyRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'hist-1',
    session_id: 'sess-1',
    amount_paise: 30_000,
    razorpay_payment_id: 'pay_original_1',
    correlation_id: 'corr-row-1',
    occurred_at: new Date(Date.now() - 10 * MIN_MS).toISOString(),
    refund_retry_count: 0,
    refund_retry_last_attempt_at: null,
    ...overrides,
  };
}

function makeBillingStub(refund: AutoRefundDowngradeResult | Error): ModalityBillingService {
  return {
    computeUpgradeDelta: jest.fn<ModalityBillingService['computeUpgradeDelta']>(),
    captureUpgradePayment: jest.fn<ModalityBillingService['captureUpgradePayment']>(),
    autoRefundDowngrade: jest.fn<ModalityBillingService['autoRefundDowngrade']>(
      async () => {
        if (refund instanceof Error) throw refund;
        return refund;
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runModalityRefundRetryJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmitSystemMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setModalityBillingServiceForTests(null);
  });

  it('returns zeroed result + no calls when admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(null as never);
    const result = await runModalityRefundRetryJob('corr-no-admin');
    expect(result).toEqual({
      scanned: 0, attempted: 0, succeeded: 0, requeued: 0, stuck: 0, skippedBackoff: 0, errors: [],
    });
  });

  it('records a scan error when fetchPendingRefundRows query errors', async () => {
    const state: FakeAdminState = {
      historyRows: [],
      sessionAppointment: {},
      appointmentPaymentId: {},
      updates: [],
      inserts: [],
      scanShouldThrow: true,
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);

    const result = await runModalityRefundRetryJob('corr-scan-fail');
    expect(result.scanned).toBe(0);
    expect(result.errors[0]).toMatch(/pg timeout/);
  });

  it('returns empty-scan result on an empty backlog', async () => {
    const state: FakeAdminState = {
      historyRows: [], sessionAppointment: {}, appointmentPaymentId: {},
      updates: [], inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const result = await runModalityRefundRetryJob('corr-empty');
    expect(result.scanned).toBe(0);
    expect(result.attempted).toBe(0);
  });

  it('skips rows whose backoff gate has not elapsed', async () => {
    const state: FakeAdminState = {
      historyRows: [
        historyRow({
          id: 'hist-young',
          refund_retry_count: 0,
          // 10s old — nowhere near the 1m first-attempt gate.
          occurred_at: new Date(Date.now() - 10 * 1000).toISOString(),
          refund_retry_last_attempt_at: null,
        }),
      ],
      sessionAppointment: {},
      appointmentPaymentId: {},
      updates: [],
      inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const billingStub = makeBillingStub({ status: 'sync_success', razorpayRefundId: 'rfnd_x' });
    setModalityBillingServiceForTests(billingStub);

    const result = await runModalityRefundRetryJob('corr-backoff');
    expect(result.scanned).toBe(1);
    expect(result.attempted).toBe(0);
    expect(result.skippedBackoff).toBe(1);
    expect(billingStub.autoRefundDowngrade).not.toHaveBeenCalled();
    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
  });

  it('gates subsequent attempts on refund_retry_last_attempt_at, not occurred_at', async () => {
    const state: FakeAdminState = {
      historyRows: [
        historyRow({
          id: 'hist-retry-young',
          refund_retry_count: 2,                                             // next = 3, needs ≥15m
          occurred_at: new Date(Date.now() - 3 * HOUR_MS).toISOString(),     // old
          refund_retry_last_attempt_at: new Date(Date.now() - 5 * MIN_MS).toISOString(),
        }),
      ],
      sessionAppointment: {}, appointmentPaymentId: {},
      updates: [], inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const billingStub = makeBillingStub({ status: 'sync_success', razorpayRefundId: 'rfnd_ok' });
    setModalityBillingServiceForTests(billingStub);

    const result = await runModalityRefundRetryJob('corr-retry-young');
    expect(result.attempted).toBe(0);
    expect(result.skippedBackoff).toBe(1);
  });

  it('happy path: sync_success stamps retry count + emits processing DM on first attempt', async () => {
    const state: FakeAdminState = {
      historyRows: [
        historyRow({
          id: 'hist-happy',
          refund_retry_count: 0,
          occurred_at: new Date(Date.now() - 2 * MIN_MS).toISOString(),    // gate: 1m ✓
        }),
      ],
      sessionAppointment: {}, appointmentPaymentId: {},
      updates: [], inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const billingStub = makeBillingStub({ status: 'sync_success', razorpayRefundId: 'rfnd_happy' });
    setModalityBillingServiceForTests(billingStub);

    const result = await runModalityRefundRetryJob('corr-happy');

    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.requeued).toBe(0);
    expect(result.stuck).toBe(0);

    expect(billingStub.autoRefundDowngrade).toHaveBeenCalledWith(expect.objectContaining({
      historyRowId: 'hist-happy',
      originalRazorpayPaymentId: 'pay_original_1',
      amountPaise: 30_000,
      reason: 'doctor_downgrade',
      attemptNumber: 1,
    }));

    const updatePatch = state.updates.find((u) => u.table === 'consultation_modality_history');
    expect(updatePatch?.patch.refund_retry_count).toBe(1);
    expect(updatePatch?.patch.refund_retry_failure_reason).toBeNull();

    // First-attempt processing DM fires exactly once.
    expect(mockEmitSystemMessage).toHaveBeenCalledTimes(1);
    const dmCall = mockEmitSystemMessage.mock.calls[0]![0] as { event: string; body: string };
    expect(dmCall.event).toBe('modality_refund_processing');
    expect(dmCall.body).toMatch(/refund of ₹300/i);
  });

  it('transient queued failure requeues with failureReason and no sentinel', async () => {
    const state: FakeAdminState = {
      historyRows: [
        historyRow({
          id: 'hist-queued',
          refund_retry_count: 1,                                               // next = 2, needs ≥5m
          occurred_at: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
          refund_retry_last_attempt_at: new Date(Date.now() - 6 * MIN_MS).toISOString(),
        }),
      ],
      sessionAppointment: {}, appointmentPaymentId: {},
      updates: [], inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const billingStub = makeBillingStub({
      status: 'queued',
      failureReason: 'network timeout',
      permanent: false,
    });
    setModalityBillingServiceForTests(billingStub);

    const result = await runModalityRefundRetryJob('corr-requeue');
    expect(result.attempted).toBe(1);
    expect(result.requeued).toBe(1);
    expect(result.stuck).toBe(0);

    const patch = state.updates.find((u) => u.table === 'consultation_modality_history')!.patch;
    expect(patch.refund_retry_count).toBe(2);
    expect(patch.refund_retry_failure_reason).toBe('network timeout');
    // No processing DM on attempt 2.
    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
  });

  it('permanent failure flag → sentinel 99 + admin_payment_alerts INSERT + refund_failed DM', async () => {
    const state: FakeAdminState = {
      historyRows: [
        historyRow({
          id: 'hist-perm',
          refund_retry_count: 0,
          occurred_at: new Date(Date.now() - 2 * MIN_MS).toISOString(),
        }),
      ],
      sessionAppointment: {}, appointmentPaymentId: {},
      updates: [], inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const billingStub = makeBillingStub({
      status: 'queued',
      failureReason: 'fully refunded',
      permanent: true,
    });
    setModalityBillingServiceForTests(billingStub);

    const result = await runModalityRefundRetryJob('corr-perm');
    expect(result.stuck).toBe(1);
    expect(result.requeued).toBe(0);

    const patch = state.updates.find((u) => u.table === 'consultation_modality_history')!.patch;
    expect(patch.refund_retry_count).toBe(REFUND_RETRY_PERMANENT_SENTINEL);
    expect(patch.refund_retry_failure_reason).toBe('fully refunded');

    const alert = state.inserts.find((i) => i.table === 'admin_payment_alerts');
    expect(alert).toBeDefined();
    expect(alert!.payload.alert_kind).toBe('refund_stuck_24h');
    expect(alert!.payload.related_entity_id).toBe('hist-perm');

    // Both the processing DM (attempt 1 fires before sentinel) and the
    // refund_failed DM should have been emitted.
    const events = mockEmitSystemMessage.mock.calls.map(
      (c) => (c[0] as { event: string }).event,
    );
    expect(events).toEqual(expect.arrayContaining(['modality_refund_processing', 'modality_refund_failed']));
  });

  it('retry exhaustion (attempt = 6 queued) triggers sentinel even without permanent flag', async () => {
    const state: FakeAdminState = {
      historyRows: [
        historyRow({
          id: 'hist-exhausted',
          refund_retry_count: REFUND_RETRY_STUCK_ATTEMPT - 1,   // next = STUCK
          occurred_at: new Date(Date.now() - 48 * HOUR_MS).toISOString(),
          refund_retry_last_attempt_at: new Date(Date.now() - 25 * HOUR_MS).toISOString(),
        }),
      ],
      sessionAppointment: {}, appointmentPaymentId: {},
      updates: [], inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const billingStub = makeBillingStub({
      status: 'queued',
      failureReason: 'still failing',
      permanent: false,
    });
    setModalityBillingServiceForTests(billingStub);

    const result = await runModalityRefundRetryJob('corr-exhausted');
    expect(result.stuck).toBe(1);
    expect(result.requeued).toBe(0);
    expect(state.inserts.find((i) => i.table === 'admin_payment_alerts')).toBeDefined();
  });

  it('looks up razorpay_payment_id via sessions→appointments when history row lacks it', async () => {
    const state: FakeAdminState = {
      historyRows: [
        historyRow({
          id: 'hist-missing-pay',
          razorpay_payment_id: null,
          refund_retry_count: 0,
          occurred_at: new Date(Date.now() - 2 * MIN_MS).toISOString(),
        }),
      ],
      sessionAppointment: { 'sess-1': 'apt-1' },
      appointmentPaymentId: { 'apt-1': 'pay_lookedup_1' },
      updates: [], inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const billingStub = makeBillingStub({ status: 'sync_success', razorpayRefundId: 'rfnd_lu' });
    setModalityBillingServiceForTests(billingStub);

    const result = await runModalityRefundRetryJob('corr-lookup');
    expect(result.succeeded).toBe(1);
    expect(billingStub.autoRefundDowngrade).toHaveBeenCalledWith(expect.objectContaining({
      originalRazorpayPaymentId: 'pay_lookedup_1',
    }));
  });

  it('sentinels rows where even the lookup cannot resolve a razorpay_payment_id', async () => {
    const state: FakeAdminState = {
      historyRows: [
        historyRow({
          id: 'hist-no-pay',
          razorpay_payment_id: null,
          refund_retry_count: 0,
          occurred_at: new Date(Date.now() - 2 * MIN_MS).toISOString(),
        }),
      ],
      sessionAppointment: {},
      appointmentPaymentId: {},
      updates: [], inserts: [],
    };
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(makeAdmin(state) as never);
    const billingStub = makeBillingStub({ status: 'sync_success', razorpayRefundId: 'rfnd_x' });
    setModalityBillingServiceForTests(billingStub);

    const result = await runModalityRefundRetryJob('corr-no-pay');
    expect(result.stuck).toBe(1);
    expect(billingStub.autoRefundDowngrade).not.toHaveBeenCalled();

    const alert = state.inserts.find((i) => i.table === 'admin_payment_alerts');
    expect(alert).toBeDefined();
    expect((alert!.payload.context_json as { failureReason: string }).failureReason)
      .toBe('missing_original_payment_id');
  });
});
