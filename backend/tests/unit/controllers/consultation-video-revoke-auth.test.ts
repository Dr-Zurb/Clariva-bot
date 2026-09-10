/**
 * Dual-bearer mount for patient video-escalation controls.
 *
 * Bot patients hold a scoped consult JWT. `authenticateToken` cannot
 * resolve it — same hole rec-17 closed for pause/resume/state.
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
jest.mock('../../../src/services/recording-escalation-service', () => ({
  patientRevokeVideoMidCall: jest.fn(),
  offerVideoRecording: jest.fn(),
  pauseVideoGrant: jest.fn(),
  resumeVideoGrant: jest.fn(),
  requestVideoEscalation: jest.fn(),
  patientResponseToEscalation: jest.fn(),
  getVideoEscalationStateForSession: jest.fn(),
  extendVideoGrant: jest.fn(),
  isSessionParticipantForRequest: jest.fn(),
}));

import {
  patientRevokeVideoHandler,
  offerVideoRecordingHandler,
  pauseVideoGrantHandler,
  resumeVideoGrantHandler,
  respondVideoEscalationHandler,
  getVideoEscalationStateHandler,
} from '../../../src/controllers/consultation-controller';
import * as pauseSvc from '../../../src/services/recording-pause-service';
import * as escSvc from '../../../src/services/recording-escalation-service';
import { ForbiddenError, UnauthorizedError } from '../../../src/utils/errors';

const mockedPause = pauseSvc as jest.Mocked<typeof pauseSvc>;
const mockedEsc = escSvc as jest.Mocked<typeof escSvc>;

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
  headers?: Record<string, string>;
  params?: Record<string, string>;
}): Request {
  const headers = opts.headers ?? {};
  return {
    body: {},
    params: opts.params ?? { sessionId: 'sess-1' },
    headers,
    header: (name: string) => headers[name] ?? headers[name.toLowerCase()],
    correlationId: 'cid-revoke-auth',
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

describe('patient video-escalation dual-bearer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPause.resolveRecordingCaller.mockResolvedValue({
      role: 'patient',
      actorId: 'patient-uuid',
    });
    mockedEsc.patientRevokeVideoMidCall.mockResolvedValue({
      correlationId: 'cid-revoke-auth',
      status: 'revoked',
    });
    mockedEsc.offerVideoRecording.mockResolvedValue({
      status: 'started',
    } as never);
    mockedEsc.pauseVideoGrant.mockResolvedValue({ status: 'paused' } as never);
    mockedEsc.resumeVideoGrant.mockResolvedValue({ status: 'resumed' } as never);
    mockedEsc.patientResponseToEscalation.mockResolvedValue({ accepted: true });
    mockedEsc.getVideoEscalationStateForSession.mockResolvedValue({
      state: { kind: 'idle', attemptsUsed: 0 },
      recent: [],
    } as never);
  });

  it('revokes with a scoped patient JWT and no req.user', async () => {
    const { res, out } = makeRes();
    const err = await invoke(
      patientRevokeVideoHandler,
      makeReq({ headers: { authorization: 'Bearer scoped.patient.jwt' } }),
      res,
    );
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
    expect(mockedPause.resolveRecordingCaller).toHaveBeenCalledWith(
      'sess-1',
      'scoped.patient.jwt',
    );
    expect(mockedEsc.patientRevokeVideoMidCall).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      patientId: 'patient-uuid',
      correlationId: 'cid-revoke-auth',
    });
  });

  it('rejects a doctor bearer on revoke', async () => {
    mockedPause.resolveRecordingCaller.mockResolvedValue({
      role: 'doctor',
      actorId: 'doc-1',
    });
    const { res } = makeRes();
    await expect(
      invoke(
        patientRevokeVideoHandler,
        makeReq({ headers: { authorization: 'Bearer doctor.jwt' } }),
        res,
      ),
    ).resolves.toBeInstanceOf(ForbiddenError);
    expect(mockedEsc.patientRevokeVideoMidCall).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer on revoke, offer, pause, and resume', async () => {
    const { res } = makeRes();
    await expect(
      invoke(patientRevokeVideoHandler, makeReq({ headers: {} }), res),
    ).resolves.toBeInstanceOf(UnauthorizedError);
    await expect(
      invoke(offerVideoRecordingHandler, makeReq({ headers: {} }), res),
    ).resolves.toBeInstanceOf(UnauthorizedError);
    await expect(
      invoke(pauseVideoGrantHandler, makeReq({ headers: {} }), res),
    ).resolves.toBeInstanceOf(UnauthorizedError);
    await expect(
      invoke(resumeVideoGrantHandler, makeReq({ headers: {} }), res),
    ).resolves.toBeInstanceOf(UnauthorizedError);
  });

  it('responds with a scoped patient JWT and no req.user', async () => {
    const { res, out } = makeRes();
    const err = await invoke(
      respondVideoEscalationHandler,
      {
        ...makeReq({
          headers: { authorization: 'Bearer scoped.patient.jwt' },
          params: { requestId: 'req-1' },
        }),
        body: { decision: 'allow' },
      } as Request,
      res,
    );
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
    expect(mockedEsc.patientResponseToEscalation).toHaveBeenCalledWith({
      requestId: 'req-1',
      bearerJwt: 'scoped.patient.jwt',
      decision: 'allow',
      correlationId: 'cid-revoke-auth',
    });
  });

  it('reads escalation state with a scoped patient JWT', async () => {
    const { res, out } = makeRes();
    const err = await invoke(
      getVideoEscalationStateHandler,
      makeReq({ headers: { authorization: 'Bearer scoped.patient.jwt' } }),
      res,
    );
    expect(err).toBeUndefined();
    expect(out.statusCode).toBe(200);
    expect(mockedPause.resolveRecordingCaller).toHaveBeenCalledWith(
      'sess-1',
      'scoped.patient.jwt',
    );
    expect(mockedEsc.getVideoEscalationStateForSession).toHaveBeenCalledWith({
      sessionId: 'sess-1',
    });
  });

  it('forwards the resolved patient actor on pause', async () => {
    const { res } = makeRes();
    const err = await invoke(
      pauseVideoGrantHandler,
      makeReq({ headers: { authorization: 'Bearer scoped.patient.jwt' } }),
      res,
    );
    expect(err).toBeUndefined();
    expect(mockedEsc.pauseVideoGrant).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      patientId: 'patient-uuid',
      correlationId: 'cid-revoke-auth',
    });
  });
});
