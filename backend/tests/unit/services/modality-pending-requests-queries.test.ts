/**
 * Query-shape + round-trip tests for Plan 09 · Task 47 pending-request
 * helpers.
 *
 * Pins the exact Supabase chain the state machine + timeout worker +
 * webhook dispatcher will execute against
 * `modality_change_pending_requests` (Migration 076). Mirrors the
 * pattern from `modality-history-queries.test.ts` (Task 46).
 *
 * RLS behaviour is not observable from this test layer — the admin
 * client bypasses RLS. The RLS policy itself is pinned in the migration
 * content-sanity test.
 *
 * @see backend/src/services/modality-pending-requests-queries.ts
 * @see backend/migrations/076_modality_change_pending_requests.sql
 */

import { describe, expect, it, jest } from '@jest/globals';

import {
  fetchActivePendingForSession,
  fetchExpiredPendingRequests,
  fetchPendingById,
  fetchPendingByRazorpayOrderId,
  insertModalityPendingRow,
  resolvePendingRequest,
  stampRazorpayOrderOnPending,
} from '../../../src/services/modality-pending-requests-queries';

// ============================================================================
// Fake Supabase chain harness (reused pattern from Task 46).
// ============================================================================

interface ChainCall {
  method: string;
  args:   unknown[];
}

interface ChainHarness {
  result:   { data: unknown; error: unknown };
  calls:    ChainCall[];
  fromMock: jest.Mock<(table: string) => unknown>;
}

function buildChain(result: { data: unknown; error: unknown }): ChainHarness {
  const calls: ChainCall[] = [];

  const chain: Record<string, unknown> = {};
  const record = (method: string, ...args: unknown[]): unknown => {
    calls.push({ method, args });
    return chain;
  };

  chain.select  = (...a: unknown[]) => record('select',  ...a);
  chain.eq      = (...a: unknown[]) => record('eq',      ...a);
  chain.is      = (...a: unknown[]) => record('is',      ...a);
  chain.lt      = (...a: unknown[]) => record('lt',      ...a);
  chain.insert  = (...a: unknown[]) => record('insert',  ...a);
  chain.update  = (...a: unknown[]) => record('update',  ...a);

  chain.order = (...a: unknown[]) => {
    calls.push({ method: 'order', args: a });
    const thenable: Record<string, unknown> = {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled),
      limit: (...la: unknown[]) => {
        calls.push({ method: 'limit', args: la });
        const innerThenable: Record<string, unknown> = {
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve(result).then(onFulfilled),
          maybeSingle: (...msa: unknown[]) => {
            calls.push({ method: 'maybeSingle', args: msa });
            return Promise.resolve(result);
          },
        };
        return innerThenable;
      },
    };
    return thenable;
  };
  chain.single = (...a: unknown[]) => {
    calls.push({ method: 'single', args: a });
    return Promise.resolve(result);
  };
  chain.maybeSingle = (...a: unknown[]) => {
    calls.push({ method: 'maybeSingle', args: a });
    return Promise.resolve(result);
  };
  chain.limit = (...a: unknown[]) => {
    calls.push({ method: 'limit', args: a });
    return Promise.resolve(result);
  };

  const fromMock: jest.Mock<(table: string) => unknown> = jest.fn(
    (_table: string): unknown => chain,
  );
  return { result, calls, fromMock };
}

function fakeClient(h: ChainHarness): unknown {
  return { from: h.fromMock } as unknown;
}

// ============================================================================
// Canned DB rows — match Migration 076 snake_case exactly.
// ============================================================================

const dbRowPatientUpgradeToVideo = {
  id:                  'pend-1',
  session_id:          'sess-A',
  initiated_by:        'patient' as const,
  requested_modality:  'video'   as const,
  reason:              null,
  preset_reason_code:  null,
  amount_paise:        15000,
  razorpay_order_id:   null,
  requested_at:        '2026-04-19T10:00:00Z',
  expires_at:          '2026-04-19T10:01:30Z',
  responded_at:        null,
  response:            null,
  correlation_id:      'corr-pending-1',
};

const dbRowDoctorUpgradeToVoice = {
  id:                  'pend-2',
  session_id:          'sess-B',
  initiated_by:        'doctor'  as const,
  requested_modality:  'voice'   as const,
  reason:              'Need to hear the patient to confirm symptoms',
  preset_reason_code:  'need_to_hear_voice' as const,
  amount_paise:        null,
  razorpay_order_id:   null,
  requested_at:        '2026-04-19T10:05:00Z',
  expires_at:          '2026-04-19T10:06:00Z',
  responded_at:        null,
  response:            null,
  correlation_id:      'corr-pending-2',
};

// ============================================================================
// insertModalityPendingRow
// ============================================================================

describe('insertModalityPendingRow', () => {
  it('round-trips a patient-upgrade row with amount_paise and no reason', async () => {
    const h = buildChain({ data: dbRowPatientUpgradeToVideo, error: null });
    const row = await insertModalityPendingRow(fakeClient(h) as never, {
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestedModality: 'video',
      amountPaise:       15000,
      expiresAt:         '2026-04-19T10:01:30Z',
      correlationId:     'corr-pending-1',
    });

    expect(h.fromMock).toHaveBeenCalledWith('modality_change_pending_requests');
    expect(h.calls.map((c) => c.method)).toEqual(['insert', 'select', 'single']);
    expect(h.calls[0].args[0]).toEqual({
      session_id:         'sess-A',
      initiated_by:       'patient',
      requested_modality: 'video',
      reason:             null,
      preset_reason_code: null,
      amount_paise:       15000,
      razorpay_order_id:  null,
      expires_at:         '2026-04-19T10:01:30Z',
      correlation_id:     'corr-pending-1',
    });
    expect(row.id).toBe('pend-1');
    expect(row.initiatedBy).toBe('patient');
    expect(row.requestedModality).toBe('video');
    expect(row.amountPaise).toBe(15000);
    expect(row.response).toBeNull();
    expect(row.respondedAt).toBeNull();
  });

  it('round-trips a doctor-upgrade row with a mandatory reason', async () => {
    const h = buildChain({ data: dbRowDoctorUpgradeToVoice, error: null });
    const row = await insertModalityPendingRow(fakeClient(h) as never, {
      sessionId:         'sess-B',
      initiatedBy:       'doctor',
      requestedModality: 'voice',
      reason:            'Need to hear the patient to confirm symptoms',
      presetReasonCode:  'need_to_hear_voice',
      expiresAt:         '2026-04-19T10:06:00Z',
      correlationId:     'corr-pending-2',
    });

    expect(h.calls[0].args[0]).toMatchObject({
      initiated_by:       'doctor',
      requested_modality: 'voice',
      reason:             'Need to hear the patient to confirm symptoms',
      preset_reason_code: 'need_to_hear_voice',
      amount_paise:       null,
      razorpay_order_id:  null,
    });
    expect(row.reason).toBe('Need to hear the patient to confirm symptoms');
    expect(row.presetReasonCode).toBe('need_to_hear_voice');
  });

  it('throws if Supabase returns no row', async () => {
    const h = buildChain({ data: null, error: null });
    await expect(
      insertModalityPendingRow(fakeClient(h) as never, {
        sessionId:         'sess-C',
        initiatedBy:       'patient',
        requestedModality: 'voice',
        expiresAt:         '2026-04-19T10:00:00Z',
        correlationId:     'c',
      }),
    ).rejects.toThrow(/insertModalityPendingRow.*no row returned/);
  });

  it('threads Supabase errors (e.g. CHECK rejection) through the thrown message', async () => {
    const h = buildChain({
      data: null,
      error: { message: 'CHECK modality_change_pending_response_shape failed' },
    });
    await expect(
      insertModalityPendingRow(fakeClient(h) as never, {
        sessionId:         'sess-D',
        initiatedBy:       'doctor',
        requestedModality: 'video',
        reason:            'Visible symptom',
        presetReasonCode:  'visible_symptom',
        expiresAt:         '2026-04-19T10:00:00Z',
        correlationId:     'c',
      }),
    ).rejects.toThrow(/modality_change_pending_response_shape/);
  });
});

// ============================================================================
// resolvePendingRequest
// ============================================================================

describe('resolvePendingRequest', () => {
  it('resolves with payload + double-resolve race guard (is response null)', async () => {
    const resolved = {
      ...dbRowPatientUpgradeToVideo,
      response:     'approved_paid' as const,
      responded_at: '2026-04-19T10:01:15Z',
    };
    const h = buildChain({ data: resolved, error: null });

    const row = await resolvePendingRequest(fakeClient(h) as never, {
      id:          'pend-1',
      response:    'approved_paid',
      respondedAt: '2026-04-19T10:01:15Z',
    });

    expect(h.fromMock).toHaveBeenCalledWith('modality_change_pending_requests');
    expect(h.calls.map((c) => c.method)).toEqual([
      'update',
      'eq',
      'is',
      'select',
      'maybeSingle',
    ]);
    expect(h.calls[0].args[0]).toEqual({
      response:     'approved_paid',
      responded_at: '2026-04-19T10:01:15Z',
    });
    expect(h.calls[1].args).toEqual(['id', 'pend-1']);
    expect(h.calls[2].args).toEqual(['response', null]);
    expect(row?.response).toBe('approved_paid');
    expect(row?.respondedAt).toBe('2026-04-19T10:01:15Z');
  });

  it('includes razorpay_order_id when supplied alongside the resolution', async () => {
    const resolved = {
      ...dbRowPatientUpgradeToVideo,
      response:          'approved_paid' as const,
      responded_at:      '2026-04-19T10:01:15Z',
      razorpay_order_id: 'order_rzp_xyz',
    };
    const h = buildChain({ data: resolved, error: null });

    await resolvePendingRequest(fakeClient(h) as never, {
      id:              'pend-1',
      response:        'approved_paid',
      respondedAt:     '2026-04-19T10:01:15Z',
      razorpayOrderId: 'order_rzp_xyz',
    });

    expect(h.calls[0].args[0]).toEqual({
      response:          'approved_paid',
      responded_at:      '2026-04-19T10:01:15Z',
      razorpay_order_id: 'order_rzp_xyz',
    });
  });

  it('returns null on a lost-race (maybeSingle → null; row already terminal)', async () => {
    const h = buildChain({ data: null, error: null });
    const row = await resolvePendingRequest(fakeClient(h) as never, {
      id:          'pend-already-timed-out',
      response:    'declined',
      respondedAt: '2026-04-19T10:01:15Z',
    });
    expect(row).toBeNull();
  });

  it('throws on Supabase error', async () => {
    const h = buildChain({ data: null, error: { message: 'conn reset' } });
    await expect(
      resolvePendingRequest(fakeClient(h) as never, {
        id:          'pend-1',
        response:    'timeout',
        respondedAt: '2026-04-19T10:01:30Z',
      }),
    ).rejects.toThrow(/resolvePendingRequest.*conn reset/);
  });
});

// ============================================================================
// stampRazorpayOrderOnPending
// ============================================================================

describe('stampRazorpayOrderOnPending', () => {
  it('stamps order id only on approved_paid rows with order id still NULL', async () => {
    const stamped = {
      ...dbRowPatientUpgradeToVideo,
      response:          'approved_paid' as const,
      responded_at:      '2026-04-19T10:01:15Z',
      razorpay_order_id: 'order_rzp_xyz',
    };
    const h = buildChain({ data: stamped, error: null });

    const row = await stampRazorpayOrderOnPending(
      fakeClient(h) as never,
      'pend-1',
      'order_rzp_xyz',
    );

    expect(h.calls.map((c) => c.method)).toEqual([
      'update',
      'eq',
      'eq',
      'is',
      'select',
      'maybeSingle',
    ]);
    expect(h.calls[0].args[0]).toEqual({ razorpay_order_id: 'order_rzp_xyz' });
    expect(h.calls[1].args).toEqual(['id', 'pend-1']);
    expect(h.calls[2].args).toEqual(['response', 'approved_paid']);
    expect(h.calls[3].args).toEqual(['razorpay_order_id', null]);
    expect(row?.razorpayOrderId).toBe('order_rzp_xyz');
  });

  it('returns null on a lost race (already stamped / not approved_paid)', async () => {
    const h = buildChain({ data: null, error: null });
    const row = await stampRazorpayOrderOnPending(
      fakeClient(h) as never,
      'pend-1',
      'order_rzp_xyz',
    );
    expect(row).toBeNull();
  });

  it('throws on Supabase error', async () => {
    const h = buildChain({ data: null, error: { message: 'timeout' } });
    await expect(
      stampRazorpayOrderOnPending(fakeClient(h) as never, 'pend-1', 'order_x'),
    ).rejects.toThrow(/stampRazorpayOrderOnPending.*timeout/);
  });
});

// ============================================================================
// fetchActivePendingForSession
// ============================================================================

describe('fetchActivePendingForSession', () => {
  it('reads session_id + response IS NULL, ORDER BY expires_at DESC LIMIT 1 (partial index)', async () => {
    const h = buildChain({ data: dbRowPatientUpgradeToVideo, error: null });

    const row = await fetchActivePendingForSession(fakeClient(h) as never, 'sess-A');

    expect(h.fromMock).toHaveBeenCalledWith('modality_change_pending_requests');
    expect(h.calls.map((c) => c.method)).toEqual([
      'select',
      'eq',
      'is',
      'order',
      'limit',
      'maybeSingle',
    ]);
    expect(h.calls[0].args).toEqual(['*']);
    expect(h.calls[1].args).toEqual(['session_id', 'sess-A']);
    expect(h.calls[2].args).toEqual(['response', null]);
    expect(h.calls[3].args).toEqual(['expires_at', { ascending: false }]);
    expect(h.calls[4].args).toEqual([1]);
    expect(row?.id).toBe('pend-1');
  });

  it('returns null when no active pending row exists (common case)', async () => {
    const h = buildChain({ data: null, error: null });
    const row = await fetchActivePendingForSession(fakeClient(h) as never, 'sess-idle');
    expect(row).toBeNull();
  });

  it('throws on Supabase error', async () => {
    const h = buildChain({ data: null, error: { message: 'boom' } });
    await expect(
      fetchActivePendingForSession(fakeClient(h) as never, 'sess-A'),
    ).rejects.toThrow(/fetchActivePendingForSession.*boom/);
  });
});

// ============================================================================
// fetchPendingById
// ============================================================================

describe('fetchPendingById', () => {
  it('reads by primary key via eq(id) → maybeSingle', async () => {
    const h = buildChain({ data: dbRowPatientUpgradeToVideo, error: null });
    const row = await fetchPendingById(fakeClient(h) as never, 'pend-1');

    expect(h.fromMock).toHaveBeenCalledWith('modality_change_pending_requests');
    expect(h.calls.map((c) => c.method)).toEqual(['select', 'eq', 'maybeSingle']);
    expect(h.calls[1].args).toEqual(['id', 'pend-1']);
    expect(row?.id).toBe('pend-1');
  });

  it('returns null on miss (404 semantics for the approve/consent routes)', async () => {
    const h = buildChain({ data: null, error: null });
    const row = await fetchPendingById(fakeClient(h) as never, 'pend-missing');
    expect(row).toBeNull();
  });
});

// ============================================================================
// fetchPendingByRazorpayOrderId
// ============================================================================

describe('fetchPendingByRazorpayOrderId', () => {
  it('reverse-looks-up a pending row by razorpay_order_id (webhook dispatch)', async () => {
    const h = buildChain({
      data: {
        ...dbRowPatientUpgradeToVideo,
        response:          'approved_paid' as const,
        responded_at:      '2026-04-19T10:01:15Z',
        razorpay_order_id: 'order_rzp_xyz',
      },
      error: null,
    });

    const row = await fetchPendingByRazorpayOrderId(
      fakeClient(h) as never,
      'order_rzp_xyz',
    );

    expect(h.fromMock).toHaveBeenCalledWith('modality_change_pending_requests');
    expect(h.calls.map((c) => c.method)).toEqual(['select', 'eq', 'maybeSingle']);
    expect(h.calls[1].args).toEqual(['razorpay_order_id', 'order_rzp_xyz']);
    expect(row?.razorpayOrderId).toBe('order_rzp_xyz');
  });

  it('returns null when the order id is unknown (unrelated Razorpay webhook)', async () => {
    const h = buildChain({ data: null, error: null });
    const row = await fetchPendingByRazorpayOrderId(
      fakeClient(h) as never,
      'order_unrelated',
    );
    expect(row).toBeNull();
  });
});

// ============================================================================
// fetchExpiredPendingRequests
// ============================================================================

describe('fetchExpiredPendingRequests (timeout worker scan)', () => {
  it('selects response IS NULL AND expires_at < cutoff ORDER BY expires_at ASC LIMIT N', async () => {
    const h = buildChain({
      data: [dbRowPatientUpgradeToVideo, dbRowDoctorUpgradeToVoice],
      error: null,
    });

    const rows = await fetchExpiredPendingRequests(
      fakeClient(h) as never,
      '2026-04-19T10:10:00Z',
      25,
    );

    expect(h.fromMock).toHaveBeenCalledWith('modality_change_pending_requests');
    expect(h.calls.map((c) => c.method)).toEqual([
      'select',
      'is',
      'lt',
      'order',
      'limit',
    ]);
    expect(h.calls[1].args).toEqual(['response', null]);
    expect(h.calls[2].args).toEqual(['expires_at', '2026-04-19T10:10:00Z']);
    expect(h.calls[3].args).toEqual(['expires_at', { ascending: true }]);
    expect(h.calls[4].args).toEqual([25]);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('pend-1');
    expect(rows[1].id).toBe('pend-2');
  });

  it('returns [] on empty scan (steady state)', async () => {
    const h = buildChain({ data: [], error: null });
    const rows = await fetchExpiredPendingRequests(
      fakeClient(h) as never,
      '2026-04-19T10:10:00Z',
      25,
    );
    expect(rows).toEqual([]);
  });

  it('returns [] when Supabase returns null data', async () => {
    const h = buildChain({ data: null, error: null });
    const rows = await fetchExpiredPendingRequests(
      fakeClient(h) as never,
      '2026-04-19T10:10:00Z',
      25,
    );
    expect(rows).toEqual([]);
  });

  it('throws on Supabase error', async () => {
    const h = buildChain({ data: null, error: { message: 'query canceled' } });
    await expect(
      fetchExpiredPendingRequests(fakeClient(h) as never, '2026-04-19T10:10:00Z', 25),
    ).rejects.toThrow(/fetchExpiredPendingRequests.*query canceled/);
  });
});
