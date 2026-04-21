/**
 * Consultation Controller · transcript routes (Plan 07 · Task 32).
 *
 * Pins the contract of:
 *   - `POST /api/v1/consultation/:sessionId/transcript-token`
 *       (exchangeTranscriptTokenHandler)
 *   - `GET  /api/v1/consultation/:sessionId/transcript.pdf`
 *       (downloadTranscriptPdfHandler)
 *
 * Transcript-token mirrors Task 29's `replay-token` and Task 31's
 * `chat-history-token` with a **15-min** TTL — patients who want to
 * re-download after expiry re-exchange from the original HMAC. The
 * route accepts both `hmacToken` (Task 31 convention) and legacy
 * `token` (Task 29) body keys; mis-routed clients shouldn't be blocked
 * by a field-name choice.
 *
 * Transcript.pdf delegates to `renderConsultTranscriptPdf`; on
 * success it returns `{ signedUrl, expiresAt, cacheHit, filename }`
 * as JSON. The frontend does `window.location.assign(signedUrl)` to
 * trigger the download (this indirection exists because the GET
 * route is Bearer-authed and browser navigations don't replay the
 * Authorization header). On denial the route surfaces the
 * `TranscriptExportError` with a JSON body — client renders a toast
 * / empty state from the machine-readable code.
 *
 * We mock the thin edges (`transcript-pdf-service`,
 * `recording-access-service`, `consultation-session-service`,
 * `supabase-jwt-mint`, `consultation-token`) and exercise the full
 * handler surface end-to-end so any controller-level regression
 * (missing error mapping, wrong field name in response, lost
 * correlation id) shows up here.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/utils/consultation-token', () => ({
  verifyConsultationToken: jest.fn(),
}));
jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById:            jest.fn(),
  createSession:              jest.fn(),
  getJoinToken:               jest.fn(),
  getJoinTokenForAppointment: jest.fn(),
}));
jest.mock('../../../src/services/supabase-jwt-mint', () => {
  const actual = jest.requireActual('../../../src/services/supabase-jwt-mint') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    mintScopedConsultationJwt: jest.fn(),
    verifyScopedConsultationJwt: jest.fn(),
  };
});
jest.mock('../../../src/services/recording-access-service', () => {
  const actual = jest.requireActual(
    '../../../src/services/recording-access-service',
  ) as Record<string, unknown>;
  return {
    ...actual,
    mintReplayUrl:                jest.fn(),
    getReplayAvailability:        jest.fn(),
    runReplayPolicyChecks:        jest.fn(),
    isSessionOrCompositionRevoked: jest.fn(),
  };
});
jest.mock('../../../src/services/transcript-pdf-service', () => {
  class TranscriptExportError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = 'TranscriptExportError';
    }
  }
  return {
    TranscriptExportError,
    renderConsultTranscriptPdf: jest.fn(),
  };
});
jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => null,
  supabase: { auth: { getUser: jest.fn() } },
}));

import {
  exchangeTranscriptTokenHandler,
  downloadTranscriptPdfHandler,
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const transcriptSvc = require('../../../src/services/transcript-pdf-service');

// ---------------------------------------------------------------------------
// Test doubles for Express req/res
// ---------------------------------------------------------------------------

interface MockRes {
  res:         Response;
  payload:     unknown;
  statusCode:  number;
  redirectTo:  string | null;
  redirectStatus: number | null;
}

function makeRes(): MockRes {
  const out: MockRes = {
    payload:        undefined,
    statusCode:     0,
    redirectTo:     null,
    redirectStatus: null,
  } as MockRes;
  const res = {
    status: (code: number): Response => {
      out.statusCode = code;
      return res as unknown as Response;
    },
    json: (body: unknown): Response => {
      out.payload = body;
      return res as unknown as Response;
    },
    redirect: (statusOrUrl: number | string, maybeUrl?: string): void => {
      if (typeof statusOrUrl === 'number') {
        out.redirectStatus = statusOrUrl;
        out.redirectTo = maybeUrl ?? null;
      } else {
        out.redirectStatus = 302;
        out.redirectTo = statusOrUrl;
      }
    },
  } as unknown as Response;
  out.res = res;
  return out;
}

function makeReq(opts: {
  body?:    Record<string, unknown> | undefined;
  params?:  Record<string, string>;
  headers?: Record<string, string>;
} = {}): Request {
  return {
    body:           opts.body ?? {},
    params:         opts.params ?? {},
    query:          {},
    headers:        opts.headers ?? {},
    correlationId:  'cid-transcript-test',
    url:            '/api/v1/consultation/sess-1/transcript',
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
  // asyncHandler wraps the handler in `Promise.resolve(fn()).catch(next)`:
  // on rejection the `next(err)` call is scheduled as a microtask one tick
  // after our `await`, so we need to yield twice to observe it.
  await new Promise((resolve) => setImmediate(resolve));
  return captured;
}

const sessionId     = '11111111-1111-1111-1111-111111111111';
const appointmentId = '22222222-2222-2222-2222-222222222222';
const doctorId      = '33333333-3333-3333-3333-333333333333';
const patientId     = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  jest.clearAllMocks();
  jwtMint.mintScopedConsultationJwt.mockReturnValue({
    token:     'minted.transcript.jwt',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
});

// ===========================================================================
// exchangeTranscriptTokenHandler — validation
// ===========================================================================

describe('exchangeTranscriptTokenHandler — validation', () => {
  it('400 when sessionId path param is missing', async () => {
    const req = makeReq({ params: {}, body: { hmacToken: 'abc' } });
    const err = await invoke(exchangeTranscriptTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('400 when body has neither hmacToken nor token', async () => {
    const req = makeReq({ params: { sessionId }, body: {} });
    const err = await invoke(exchangeTranscriptTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('accepts body.hmacToken (Task 31 convention) and mints a 15-min JWT', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue({
      id:            sessionId,
      appointmentId,
      doctorId,
      patientId,
      status:        'ended',
      modality:      'voice',
    });

    const req = makeReq({ params: { sessionId }, body: { hmacToken: 'valid.hmac' } });
    const out = makeRes();
    const err = await invoke(exchangeTranscriptTokenHandler, req, out.res);

    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
    // TTL: 15 minutes. We allow a 10-second tolerance for test flake.
    const mintCall = jwtMint.mintScopedConsultationJwt.mock.calls[0]?.[0] as {
      role:     string;
      sessionId: string;
      expiresAt: Date;
    };
    expect(mintCall.role).toBe('patient');
    expect(mintCall.sessionId).toBe(sessionId);
    const ttlMs = mintCall.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(14 * 60 * 1000);
    expect(ttlMs).toBeLessThan(16 * 60 * 1000);

    const payload = out.payload as {
      success: boolean;
      data: { accessToken: string; expiresAt: string };
    };
    expect(payload.data.accessToken).toBe('minted.transcript.jwt');
    expect(typeof payload.data.expiresAt).toBe('string');
  });

  it('also accepts body.token (Task 29 convention)', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue({
      id: sessionId, appointmentId, doctorId, patientId,
      status: 'ended', modality: 'voice',
    });

    const req = makeReq({ params: { sessionId }, body: { token: 'legacy.hmac' } });
    const out = makeRes();
    const err = await invoke(exchangeTranscriptTokenHandler, req, out.res);
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
  });

  it('401 on HMAC verification failure', async () => {
    consultationToken.verifyConsultationToken.mockImplementation(() => {
      throw new UnauthorizedError('bad sig');
    });
    const req = makeReq({ params: { sessionId }, body: { hmacToken: 'bad' } });
    const err = await invoke(exchangeTranscriptTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(jwtMint.mintScopedConsultationJwt).not.toHaveBeenCalled();
  });

  it('404 when session lookup returns null', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({ appointmentId });
    sessionService.findSessionById.mockResolvedValue(null);
    const req = makeReq({ params: { sessionId }, body: { hmacToken: 'valid' } });
    const err = await invoke(exchangeTranscriptTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('401 when token authorizes a different appointment', async () => {
    consultationToken.verifyConsultationToken.mockReturnValue({
      appointmentId: 'other-appt',
    });
    sessionService.findSessionById.mockResolvedValue({
      id: sessionId, appointmentId, doctorId, patientId,
      status: 'ended', modality: 'voice',
    });
    const req = makeReq({ params: { sessionId }, body: { hmacToken: 'valid' } });
    const err = await invoke(exchangeTranscriptTokenHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
  });
});

// ===========================================================================
// downloadTranscriptPdfHandler
// ===========================================================================

describe('downloadTranscriptPdfHandler', () => {
  it('400 when sessionId path param is missing', async () => {
    const req = makeReq({
      params:  {},
      headers: { authorization: 'Bearer something' },
    });
    const err = await invoke(downloadTranscriptPdfHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('401 when Authorization header is missing (service not called)', async () => {
    const req = makeReq({ params: { sessionId } });
    const err = await invoke(downloadTranscriptPdfHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(transcriptSvc.renderConsultTranscriptPdf).not.toHaveBeenCalled();
  });

  it('200 returns the signed URL as JSON on success (patient JWT path)', async () => {
    // Patient JWT path: verifyScopedConsultationJwt returns a patient claim.
    jwtMint.verifyScopedConsultationJwt.mockReturnValue({
      consult_role: 'patient',
      session_id:   sessionId,
    });
    sessionService.findSessionById.mockResolvedValue({
      id: sessionId, appointmentId, doctorId, patientId,
      status: 'ended', modality: 'voice',
    });
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    transcriptSvc.renderConsultTranscriptPdf.mockResolvedValue({
      signedUrl: 'https://example.com/signed.pdf?token=abc',
      expiresAt,
      cacheHit:  false,
      filename:  'transcript-11111111.pdf',
    });

    const req = makeReq({
      params:  { sessionId },
      headers: { authorization: 'Bearer patient.jwt' },
    });
    const out = makeRes();
    const err = await invoke(downloadTranscriptPdfHandler, req, out.res);

    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
    const payload = out.payload as {
      success: boolean;
      data: { signedUrl: string; expiresAt: string; cacheHit: boolean; filename: string };
    };
    expect(payload.data.signedUrl).toBe('https://example.com/signed.pdf?token=abc');
    expect(payload.data.cacheHit).toBe(false);
    expect(payload.data.filename).toBe('transcript-11111111.pdf');
    expect(payload.data.expiresAt).toBe(expiresAt.toISOString());
    expect(transcriptSvc.renderConsultTranscriptPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        requestingUserId: patientId,
        requestingRole:   'patient',
      }),
    );
  });

  it('maps TranscriptExportError.not_a_participant → 403 JSON', async () => {
    jwtMint.verifyScopedConsultationJwt.mockReturnValue({
      consult_role: 'patient', session_id: sessionId,
    });
    sessionService.findSessionById.mockResolvedValue({
      id: sessionId, appointmentId, doctorId, patientId,
      status: 'ended', modality: 'voice',
    });
    transcriptSvc.renderConsultTranscriptPdf.mockRejectedValue(
      new transcriptSvc.TranscriptExportError('not_a_participant', 'nope'),
    );
    const req = makeReq({
      params:  { sessionId },
      headers: { authorization: 'Bearer patient.jwt' },
    });
    const out = makeRes();
    const err = await invoke(downloadTranscriptPdfHandler, req, out.res);
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(403);
    expect(out.redirectTo).toBeNull();
    const payload = out.payload as { error: { code: string } };
    expect(payload.error.code).toBe('not_a_participant');
  });

  it('maps TranscriptExportError.session_not_ended → 409 JSON', async () => {
    jwtMint.verifyScopedConsultationJwt.mockReturnValue({
      consult_role: 'patient', session_id: sessionId,
    });
    sessionService.findSessionById.mockResolvedValue({
      id: sessionId, appointmentId, doctorId, patientId,
      status: 'live', modality: 'voice',
    });
    transcriptSvc.renderConsultTranscriptPdf.mockRejectedValue(
      new transcriptSvc.TranscriptExportError('session_not_ended', 'not ended'),
    );
    const req = makeReq({
      params:  { sessionId },
      headers: { authorization: 'Bearer patient.jwt' },
    });
    const out = makeRes();
    const err = await invoke(downloadTranscriptPdfHandler, req, out.res);
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(409);
  });

  it('maps TranscriptExportError.revoked → 410 JSON', async () => {
    jwtMint.verifyScopedConsultationJwt.mockReturnValue({
      consult_role: 'patient', session_id: sessionId,
    });
    sessionService.findSessionById.mockResolvedValue({
      id: sessionId, appointmentId, doctorId, patientId,
      status: 'ended', modality: 'voice',
    });
    transcriptSvc.renderConsultTranscriptPdf.mockRejectedValue(
      new transcriptSvc.TranscriptExportError('revoked', 'gone'),
    );
    const req = makeReq({
      params:  { sessionId },
      headers: { authorization: 'Bearer patient.jwt' },
    });
    const out = makeRes();
    const err = await invoke(downloadTranscriptPdfHandler, req, out.res);
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(410);
  });

  it('propagates non-TranscriptExportError errors to Express error handler', async () => {
    jwtMint.verifyScopedConsultationJwt.mockReturnValue({
      consult_role: 'patient', session_id: sessionId,
    });
    sessionService.findSessionById.mockResolvedValue({
      id: sessionId, appointmentId, doctorId, patientId,
      status: 'ended', modality: 'voice',
    });
    const unexpected = new Error('database down');
    transcriptSvc.renderConsultTranscriptPdf.mockRejectedValue(unexpected);
    const req = makeReq({
      params:  { sessionId },
      headers: { authorization: 'Bearer patient.jwt' },
    });
    const err = await invoke(downloadTranscriptPdfHandler, req, makeRes().res);
    expect(err).toBe(unexpected);
  });
});
