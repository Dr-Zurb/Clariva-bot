/**
 * Query-shape + round-trip + narrowing tests for Plan 09 · Task 46 query
 * helpers.
 *
 * Pins the exact Supabase chain Tasks 47 + 49 + 55 will execute against
 * the new `consultation_modality_history` table + the
 * `consultation_sessions` column adds (Migration 075). Without a live
 * Postgres test harness, the "integration" bits boil down to three
 * contracts:
 *
 *   1. The Task 47 insert round-trips every new column correctly via
 *      snake_case ↔ camelCase mapping (id + occurred_at default at DB
 *      layer; caller supplies billing + direction + reason).
 *
 *   2. The Task 55 timeline read is keyed by `session_id` + ORDER BY
 *      `occurred_at ASC` (matches the `idx_modality_history_session_time`
 *      index and oldest-first render order).
 *
 *   3. The Task 49 refund worker reads rows via
 *      `eq(billing_action, 'auto_refund_downgrade').is(razorpay_refund_id,
 *      null).order(occurred_at ASC).limit(N)` — matches the partial
 *      index predicate.
 *
 *   4. The `narrowHistoryEntry` discriminated-union lift matches the
 *      DB-level `modality_history_billing_shape` CHECK. Invalid shapes
 *      throw loudly rather than lying to downstream code.
 *
 * RLS behaviour (a second participant's SELECT returning empty) is not
 * observable from this test layer — the admin client bypasses RLS. The
 * RLS policy itself is pinned in the migration content-sanity test.
 *
 * @see backend/src/services/modality-history-queries.ts
 * @see backend/tests/unit/migrations/modality-history-migration.test.ts
 */

import { describe, expect, it, jest } from '@jest/globals';

import {
  fetchModalityHistoryForSession,
  fetchPendingRefundRows,
  insertModalityHistoryRow,
  narrowHistoryEntry,
  updateRazorpayRefundId,
} from '../../../src/services/modality-history-queries';
import type {
  ModalityHistoryRowWide,
} from '../../../src/types/modality-history';

// ============================================================================
// Fake Supabase chain — records each call so tests can assert the chain
// shape AND return canned row(s). Mirrors the harness in
// `video-escalation-audit-query.test.ts`.
// ============================================================================

interface ChainCall {
  method: string;
  args:   unknown[];
}

interface ChainHarness {
  result:    { data: unknown; error: unknown };
  calls:     ChainCall[];
  fromMock:  jest.Mock<(table: string) => unknown>;
}

function buildChain(result: { data: unknown; error: unknown }): ChainHarness {
  const calls: ChainCall[] = [];

  const chain: Record<string, unknown> = {};
  const recordAndReturn = (method: string, ...args: unknown[]): unknown => {
    calls.push({ method, args });
    return chain;
  };

  chain.select  = (...a: unknown[]) => recordAndReturn('select',  ...a);
  chain.eq      = (...a: unknown[]) => recordAndReturn('eq',      ...a);
  chain.is      = (...a: unknown[]) => recordAndReturn('is',      ...a);
  chain.insert  = (...a: unknown[]) => recordAndReturn('insert',  ...a);
  chain.update  = (...a: unknown[]) => recordAndReturn('update',  ...a);

  // Terminal awaits that resolve to `result`.
  chain.order       = (...a: unknown[]) => {
    calls.push({ method: 'order', args: a });
    // Order may either terminate (thenable) or continue (for .limit(n)).
    // Return a thenable that ALSO exposes .limit to cover both cases.
    const thenable: Record<string, unknown> = {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled),
      limit: (...la: unknown[]) => {
        calls.push({ method: 'limit', args: la });
        return Promise.resolve(result);
      },
    };
    return thenable;
  };
  chain.single       = (...a: unknown[]) => {
    calls.push({ method: 'single', args: a });
    return Promise.resolve(result);
  };
  chain.maybeSingle  = (...a: unknown[]) => {
    calls.push({ method: 'maybeSingle', args: a });
    return Promise.resolve(result);
  };

  const fromMock: jest.Mock<(table: string) => unknown> = jest.fn(
    (_table: string): unknown => chain,
  );
  return { result, calls, fromMock };
}

function fakeClient(harness: ChainHarness): unknown {
  return { from: harness.fromMock } as unknown;
}

// ============================================================================
// insertModalityHistoryRow (Task 47 state-machine insert path)
// ============================================================================

describe('insertModalityHistoryRow (Task 47 state-machine write)', () => {
  it('round-trips a paid_upgrade row with all Razorpay fields mapped', async () => {
    const h = buildChain({
      data: {
        id:                  'hist-1',
        session_id:          'session-A',
        from_modality:       'text',
        to_modality:         'voice',
        initiated_by:        'patient',
        billing_action:      'paid_upgrade',
        amount_paise:        15000,
        razorpay_payment_id: 'pay_abc',
        razorpay_refund_id:  null,
        reason:              null,
        preset_reason_code:  null,
        correlation_id:      'corr-1',
        occurred_at:         '2026-04-19T10:00:00Z',
      },
      error: null,
    });

    const row = await insertModalityHistoryRow(fakeClient(h) as never, {
      sessionId:         'session-A',
      fromModality:      'text',
      toModality:        'voice',
      initiatedBy:       'patient',
      billingAction:     'paid_upgrade',
      amountPaise:       15000,
      razorpayPaymentId: 'pay_abc',
      correlationId:     'corr-1',
    });

    expect(h.fromMock).toHaveBeenCalledWith('consultation_modality_history');
    expect(h.calls.map((c) => c.method)).toEqual(['insert', 'select', 'single']);
    // snake_case payload at the DB boundary; optional fields fan out to null.
    expect(h.calls[0].args[0]).toEqual({
      session_id:          'session-A',
      from_modality:       'text',
      to_modality:         'voice',
      initiated_by:        'patient',
      billing_action:      'paid_upgrade',
      amount_paise:        15000,
      razorpay_payment_id: 'pay_abc',
      razorpay_refund_id:  null,
      reason:              null,
      preset_reason_code:  null,
      correlation_id:      'corr-1',
    });
    expect(row.id).toBe('hist-1');
    expect(row.billingAction).toBe('paid_upgrade');
    expect(row.amountPaise).toBe(15000);
    expect(row.razorpayPaymentId).toBe('pay_abc');
    expect(row.razorpayRefundId).toBeNull();
  });

  it('round-trips a free_upgrade row with every billing field null', async () => {
    const h = buildChain({
      data: {
        id:                  'hist-free',
        session_id:          'session-B',
        from_modality:       'voice',
        to_modality:         'video',
        initiated_by:        'patient',
        billing_action:      'free_upgrade',
        amount_paise:        null,
        razorpay_payment_id: null,
        razorpay_refund_id:  null,
        reason:              null,
        preset_reason_code:  null,
        correlation_id:      'corr-2',
        occurred_at:         '2026-04-19T10:05:00Z',
      },
      error: null,
    });

    const row = await insertModalityHistoryRow(fakeClient(h) as never, {
      sessionId:     'session-B',
      fromModality:  'voice',
      toModality:    'video',
      initiatedBy:   'patient',
      billingAction: 'free_upgrade',
      correlationId: 'corr-2',
    });

    expect(h.calls[0].args[0]).toMatchObject({
      billing_action:      'free_upgrade',
      amount_paise:        null,
      razorpay_payment_id: null,
      razorpay_refund_id:  null,
      reason:              null,
      preset_reason_code:  null,
    });
    expect(row.billingAction).toBe('free_upgrade');
    expect(row.amountPaise).toBeNull();
  });

  it('round-trips an auto_refund_downgrade row (refund id pending at insert)', async () => {
    const h = buildChain({
      data: {
        id:                  'hist-refund-pending',
        session_id:          'session-C',
        from_modality:       'video',
        to_modality:         'voice',
        initiated_by:        'doctor',
        billing_action:      'auto_refund_downgrade',
        amount_paise:        5000,
        razorpay_payment_id: null,
        razorpay_refund_id:  null,
        reason:              'Patient environment unsuitable for video',
        preset_reason_code:  'patient_environment',
        correlation_id:      'corr-3',
        occurred_at:         '2026-04-19T10:10:00Z',
      },
      error: null,
    });

    const row = await insertModalityHistoryRow(fakeClient(h) as never, {
      sessionId:        'session-C',
      fromModality:     'video',
      toModality:       'voice',
      initiatedBy:      'doctor',
      billingAction:    'auto_refund_downgrade',
      amountPaise:      5000,
      reason:           'Patient environment unsuitable for video',
      presetReasonCode: 'patient_environment',
      correlationId:    'corr-3',
    });

    expect(h.calls[0].args[0]).toMatchObject({
      billing_action:      'auto_refund_downgrade',
      amount_paise:        5000,
      razorpay_payment_id: null,
      razorpay_refund_id:  null,
      reason:              'Patient environment unsuitable for video',
      preset_reason_code:  'patient_environment',
    });
    expect(row.razorpayRefundId).toBeNull();
  });

  it('throws if Supabase returns no row', async () => {
    const h = buildChain({ data: null, error: null });
    await expect(
      insertModalityHistoryRow(fakeClient(h) as never, {
        sessionId:     's',
        fromModality:  'text',
        toModality:    'voice',
        initiatedBy:   'patient',
        billingAction: 'free_upgrade',
        correlationId: 'c',
      }),
    ).rejects.toThrow(/insertModalityHistoryRow.*no row returned/);
  });

  it('throws on Supabase error with the error message threaded through', async () => {
    const h = buildChain({
      data: null,
      error: { message: 'CHECK modality_history_billing_shape failed' },
    });
    await expect(
      insertModalityHistoryRow(fakeClient(h) as never, {
        sessionId:     's',
        fromModality:  'text',
        toModality:    'voice',
        initiatedBy:   'patient',
        billingAction: 'free_upgrade',
        correlationId: 'c',
      }),
    ).rejects.toThrow(/modality_history_billing_shape/);
  });
});

// ============================================================================
// fetchModalityHistoryForSession (Task 55 timeline read)
// ============================================================================

describe('fetchModalityHistoryForSession (Task 55 timeline read)', () => {
  it('reads by session_id, ORDER BY occurred_at ASC (oldest first)', async () => {
    const h = buildChain({
      data: [
        {
          id:                  'hist-1',
          session_id:          'session-A',
          from_modality:       'text',
          to_modality:         'voice',
          initiated_by:        'patient',
          billing_action:      'paid_upgrade',
          amount_paise:        15000,
          razorpay_payment_id: 'pay_abc',
          razorpay_refund_id:  null,
          reason:              null,
          preset_reason_code:  null,
          correlation_id:      'corr-1',
          occurred_at:         '2026-04-19T10:00:00Z',
        },
        {
          id:                  'hist-2',
          session_id:          'session-A',
          from_modality:       'voice',
          to_modality:         'video',
          initiated_by:        'doctor',
          billing_action:      'free_upgrade',
          amount_paise:        null,
          razorpay_payment_id: null,
          razorpay_refund_id:  null,
          reason:              'Need to see the rash',
          preset_reason_code:  'visible_symptom',
          correlation_id:      'corr-2',
          occurred_at:         '2026-04-19T10:15:00Z',
        },
      ],
      error: null,
    });

    const rows = await fetchModalityHistoryForSession(
      fakeClient(h) as never,
      'session-A',
    );

    expect(h.fromMock).toHaveBeenCalledWith('consultation_modality_history');
    expect(h.calls.map((c) => c.method)).toEqual(['select', 'eq', 'order']);
    expect(h.calls[0].args).toEqual(['*']);
    expect(h.calls[1].args).toEqual(['session_id', 'session-A']);
    expect(h.calls[2].args).toEqual(['occurred_at', { ascending: true }]);

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('hist-1');
    expect(rows[0].fromModality).toBe('text');
    expect(rows[0].toModality).toBe('voice');
    expect(rows[1].initiatedBy).toBe('doctor');
    expect(rows[1].presetReasonCode).toBe('visible_symptom');
  });

  it('returns [] when the session has no transitions (common case)', async () => {
    const h = buildChain({ data: [], error: null });
    const rows = await fetchModalityHistoryForSession(
      fakeClient(h) as never,
      'session-straight-through',
    );
    expect(rows).toEqual([]);
  });

  it('returns [] when Supabase returns null data', async () => {
    const h = buildChain({ data: null, error: null });
    const rows = await fetchModalityHistoryForSession(
      fakeClient(h) as never,
      'session-null',
    );
    expect(rows).toEqual([]);
  });

  it('throws on Supabase error', async () => {
    const h = buildChain({ data: null, error: { message: 'network down' } });
    await expect(
      fetchModalityHistoryForSession(fakeClient(h) as never, 'session-X'),
    ).rejects.toThrow(/fetchModalityHistoryForSession.*network down/);
  });
});

// ============================================================================
// fetchPendingRefundRows (Task 49 retry worker scan)
// ============================================================================

describe('fetchPendingRefundRows (Task 49 refund retry scan)', () => {
  it('reads where billing_action = auto_refund_downgrade AND razorpay_refund_id IS NULL, oldest first, limited', async () => {
    const h = buildChain({
      data: [
        {
          id:                  'hist-refund-pending',
          session_id:          'session-C',
          from_modality:       'video',
          to_modality:         'voice',
          initiated_by:        'doctor',
          billing_action:      'auto_refund_downgrade',
          amount_paise:        5000,
          razorpay_payment_id: null,
          razorpay_refund_id:  null,
          reason:              'Patient environment unsuitable for video',
          preset_reason_code:  'patient_environment',
          correlation_id:      'corr-3',
          occurred_at:         '2026-04-19T10:10:00Z',
        },
      ],
      error: null,
    });

    const rows = await fetchPendingRefundRows(fakeClient(h) as never, 25);

    expect(h.fromMock).toHaveBeenCalledWith('consultation_modality_history');
    // select * → eq(billing_action, auto_refund_downgrade) →
    // is(razorpay_refund_id, null) → order(occurred_at ASC) → limit(25)
    expect(h.calls.map((c) => c.method)).toEqual([
      'select',
      'eq',
      'is',
      'order',
      'limit',
    ]);
    expect(h.calls[1].args).toEqual([
      'billing_action',
      'auto_refund_downgrade',
    ]);
    expect(h.calls[2].args).toEqual(['razorpay_refund_id', null]);
    expect(h.calls[3].args).toEqual(['occurred_at', { ascending: true }]);
    expect(h.calls[4].args).toEqual([25]);
    expect(rows).toHaveLength(1);
    expect(rows[0].billingAction).toBe('auto_refund_downgrade');
    expect(rows[0].razorpayRefundId).toBeNull();
  });

  it('returns [] on empty backlog', async () => {
    const h = buildChain({ data: [], error: null });
    const rows = await fetchPendingRefundRows(fakeClient(h) as never, 25);
    expect(rows).toEqual([]);
  });
});

// ============================================================================
// updateRazorpayRefundId (Task 49 refund-confirm write)
// ============================================================================

describe('updateRazorpayRefundId (Task 49 refund-confirm write)', () => {
  it('updates refund id with the double-write race guard (is(razorpay_refund_id, null))', async () => {
    const h = buildChain({
      data: {
        id:                  'hist-refund-pending',
        session_id:          'session-C',
        from_modality:       'video',
        to_modality:         'voice',
        initiated_by:        'doctor',
        billing_action:      'auto_refund_downgrade',
        amount_paise:        5000,
        razorpay_payment_id: null,
        razorpay_refund_id:  'rfnd_xyz',
        reason:              'Patient environment unsuitable for video',
        preset_reason_code:  'patient_environment',
        correlation_id:      'corr-3',
        occurred_at:         '2026-04-19T10:10:00Z',
      },
      error: null,
    });

    const row = await updateRazorpayRefundId(fakeClient(h) as never, {
      id:               'hist-refund-pending',
      razorpayRefundId: 'rfnd_xyz',
    });

    expect(h.fromMock).toHaveBeenCalledWith('consultation_modality_history');
    // update({razorpay_refund_id}) → eq(id) → eq(billing_action) →
    // is(razorpay_refund_id, null) → select(*) → maybeSingle
    expect(h.calls.map((c) => c.method)).toEqual([
      'update',
      'eq',
      'eq',
      'is',
      'select',
      'maybeSingle',
    ]);
    expect(h.calls[0].args[0]).toEqual({ razorpay_refund_id: 'rfnd_xyz' });
    expect(h.calls[1].args).toEqual(['id', 'hist-refund-pending']);
    expect(h.calls[2].args).toEqual(['billing_action', 'auto_refund_downgrade']);
    expect(h.calls[3].args).toEqual(['razorpay_refund_id', null]);
    expect(row).not.toBeNull();
    expect(row?.razorpayRefundId).toBe('rfnd_xyz');
  });

  it('returns null on a stale / lost-race update (maybeSingle → null)', async () => {
    const h = buildChain({ data: null, error: null });
    const row = await updateRazorpayRefundId(fakeClient(h) as never, {
      id:               'hist-gone',
      razorpayRefundId: 'rfnd_whatever',
    });
    expect(row).toBeNull();
  });

  it('throws on Supabase error', async () => {
    const h = buildChain({ data: null, error: { message: 'timeout' } });
    await expect(
      updateRazorpayRefundId(fakeClient(h) as never, {
        id:               'hist-1',
        razorpayRefundId: 'rfnd_1',
      }),
    ).rejects.toThrow(/updateRazorpayRefundId.*timeout/);
  });
});

// ============================================================================
// narrowHistoryEntry — discriminated-union lift matches billing_shape CHECK
// ============================================================================

describe('narrowHistoryEntry (pure discriminated-union lift)', () => {
  const baseWide: Omit<ModalityHistoryRowWide, 'billingAction'
    | 'amountPaise' | 'razorpayPaymentId' | 'razorpayRefundId'> = {
    id:               'hist-1',
    sessionId:        'session-A',
    fromModality:     'text',
    toModality:       'voice',
    initiatedBy:      'patient',
    reason:           null,
    presetReasonCode: null,
    correlationId:    'c',
    occurredAt:       '2026-04-19T10:00:00Z',
  };

  it('lifts paid_upgrade into a narrowed entry with amountPaise + payment id', () => {
    const entry = narrowHistoryEntry({
      ...baseWide,
      billingAction:     'paid_upgrade',
      amountPaise:       15000,
      razorpayPaymentId: 'pay_abc',
      razorpayRefundId:  null,
    });
    expect(entry.billingAction).toBe('paid_upgrade');
    if (entry.billingAction === 'paid_upgrade') {
      expect(entry.amountPaise).toBe(15000);
      expect(entry.razorpayPaymentId).toBe('pay_abc');
      expect(entry.razorpayRefundId).toBeNull();
    }
  });

  it('lifts free_upgrade with every billing field null', () => {
    const entry = narrowHistoryEntry({
      ...baseWide,
      billingAction:     'free_upgrade',
      amountPaise:       null,
      razorpayPaymentId: null,
      razorpayRefundId:  null,
    });
    expect(entry.billingAction).toBe('free_upgrade');
    if (entry.billingAction === 'free_upgrade') {
      expect(entry.amountPaise).toBeNull();
      expect(entry.razorpayPaymentId).toBeNull();
    }
  });

  it('lifts no_refund_downgrade with every billing field null', () => {
    const entry = narrowHistoryEntry({
      ...baseWide,
      fromModality:      'video',
      toModality:        'voice',
      billingAction:     'no_refund_downgrade',
      amountPaise:       null,
      razorpayPaymentId: null,
      razorpayRefundId:  null,
    });
    expect(entry.billingAction).toBe('no_refund_downgrade');
  });

  it('lifts auto_refund_downgrade with pending refund id null', () => {
    const entry = narrowHistoryEntry({
      ...baseWide,
      fromModality:      'video',
      toModality:        'voice',
      initiatedBy:       'doctor',
      reason:            'Patient environment unsuitable for video',
      billingAction:     'auto_refund_downgrade',
      amountPaise:       5000,
      razorpayPaymentId: null,
      razorpayRefundId:  null,
    });
    expect(entry.billingAction).toBe('auto_refund_downgrade');
    if (entry.billingAction === 'auto_refund_downgrade') {
      expect(entry.amountPaise).toBe(5000);
      expect(entry.razorpayRefundId).toBeNull();
    }
  });

  it('lifts auto_refund_downgrade with settled refund id', () => {
    const entry = narrowHistoryEntry({
      ...baseWide,
      fromModality:      'video',
      toModality:        'voice',
      initiatedBy:       'doctor',
      reason:            'Network repeatedly dropping',
      billingAction:     'auto_refund_downgrade',
      amountPaise:       5000,
      razorpayPaymentId: null,
      razorpayRefundId:  'rfnd_settled',
    });
    if (entry.billingAction === 'auto_refund_downgrade') {
      expect(entry.razorpayRefundId).toBe('rfnd_settled');
    }
  });

  it('throws loudly if paid_upgrade is missing amountPaise (CHECK bypass detector)', () => {
    expect(() =>
      narrowHistoryEntry({
        ...baseWide,
        billingAction:     'paid_upgrade',
        amountPaise:       null,
        razorpayPaymentId: 'pay_abc',
        razorpayRefundId:  null,
      }),
    ).toThrow(/paid_upgrade.*violates billing-shape CHECK/);
  });

  it('throws loudly if paid_upgrade is missing razorpayPaymentId (CHECK bypass detector)', () => {
    expect(() =>
      narrowHistoryEntry({
        ...baseWide,
        billingAction:     'paid_upgrade',
        amountPaise:       15000,
        razorpayPaymentId: null,
        razorpayRefundId:  null,
      }),
    ).toThrow(/paid_upgrade.*violates billing-shape CHECK/);
  });

  it('throws loudly if auto_refund_downgrade is missing amountPaise', () => {
    expect(() =>
      narrowHistoryEntry({
        ...baseWide,
        fromModality:      'video',
        toModality:        'voice',
        initiatedBy:       'doctor',
        billingAction:     'auto_refund_downgrade',
        amountPaise:       null,
        razorpayPaymentId: null,
        razorpayRefundId:  null,
      }),
    ).toThrow(/auto_refund_downgrade.*violates billing-shape CHECK/);
  });
});
