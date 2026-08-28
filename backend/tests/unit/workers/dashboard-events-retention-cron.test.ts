/**
 * Unit tests for `dashboard-events-retention-cron.ts` (alerts-v2 · alr2-05).
 *
 * Pins the sacred unread predicate + per-tick cap:
 *   - acknowledged + older-than-N → deleted
 *   - acknowledged + within-N → not selected (kept)
 *   - unread (any age) → not selected (kept)
 *   - select limit === BATCH_SIZE_CAP
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: { DASHBOARD_EVENTS_RETENTION_DAYS: 90 },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import * as database from '../../../src/config/database';
import {
  __testInternals,
  runDashboardEventsRetentionJob,
} from '../../../src/workers/dashboard-events-retention-cron';

const mockedDb = database as jest.Mocked<typeof database>;

interface Capture {
  notArgs: unknown[] | null;
  ltArgs: unknown[] | null;
  limitArg: number | null;
  deleteIds: string[] | null;
}

function buildAdminMock(opts: {
  scanIds?: string[];
  scanError?: { message: string } | null;
  deleteError?: { message: string } | null;
  deleteCount?: number | null;
  capture: Capture;
}) {
  const capture = opts.capture;

  return {
    from: (table: string) => {
      if (table !== 'doctor_dashboard_events') {
        throw new Error(`unexpected table ${table}`);
      }

      // Shared chain builder; terminal differs for select vs delete.
      const chain: Record<string, unknown> = {};
      const self = () => chain;

      chain.select = self;
      chain.not = (...args: unknown[]) => {
        capture.notArgs = args;
        return chain;
      };
      chain.lt = (...args: unknown[]) => {
        capture.ltArgs = args;
        return chain;
      };
      chain.order = self;
      chain.limit = (n: number) => {
        capture.limitArg = n;
        return Promise.resolve({
          data:  opts.scanError ? null : (opts.scanIds ?? []).map((id) => ({ id })),
          error: opts.scanError ?? null,
        });
      };

      chain.delete = (_opts?: { count?: string }) => {
        const delChain: Record<string, unknown> = {};
        delChain.in = (_col: string, ids: string[]) => {
          capture.deleteIds = ids;
          return Promise.resolve({
            data:  null,
            error: opts.deleteError ?? null,
            count: opts.deleteCount ?? ids.length,
          });
        };
        return delChain;
      };

      return chain;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('runDashboardEventsRetentionJob', () => {
  it('deletes acknowledged rows older than N days', async () => {
    const capture: Capture = {
      notArgs: null,
      ltArgs: null,
      limitArg: null,
      deleteIds: null,
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        scanIds: ['evt-old-1', 'evt-old-2'],
        capture,
      }) as never,
    );

    const result = await runDashboardEventsRetentionJob('corr-1');

    expect(capture.notArgs).toEqual(['acknowledged_at', 'is', null]);
    expect(capture.ltArgs?.[0]).toBe('acknowledged_at');
    // 90 days before frozen now
    expect(capture.ltArgs?.[1]).toBe('2026-04-22T12:00:00.000Z');
    expect(capture.limitArg).toBe(__testInternals.BATCH_SIZE_CAP);
    expect(capture.deleteIds).toEqual(['evt-old-1', 'evt-old-2']);
    expect(result).toEqual({
      retentionDays: 90,
      scanned:       2,
      deleted:       2,
      errors:        0,
    });
  });

  it('keeps the feed when the scan returns no candidates (within-N / unread filtered by SQL)', async () => {
    const capture: Capture = {
      notArgs: null,
      ltArgs: null,
      limitArg: null,
      deleteIds: null,
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({ scanIds: [], capture }) as never,
    );

    const result = await runDashboardEventsRetentionJob('corr-empty');

    expect(capture.notArgs).toEqual(['acknowledged_at', 'is', null]);
    expect(capture.deleteIds).toBeNull();
    expect(result).toEqual({
      retentionDays: 90,
      scanned:       0,
      deleted:       0,
      errors:        0,
    });
  });

  it('caps the select at BATCH_SIZE_CAP', async () => {
    const capture: Capture = {
      notArgs: null,
      ltArgs: null,
      limitArg: null,
      deleteIds: null,
    };
    const many = Array.from(
      { length: __testInternals.BATCH_SIZE_CAP },
      (_, i) => `evt-${i}`,
    );
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({ scanIds: many, capture }) as never,
    );

    const result = await runDashboardEventsRetentionJob('corr-cap');

    expect(capture.limitArg).toBe(200);
    expect(result.scanned).toBe(200);
    expect(result.deleted).toBe(200);
    expect(capture.deleteIds).toHaveLength(200);
  });

  it('counts a scan error without throwing', async () => {
    const capture: Capture = {
      notArgs: null,
      ltArgs: null,
      limitArg: null,
      deleteIds: null,
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        scanError: { message: 'boom' },
        capture,
      }) as never,
    );

    const result = await runDashboardEventsRetentionJob('corr-scan-err');

    expect(capture.deleteIds).toBeNull();
    expect(result.errors).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it('counts a delete error without throwing', async () => {
    const capture: Capture = {
      notArgs: null,
      ltArgs: null,
      limitArg: null,
      deleteIds: null,
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        scanIds:     ['evt-1'],
        deleteError: { message: 'delete boom' },
        capture,
      }) as never,
    );

    const result = await runDashboardEventsRetentionJob('corr-del-err');

    expect(capture.deleteIds).toEqual(['evt-1']);
    expect(result.errors).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it('returns empty totals when admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    const result = await runDashboardEventsRetentionJob('corr-no-admin');

    expect(result).toEqual({
      retentionDays: 90,
      scanned:       0,
      deleted:       0,
      errors:        0,
    });
  });
});
