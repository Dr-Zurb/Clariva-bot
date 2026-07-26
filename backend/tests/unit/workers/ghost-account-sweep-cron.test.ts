/**
 * Unit tests for `ghost-account-sweep-cron.ts` (auth-v2 · Model C).
 *
 * Pins the load-bearing "keep" predicates (a wrong one is an irreversible
 * delete of a real doctor) and the dry-run default:
 *   - ghost (incomplete + past grace + no verification + no data) → deleted
 *   - dry-run (flag off) → candidate identified, nothing deleted
 *   - completed profile / too-new / admin / verified / has-appointments → kept
 *   - engagement-check error → kept (never delete on incomplete evidence)
 *   - delete cap bounds deletes per tick
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { User } from '@supabase/supabase-js';

const mockEnv = {
  GHOST_ACCOUNT_SWEEP_ENABLED: false,
  GHOST_ACCOUNT_SWEEP_MIN_AGE_DAYS: 7,
};

jest.mock('../../../src/config/env', () => ({ env: mockEnv }));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import * as database from '../../../src/config/database';
import {
  __testInternals,
  runGhostAccountSweepJob,
} from '../../../src/workers/ghost-account-sweep-cron';

const mockedDb = database as jest.Mocked<typeof database>;

const DAY_MS = 24 * 60 * 60 * 1000;

interface UserData {
  verificationStatus?: string;
  appointmentCount?: number;
  verificationError?: string;
  appointmentError?: string;
}

function mkUser(
  id: string,
  opts: {
    ageDays?: number;
    profileCompleted?: boolean;
    role?: string;
    appRole?: string;
  } = {},
): User {
  const created = new Date(
    Date.now() - (opts.ageDays ?? 30) * DAY_MS,
  ).toISOString();
  return {
    id,
    created_at: created,
    user_metadata: {
      ...(opts.profileCompleted ? { profile_completed: true } : {}),
      ...(opts.role ? { role: opts.role } : {}),
    },
    app_metadata: {
      ...(opts.appRole ? { role: opts.appRole } : {}),
    },
  } as unknown as User;
}

function buildAdminMock(opts: {
  pages: User[][];
  listError?: { message: string };
  perUser?: Record<string, UserData>;
  deleteErrors?: Record<string, string>;
  deleted: string[];
}) {
  const perUser = opts.perUser ?? {};

  return {
    auth: {
      admin: {
        listUsers: (args: { page: number; perPage: number }) => {
          if (opts.listError) {
            return Promise.resolve({ data: null, error: opts.listError });
          }
          const users = opts.pages[args.page - 1] ?? [];
          return Promise.resolve({ data: { users }, error: null });
        },
        deleteUser: (id: string) => {
          const err = opts.deleteErrors?.[id];
          if (err) return Promise.resolve({ data: null, error: { message: err } });
          opts.deleted.push(id);
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
    from: (table: string) => {
      if (table === 'doctor_verification') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: () => {
                const u = perUser[id];
                if (u?.verificationError) {
                  return Promise.resolve({
                    data: null,
                    error: { message: u.verificationError },
                  });
                }
                return Promise.resolve({
                  data: u?.verificationStatus
                    ? { status: u.verificationStatus }
                    : null,
                  error: null,
                });
              },
            }),
          }),
        };
      }
      if (table === 'appointments') {
        return {
          select: (_cols: string, _o?: unknown) => ({
            eq: (_col: string, id: string) => {
              const u = perUser[id];
              if (u?.appointmentError) {
                return Promise.resolve({
                  count: null,
                  error: { message: u.appointmentError },
                });
              }
              return Promise.resolve({
                count: u?.appointmentCount ?? 0,
                error: null,
              });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = false;
  mockEnv.GHOST_ACCOUNT_SWEEP_MIN_AGE_DAYS = 7;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('runGhostAccountSweepJob', () => {
  it('deletes a ghost account when the sweep is enabled', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('ghost-1', { ageDays: 30 })]],
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-del');

    expect(deleted).toEqual(['ghost-1']);
    expect(result).toMatchObject({
      dryRun: false,
      scanned: 1,
      candidates: 1,
      deleted: 1,
      errors: 0,
    });
  });

  it('identifies but does not delete in dry-run (flag off)', async () => {
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('ghost-1', { ageDays: 30 })]],
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-dry');

    expect(deleted).toEqual([]);
    expect(result).toMatchObject({
      dryRun: true,
      scanned: 1,
      candidates: 1,
      deleted: 0,
      errors: 0,
    });
  });

  it('keeps accounts that completed onboarding', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('done-1', { ageDays: 30, profileCompleted: true })]],
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-done');

    expect(deleted).toEqual([]);
    expect(result.candidates).toBe(0);
    expect(result.scanned).toBe(1);
  });

  it('keeps accounts younger than the grace window', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('fresh-1', { ageDays: 1 })]],
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-fresh');

    expect(deleted).toEqual([]);
    expect(result.candidates).toBe(0);
  });

  it('never touches admin accounts', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('admin-1', { ageDays: 90, appRole: 'admin' })]],
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-admin');

    expect(deleted).toEqual([]);
    expect(result.candidates).toBe(0);
  });

  it('keeps accounts with a submitted/reviewed verification', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('verif-1', { ageDays: 30 })]],
        perUser: { 'verif-1': { verificationStatus: 'pending_review' } },
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-verif');

    expect(deleted).toEqual([]);
    expect(result.candidates).toBe(0);
  });

  it('sweeps an account whose only verification row is a bare "unverified"', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('unverif-1', { ageDays: 30 })]],
        perUser: { 'unverif-1': { verificationStatus: 'unverified' } },
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-unverif');

    expect(deleted).toEqual(['unverif-1']);
    expect(result.candidates).toBe(1);
  });

  it('keeps accounts that own appointments', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('appt-1', { ageDays: 30 })]],
        perUser: { 'appt-1': { appointmentCount: 2 } },
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-appt');

    expect(deleted).toEqual([]);
    expect(result.candidates).toBe(0);
  });

  it('keeps the account (counts an error) when an engagement check fails', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [[mkUser('err-1', { ageDays: 30 })]],
        perUser: { 'err-1': { verificationError: 'boom' } },
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-check-err');

    expect(deleted).toEqual([]);
    expect(result.candidates).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('bounds deletes to DELETE_CAP_PER_TICK', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    const cap = __testInternals.DELETE_CAP_PER_TICK;
    const many = Array.from({ length: cap + 5 }, (_, i) =>
      mkUser(`ghost-${i}`, { ageDays: 30 }),
    );
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({ pages: [many], deleted }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-cap');

    expect(result.candidates).toBe(cap + 5);
    expect(result.deleted).toBe(cap);
    expect(deleted).toHaveLength(cap);
  });

  it('counts a listUsers error without throwing', async () => {
    mockEnv.GHOST_ACCOUNT_SWEEP_ENABLED = true;
    const deleted: string[] = [];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        pages: [],
        listError: { message: 'list boom' },
        deleted,
      }) as never,
    );

    const result = await runGhostAccountSweepJob('corr-list-err');

    expect(result.errors).toBe(1);
    expect(result.deleted).toBe(0);
    expect(result.candidates).toBe(0);
  });

  it('returns empty totals when the admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    const result = await runGhostAccountSweepJob('corr-no-admin');

    expect(result).toEqual({
      dryRun: true,
      minAgeDays: 7,
      scanned: 0,
      candidates: 0,
      deleted: 0,
      errors: 0,
    });
  });
});
