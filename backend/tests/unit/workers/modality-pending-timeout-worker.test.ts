/**
 * Modality pending-timeout worker unit tests (Plan 09 · Task 47).
 *
 * Pins the DB-polling worker's branch behaviour without live Postgres:
 *
 *   1. Happy path: N expired rows → all flipped to 'timeout'.
 *   2. Race path: `resolvePendingRequest` returns null → counted as raced.
 *   3. Scan error: `fetchExpiredPendingRequests` throws → errors[] grows.
 *   4. Per-row error: a single resolve throws → other rows still processed.
 *   5. Empty scan: no rows → no-op.
 *   6. No admin client: returns empty result and logs.
 *
 * Mirrors the test shape from `video-escalation-timeout-worker.test.ts`.
 *
 * @see backend/src/workers/modality-pending-timeout-worker.ts
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ============================================================================
// Mocks (BEFORE importing the SUT)
// ============================================================================

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

const mockFetchExpiredPendingRequests = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockResolvePendingRequest       = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/modality-pending-requests-queries', () => ({
  fetchExpiredPendingRequests: (...a: unknown[]) => mockFetchExpiredPendingRequests(...a),
  resolvePendingRequest:       (...a: unknown[]) => mockResolvePendingRequest(...a),
}));

import * as database from '../../../src/config/database';
import { runModalityPendingTimeoutJob } from '../../../src/workers/modality-pending-timeout-worker';

const mockedDb = database as jest.Mocked<typeof database>;

// ============================================================================
// Fixtures
// ============================================================================

const expiredRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id:                'pend-expired-1',
  sessionId:         'sess-A',
  initiatedBy:       'patient',
  requestedModality: 'voice',
  reason:            null,
  presetReasonCode:  null,
  amountPaise:       null,
  razorpayOrderId:   null,
  requestedAt:       '2026-04-19T10:00:00Z',
  expiresAt:         '2026-04-19T10:01:30Z',
  respondedAt:       null,
  response:          null,
  correlationId:     'corr-row-1',
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('runModalityPendingTimeoutJob', () => {
  const stubAdmin = { from: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.getSupabaseAdminClient.mockReturnValue(stubAdmin as never);
  });

  it('returns {scanned: 0, timedOut: 0, raced: 0} on an empty backlog', async () => {
    mockFetchExpiredPendingRequests.mockResolvedValueOnce([]);

    const result = await runModalityPendingTimeoutJob('corr-job-empty');
    expect(result.scanned).toBe(0);
    expect(result.timedOut).toBe(0);
    expect(result.raced).toBe(0);
    expect(result.errors).toEqual([]);
    expect(mockResolvePendingRequest).not.toHaveBeenCalled();
  });

  it('flips every expired row to timeout (happy path)', async () => {
    const rows = [
      expiredRow({ id: 'pend-1', sessionId: 'sess-A' }),
      expiredRow({ id: 'pend-2', sessionId: 'sess-B', initiatedBy: 'doctor' }),
    ];
    mockFetchExpiredPendingRequests.mockResolvedValueOnce(rows);
    mockResolvePendingRequest.mockResolvedValue({ response: 'timeout' });

    const result = await runModalityPendingTimeoutJob('corr-job-happy');
    expect(result.scanned).toBe(2);
    expect(result.timedOut).toBe(2);
    expect(result.raced).toBe(0);
    expect(result.errors).toEqual([]);
    expect(mockResolvePendingRequest).toHaveBeenCalledTimes(2);

    // Verify the update payload.
    const call0 = mockResolvePendingRequest.mock.calls[0] as [unknown, { id: string; response: string; respondedAt: string }];
    expect(call0[1].id).toBe('pend-1');
    expect(call0[1].response).toBe('timeout');
    expect(call0[1].respondedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('counts a lost race (resolvePendingRequest returns null) without logging an error', async () => {
    mockFetchExpiredPendingRequests.mockResolvedValueOnce([
      expiredRow({ id: 'pend-raced' }),
      expiredRow({ id: 'pend-won' }),
    ]);
    // First row: raced (null); second: won.
    mockResolvePendingRequest
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ response: 'timeout' });

    const result = await runModalityPendingTimeoutJob('corr-job-race');
    expect(result.scanned).toBe(2);
    expect(result.timedOut).toBe(1);
    expect(result.raced).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('keeps processing after a per-row resolve throws (isolates failures)', async () => {
    mockFetchExpiredPendingRequests.mockResolvedValueOnce([
      expiredRow({ id: 'pend-ok-1' }),
      expiredRow({ id: 'pend-boom' }),
      expiredRow({ id: 'pend-ok-2' }),
    ]);
    mockResolvePendingRequest
      .mockResolvedValueOnce({ response: 'timeout' })
      .mockRejectedValueOnce(new Error('connection closed'))
      .mockResolvedValueOnce({ response: 'timeout' });

    const result = await runModalityPendingTimeoutJob('corr-job-mixed');
    expect(result.scanned).toBe(3);
    expect(result.timedOut).toBe(2);
    expect(result.raced).toBe(0);
    expect(result.errors).toEqual(['connection closed']);
  });

  it('returns with a scan error when fetchExpiredPendingRequests throws', async () => {
    mockFetchExpiredPendingRequests.mockRejectedValueOnce(new Error('pg timeout'));

    const result = await runModalityPendingTimeoutJob('corr-job-scanfail');
    expect(result.scanned).toBe(0);
    expect(result.timedOut).toBe(0);
    expect(result.raced).toBe(0);
    expect(result.errors).toEqual(['pg timeout']);
    expect(mockResolvePendingRequest).not.toHaveBeenCalled();
  });

  it('returns empty result when the admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(null as never);

    const result = await runModalityPendingTimeoutJob('corr-job-noadmin');
    expect(result).toEqual({
      scanned:  0,
      timedOut: 0,
      raced:    0,
      errors:   [],
    });
    expect(mockFetchExpiredPendingRequests).not.toHaveBeenCalled();
  });
});
