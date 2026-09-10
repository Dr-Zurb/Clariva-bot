/**
 * rec-17 — pause / resume / state dual-bearer mount.
 *
 * The routes no longer use `authenticateToken`. The handler extracts
 * the Bearer and hands it to the pause service, same as attachments/sign.
 * A doctor still presents a Supabase access token; a patient presents
 * the scoped consult JWT they already hold.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => null,
  supabase: { auth: { getUser: jest.fn() } },
}));
jest.mock('../../../src/services/appointment-service', () => ({
  startConsultation: jest.fn(),
  startVoiceConsultation: jest.fn(),
  getConsultationToken: jest.fn(),
  getConsultationTokenForPatient: jest.fn(),
}));
jest.mock('../../../src/services/notification-service', () => ({
  sendConsultationReadyToPatient: jest.fn(),
}));
jest.mock('../../../src/services/recording-access-service', () => ({
  mintReplayUrl: jest.fn(),
  getReplayAvailability: jest.fn(),
  MintReplayError: class MintReplayError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = 'MintReplayError';
    }
  },
  VideoOtpRequiredError: class VideoOtpRequiredError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'VideoOtpRequiredError';
    }
  },
}));
jest.mock('../../../src/services/transcript-pdf-service', () => ({
  renderConsultTranscriptPdf: jest.fn(),
  TranscriptExportError: class TranscriptExportError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = 'TranscriptExportError';
    }
  },
}));
jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
  createSession: jest.fn(),
  getJoinToken: jest.fn(),
  getJoinTokenForAppointment: jest.fn(),
  markParticipantJoined: jest.fn(),
  updateSessionStatus: jest.fn(),
}));
jest.mock('../../../src/services/recording-pause-service', () => ({
  pauseRecording: jest.fn(),
  resumeRecording: jest.fn(),
  extendRecordingPause: jest.fn(),
  getCurrentRecordingState: jest.fn(),
  resolveRecordingCaller: jest.fn(),
  isSessionParticipant: jest.fn(),
}));

import {
  pauseRecordingHandler,
  resumeRecordingHandler,
  getRecordingStateHandler,
} from '../../../src/controllers/consultation-controller';
import * as pauseSvc from '../../../src/services/recording-pause-service';
import { UnauthorizedError } from '../../../src/utils/errors';

const mockedPause = pauseSvc as jest.Mocked<typeof pauseSvc>;

function makeRes(): { res: Response; out: { statusCode: number } } {
  const out = { statusCode: 0 };
  const res = {
    status: (code: number) => {
      out.statusCode = code;
      return res;
    },
    json: () => res,
    send: () => res,
  } as unknown as Response;
  return { res, out };
}

function makeReq(opts: {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}): Request {
  const headers = opts.headers ?? {};
  return {
    body: opts.body ?? {},
    params: opts.params ?? { sessionId: 'sess-1' },
    headers,
    header: (name: string) => headers[name] ?? headers[name.toLowerCase()],
    correlationId: 'cid-rec-17',
  } as unknown as Request;
}

async function invoke(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown;
  await handler(req, res, (err?: unknown) => {
    captured = err;
  });
  await new Promise((resolve) => setImmediate(resolve));
  return captured;
}

describe('rec-17 · pause/resume/state mount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPause.pauseRecording.mockResolvedValue(undefined);
    mockedPause.resumeRecording.mockResolvedValue(undefined);
    mockedPause.resolveRecordingCaller.mockResolvedValue({
      role: 'patient',
      actorId: 'sess-1',
    });
    mockedPause.getCurrentRecordingState.mockResolvedValue({
      sessionId: 'sess-1',
      paused: false,
    });
  });

  it('forwards a scoped patient JWT on pause without requiring req.user', async () => {
    const { res, out } = makeRes();
    const err = await invoke(
      pauseRecordingHandler,
      makeReq({
        headers: { authorization: 'Bearer scoped.patient.jwt' },
        body: {},
      }),
      res,
    );
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(204);
    expect(mockedPause.pauseRecording).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      bearerJwt: 'scoped.patient.jwt',
      reasonCode: undefined,
      correlationId: 'cid-rec-17',
    });
  });

  it('forwards a doctor Supabase JWT and reasonCode on the same URL', async () => {
    const { res } = makeRes();
    const err = await invoke(
      pauseRecordingHandler,
      makeReq({
        headers: { authorization: 'Bearer doctor.supabase.jwt' },
        body: { reasonCode: 'administrative' },
      }),
      res,
    );
    expect(err).toBeUndefined();
    expect(mockedPause.pauseRecording).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      bearerJwt: 'doctor.supabase.jwt',
      reasonCode: 'administrative',
      correlationId: 'cid-rec-17',
    });
  });

  it('rejects a missing bearer on pause, resume, and state', async () => {
    const { res } = makeRes();
    await expect(
      invoke(pauseRecordingHandler, makeReq({ headers: {} }), res)
    ).resolves.toBeInstanceOf(UnauthorizedError);
    await expect(
      invoke(resumeRecordingHandler, makeReq({ headers: {} }), res)
    ).resolves.toBeInstanceOf(UnauthorizedError);
    await expect(
      invoke(getRecordingStateHandler, makeReq({ headers: {} }), res)
    ).resolves.toBeInstanceOf(UnauthorizedError);
  });

  it('GET /recording/state resolves the bearer before reading state', async () => {
    const { res, out } = makeRes();
    const err = await invoke(
      getRecordingStateHandler,
      makeReq({ headers: { authorization: 'Bearer scoped.patient.jwt' } }),
      res,
    );
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
    expect(mockedPause.resolveRecordingCaller).toHaveBeenCalledWith(
      'sess-1',
      'scoped.patient.jwt',
    );
    expect(mockedPause.getCurrentRecordingState).toHaveBeenCalledWith('sess-1');
  });
});
