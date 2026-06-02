/**
 * Unit tests for `text-session-supabase.provisionCompanionChannel`
 * (Plan 06 · Task 36 · Decision 9 LOCKED).
 *
 * Separate file from `text-session-supabase.test.ts` because the new helper
 * has its own focused responsibility surface: mint an HMAC consultation-token
 * + build the patient join URL + surface the JWT TTL. The sibling suite
 * covers the adapter contract (`createSession`, `endSession`, `getJoinToken`)
 * and `sendMessage`; splitting keeps both suites under ~400 lines.
 *
 * Covers:
 *   - Happy path: URL pointed at `/c/text/{sessionId}?t={hmac}`, token +
 *     expiresAt populated, and both values verifiable.
 *   - `patientId === null`: URL + token collapse to null, `expiresAt` still set.
 *   - `sessionId` missing: defensive short-circuit (returns null).
 *   - Session not found in DB: defensive short-circuit (returns null).
 *   - `APP_BASE_URL` unset: URL null but token set (token is still useful
 *     for automated callers that build their own URLs).
 *   - `CONSULTATION_TOKEN_SECRET` unset (mint throws): partial shape — URL +
 *     token null, expiresAt still set.
 *   - Idempotency: two rapid-succession calls produce URLs with the same
 *     path + host (token payload is allowed to differ, but both tokens
 *     verify via `verifyConsultationToken`).
 *   - The helper does NOT write anything to the DB (no `insert` / `update`
 *     on the admin client).
 *
 * Supabase admin client is mocked at the module boundary; the HMAC helper
 * and env are real for integration-through semantics.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const TEST_HMAC_SECRET = 'hmac-secret-thirty-two-bytes-yes-please';

jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_JWT_SECRET: 'test-secret-thirty-two-bytes-long-please',
    CONSULTATION_TOKEN_SECRET: TEST_HMAC_SECRET,
    APP_BASE_URL: 'https://app.example.com',
    TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END: 30,
  },
}));

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

// Task 37's emitter surface is imported by `text-session-supabase` for
// the `getTextJoinToken` path — we don't exercise it here but the module
// boundary still needs satisfying.
jest.mock('../../../src/services/consultation-message-service', () => ({
  SYSTEM_SENDER_ID: '00000000-0000-0000-0000-000000000000',
  emitPartyJoined: jest.fn(async () => {}),
}));

import * as database from '../../../src/config/database';
import { provisionCompanionChannel } from '../../../src/services/text-session-supabase';
import { verifyConsultationToken } from '../../../src/utils/consultation-token';

const mockedDb = database as jest.Mocked<typeof database>;

// ---------------------------------------------------------------------------
// Supabase admin mock — only the session-lookup path is exercised.
// ---------------------------------------------------------------------------

function buildAdminWithSession(sessionRow: Record<string, unknown> | null) {
  const maybeSingle = jest.fn().mockResolvedValue(
    { data: sessionRow, error: null } as never,
  );
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  const insert = jest.fn();
  const update = jest.fn();
  return {
    client: { from, insert, update },
    mocks: { from, select, eq, maybeSingle, insert, update },
  };
}

const baseSessionRow = {
  id: 'sess-uuid-1',
  doctor_id: 'doc-1',
  appointment_id: 'apt-1',
  patient_id: 'pat-1',
  expected_end_at: '2026-04-19T10:30:00.000Z',
  status: 'scheduled',
};

const baseInput = {
  sessionId: 'sess-uuid-1',
  doctorId: 'doc-1',
  patientId: 'pat-1' as string | null,
  appointmentId: 'apt-1',
  correlationId: 'corr-companion-001',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('provisionCompanionChannel — happy path', () => {
  it('returns URL pointed at /c/text/{sessionId} + verifiable HMAC token + JWT expiresAt', async () => {
    const sb = buildAdminWithSession(baseSessionRow);
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const result = await provisionCompanionChannel(baseInput);

    expect(result).not.toBeNull();
    expect(result!.patientJoinUrl).toBe(
      `https://app.example.com/c/text/sess-uuid-1?t=${result!.patientToken}`,
    );
    expect(result!.patientToken).toBeTruthy();
    // Token verifies end-to-end through the canonical HMAC helper.
    const verified = verifyConsultationToken(result!.patientToken!);
    expect(verified.appointmentId).toBe('apt-1');
    // expiresAt matches `expected_end_at + 30min` (the mocked TTL).
    expect(result!.expiresAt).toBe('2026-04-19T11:00:00.000Z');
  });

  it('does NOT write anything to the DB (pure provisioning, no insert / update)', async () => {
    const sb = buildAdminWithSession(baseSessionRow);
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    await provisionCompanionChannel(baseInput);

    expect(sb.mocks.insert).not.toHaveBeenCalled();
    expect(sb.mocks.update).not.toHaveBeenCalled();
    // The `from('consultation_sessions')` call is the SELECT lookup — one hop,
    // nothing else.
    expect(sb.mocks.from).toHaveBeenCalledTimes(1);
    expect(sb.mocks.from).toHaveBeenCalledWith('consultation_sessions');
  });
});

// ---------------------------------------------------------------------------
// Defensive short-circuits
// ---------------------------------------------------------------------------

describe('provisionCompanionChannel — defensive short-circuits', () => {
  it('returns null when sessionId is empty', async () => {
    const result = await provisionCompanionChannel({
      ...baseInput,
      sessionId: '   ',
    });
    expect(result).toBeNull();
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('returns null when the session row is not found', async () => {
    const sb = buildAdminWithSession(null);
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const result = await provisionCompanionChannel(baseInput);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// patientId === null
// ---------------------------------------------------------------------------

describe('provisionCompanionChannel — patientId null', () => {
  it('returns URL-less shape (null URL + null token + non-null expiresAt)', async () => {
    const sb = buildAdminWithSession({ ...baseSessionRow, patient_id: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const result = await provisionCompanionChannel({ ...baseInput, patientId: null });

    expect(result).toEqual({
      sessionId: 'sess-uuid-1',
      patientJoinUrl: null,
      patientToken: null,
      expiresAt: '2026-04-19T11:00:00.000Z',
    });
  });
});

// ---------------------------------------------------------------------------
// APP_BASE_URL unset
// ---------------------------------------------------------------------------

describe('provisionCompanionChannel — APP_BASE_URL unset', () => {
  it('returns null URL but keeps the HMAC token + expiresAt populated', async () => {
    jest.isolateModules(() => {});
    jest.resetModules();
    jest.doMock('../../../src/config/env', () => ({
      env: {
        SUPABASE_JWT_SECRET: 'test-secret-thirty-two-bytes-long-please',
        CONSULTATION_TOKEN_SECRET: TEST_HMAC_SECRET,
        APP_BASE_URL: '',
        TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END: 30,
      },
    }));
    jest.doMock('../../../src/config/logger', () => ({
      logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
      },
    }));
    jest.doMock('../../../src/config/database', () => ({
      getSupabaseAdminClient: jest.fn(),
    }));
    jest.doMock('../../../src/services/consultation-message-service', () => ({
      SYSTEM_SENDER_ID: '00000000-0000-0000-0000-000000000000',
      emitPartyJoined: jest.fn(async () => {}),
    }));

    // Using require() here is intentional — we need the freshly-reset
    // module instance with the env override above.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const dbIso = require('../../../src/config/database');
    const svcIso = require('../../../src/services/text-session-supabase');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const sb = buildAdminWithSession(baseSessionRow);
    dbIso.getSupabaseAdminClient.mockReturnValue(sb.client);

    const result = await svcIso.provisionCompanionChannel(baseInput);

    expect(result).not.toBeNull();
    expect(result.patientJoinUrl).toBeNull();
    expect(result.patientToken).toBeTruthy();
    expect(result.expiresAt).toBe('2026-04-19T11:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// CONSULTATION_TOKEN_SECRET unset (mint throws)
// ---------------------------------------------------------------------------

describe('provisionCompanionChannel — HMAC mint failure', () => {
  it('returns partial shape (null URL + null token + expiresAt set) when the HMAC helper throws', async () => {
    jest.resetModules();
    jest.doMock('../../../src/config/env', () => ({
      env: {
        SUPABASE_JWT_SECRET: 'test-secret-thirty-two-bytes-long-please',
        CONSULTATION_TOKEN_SECRET: '', // empty → generateConsultationToken throws
        APP_BASE_URL: 'https://app.example.com',
        TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END: 30,
      },
    }));
    jest.doMock('../../../src/config/logger', () => ({
      logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
      },
    }));
    jest.doMock('../../../src/config/database', () => ({
      getSupabaseAdminClient: jest.fn(),
    }));
    jest.doMock('../../../src/services/consultation-message-service', () => ({
      SYSTEM_SENDER_ID: '00000000-0000-0000-0000-000000000000',
      emitPartyJoined: jest.fn(async () => {}),
    }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const dbIso = require('../../../src/config/database');
    const svcIso = require('../../../src/services/text-session-supabase');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const sb = buildAdminWithSession(baseSessionRow);
    dbIso.getSupabaseAdminClient.mockReturnValue(sb.client);

    const result = await svcIso.provisionCompanionChannel(baseInput);

    expect(result).toEqual({
      sessionId: 'sess-uuid-1',
      patientJoinUrl: null,
      patientToken: null,
      expiresAt: '2026-04-19T11:00:00.000Z',
    });
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('provisionCompanionChannel — idempotency', () => {
  it('two calls produce URLs with the same path + host and tokens that both verify', async () => {
    const sb = buildAdminWithSession(baseSessionRow);
    mockedDb.getSupabaseAdminClient.mockReturnValue(sb.client as never);

    const a = await provisionCompanionChannel(baseInput);
    const b = await provisionCompanionChannel(baseInput);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    // Strip the query-string HMAC and compare just the path + host — the
    // token payload carries a second-resolution `exp`, so back-to-back
    // calls may produce identical OR differing HMACs. Both are
    // functionally equivalent (both verify against the same secret +
    // same appointmentId).
    const stripQuery = (u: string) => u.split('?')[0];
    expect(stripQuery(a!.patientJoinUrl!)).toBe(
      'https://app.example.com/c/text/sess-uuid-1',
    );
    expect(stripQuery(a!.patientJoinUrl!)).toBe(stripQuery(b!.patientJoinUrl!));

    // Both tokens verify end-to-end (no assertion on equality).
    expect(verifyConsultationToken(a!.patientToken!).appointmentId).toBe('apt-1');
    expect(verifyConsultationToken(b!.patientToken!).appointmentId).toBe('apt-1');

    // Same JWT expiresAt (both derived from the same session's
    // expected_end_at + TTL — no per-call drift).
    expect(a!.expiresAt).toBe(b!.expiresAt);
  });
});
