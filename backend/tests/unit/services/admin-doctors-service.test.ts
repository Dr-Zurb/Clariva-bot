/**
 * Admin Doctors Directory Service tests (admin-console-v3 · acon3-01; auth-v2).
 *
 * Covers funnelStatus derivation buckets + LEFT-join (verification without
 * settings still returns). Invite/`password_set` signals retired.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database');
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  deriveFunnelStatus,
  listAdminDoctors,
} from '../../../src/services/admin-doctors-service';
import * as database from '../../../src/config/database';
import { InternalError } from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const correlationId = 'corr-admin-doctors';

function makeAdmin(opts: {
  users?: Array<Record<string, unknown>>;
  settings?: Array<Record<string, unknown>>;
  verifications?: Array<Record<string, unknown>>;
  settingsError?: unknown;
  verificationError?: unknown;
  listUsersError?: unknown;
}) {
  const listUsers = jest.fn(() =>
    Promise.resolve(
      opts.listUsersError
        ? { data: null, error: opts.listUsersError }
        : { data: { users: opts.users ?? [] }, error: null },
    ),
  );

  const from = jest.fn((table: string) => {
    const rows =
      table === 'doctor_settings'
        ? (opts.settings ?? [])
        : (opts.verifications ?? []);
    const err =
      table === 'doctor_settings'
        ? opts.settingsError ?? null
        : opts.verificationError ?? null;

    const builder = {
      select: jest.fn(() => builder),
      in: jest.fn(() => Promise.resolve({ data: err ? null : rows, error: err })),
    };
    return builder;
  });

  const admin = {
    auth: { admin: { listUsers } },
    from,
  };

  mockedDb.getSupabaseAdminClient.mockReturnValue(
    admin as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
  );

  return { listUsers, from };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('deriveFunnelStatus', () => {
  it('passes through pending_review / verified / rejected / changes_requested', () => {
    expect(
      deriveFunnelStatus({ verificationStatus: 'pending_review' }),
    ).toBe('pending_review');
    expect(deriveFunnelStatus({ verificationStatus: 'verified' })).toBe(
      'verified',
    );
    expect(deriveFunnelStatus({ verificationStatus: 'rejected' })).toBe(
      'rejected',
    );
    expect(
      deriveFunnelStatus({ verificationStatus: 'changes_requested' }),
    ).toBe('changes_requested');
  });

  it('maps null / unverified to onboarding', () => {
    expect(deriveFunnelStatus({ verificationStatus: null })).toBe('onboarding');
    expect(deriveFunnelStatus({ verificationStatus: 'unverified' })).toBe(
      'onboarding',
    );
  });
});

describe('listAdminDoctors', () => {
  it('aggregates auth + settings + verification into funnel buckets', async () => {
    const onboardingId = '22222222-2222-4222-8222-222222222222';
    const pendingId = '33333333-3333-4333-8333-333333333333';
    const verifiedId = '44444444-4444-4444-8444-444444444444';
    const rejectedId = '55555555-5555-4555-8555-555555555555';

    makeAdmin({
      users: [
        {
          id: onboardingId,
          email: 'onboarding@example.com',
          created_at: '2026-07-21T10:00:00Z',
          user_metadata: { full_name: 'Onboarding Doc' },
        },
        {
          id: pendingId,
          email: 'pending@example.com',
          created_at: '2026-07-20T10:00:00Z',
          user_metadata: {},
        },
        {
          id: verifiedId,
          email: 'verified@example.com',
          created_at: '2026-07-19T10:00:00Z',
          user_metadata: {},
        },
        {
          id: rejectedId,
          email: 'rejected@example.com',
          created_at: '2026-07-18T10:00:00Z',
          user_metadata: {},
        },
      ],
      settings: [
        {
          doctor_id: onboardingId,
          practice_name: 'Onboard Clinic',
          specialty: null,
        },
      ],
      verifications: [
        {
          doctor_id: pendingId,
          status: 'pending_review',
          full_name: 'Pending Doc',
          specialty: 'Cardio',
        },
        {
          doctor_id: verifiedId,
          status: 'verified',
          full_name: 'Verified Doc',
          specialty: null,
        },
        {
          doctor_id: rejectedId,
          status: 'rejected',
          full_name: 'Rejected Doc',
          specialty: null,
        },
      ],
    });

    const items = await listAdminDoctors(correlationId);
    expect(items.map((i) => i.funnelStatus)).toEqual([
      'onboarding',
      'pending_review',
      'verified',
      'rejected',
    ]);
    expect(items[0]).toMatchObject({
      doctorId: onboardingId,
      email: 'onboarding@example.com',
      fullName: 'Onboarding Doc',
      practiceName: 'Onboard Clinic',
      verificationStatus: null,
    });
    expect(items[1]).toMatchObject({
      doctorId: pendingId,
      fullName: 'Pending Doc',
      practiceName: null,
      specialty: 'Cardio',
      verificationStatus: 'pending_review',
    });
  });

  it('returns verification-only doctors (LEFT join when settings missing)', async () => {
    const doctorId = '66666666-6666-4666-8666-666666666666';
    makeAdmin({
      users: [
        {
          id: doctorId,
          email: 'solo@example.com',
          created_at: '2026-07-22T12:00:00Z',
          user_metadata: {},
        },
      ],
      settings: [],
      verifications: [
        {
          doctor_id: doctorId,
          status: 'pending_review',
          full_name: 'Solo Doc',
          specialty: 'Ortho',
        },
      ],
    });

    const items = await listAdminDoctors(correlationId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      doctorId,
      email: 'solo@example.com',
      fullName: 'Solo Doc',
      practiceName: null,
      specialty: 'Ortho',
      funnelStatus: 'pending_review',
    });
  });

  it('filters by derived funnel status when provided', async () => {
    makeAdmin({
      users: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'a@example.com',
          created_at: '2026-07-22T10:00:00Z',
          user_metadata: {},
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'b@example.com',
          created_at: '2026-07-21T10:00:00Z',
          user_metadata: {},
        },
      ],
      verifications: [
        {
          doctor_id: '22222222-2222-4222-8222-222222222222',
          status: 'verified',
          full_name: 'B',
          specialty: null,
        },
      ],
    });

    const onboarding = await listAdminDoctors(correlationId, 'onboarding');
    expect(onboarding).toHaveLength(1);
    expect(onboarding[0].email).toBe('a@example.com');
  });

  it('throws InternalError when admin client missing', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    await expect(listAdminDoctors(correlationId)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
