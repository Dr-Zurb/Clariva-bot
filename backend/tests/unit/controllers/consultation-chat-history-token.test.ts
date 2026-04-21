/**
 * Consultation Controller · `exchangeChatHistoryTokenHandler`
 * (Plan 07 · Task 31)
 *
 * Pins the contract of `POST /api/v1/consultation/:sessionId/chat-history-token`:
 *   - Body MUST be `{ hmacToken }` (NOT `{ token }`) — the route is the
 *     post-consult chat-history surface, mirroring the field name from
 *     the task spec. A missing or non-string `hmacToken` → 400
 *     `ValidationError`.
 *   - HMAC verification delegates to `verifyConsultationToken`. Failures
 *     (signature mismatch / expiry / malformed) propagate as the
 *     `UnauthorizedError` from the primitive — global handler maps to
 *     401.
 *   - Session lookup via `findSessionById`. Missing → 404
 *     `NotFoundError`. Mismatched appointment id (token authorizes
 *     a different session) → 401 `UnauthorizedError` *without*
 *     leaking which session the token actually maps to.
 *   - On success the controller mints a 90-day patient-scoped
 *     Supabase JWT via `mintScopedConsultationJwt` with:
 *       - `role: 'patient'`,
 *       - `sub:  buildPatientSub(appointmentId)` (synthetic — bot
 *         patients have no `auth.users` row),
 *       - `sessionId` = the URL session id (NOT the appointment id),
 *       - `expiresAt` ≈ now + 90 days (within a few seconds tolerance).
 *   - Returns `{ accessToken, expiresAt }` (NOT `token` — the response
 *     field name aligns with the task spec).
 *
 * Out of scope:
 *   - Rate-limiting (none configured for this route in v1; the task
 *     defers to the global per-IP limiter).
 *   - HMAC primitive internals (covered in `consultation-token.test.ts`).
 *   - JWT mint internals (covered in `supabase-jwt-mint.test.ts`).
 *   - End-to-end auth middleware (the route is HMAC-only — no
 *     `authenticateToken` middleware is mounted).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/utils/consultation-token', () => ({
  verifyConsultationToken: jest.fn(),
}));
jest.mock('../../../src/services/consultation-session-service', () => ({
  // The controller imports several names from this module; mock all the
  // ones it touches at module load (replay handlers also live here, so
  // the require-graph reaches them transitively).
  findSessionById:                  jest.fn(),
  createSession:                    jest.fn(),
  getJoinToken:                     jest.fn(),
  getJoinTokenForAppointment:       jest.fn(),
}));
jest.mock('../../../src/services/supabase-jwt-mint', () => {
  const actual = jest.requireActual('../../../src/services/supabase-jwt-mint') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    mintScopedConsultationJwt: jest.fn(),
  };
});
// recording-access-service re-exports MintReplayError as a class; preserve
// the actual module so the import in the controller resolves cleanly.
jest.mock('../../../src/services/recording-access-service', () => {
  const actual = jest.requireActual('../../../src/services/recording-access-service');
  return actual;
});
jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
// The handler enriches the response with `actual_ended_at` (from
// `consultation_sessions`) + `practice_name` (from `doctor_settings`)
// via the admin client. Mock the database config so those lookups
// resolve synthetically — tests stub the resolved data per case.
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
  exchangeChatHistoryTokenHandler,
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
const jwtMint = require('../../../src/services/supabase-jwt-mint');

// ---------------------------------------------------------------------------
// Test doubles for Express req/res — mirrors the pattern in the
// dashboard-events controller test (see comment there for the rationale
// for hand-rolled doubles vs supertest).
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
    correlationId:  'cid-chat-history-token-test',
    url:            '/api/v1/consultation/sess-1/chat-history-token',
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

const sessionId     = '11111111-1111-1111-1111-111111111111';
const appointmentId = '22222222-2222-2222-2222-222222222222';
const doctorId      = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  jwtMint.mintScopedConsultationJwt.mockReturnValue({
    token:     'minted.jwt.token',
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });
  // Default enrichment lookups: synthetically empty (the controller
  // tolerates this — the response just omits those fields). Per-test
  // overrides exercise the enriched-response branch.
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

// ===========================================================================
// Validation
// ===========================================================================

describe('exchangeChatHistoryTokenHandler — validation', () => {
  it('400 when sessionId path param is missing', async () => {
    const req = makeReq({ params: {}, body: { hmacToken: 'abc' } });
    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when sessionId is whitespace-only', async () => {
    const req = makeReq({ params: { sessionId: '   ' }, body: { hmacToken: 'abc' } });
    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when body { hmacToken } is missing', async () => {
    const req = makeReq({ params: { sessionId }, body: {} });
    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when body.hmacToken is not a string', async () => {
    const req = makeReq({ params: { sessionId }, body: { hmacToken: 12345 } });
    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when body.hmacToken trims to empty', async () => {
    const req = makeReq({ params: { sessionId }, body: { hmacToken: '   ' } });
    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });
});

// ===========================================================================
// HMAC + session checks
// ===========================================================================

describe('exchangeChatHistoryTokenHandler — HMAC + session checks', () => {
  it('401 when verifyConsultationToken throws UnauthorizedError', async () => {
    consultationToken.verifyConsultationToken.mockImplementation(() => {
      throw new UnauthorizedError('Invalid consultation token (signature mismatch)');
    });
    const req = makeReq({
      params: { sessionId },
      body:   { hmacToken: 'malformed.token' },
    });

    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    // The session is never looked up if HMAC fails first.
    expect(sessionService.findSessionById).not.toHaveBeenCalled();
    // The JWT is never minted on failed verification.
    expect(jwtMint.mintScopedConsultationJwt).not.toHaveBeenCalled();
  });

  it('401 when the HMAC has expired (UnauthorizedError surfaced)', async () => {
    consultationToken.verifyConsultationToken.mockImplementation(() => {
      throw new UnauthorizedError('Consultation token has expired');
    });
    const req = makeReq({
      params: { sessionId },
      body:   { hmacToken: 'expired.token' },
    });

    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
  });

  it('404 when session lookup returns null (after HMAC verifies)', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue(null);

    const req = makeReq({
      params: { sessionId },
      body:   { hmacToken: 'valid.token' },
    });

    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(jwtMint.mintScopedConsultationJwt).not.toHaveBeenCalled();
  });

  it('401 when token authorizes a different appointment (no session-id leak)', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({
      appointmentId: 'different-appt-id',
    });
    sessionService.findSessionById.mockResolvedValue({
      id:            sessionId,
      appointmentId, // doesn't match the token's appointment
      doctorId,
      patientId:     'pat-1',
      status:        'ended',
      modality:      'text',
    });

    const req = makeReq({
      params: { sessionId },
      body:   { hmacToken: 'valid-but-wrong-session.token' },
    });

    const err = await invoke(exchangeChatHistoryTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    // No JWT minted on appointment mismatch.
    expect(jwtMint.mintScopedConsultationJwt).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Happy path — JWT mint
// ===========================================================================

describe('exchangeChatHistoryTokenHandler — happy path', () => {
  it('200 with { accessToken, expiresAt } and mints a 90-day patient-scoped JWT', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue({
      id:            sessionId,
      appointmentId,
      doctorId,
      patientId:     'pat-1',
      status:        'ended',
      modality:      'text',
    });

    const req = makeReq({
      params: { sessionId },
      body:   { hmacToken: 'valid.hmac.token' },
    });
    const m = makeRes();

    const err = await invoke(exchangeChatHistoryTokenHandler, req, m.res);
    expect(err).toBeUndefined();
    expect(m.statusCode).toBe(200);

    const body = m.payload as {
      data: { accessToken: string; expiresAt: string };
    };
    expect(body.data.accessToken).toBe('minted.jwt.token');
    expect(body.data.expiresAt).toBeTruthy();

    // Mint called with the right inputs — sub is patient-scoped, role
    // pinned to 'patient', sessionId is the URL session (NOT the
    // appointmentId), and the expiresAt is ~90 days out.
    expect(jwtMint.mintScopedConsultationJwt).toHaveBeenCalledTimes(1);
    const mintArgs = jwtMint.mintScopedConsultationJwt.mock.calls[0][0] as {
      sub:       string;
      role:      string;
      sessionId: string;
      expiresAt: Date;
    };
    expect(mintArgs.role).toBe('patient');
    expect(mintArgs.sub).toBe(`patient:${appointmentId}`);
    expect(mintArgs.sessionId).toBe(sessionId);

    const ninetyDaysFromNow = Date.now() + 90 * 24 * 60 * 60 * 1000;
    const drift = Math.abs(mintArgs.expiresAt.getTime() - ninetyDaysFromNow);
    // Allow up to 5s of drift (test runtime + JS clock jitter).
    expect(drift).toBeLessThan(5_000);
  });

  it('200 includes enriched currentUserId, sessionStatus, consultEndedAt, practiceName when admin lookups succeed', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue({
      id:            sessionId,
      appointmentId,
      doctorId,
      patientId:     'pat-7',
      status:        'ended',
      modality:      'text',
    });

    // First .maybeSingle() call → consultation_sessions { actual_ended_at }.
    // Second .maybeSingle() call → doctor_settings { practice_name }.
    const endedAtIso = '2026-04-19T10:30:00.000Z';
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { actual_ended_at: endedAtIso }, error: null })
      .mockResolvedValueOnce({ data: { practice_name: 'Dr. Sharma Clinic' }, error: null });

    const req = makeReq({
      params: { sessionId },
      body:   { hmacToken: 'valid.hmac.token' },
    });
    const m = makeRes();

    await invoke(exchangeChatHistoryTokenHandler, req, m.res);

    expect(m.statusCode).toBe(200);
    const body = m.payload as {
      data: {
        accessToken:    string;
        expiresAt:      string;
        currentUserId:  string;
        sessionStatus:  string;
        consultEndedAt: string | null;
        practiceName?:  string;
      };
    };
    expect(body.data.currentUserId).toBe('pat-7');
    expect(body.data.sessionStatus).toBe('ended');
    expect(body.data.consultEndedAt).toBe(endedAtIso);
    expect(body.data.practiceName).toBe('Dr. Sharma Clinic');
  });

  it('200 falls back to appointmentId for currentUserId when patientId is null (bot patient)', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue({
      id:            sessionId,
      appointmentId,
      doctorId,
      patientId:     null,
      status:        'ended',
      modality:      'text',
    });

    const req = makeReq({
      params: { sessionId },
      body:   { hmacToken: 'valid.hmac.token' },
    });
    const m = makeRes();

    await invoke(exchangeChatHistoryTokenHandler, req, m.res);

    expect(m.statusCode).toBe(200);
    const body = m.payload as { data: { currentUserId: string } };
    expect(body.data.currentUserId).toBe(appointmentId);
  });

  it('mints a JWT even for ended sessions (readonly access is the whole point)', async () => {
    // Migration 052's patient SELECT policy keys on (consult_role,
    // session_id) — NOT on session.status — so even an `ended` session
    // must mint a JWT for the readonly chat surface.
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue({
      id:            sessionId,
      appointmentId,
      doctorId,
      patientId:     'pat-1',
      status:        'ended',
      modality:      'voice',
    });

    const req = makeReq({
      params: { sessionId },
      body:   { hmacToken: 'valid.token' },
    });
    const m = makeRes();

    await invoke(exchangeChatHistoryTokenHandler, req, m.res);
    expect(m.statusCode).toBe(200);
    expect(jwtMint.mintScopedConsultationJwt).toHaveBeenCalledTimes(1);
  });
});
