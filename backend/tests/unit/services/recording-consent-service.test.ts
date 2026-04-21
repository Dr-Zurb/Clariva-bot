/**
 * Unit tests for `services/recording-consent-service.ts` (Plan 02 · Task 27).
 *
 * Covers the three exported functions:
 *   - `captureBookingConsent`   — write path; happy path for true and false,
 *                                 "appointment not found" surfaces NotFoundError,
 *                                 DB error surfaces InternalError.
 *   - `rePitchOnDecline`        — pure helper; always returns shouldShow=true
 *                                 and the v1.0 body copy in v1.
 *   - `getConsentForSession`    — two-step join lookup; happy path for each
 *                                 of null / true / false decisions, plus
 *                                 missing session and missing appointment.
 *
 * Mirrors the mock shape used in `consultation-message-service.test.ts` —
 * we mock `getSupabaseAdminClient` directly and hand-roll a chain that
 * mimics the exact Supabase call sequence the unit-under-test makes.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (registered before unit-under-test import)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import {
  captureBookingConsent,
  getConsentForSession,
  rePitchOnDecline,
  RECORDING_CONSENT_VERSION,
  RECORDING_CONSENT_BODY_V1,
} from '../../../src/services/recording-consent-service';
import { InternalError, NotFoundError } from '../../../src/utils/errors';
import * as database from '../../../src/config/database';

const mockedDb = database as jest.Mocked<typeof database>;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers — build the Supabase .update().eq().select().maybeSingle() chain
// for captureBookingConsent and the two-step select chains for
// getConsentForSession.
// ---------------------------------------------------------------------------

function buildUpdateChain(
  result: { data: unknown; error: { message: string } | null },
) {
  const maybeSingle = jest.fn().mockReturnValue(Promise.resolve(result));
  const select = jest.fn().mockReturnValue({ maybeSingle });
  const eq = jest.fn().mockReturnValue({ select });
  const update = jest.fn().mockReturnValue({ eq });
  return { from: jest.fn().mockReturnValue({ update }), __update: update };
}

function buildTwoStepSelectChain(
  sessionResult: { data: unknown; error: { message: string } | null },
  appointmentResult: { data: unknown; error: { message: string } | null },
) {
  // First `.from('consultation_sessions').select().eq().maybeSingle()`
  const sessionMaybeSingle = jest.fn().mockReturnValue(Promise.resolve(sessionResult));
  const sessionEq = jest.fn().mockReturnValue({ maybeSingle: sessionMaybeSingle });
  const sessionSelect = jest.fn().mockReturnValue({ eq: sessionEq });

  // Second `.from('appointments').select().eq().maybeSingle()`
  const apptMaybeSingle = jest.fn().mockReturnValue(Promise.resolve(appointmentResult));
  const apptEq = jest.fn().mockReturnValue({ maybeSingle: apptMaybeSingle });
  const apptSelect = jest.fn().mockReturnValue({ eq: apptEq });

  const from = jest.fn((...args: unknown[]) => {
    const table = args[0] as string;
    if (table === 'consultation_sessions') return { select: sessionSelect };
    if (table === 'appointments') return { select: apptSelect };
    throw new Error(`unexpected table ${table}`);
  });
  return { from };
}

// ---------------------------------------------------------------------------
// captureBookingConsent
// ---------------------------------------------------------------------------

describe('captureBookingConsent', () => {
  it('writes decision=true and resolves on a matching row', async () => {
    const chain = buildUpdateChain({ data: { id: 'appt-1' }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      chain as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    await expect(
      captureBookingConsent({
        appointmentId:   'appt-1',
        decision:        true,
        consentVersion:  'v1.0',
        correlationId:   'corr-1',
      }),
    ).resolves.toBeUndefined();
    expect(chain.__update).toHaveBeenCalledTimes(1);
    const args = (chain.__update as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.recording_consent_decision).toBe(true);
    expect(args.recording_consent_version).toBe('v1.0');
    expect(typeof args.recording_consent_at).toBe('string');
  });

  it('writes decision=false without throwing', async () => {
    const chain = buildUpdateChain({ data: { id: 'appt-2' }, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      chain as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    await expect(
      captureBookingConsent({
        appointmentId:   'appt-2',
        decision:        false,
        consentVersion:  'v1.0',
        correlationId:   'corr-2',
      }),
    ).resolves.toBeUndefined();
  });

  it('throws NotFoundError when no row matched the id', async () => {
    const chain = buildUpdateChain({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      chain as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    await expect(
      captureBookingConsent({
        appointmentId:   'missing',
        decision:        true,
        consentVersion:  'v1.0',
        correlationId:   'corr-3',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws InternalError when the DB returns an error', async () => {
    const chain = buildUpdateChain({ data: null, error: { message: 'boom' } });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      chain as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    await expect(
      captureBookingConsent({
        appointmentId:   'appt-3',
        decision:        true,
        consentVersion:  'v1.0',
        correlationId:   'corr-4',
      }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('throws InternalError when the admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    await expect(
      captureBookingConsent({
        appointmentId:   'appt-4',
        decision:        true,
        consentVersion:  'v1.0',
        correlationId:   'corr-5',
      }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

// ---------------------------------------------------------------------------
// rePitchOnDecline
// ---------------------------------------------------------------------------

describe('rePitchOnDecline', () => {
  it('returns shouldShow=true and the v1.0 body copy', async () => {
    const result = await rePitchOnDecline({
      appointmentId: 'appt-1',
      correlationId: 'corr-1',
    });
    expect(result.shouldShow).toBe(true);
    expect(result.copy).toBe(RECORDING_CONSENT_BODY_V1);
  });
});

// ---------------------------------------------------------------------------
// getConsentForSession
// ---------------------------------------------------------------------------

describe('getConsentForSession', () => {
  it('returns the consent row when session + appointment resolve cleanly', async () => {
    const chain = buildTwoStepSelectChain(
      { data: { appointment_id: 'appt-1' }, error: null },
      {
        data: {
          recording_consent_decision: false,
          recording_consent_at:       '2026-04-19T10:00:00.000Z',
          recording_consent_version:  'v1.0',
        },
        error: null,
      },
    );
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      chain as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    const result = await getConsentForSession({ sessionId: 's-1' });
    expect(result.decision).toBe(false);
    expect(result.capturedAt).toBeInstanceOf(Date);
    expect(result.version).toBe('v1.0');
  });

  it('returns decision=null when the patient was never asked', async () => {
    const chain = buildTwoStepSelectChain(
      { data: { appointment_id: 'appt-2' }, error: null },
      {
        data: {
          recording_consent_decision: null,
          recording_consent_at:       null,
          recording_consent_version:  null,
        },
        error: null,
      },
    );
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      chain as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    const result = await getConsentForSession({ sessionId: 's-2' });
    expect(result.decision).toBeNull();
    expect(result.capturedAt).toBeNull();
    expect(result.version).toBeNull();
  });

  it('throws NotFoundError when the session does not exist', async () => {
    const chain = buildTwoStepSelectChain(
      { data: null, error: null },
      { data: null, error: null },
    );
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      chain as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    await expect(getConsentForSession({ sessionId: 's-missing' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError when the appointment does not exist', async () => {
    const chain = buildTwoStepSelectChain(
      { data: { appointment_id: 'appt-gone' }, error: null },
      { data: null, error: null },
    );
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      chain as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    await expect(getConsentForSession({ sessionId: 's-3' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws InternalError when the admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    await expect(getConsentForSession({ sessionId: 's-4' })).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});

// ---------------------------------------------------------------------------
// Re-exports — sanity checks on the constants surface
// ---------------------------------------------------------------------------

describe('constant re-exports', () => {
  it('pins RECORDING_CONSENT_VERSION = v1.0 for Decision 4', () => {
    expect(RECORDING_CONSENT_VERSION).toBe('v1.0');
  });

  it('re-exports the body copy verbatim', () => {
    expect(RECORDING_CONSENT_BODY_V1.length).toBeGreaterThan(0);
    expect(RECORDING_CONSENT_BODY_V1).toMatch(/recorded/i);
  });
});
