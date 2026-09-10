import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/env', () => ({
  env: { SLOT_INTERVAL_MINUTES: 15 },
}));

jest.mock('../../../src/config/database', () => ({
  supabase: {},
  getSupabaseAdminClient: jest.fn(),
}));

const startConsultation = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const startVoiceConsultation = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/appointment-service', () => ({
  startConsultation: (...args: unknown[]) => startConsultation(...args),
  startVoiceConsultation: (...args: unknown[]) => startVoiceConsultation(...args),
  getConsultationToken: jest.fn(),
  getConsultationTokenForPatient: jest.fn(),
}));
jest.mock('../../../src/services/notification-service', () => ({
  sendConsultationReadyToPatient: jest.fn(),
}));
jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
  createSession: jest.fn(),
  getJoinToken: jest.fn(),
  getJoinTokenForAppointment: jest.fn(),
  markParticipantJoined: jest.fn(),
  updateSessionStatus: jest.fn(),
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
jest.mock('../../../src/services/recording-pause-service', () => ({
  pauseRecording: jest.fn(),
  resumeRecording: jest.fn(),
  extendRecordingPause: jest.fn(),
  getCurrentRecordingState: jest.fn(),
  resolveRecordingCaller: jest.fn(),
  isSessionParticipant: jest.fn(),
}));
jest.mock('../../../src/services/recording-escalation-service', () => ({
  requestVideoEscalation: jest.fn(),
  patientResponseToEscalation: jest.fn(),
  patientRevokeVideoMidCall: jest.fn(),
  offerVideoRecording: jest.fn(),
  pauseVideoGrant: jest.fn(),
  resumeVideoGrant: jest.fn(),
  getVideoEscalationStateForSession: jest.fn(),
  extendVideoGrant: jest.fn(),
  isSessionParticipantForRequest: jest.fn(),
}));

const assertDoctorRecordingAttestation =
  jest.fn<(doctorId: string) => Promise<void>>();

jest.mock('../../../src/services/doctor-recording-attestation-service', () => ({
  assertDoctorRecordingAttestation: (doctorId: string) =>
    assertDoctorRecordingAttestation(doctorId),
  getDoctorRecordingAttestationStatus: jest.fn(),
  acceptDoctorRecordingAttestation: jest.fn(),
}));

import {
  startConsultationHandler,
  startTextConsultationHandler,
  startVoiceConsultationHandler,
} from '../../../src/controllers/consultation-controller';
import { DoctorRecordingAttestationRequiredError } from '../../../src/utils/errors';

const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const DOCTOR_ID = '660e8400-e29b-41d4-a716-446655440001';

async function invoke(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  req: Request,
  res: Response
): Promise<unknown> {
  let captured: unknown = undefined;
  await handler(req, res, (err?: unknown) => {
    captured = err;
  });
  await Promise.resolve();
  return captured;
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function startReq(): Request {
  return {
    user: { id: DOCTOR_ID },
    body: { appointmentId: APPOINTMENT_ID },
    correlationId: 'cid',
  } as unknown as Request;
}

describe('consult start attestation gate (rec-11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    startConsultation.mockResolvedValue({ sessionId: 's' });
    startVoiceConsultation.mockResolvedValue({ sessionId: 's' });
  });

  it('blocks video start when attestation is missing or only at an older version', async () => {
    assertDoctorRecordingAttestation.mockRejectedValue(
      new DoctorRecordingAttestationRequiredError()
    );
    const err = await invoke(startConsultationHandler, startReq(), mockRes());
    expect(err).toBeInstanceOf(DoctorRecordingAttestationRequiredError);
    expect(assertDoctorRecordingAttestation).toHaveBeenCalledWith(DOCTOR_ID);
    expect(startConsultation).not.toHaveBeenCalled();
  });

  it('starts video and voice when the active version is accepted', async () => {
    assertDoctorRecordingAttestation.mockResolvedValue(undefined);
    expect(await invoke(startConsultationHandler, startReq(), mockRes())).toBeUndefined();
    expect(startConsultation).toHaveBeenCalledWith(APPOINTMENT_ID, 'cid', DOCTOR_ID);

    expect(await invoke(startVoiceConsultationHandler, startReq(), mockRes())).toBeUndefined();
    expect(startVoiceConsultation).toHaveBeenCalledWith(APPOINTMENT_ID, 'cid', DOCTOR_ID);
  });

  it('does not gate text consult start (audio mandate only)', async () => {
    assertDoctorRecordingAttestation.mockRejectedValue(
      new DoctorRecordingAttestationRequiredError()
    );
    await invoke(startTextConsultationHandler, startReq(), mockRes());
    expect(assertDoctorRecordingAttestation).not.toHaveBeenCalled();
  });
});
