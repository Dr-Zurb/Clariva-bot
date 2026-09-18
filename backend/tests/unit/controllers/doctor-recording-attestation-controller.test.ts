import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/doctor-recording-attestation-service', () => ({
  getDoctorRecordingAttestationStatus: jest.fn(),
  acceptDoctorRecordingAttestation: jest.fn(),
}));

import {
  acceptRecordingAttestationHandler,
  getRecordingAttestationHandler,
} from '../../../src/controllers/doctor-recording-attestation-controller';
import * as attestation from '../../../src/services/doctor-recording-attestation-service';
import { UnauthorizedError, ValidationError } from '../../../src/utils/errors';

const mocked = attestation as jest.Mocked<typeof attestation>;

async function invoke(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  req: Request,
  res: Response
): Promise<unknown> {
  let captured: unknown = undefined;
  const next = (err?: unknown): void => {
    captured = err;
  };
  await handler(req, res, next);
  await Promise.resolve();
  return captured;
}

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('doctor-recording-attestation-controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated reads and accepts', async () => {
    const req = { user: undefined, body: {}, correlationId: 'c' } as unknown as Request;
    const getErr = await invoke(getRecordingAttestationHandler, req, mockRes());
    const postErr = await invoke(acceptRecordingAttestationHandler, req, mockRes());
    expect(getErr).toBeInstanceOf(UnauthorizedError);
    expect(postErr).toBeInstanceOf(UnauthorizedError);
    expect(mocked.getDoctorRecordingAttestationStatus).not.toHaveBeenCalled();
    expect(mocked.acceptDoctorRecordingAttestation).not.toHaveBeenCalled();
  });

  it('accepts using the token doctor id, never a body doctor id', async () => {
    mocked.acceptDoctorRecordingAttestation.mockResolvedValue({
      accepted: true,
      policyVersion: 'DRAFT-REC-D2-UNAPPROVED',
      acceptedAt: '2026-08-23T10:00:00.000Z',
      clauses: [],
    });

    const spoofed = await invoke(
      acceptRecordingAttestationHandler,
      {
        user: { id: 'doctor-from-token' },
        body: { doctorId: 'someone-else' },
        correlationId: 'c',
      } as unknown as Request,
      mockRes()
    );
    expect(spoofed).toBeInstanceOf(ValidationError);
    expect(mocked.acceptDoctorRecordingAttestation).not.toHaveBeenCalled();

    const res = mockRes();
    const err = await invoke(
      acceptRecordingAttestationHandler,
      {
        user: { id: 'doctor-from-token' },
        body: {},
        correlationId: 'c',
      } as unknown as Request,
      res
    );
    expect(err).toBeUndefined();
    expect(mocked.acceptDoctorRecordingAttestation).toHaveBeenCalledWith('doctor-from-token');
  });
});
