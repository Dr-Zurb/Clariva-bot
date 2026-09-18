/**
 * rec-18 — GET /replay/gaps authorization.
 *
 * Reuses `resolveReplayCaller`. Both participants may read; a
 * non-participant is refused.
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
jest.mock('../../../src/services/supabase-jwt-mint', () => {
  const actual = jest.requireActual('../../../src/services/supabase-jwt-mint') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    verifyScopedConsultationJwt: jest.fn(),
  };
});
jest.mock('../../../src/services/recording-gap-service', () => ({
  listRecordingGaps: jest.fn(),
}));
jest.mock('../../../src/services/recording-pause-service', () => ({
  pauseRecording: jest.fn(),
  resumeRecording: jest.fn(),
  extendRecordingPause: jest.fn(),
  getCurrentRecordingState: jest.fn(),
  resolveRecordingCaller: jest.fn(),
  isSessionParticipant: jest.fn(),
}));

import { getRecordingGapsHandler } from '../../../src/controllers/consultation-controller';
import * as gapSvc from '../../../src/services/recording-gap-service';
import * as pauseSvc from '../../../src/services/recording-pause-service';
import * as sessionSvc from '../../../src/services/consultation-session-service';
import * as jwtMint from '../../../src/services/supabase-jwt-mint';
import * as database from '../../../src/config/database';
import { ForbiddenError, UnauthorizedError } from '../../../src/utils/errors';

const mockedGaps = gapSvc as jest.Mocked<typeof gapSvc>;
const mockedPause = pauseSvc as jest.Mocked<typeof pauseSvc>;
const mockedSession = sessionSvc as jest.Mocked<typeof sessionSvc>;
const mockedJwt = jwtMint as jest.Mocked<typeof jwtMint>;

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

function makeReq(headers: Record<string, string>): Request {
  return {
    body: {},
    params: { sessionId: 'sess-1' },
    headers,
    header: (name: string) => headers[name] ?? headers[name.toLowerCase()],
    correlationId: 'cid-rec-18',
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

describe('rec-18 · GET /replay/gaps auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGaps.listRecordingGaps.mockResolvedValue({ schemaVersion: 1, gaps: [] });
    mockedSession.findSessionById.mockResolvedValue({
      id: 'sess-1',
      patientId: 'pat-1',
      doctorId: 'doc-1',
    } as never);
  });

  it('lets the patient read gaps with a scoped consult JWT', async () => {
    mockedJwt.verifyScopedConsultationJwt.mockReturnValue({
      aud: 'authenticated',
      role: 'authenticated',
      sub: 'patient:appt-1',
      exp: 9_999_999_999,
      iat: 1,
      session_id: 'sess-1',
      consult_role: 'patient',
    });
    mockedPause.isSessionParticipant.mockResolvedValue({
      isParticipant: true,
      role: 'patient',
    });

    const { res, out } = makeRes();
    const err = await invoke(
      getRecordingGapsHandler,
      makeReq({ authorization: 'Bearer scoped.patient.jwt' }),
      res,
    );
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
    expect(mockedGaps.listRecordingGaps).toHaveBeenCalledWith('sess-1');
  });

  it('lets the session doctor read gaps with a Supabase JWT', async () => {
    mockedJwt.verifyScopedConsultationJwt.mockImplementation(() => {
      throw new Error('not scoped');
    });
    (database.supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'doc-1' } },
      error: null,
    } as never);
    mockedPause.isSessionParticipant.mockResolvedValue({
      isParticipant: true,
      role: 'doctor',
    });

    const { res, out } = makeRes();
    const err = await invoke(
      getRecordingGapsHandler,
      makeReq({ authorization: 'Bearer doctor.supabase.jwt' }),
      res,
    );
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
    expect(mockedGaps.listRecordingGaps).toHaveBeenCalledWith('sess-1');
  });

  it('refuses a non-participant', async () => {
    mockedJwt.verifyScopedConsultationJwt.mockImplementation(() => {
      throw new Error('not scoped');
    });
    (database.supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'stranger' } },
      error: null,
    } as never);
    mockedPause.isSessionParticipant.mockResolvedValue({
      isParticipant: false,
      role: null,
    });

    const { res } = makeRes();
    const err = await invoke(
      getRecordingGapsHandler,
      makeReq({ authorization: 'Bearer stranger.jwt' }),
      res,
    );
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(mockedGaps.listRecordingGaps).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer', async () => {
    const { res } = makeRes();
    const err = await invoke(getRecordingGapsHandler, makeReq({}), res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedGaps.listRecordingGaps).not.toHaveBeenCalled();
  });
});
