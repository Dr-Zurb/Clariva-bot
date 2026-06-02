/**
 * Query-shape + round-trip tests for Plan 08 · Task 45 query helpers.
 *
 * Pins the exact Supabase chain Tasks 41 + 44 will execute against the
 * new `video_escalation_audit` / `video_otp_window` tables (Migration
 * 070). Without a live Postgres test harness, the "integration" bits
 * boil down to three contracts:
 *
 *   1. The escalation rate-limit read is keyed by
 *      `session_id` + `requested_at DESC` + LIMIT 2 (matches the
 *      `idx_video_escalation_audit_session_time` index and Task 41's
 *      rate-limit query).
 *   2. The OTP-window skip-check is keyed by `patient_id` + a
 *      `> window_start` filter on `last_otp_verified_at` and returns
 *      exactly one row or none (matches Task 44's skip-check).
 *   3. Mappers handle snake_case → camelCase + null passthroughs
 *      correctly, so Task 41 / 44 never leak DB column names.
 *
 * Anything RLS-related (a second doctor's query returning empty) is
 * not observable from this test layer — the admin client bypasses RLS.
 * The RLS policy itself is pinned in the migration content-sanity test.
 * This comment serves as the cross-reference.
 *
 * @see backend/src/services/video-recording-audit-queries.ts
 * @see backend/tests/unit/migrations/video-recording-audit-extensions-migration.test.ts
 */

import { describe, expect, it, jest } from '@jest/globals';

import {
  fetchRecentEscalationsForSession,
  fetchVideoOtpWindow,
  insertVideoEscalationRequest,
  resolveVideoEscalationResponse,
  upsertVideoOtpWindow,
} from '../../../src/services/video-recording-audit-queries';

// ============================================================================
// Fake Supabase chain — records each call so tests can assert the chain
// shape AND return canned row(s).
// ============================================================================

interface ChainCall {
  method: string;
  args:   unknown[];
}

interface ChainHarness {
  /** Rows the chain resolves to when awaited OR returned via .single/.maybeSingle. */
  result:       { data: unknown; error: unknown };
  /** All method calls captured on the chain (in order). */
  calls:        ChainCall[];
  /** Jest mock for `from(table)` — assert the table name from here. */
  fromMock:     jest.Mock<(table: string) => unknown>;
}

function buildChain(result: { data: unknown; error: unknown }): ChainHarness {
  const calls: ChainCall[] = [];

  const chain: Record<string, unknown> = {};
  const recordAndReturn = (method: string, ...args: unknown[]): unknown => {
    calls.push({ method, args });
    return chain;
  };

  chain.select      = (...a: unknown[]) => recordAndReturn('select',      ...a);
  chain.eq          = (...a: unknown[]) => recordAndReturn('eq',          ...a);
  chain.is          = (...a: unknown[]) => recordAndReturn('is',          ...a);
  chain.gt          = (...a: unknown[]) => recordAndReturn('gt',          ...a);
  chain.order       = (...a: unknown[]) => recordAndReturn('order',       ...a);
  chain.insert      = (...a: unknown[]) => recordAndReturn('insert',      ...a);
  chain.update      = (...a: unknown[]) => recordAndReturn('update',      ...a);
  chain.upsert      = (...a: unknown[]) => recordAndReturn('upsert',      ...a);

  // Terminal awaits that resolve to `result`.
  chain.limit        = (...a: unknown[]) => {
    calls.push({ method: 'limit', args: a });
    return Promise.resolve(result);
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
// Task 41's rate-limit query — `fetchRecentEscalationsForSession`
// ============================================================================

describe('fetchRecentEscalationsForSession (Task 41 rate-limit read)', () => {
  it('reads video_escalation_audit keyed by session_id, ORDER BY requested_at DESC, LIMIT N', async () => {
    const h = buildChain({
      data: [
        {
          id:                 '11111111-1111-1111-1111-111111111111',
          session_id:         'session-A',
          doctor_id:          'doctor-A',
          requested_at:       '2026-04-19T10:00:00Z',
          reason:             'Need to see the rash more clearly',
          preset_reason_code: 'visible_symptom',
          patient_response:   null,
          responded_at:       null,
          correlation_id:     'corr-1',
        },
        {
          id:                 '22222222-2222-2222-2222-222222222222',
          session_id:         'session-A',
          doctor_id:          'doctor-A',
          requested_at:       '2026-04-19T09:50:00Z',
          reason:             'Earlier attempt; declined',
          preset_reason_code: 'visible_symptom',
          patient_response:   'decline',
          responded_at:       '2026-04-19T09:50:30Z',
          correlation_id:     'corr-0',
        },
      ],
      error: null,
    });

    const rows = await fetchRecentEscalationsForSession(
      fakeClient(h) as never,
      'session-A',
      2,
    );

    // 1. Hit the right table.
    expect(h.fromMock).toHaveBeenCalledWith('video_escalation_audit');

    // 2. Chain shape — select * → eq(session_id) → order(requested_at DESC) → limit(2).
    expect(h.calls.map((c) => c.method)).toEqual([
      'select',
      'eq',
      'order',
      'limit',
    ]);
    expect(h.calls[0].args).toEqual(['*']);
    expect(h.calls[1].args).toEqual(['session_id', 'session-A']);
    expect(h.calls[2].args).toEqual(['requested_at', { ascending: false }]);
    expect(h.calls[3].args).toEqual([2]);

    // 3. camelCase mapping is applied; ordering preserved; nulls survive.
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('11111111-1111-1111-1111-111111111111');
    expect(rows[0].sessionId).toBe('session-A');
    expect(rows[0].presetReasonCode).toBe('visible_symptom');
    expect(rows[0].patientResponse).toBeNull();
    expect(rows[0].respondedAt).toBeNull();
    expect(rows[1].patientResponse).toBe('decline');
    expect(rows[1].respondedAt).toBe('2026-04-19T09:50:30Z');
  });

  it('returns [] when the session has no escalations yet', async () => {
    const h = buildChain({ data: [], error: null });
    const rows = await fetchRecentEscalationsForSession(
      fakeClient(h) as never,
      'session-never-escalated',
      2,
    );
    expect(rows).toEqual([]);
  });

  it('returns [] when Supabase returns null data (guest-bucket edge)', async () => {
    const h = buildChain({ data: null, error: null });
    const rows = await fetchRecentEscalationsForSession(
      fakeClient(h) as never,
      'session-null',
      2,
    );
    expect(rows).toEqual([]);
  });

  it('throws on Supabase error', async () => {
    const h = buildChain({ data: null, error: { message: 'network down' } });
    await expect(
      fetchRecentEscalationsForSession(fakeClient(h) as never, 'session-X', 2),
    ).rejects.toThrow(/fetchRecentEscalationsForSession.*network down/);
  });
});

// ============================================================================
// Task 41's INSERT + UPDATE — request + resolve escalation
// ============================================================================

describe('insertVideoEscalationRequest (Task 41 doctor-request write)', () => {
  it('inserts with null defaults for preset/correlation and returns the created row', async () => {
    const h = buildChain({
      data: {
        id:                 'esc-1',
        session_id:         'session-A',
        doctor_id:          'doctor-A',
        requested_at:       '2026-04-19T10:00:00Z',
        reason:             'Visible rash',
        preset_reason_code: 'visible_symptom',
        patient_response:   null,
        responded_at:       null,
        correlation_id:     null,
      },
      error: null,
    });

    const row = await insertVideoEscalationRequest(fakeClient(h) as never, {
      sessionId:        'session-A',
      doctorId:         'doctor-A',
      reason:           'Visible rash',
      presetReasonCode: 'visible_symptom',
    });

    expect(h.fromMock).toHaveBeenCalledWith('video_escalation_audit');
    expect(h.calls.map((c) => c.method)).toEqual([
      'insert',
      'select',
      'single',
    ]);
    // snake_case payload at the DB boundary, null fan-out preserved.
    expect(h.calls[0].args[0]).toMatchObject({
      session_id:         'session-A',
      doctor_id:          'doctor-A',
      reason:             'Visible rash',
      preset_reason_code: 'visible_symptom',
      correlation_id:     null,
    });
    expect(row.id).toBe('esc-1');
    expect(row.patientResponse).toBeNull();
  });

  it('throws if Supabase returns no row', async () => {
    const h = buildChain({ data: null, error: null });
    await expect(
      insertVideoEscalationRequest(fakeClient(h) as never, {
        sessionId: 's',
        doctorId:  'd',
        reason:    'long enough',
      }),
    ).rejects.toThrow(/no row returned/);
  });
});

describe('resolveVideoEscalationResponse (Task 41 consent-response write)', () => {
  it('updates (patient_response, responded_at) only when still pending; returns the row', async () => {
    const h = buildChain({
      data: {
        id:                 'esc-1',
        session_id:         'session-A',
        doctor_id:          'doctor-A',
        requested_at:       '2026-04-19T10:00:00Z',
        reason:             'Visible rash',
        preset_reason_code: 'visible_symptom',
        patient_response:   'allow',
        responded_at:       '2026-04-19T10:00:40Z',
        correlation_id:     null,
      },
      error: null,
    });

    const row = await resolveVideoEscalationResponse(
      fakeClient(h) as never,
      'esc-1',
      { patientResponse: 'allow', respondedAt: '2026-04-19T10:00:40Z' },
    );

    expect(h.fromMock).toHaveBeenCalledWith('video_escalation_audit');
    // update(...) → eq('id', …) → is('patient_response', null) → select('*') → maybeSingle()
    expect(h.calls.map((c) => c.method)).toEqual([
      'update',
      'eq',
      'is',
      'select',
      'maybeSingle',
    ]);
    expect(h.calls[0].args[0]).toEqual({
      patient_response: 'allow',
      responded_at:     '2026-04-19T10:00:40Z',
    });
    expect(h.calls[1].args).toEqual(['id', 'esc-1']);
    expect(h.calls[2].args).toEqual(['patient_response', null]);
    expect(row).not.toBeNull();
    expect(row?.patientResponse).toBe('allow');
  });

  it('returns null on a stale / already-resolved update (maybeSingle → null)', async () => {
    const h = buildChain({ data: null, error: null });
    const row = await resolveVideoEscalationResponse(
      fakeClient(h) as never,
      'esc-gone',
      { patientResponse: 'timeout', respondedAt: '2026-04-19T10:01:00Z' },
    );
    expect(row).toBeNull();
  });
});

// ============================================================================
// Task 44's OTP skip-check read — `fetchVideoOtpWindow`
// ============================================================================

describe('fetchVideoOtpWindow (Task 44 skip-OTP read)', () => {
  it('reads video_otp_window keyed by patient_id + gt(last_otp_verified_at), maybeSingle', async () => {
    const h = buildChain({
      data: {
        patient_id:             'patient-A',
        last_otp_verified_at:   '2026-04-10T12:00:00Z',
        last_otp_verified_via:  'sms',
        correlation_id:         'corr-9',
      },
      error: null,
    });
    const windowStart = '2026-03-20T12:00:00Z';

    const row = await fetchVideoOtpWindow(
      fakeClient(h) as never,
      'patient-A',
      windowStart,
    );

    expect(h.fromMock).toHaveBeenCalledWith('video_otp_window');
    expect(h.calls.map((c) => c.method)).toEqual([
      'select',
      'eq',
      'gt',
      'maybeSingle',
    ]);
    expect(h.calls[1].args).toEqual(['patient_id', 'patient-A']);
    expect(h.calls[2].args).toEqual(['last_otp_verified_at', windowStart]);
    expect(row).toEqual({
      patientId:          'patient-A',
      lastOtpVerifiedAt:  '2026-04-10T12:00:00Z',
      lastOtpVerifiedVia: 'sms',
      correlationId:      'corr-9',
    });
  });

  it('returns null when no row within the window (stale / never-verified)', async () => {
    const h = buildChain({ data: null, error: null });
    const row = await fetchVideoOtpWindow(
      fakeClient(h) as never,
      'patient-stale',
      '2026-03-20T12:00:00Z',
    );
    expect(row).toBeNull();
  });

  it('throws on Supabase error', async () => {
    const h = buildChain({ data: null, error: { message: 'timeout' } });
    await expect(
      fetchVideoOtpWindow(fakeClient(h) as never, 'patient-A', '2026-03-20T12:00:00Z'),
    ).rejects.toThrow(/fetchVideoOtpWindow.*timeout/);
  });
});

// ============================================================================
// Task 44's OTP verify UPSERT — `upsertVideoOtpWindow`
// ============================================================================

describe('upsertVideoOtpWindow (Task 44 OTP-verify write)', () => {
  it('upserts with onConflict=patient_id and returns the persisted row', async () => {
    const h = buildChain({
      data: {
        patient_id:             'patient-A',
        last_otp_verified_at:   '2026-04-19T10:00:00Z',
        last_otp_verified_via:  'sms',
        correlation_id:         null,
      },
      error: null,
    });

    const row = await upsertVideoOtpWindow(fakeClient(h) as never, {
      patientId:          'patient-A',
      lastOtpVerifiedAt:  '2026-04-19T10:00:00Z',
      lastOtpVerifiedVia: 'sms',
    });

    expect(h.fromMock).toHaveBeenCalledWith('video_otp_window');
    expect(h.calls.map((c) => c.method)).toEqual([
      'upsert',
      'select',
      'single',
    ]);
    expect(h.calls[0].args[0]).toEqual({
      patient_id:             'patient-A',
      last_otp_verified_at:   '2026-04-19T10:00:00Z',
      last_otp_verified_via:  'sms',
      correlation_id:         null,
    });
    expect(h.calls[0].args[1]).toEqual({ onConflict: 'patient_id' });
    expect(row.patientId).toBe('patient-A');
    expect(row.lastOtpVerifiedVia).toBe('sms');
  });
});
