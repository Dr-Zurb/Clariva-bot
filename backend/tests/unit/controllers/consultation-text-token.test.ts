/**
 * Consultation Controller · `exchangeTextConsultTokenHandler`
 * (Plan 04 · Task 18 + Plan 06 Decision 9 / voice-0A hotfix)
 *
 * Pins the contract of `POST /api/v1/consultation/:sessionId/text-token`:
 *   - Body MUST be `{ token }` (the patient HMAC consultation token).
 *     Missing / non-string / whitespace-only → 400 `ValidationError`.
 *   - HMAC verification delegates to `verifyConsultationToken`. Failures
 *     propagate as 401 `UnauthorizedError`.
 *   - Session lookup via `findSessionById`. Missing → 404
 *     `NotFoundError`. Mismatched appointment id → 401 `UnauthorizedError`
 *     (without leaking which session the token actually maps to).
 *   - **Modality allow-list (voice-0A):** only `text`, `voice`, `video`
 *     are accepted. Anything else (e.g. a synthetic future modality) →
 *     400 `ValidationError` with the legacy "Cannot exchange text-token
 *     for {modality} session" message preserved (so log/Sentry rules
 *     keyed on it keep firing).
 *   - **Token mint (voice-0A):** the handler ALWAYS mints via
 *     `textSessionSupabaseAdapter.getJoinToken(...)` directly, NEVER via
 *     `facadeGetJoinToken`, regardless of session modality. Bypassing
 *     the modality-dispatching facade is the whole point of the fix —
 *     voice/video sessions need a Supabase JWT (for the companion chat
 *     RLS), not a Twilio access token.
 *   - For `ended` / `cancelled` sessions: no mint; response carries
 *     `{ token: null, expiresAt: null }` (the patient still gets the
 *     post-session UI scaffolding from `sessionStatus` etc.).
 *   - Adapter input shape: `{ appointmentId, doctorId, role, providerSessionId,
 *     sessionId }`. Mirrors what the facade synthesizes internally;
 *     calling the adapter directly saves the redundant `findSessionById`
 *     round-trip the facade would have done.
 *
 * Test layer note (voice-0T fallback):
 *   - The voice-0T spec asks for an integration test against a real
 *     Supabase to assert the minted JWT actually passes RLS. This repo
 *     has no Supabase integration-test harness today, so per the voice-0T
 *     "Fallback" branch we ship the handler-level unit suite instead.
 *     The follow-up to add the harness is tracked separately (see the
 *     status note appended to task-voice-0T-text-token-integration-test.md
 *     after the PR lands).
 *
 * Out of scope:
 *   - JWT shape / RLS pass — covered by `supabase-jwt-mint.test.ts`
 *     (mint primitive) and would require an integration test for
 *     end-to-end RLS proof.
 *   - HMAC primitive internals (covered in `consultation-token.test.ts`).
 *   - Adapter internals (covered in `text-session-supabase.test.ts`).
 *   - Sibling `exchangeVoiceConsultTokenHandler` (separate handler;
 *     intentionally still uses `facadeGetJoinToken` because its contract
 *     IS modality-dispatched — that's the call channel, not the chat
 *     channel).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/utils/consultation-token', () => ({
  verifyConsultationToken: jest.fn(),
}));
jest.mock('../../../src/services/consultation-session-service', () => ({
  // The controller imports several names from this module; mock the
  // ones it touches at module load. `getJoinToken` (re-aliased to
  // `facadeGetJoinToken` in the controller) MUST be present so we can
  // assert it is NEVER called by this handler post-fix.
  findSessionById:                  jest.fn(),
  createSession:                    jest.fn(),
  getJoinToken:                     jest.fn(),
  getJoinTokenForAppointment:       jest.fn(),
  markParticipantJoined:            jest.fn(),
  updateSessionStatus:              jest.fn(),
}));
jest.mock('../../../src/services/text-session-supabase', () => ({
  // Adapter is the only export this handler exercises post-fix. The
  // other handlers in the controller use `mintAttachmentSignedUrls`,
  // which is reached only via their respective routes — we stub it as
  // a jest.fn() so the controller's module-load resolves cleanly.
  textSessionSupabaseAdapter: {
    modality:      'text' as const,
    provider:      'supabase_realtime' as const,
    createSession: jest.fn(),
    endSession:    jest.fn(),
    getJoinToken:  jest.fn(),
  },
  mintAttachmentSignedUrls: jest.fn(),
}));
// recording-access-service re-exports MintReplayError as a class; preserve
// the actual module so the import in the controller resolves cleanly.
jest.mock('../../../src/services/recording-access-service', () => {
  const actual = jest.requireActual('../../../src/services/recording-access-service');
  return actual;
});
jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
// The handler enriches the response with `practice_name` (from
// `doctor_settings`) via the admin client. Mock the database config so
// that lookup resolves synthetically — tests stub the resolved data
// per case (or leave it as the default empty stub).
type MaybeSingleResult = {
  data:  Record<string, unknown> | null;
  error: { message: string } | null;
};
const mockMaybeSingle: jest.Mock<() => Promise<MaybeSingleResult>> = jest.fn(
  () => Promise.resolve({ data: null, error: null }) as Promise<MaybeSingleResult>,
);
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
    }),
  }),
  supabase: {},
}));

import {
  exchangeTextConsultTokenHandler,
} from '../../../src/controllers/consultation-controller';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/utils/errors';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const consultationToken = require('../../../src/utils/consultation-token');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sessionService = require('../../../src/services/consultation-session-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const textSupabase = require('../../../src/services/text-session-supabase');

// ---------------------------------------------------------------------------
// Test doubles for Express req/res — mirrors the pattern in
// `consultation-chat-history-token.test.ts` (sibling handler test).
// ---------------------------------------------------------------------------

interface MockRes {
  res:        Response;
  payload:    unknown;
  statusCode: number;
}

function makeRes(): MockRes {
  const out: MockRes = { payload: undefined, statusCode: 0 } as MockRes;
  const res = {
    status: (code: number): Response => {
      out.statusCode = code;
      return res as unknown as Response;
    },
    json: (body: unknown): Response => {
      out.payload = body;
      return res as unknown as Response;
    },
  } as unknown as Response;
  out.res = res;
  return out;
}

function makeReq(opts: {
  body?:   Record<string, unknown> | undefined;
  params?: Record<string, string>;
} = {}): Request {
  return {
    body:           opts.body ?? {},
    params:         opts.params ?? {},
    query:          {},
    headers:        {},
    correlationId:  'cid-text-token-test',
    url:            '/api/v1/consultation/sess-1/text-token',
    method:         'POST',
  } as unknown as Request;
}

async function invoke(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown = undefined;
  const next = (err?: unknown): void => {
    captured = err;
  };
  await handler(req, res, next);
  await Promise.resolve();
  return captured;
}

const sessionId         = '11111111-1111-1111-1111-111111111111';
const appointmentId     = '22222222-2222-2222-2222-222222222222';
const doctorId          = '33333333-3333-3333-3333-333333333333';
const providerSessionId = 'provider-room-id-abc';
const scheduledStartAt  = new Date('2026-04-30T09:00:00.000Z');
const expectedEndAt     = new Date('2026-04-30T09:30:00.000Z');

interface MockSessionOverrides {
  modality?: 'text' | 'voice' | 'video' | string;
  status?:   'scheduled' | 'live' | 'ended' | 'cancelled' | string;
  patientId?: string | null;
}

function makeSessionRow(overrides: MockSessionOverrides = {}) {
  return {
    id:                sessionId,
    appointmentId,
    doctorId,
    patientId:         overrides.patientId === undefined ? 'pat-1' : overrides.patientId,
    status:            overrides.status   ?? 'live',
    modality:          overrides.modality ?? 'text',
    providerSessionId,
    scheduledStartAt,
    expectedEndAt,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: adapter mints a non-empty token + an expiry 30 min out.
  textSupabase.textSessionSupabaseAdapter.getJoinToken.mockResolvedValue({
    token:     'minted.supabase.jwt',
    expiresAt: new Date('2026-04-30T09:30:00.000Z'),
  });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

// ===========================================================================
// Validation
// ===========================================================================

describe('exchangeTextConsultTokenHandler — validation', () => {
  it('400 when sessionId path param is missing', async () => {
    const req = makeReq({ params: {}, body: { token: 'abc' } });
    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when sessionId is whitespace-only', async () => {
    const req = makeReq({ params: { sessionId: '   ' }, body: { token: 'abc' } });
    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when body { token } is missing', async () => {
    const req = makeReq({ params: { sessionId }, body: {} });
    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when body.token is not a string', async () => {
    const req = makeReq({ params: { sessionId }, body: { token: 12345 } });
    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when body.token trims to empty', async () => {
    const req = makeReq({ params: { sessionId }, body: { token: '   ' } });
    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });
});

// ===========================================================================
// HMAC + session checks
// ===========================================================================

describe('exchangeTextConsultTokenHandler — HMAC + session checks', () => {
  it('401 when verifyConsultationToken throws UnauthorizedError', async () => {
    consultationToken.verifyConsultationToken.mockImplementation(() => {
      throw new UnauthorizedError('Invalid consultation token (signature mismatch)');
    });
    const req = makeReq({
      params: { sessionId },
      body:   { token: 'malformed.token' },
    });

    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(sessionService.findSessionById).not.toHaveBeenCalled();
    expect(textSupabase.textSessionSupabaseAdapter.getJoinToken).not.toHaveBeenCalled();
  });

  it('404 when session lookup returns null', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue(null);

    const req = makeReq({ params: { sessionId }, body: { token: 'valid.token' } });
    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(textSupabase.textSessionSupabaseAdapter.getJoinToken).not.toHaveBeenCalled();
  });

  it('401 when token authorizes a different appointment (no session-id leak, optional voice-0T case)', async () => {
    // voice-0T optional case: HMAC for appointment A, URL for session
    // of appointment B. Pins the existing security boundary.
    consultationToken.verifyConsultationToken.mockReturnValue({
      appointmentId: 'different-appt-id',
    });
    sessionService.findSessionById.mockResolvedValue(makeSessionRow({ modality: 'voice' }));

    const req = makeReq({ params: { sessionId }, body: { token: 'wrong-session.token' } });
    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(textSupabase.textSessionSupabaseAdapter.getJoinToken).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Modality allow-list (voice-0A guard relaxation)
// ===========================================================================

describe('exchangeTextConsultTokenHandler — modality allow-list (voice-0A)', () => {
  it.each(['text', 'voice', 'video'] as const)(
    'mints a Supabase JWT for modality=%s (voice-0T happy path)',
    async (modality) => {
      consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
      sessionService.findSessionById.mockResolvedValue(makeSessionRow({ modality }));

      const req = makeReq({ params: { sessionId }, body: { token: 'valid.token' } });
      const m = makeRes();
      const err = await invoke(exchangeTextConsultTokenHandler, req, m.res);

      expect(err).toBeUndefined();
      expect(m.statusCode).toBe(200);

      // CRITICAL: the text adapter is what mints — NOT the modality-
      // dispatching facade. Pre-voice-0A this assertion would fail for
      // voice/video (the facade would have returned a Twilio token).
      expect(textSupabase.textSessionSupabaseAdapter.getJoinToken).toHaveBeenCalledTimes(1);
      expect(sessionService.getJoinToken).not.toHaveBeenCalled();

      // Adapter input mirrors what the facade synthesizes internally.
      const [adapterInput, cid] =
        textSupabase.textSessionSupabaseAdapter.getJoinToken.mock.calls[0] as [
          {
            appointmentId:     string;
            doctorId:          string;
            role:              'doctor' | 'patient';
            providerSessionId: string | undefined;
            sessionId:         string;
          },
          string,
        ];
      expect(adapterInput).toEqual({
        appointmentId,
        doctorId,
        role:              'patient',
        providerSessionId,
        sessionId,
      });
      expect(cid).toBe('cid-text-token-test');

      const body = m.payload as {
        data: { token: string; expiresAt: string; sessionStatus: string };
      };
      expect(body.data.token).toBe('minted.supabase.jwt');
      expect(body.data.expiresAt).toBe('2026-04-30T09:30:00.000Z');
      expect(body.data.sessionStatus).toBe('live');
    },
  );

  it('400 with the legacy error message for an unsupported modality (voice-0T negative case)', async () => {
    // Use a synthetic modality (`fax`) that isn't on the allow-list.
    // If someone "simplifies" the guard back to `=== 'text'` or removes
    // it entirely, this test breaks immediately — that's the lock.
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue(makeSessionRow({ modality: 'fax' }));

    const req = makeReq({ params: { sessionId }, body: { token: 'valid.token' } });
    const err = await invoke(exchangeTextConsultTokenHandler, req, makeRes().res);

    expect(err).toBeInstanceOf(ValidationError);
    // Error message preserved verbatim per voice-0A acceptance criteria
    // (any Sentry rule grepping on this string keeps firing).
    expect((err as ValidationError).message).toBe(
      'Cannot exchange text-token for fax session',
    );
    expect(textSupabase.textSessionSupabaseAdapter.getJoinToken).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Ended / cancelled branch — mint skipped, response shape preserved
// ===========================================================================

describe('exchangeTextConsultTokenHandler — terminal-status branch', () => {
  it.each(['ended', 'cancelled'] as const)(
    'returns { token: null, expiresAt: null } without minting for status=%s (voice-0T optional case)',
    async (status) => {
      consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
      sessionService.findSessionById.mockResolvedValue(
        makeSessionRow({ modality: 'voice', status }),
      );

      const req = makeReq({ params: { sessionId }, body: { token: 'valid.token' } });
      const m = makeRes();
      const err = await invoke(exchangeTextConsultTokenHandler, req, m.res);

      expect(err).toBeUndefined();
      expect(m.statusCode).toBe(200);
      expect(textSupabase.textSessionSupabaseAdapter.getJoinToken).not.toHaveBeenCalled();
      expect(sessionService.getJoinToken).not.toHaveBeenCalled();

      const body = m.payload as {
        data: { token: string | null; expiresAt: string | null; sessionStatus: string };
      };
      expect(body.data.token).toBeNull();
      expect(body.data.expiresAt).toBeNull();
      expect(body.data.sessionStatus).toBe(status);
    },
  );
});

// ===========================================================================
// Response enrichment — currentUserId derivation + practice-name lookup
// ===========================================================================

describe('exchangeTextConsultTokenHandler — response enrichment', () => {
  it('uses session.patientId for currentUserId when present', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue(
      makeSessionRow({ modality: 'text', patientId: 'pat-7' }),
    );

    const req = makeReq({ params: { sessionId }, body: { token: 'valid.token' } });
    const m = makeRes();
    await invoke(exchangeTextConsultTokenHandler, req, m.res);

    const body = m.payload as { data: { currentUserId: string } };
    expect(body.data.currentUserId).toBe('pat-7');
  });

  it('falls back to appointmentId for currentUserId when patientId is null (bot patient)', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue(
      makeSessionRow({ modality: 'voice', patientId: null }),
    );

    const req = makeReq({ params: { sessionId }, body: { token: 'valid.token' } });
    const m = makeRes();
    await invoke(exchangeTextConsultTokenHandler, req, m.res);

    const body = m.payload as { data: { currentUserId: string } };
    expect(body.data.currentUserId).toBe(appointmentId);
  });

  it('includes practiceName when doctor_settings lookup succeeds', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue(makeSessionRow({ modality: 'video' }));
    mockMaybeSingle.mockResolvedValueOnce({
      data:  { practice_name: 'Dr. Sharma Clinic' },
      error: null,
    });

    const req = makeReq({ params: { sessionId }, body: { token: 'valid.token' } });
    const m = makeRes();
    await invoke(exchangeTextConsultTokenHandler, req, m.res);

    const body = m.payload as { data: { practiceName?: string } };
    expect(body.data.practiceName).toBe('Dr. Sharma Clinic');
  });

  it('omits practiceName when lookup yields no row', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue(makeSessionRow({ modality: 'text' }));
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq({ params: { sessionId }, body: { token: 'valid.token' } });
    const m = makeRes();
    await invoke(exchangeTextConsultTokenHandler, req, m.res);

    const body = m.payload as { data: { practiceName?: string } };
    expect(body.data.practiceName).toBeUndefined();
  });
});
