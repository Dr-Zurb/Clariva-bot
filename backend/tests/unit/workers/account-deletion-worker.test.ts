/**
 * Unit tests for `workers/account-deletion-worker.ts` (Plan 02 · Task 33).
 *
 * Covers:
 *   - `requestAccountDeletion`   — happy path writes audit row, computes
 *                                  grace window, and returns the row id.
 *                                  Second call while pending reuses the
 *                                  existing row (idempotent self-serve).
 *                                  Missing patient → NotFoundError.
 *
 *   - `cancelAccountDeletion`    — cancels the pending row before grace.
 *                                  Throws `ValidationError` after grace
 *                                  or when there is no pending row.
 *
 *   - `finalizeAccountDeletion`  — idempotent: no-op when already
 *                                  finalized / cancelled. Happy path
 *                                  writes revocation, scrubs patient
 *                                  PII, stamps audit, and returns the
 *                                  prefix list. PII scrub is proved to
 *                                  happen via the mocked helper; the
 *                                  deeper "appointments untouched"
 *                                  property lives in the pii-scrub test.
 *
 * The Supabase mock is driven by a per-test table-router — each test
 * declares what it wants each table to return (select / insert /
 * update). This keeps the assertions close to the behavior we care
 * about and avoids a kitchen-sink mock that drifts from the unit.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (registered before unit-under-test import).
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    ACCOUNT_DELETION_GRACE_DAYS: 7,
  },
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn().mockReturnValue(Promise.resolve()),
}));

jest.mock('../../../src/services/ai-service', () => ({
  redactPhiForAI: jest.fn((s: string) => s),
}));

jest.mock('../../../src/services/account-deletion-pii-scrub', () => ({
  scrubPatientPiiFromLogs: jest.fn().mockReturnValue(Promise.resolve({ scrubbed: true })),
}));

jest.mock('../../../src/services/instagram-service', () => ({
  sendInstagramMessage: jest.fn().mockReturnValue(Promise.resolve({ ok: true })),
}));

jest.mock('../../../src/services/instagram-connect-service', () => ({
  getInstagramAccessTokenForDoctor: jest
    .fn()
    .mockReturnValue(Promise.resolve('ig-token')),
}));

jest.mock('../../../src/services/twilio-sms-service', () => ({
  sendSms: jest.fn().mockReturnValue(Promise.resolve(true)),
}));

jest.mock('../../../src/config/email', () => ({
  sendEmail: jest.fn().mockReturnValue(Promise.resolve(true)),
}));

import {
  cancelAccountDeletion,
  enumerateArtifactPrefixes,
  finalizeAccountDeletion,
  requestAccountDeletion,
} from '../../../src/workers/account-deletion-worker';
import {
  InternalError,
  NotFoundError,
  ValidationError,
} from '../../../src/utils/errors';
import * as database from '../../../src/config/database';
import * as scrubModule from '../../../src/services/account-deletion-pii-scrub';
import * as igService from '../../../src/services/instagram-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedScrub = scrubModule as jest.Mocked<typeof scrubModule>;
const mockedIg = igService as jest.Mocked<typeof igService>;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Supabase mock harness — a small per-table router.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface TableHandlers {
  /** For `.select(...).eq(...).maybeSingle()` returning a single row (or null). */
  singleSelectResult?: { data: Row | null; error: { message: string } | null };
  /** For `.select(...).is(...).is(...).order(...).limit(...).maybeSingle()` chains. */
  filteredSingleResult?: { data: Row | null; error: { message: string } | null };
  /** For `.insert(...).select(...).single()`. */
  insertResult?: { data: Row | null; error: { message: string } | null };
  /** For `.update(...).eq(...)`. Triggered by any update call. */
  updateResult?: { data: Row | null; error: { message: string } | null };
  /** For `.upsert(...)`. */
  upsertResult?: { data: Row | null; error: { message: string } | null };
  /** For `.select(...).eq(...)` returning an array (cron scan shape). */
  selectListResult?: { data: Row[] | null; error: { message: string } | null };
}

function makeChainable(
  calls: { inserts: Row[]; updates: Row[]; upserts: Row[] },
  handlers: TableHandlers,
): any {
  const res = <T>(value: T) => Promise.resolve(value);

  const buildSelectChain = () => {
    const leaf = {
      maybeSingle: () =>
        res(
          handlers.filteredSingleResult ??
            handlers.singleSelectResult ?? {
              data: null,
              error: null,
            },
        ),
      single: () =>
        res(
          handlers.singleSelectResult ?? { data: null, error: null },
        ),
      then: undefined,
    };
    // Pretend every chained filter returns this leaf until maybeSingle / single.
    const proxy: any = new Proxy(leaf, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        // any method name returns the proxy (so `.eq().is().order().limit()` all chain).
        return () => proxy;
      },
    });
    return proxy;
  };

  return {
    select: jest.fn(() => buildSelectChain()),
    insert: jest.fn((...args: unknown[]) => {
      calls.inserts.push(args[0] as Row);
      return {
        select: jest.fn().mockReturnValue({
          single: () => res(handlers.insertResult ?? { data: null, error: null }),
        }),
      };
    }),
    update: jest.fn((...args: unknown[]) => {
      calls.updates.push(args[0] as Row);
      return {
        eq: jest
          .fn()
          .mockReturnValue(res(handlers.updateResult ?? { data: null, error: null })),
      };
    }),
    upsert: jest.fn((...args: unknown[]) => {
      calls.upserts.push(args[0] as Row);
      return res(handlers.upsertResult ?? { data: null, error: null });
    }),
  };
}

function buildAdminClient(perTable: Record<string, TableHandlers>): {
  client: ReturnType<typeof mockedDb.getSupabaseAdminClient>;
  calls: Record<string, { inserts: Row[]; updates: Row[]; upserts: Row[] }>;
} {
  const calls: Record<string, { inserts: Row[]; updates: Row[]; upserts: Row[] }> = {};
  const from = jest.fn((...args: unknown[]) => {
    const table = args[0] as string;
    if (!calls[table]) calls[table] = { inserts: [], updates: [], upserts: [] };
    const handlers = perTable[table] ?? {};
    return makeChainable(calls[table]!, handlers);
  });
  const client = { from } as unknown as ReturnType<
    typeof mockedDb.getSupabaseAdminClient
  >;
  return { client, calls };
}

// ---------------------------------------------------------------------------
// enumerateArtifactPrefixes
// ---------------------------------------------------------------------------

describe('enumerateArtifactPrefixes', () => {
  it('returns the single recordings/patient_<id>/ prefix for v1', () => {
    expect(enumerateArtifactPrefixes('p-abc')).toEqual([
      'recordings/patient_p-abc/',
    ]);
  });
});

// ---------------------------------------------------------------------------
// requestAccountDeletion
// ---------------------------------------------------------------------------

describe('requestAccountDeletion', () => {
  it('writes an audit row and returns the grace cutoff', async () => {
    const { client, calls } = buildAdminClient({
      patients: {
        singleSelectResult: { data: { id: 'p-1' }, error: null },
      },
      account_deletion_audit: {
        filteredSingleResult: { data: null, error: null },
        insertResult: {
          data: {
            id: 'audit-1',
            grace_window_until: '2026-05-01T00:00:00.000Z',
          },
          error: null,
        },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    const res = await requestAccountDeletion({
      patientId: 'p-1',
      requestedBy: 'p-1',
      correlationId: 'c-1',
      reason: '  not using anymore — contact me at 555-0100  ',
    });

    expect(res.auditId).toBe('audit-1');
    expect(res.reused).toBe(false);
    expect(calls.account_deletion_audit!.inserts).toHaveLength(1);
    const insert = calls.account_deletion_audit!.inserts[0]!;
    expect(insert.patient_id).toBe('p-1');
    expect(insert.requested_by).toBe('p-1');
    expect(typeof insert.grace_window_until).toBe('string');
    expect(typeof insert.reason).toBe('string');
  });

  it('reuses the existing pending audit row instead of creating a duplicate', async () => {
    const { client, calls } = buildAdminClient({
      patients: {
        singleSelectResult: { data: { id: 'p-1' }, error: null },
      },
      account_deletion_audit: {
        filteredSingleResult: {
          data: {
            id: 'audit-existing',
            grace_window_until: '2026-05-01T00:00:00.000Z',
          },
          error: null,
        },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    const res = await requestAccountDeletion({
      patientId: 'p-1',
      requestedBy: 'p-1',
      correlationId: 'c-1',
    });
    expect(res.reused).toBe(true);
    expect(res.auditId).toBe('audit-existing');
    expect(calls.account_deletion_audit!.inserts).toHaveLength(0);
  });

  it('throws NotFoundError when the patient does not exist', async () => {
    const { client } = buildAdminClient({
      patients: { singleSelectResult: { data: null, error: null } },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    await expect(
      requestAccountDeletion({
        patientId: 'missing',
        requestedBy: 'admin',
        correlationId: 'c',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws InternalError when admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    await expect(
      requestAccountDeletion({
        patientId: 'p-1',
        requestedBy: 'p-1',
        correlationId: 'c',
      }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

// ---------------------------------------------------------------------------
// cancelAccountDeletion
// ---------------------------------------------------------------------------

describe('cancelAccountDeletion', () => {
  it('cancels a pending row inside the grace window', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { client, calls } = buildAdminClient({
      account_deletion_audit: {
        filteredSingleResult: {
          data: { id: 'audit-1', grace_window_until: future },
          error: null,
        },
        updateResult: { data: null, error: null },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    await expect(
      cancelAccountDeletion({
        patientId: 'p-1',
        cancelledBy: 'p-1',
        correlationId: 'c',
      }),
    ).resolves.toBeUndefined();

    expect(calls.account_deletion_audit!.updates).toHaveLength(1);
    const update = calls.account_deletion_audit!.updates[0]!;
    expect(typeof update.cancelled_at).toBe('string');
    expect(update.cancelled_by).toBe('p-1');
  });

  it('throws ValidationError when there is no pending row', async () => {
    const { client } = buildAdminClient({
      account_deletion_audit: {
        filteredSingleResult: { data: null, error: null },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);
    await expect(
      cancelAccountDeletion({
        patientId: 'p-1',
        cancelledBy: 'p-1',
        correlationId: 'c',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when the grace window has expired', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { client } = buildAdminClient({
      account_deletion_audit: {
        filteredSingleResult: {
          data: { id: 'audit-1', grace_window_until: past },
          error: null,
        },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);
    await expect(
      cancelAccountDeletion({
        patientId: 'p-1',
        cancelledBy: 'p-1',
        correlationId: 'c',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// finalizeAccountDeletion
// ---------------------------------------------------------------------------

describe('finalizeAccountDeletion', () => {
  it('writes revocation + scrubs PII + stamps audit on the happy path', async () => {
    const { client, calls } = buildAdminClient({
      account_deletion_audit: {
        filteredSingleResult: {
          data: {
            id: 'audit-1',
            finalized_at: null,
            cancelled_at: null,
            grace_window_until: '2020-01-01T00:00:00.000Z',
            requested_by: 'p-1',
          },
          error: null,
        },
        updateResult: { data: null, error: null },
      },
      signed_url_revocation: {
        upsertResult: { data: null, error: null },
      },
      conversations: {
        filteredSingleResult: {
          data: {
            doctor_id: 'd-1',
            platform: 'instagram',
            platform_conversation_id: 'ig-psid-1',
          },
          error: null,
        },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    const res = await finalizeAccountDeletion({
      patientId: 'p-1',
      correlationId: 'c-1',
    });

    expect(res.executed).toBe(true);
    expect(res.revokedPrefixes).toEqual(['recordings/patient_p-1/']);
    expect(calls.signed_url_revocation!.upserts).toHaveLength(1);
    const upsert = calls.signed_url_revocation!.upserts[0]!;
    expect(upsert.url_prefix).toBe('recordings/patient_p-1/');
    expect(upsert.revocation_reason).toBe('account_deleted');

    expect(mockedScrub.scrubPatientPiiFromLogs).toHaveBeenCalledWith({
      patientId: 'p-1',
      correlationId: 'c-1',
    });

    const auditUpdate = calls.account_deletion_audit!.updates[0]!;
    expect(typeof auditUpdate.finalized_at).toBe('string');
    expect(auditUpdate.artifact_prefix_count).toBe(1);

    expect(mockedIg.sendInstagramMessage).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the audit row is already finalized', async () => {
    const { client, calls } = buildAdminClient({
      account_deletion_audit: {
        filteredSingleResult: {
          data: {
            id: 'audit-1',
            finalized_at: '2026-04-25T00:00:00.000Z',
            cancelled_at: null,
            grace_window_until: '2026-04-20T00:00:00.000Z',
            requested_by: 'p-1',
          },
          error: null,
        },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    const res = await finalizeAccountDeletion({
      patientId: 'p-1',
      correlationId: 'c-1',
    });
    expect(res.executed).toBe(false);
    expect(res.revokedPrefixes).toEqual(['recordings/patient_p-1/']);
    expect(mockedScrub.scrubPatientPiiFromLogs).not.toHaveBeenCalled();
    expect(calls.signed_url_revocation?.upserts ?? []).toHaveLength(0);
  });

  it('is a no-op when the audit row is cancelled', async () => {
    const { client } = buildAdminClient({
      account_deletion_audit: {
        filteredSingleResult: {
          data: {
            id: 'audit-1',
            finalized_at: null,
            cancelled_at: '2026-04-22T00:00:00.000Z',
            grace_window_until: '2026-04-25T00:00:00.000Z',
            requested_by: 'p-1',
          },
          error: null,
        },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    const res = await finalizeAccountDeletion({
      patientId: 'p-1',
      correlationId: 'c-1',
    });
    expect(res.executed).toBe(false);
    expect(res.revokedPrefixes).toEqual([]);
    expect(mockedScrub.scrubPatientPiiFromLogs).not.toHaveBeenCalled();
  });

  it('returns empty result when no audit row exists for the patient', async () => {
    const { client } = buildAdminClient({
      account_deletion_audit: {
        filteredSingleResult: { data: null, error: null },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    const res = await finalizeAccountDeletion({
      patientId: 'p-1',
      correlationId: 'c-1',
    });
    expect(res.executed).toBe(false);
    expect(res.revokedPrefixes).toEqual([]);
  });

  it('still stamps audit even when the explainer DM fails', async () => {
    mockedIg.sendInstagramMessage.mockImplementationOnce(() =>
      Promise.reject(new Error('ig-down')),
    );
    const { client, calls } = buildAdminClient({
      account_deletion_audit: {
        filteredSingleResult: {
          data: {
            id: 'audit-1',
            finalized_at: null,
            cancelled_at: null,
            grace_window_until: '2020-01-01T00:00:00.000Z',
            requested_by: 'p-1',
          },
          error: null,
        },
        updateResult: { data: null, error: null },
      },
      signed_url_revocation: {
        upsertResult: { data: null, error: null },
      },
      conversations: {
        filteredSingleResult: {
          data: {
            doctor_id: 'd-1',
            platform: 'instagram',
            platform_conversation_id: 'ig-psid-1',
          },
          error: null,
        },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client);

    const res = await finalizeAccountDeletion({
      patientId: 'p-1',
      correlationId: 'c-1',
    });
    expect(res.executed).toBe(true);
    expect(calls.account_deletion_audit!.updates).toHaveLength(1);
  });
});
