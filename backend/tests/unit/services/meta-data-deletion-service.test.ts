/**
 * Meta data-deletion service unit tests (instagram-launch-readiness · ilr-02).
 *
 * Covers the load-bearing behavior:
 *   - a matching Facebook user_id disconnects that doctor and records 'completed',
 *   - an unmatched user_id records 'no_match' and touches nothing,
 *   - lookup / disconnect failures degrade to 'failed' WITHOUT throwing
 *     (Meta must still get a confirmation code),
 *   - the audit row captures meta_user_id + matched doctor + completed_at,
 *   - status lookup maps hits, misses, and errors to a safe value.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  recordAndProcessMetaDeletion,
  getMetaDeletionStatus,
} from '../../../src/services/meta-data-deletion-service';
import * as database from '../../../src/config/database';
import { disconnectInstagram } from '../../../src/services/instagram-connect-service';

jest.mock('../../../src/config/database');
jest.mock('../../../src/services/instagram-connect-service', () => ({
  disconnectInstagram: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockedDb = database as jest.Mocked<typeof database>;
const mockedDisconnect = disconnectInstagram as jest.MockedFunction<typeof disconnectInstagram>;

const metaUserId = 'fb-user-123';
const correlationId = 'corr-del';

interface TableResult {
  data: unknown;
  error: unknown;
}

/**
 * Chainable Supabase admin mock. `from(table)` routes maybeSingle to the right
 * canned result; `insert` captures the payload and resolves `{ error }`.
 */
function makeAdmin(opts: {
  doctorLookup?: TableResult;
  statusLookup?: TableResult;
  insertError?: unknown;
}) {
  const captured: { insert?: Record<string, unknown>; fromTables: string[] } = {
    fromTables: [],
  };

  const makeBuilder = (table: string): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      insert: jest.fn((payload: Record<string, unknown>) => {
        captured.insert = payload;
        return Promise.resolve({ error: opts.insertError ?? null });
      }),
      maybeSingle: jest.fn(() =>
        Promise.resolve(
          table === 'doctor_instagram'
            ? opts.doctorLookup ?? { data: null, error: null }
            : opts.statusLookup ?? { data: null, error: null }
        )
      ),
    };
    return builder;
  };

  const admin = {
    from: jest.fn((table: string) => {
      captured.fromTables.push(table);
      return makeBuilder(table);
    }),
  };

  mockedDb.getSupabaseAdminClient.mockReturnValue(
    admin as unknown as ReturnType<typeof database.getSupabaseAdminClient>
  );

  return { admin, captured };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('recordAndProcessMetaDeletion', () => {
  it('matched user_id → disconnects the doctor and records completed', async () => {
    const { captured } = makeAdmin({ doctorLookup: { data: { doctor_id: 'doc-1' }, error: null } });
    mockedDisconnect.mockResolvedValueOnce(undefined);

    const res = await recordAndProcessMetaDeletion(metaUserId, correlationId);

    expect(res.status).toBe('completed');
    expect(res.confirmationCode).toMatch(/^del-/);
    expect(mockedDisconnect).toHaveBeenCalledWith('doc-1', correlationId);
    expect(captured.insert).toMatchObject({
      confirmation_code: res.confirmationCode,
      meta_user_id: metaUserId,
      status: 'completed',
      matched_doctor_id: 'doc-1',
    });
    expect(captured.insert?.completed_at).toEqual(expect.any(String));
  });

  it('unmatched user_id → records no_match and never disconnects', async () => {
    const { captured } = makeAdmin({ doctorLookup: { data: null, error: null } });

    const res = await recordAndProcessMetaDeletion(metaUserId, correlationId);

    expect(res.status).toBe('no_match');
    expect(mockedDisconnect).not.toHaveBeenCalled();
    expect(captured.insert).toMatchObject({
      status: 'no_match',
      matched_doctor_id: null,
      completed_at: null,
    });
  });

  it('disconnect failure → degrades to failed without throwing', async () => {
    const { captured } = makeAdmin({ doctorLookup: { data: { doctor_id: 'doc-1' }, error: null } });
    mockedDisconnect.mockRejectedValueOnce(new Error('boom'));

    const res = await recordAndProcessMetaDeletion(metaUserId, correlationId);

    expect(res.status).toBe('failed');
    expect(res.confirmationCode).toMatch(/^del-/);
    // The matched doctor is still recorded so ops know whose disconnect to retry.
    expect(captured.insert).toMatchObject({ status: 'failed', matched_doctor_id: 'doc-1' });
  });

  it('lookup error → degrades to failed without throwing', async () => {
    makeAdmin({ doctorLookup: { data: null, error: { code: 'PGRST500' } } });

    const res = await recordAndProcessMetaDeletion(metaUserId, correlationId);

    expect(res.status).toBe('failed');
    expect(mockedDisconnect).not.toHaveBeenCalled();
  });

  it('admin client unavailable → still returns a confirmation code (no throw)', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      null as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    const res = await recordAndProcessMetaDeletion(metaUserId, correlationId);

    expect(res.confirmationCode).toMatch(/^del-/);
    expect(mockedDisconnect).not.toHaveBeenCalled();
  });
});

describe('getMetaDeletionStatus', () => {
  it('returns the stored status for a known code', async () => {
    makeAdmin({ statusLookup: { data: { status: 'completed' }, error: null } });
    await expect(getMetaDeletionStatus('del-abc', correlationId)).resolves.toBe('completed');
  });

  it('returns unknown for a missing code', async () => {
    makeAdmin({ statusLookup: { data: null, error: null } });
    await expect(getMetaDeletionStatus('del-missing', correlationId)).resolves.toBe('unknown');
  });

  it('returns unknown when lookup errors', async () => {
    makeAdmin({ statusLookup: { data: null, error: { code: 'PGRST500' } } });
    await expect(getMetaDeletionStatus('del-err', correlationId)).resolves.toBe('unknown');
  });

  it('returns unknown when admin client unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      null as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    await expect(getMetaDeletionStatus('del-x', correlationId)).resolves.toBe('unknown');
  });
});
