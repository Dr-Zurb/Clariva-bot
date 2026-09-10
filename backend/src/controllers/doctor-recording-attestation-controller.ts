/**
 * Doctor recording attestation (rec-11 / REC-D4).
 *
 * GET  /api/v1/recording-attestation — status + clauses + active version
 * POST /api/v1/recording-attestation — accept the active version
 *
 * Auth: doctor JWT. Doctor id is taken from the token only.
 */

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { validateAcceptRecordingAttestationBody } from '../utils/validation';
import {
  acceptDoctorRecordingAttestation,
  getDoctorRecordingAttestationStatus,
} from '../services/doctor-recording-attestation-service';

function requireUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return userId;
}

export const getRecordingAttestationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const doctorId = requireUserId(req);
    const status = await getDoctorRecordingAttestationStatus(doctorId);
    res.status(200).json(successResponse(status, req));
  }
);

export const acceptRecordingAttestationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const doctorId = requireUserId(req);
    validateAcceptRecordingAttestationBody(req.body);
    const status = await acceptDoctorRecordingAttestation(doctorId);
    res.status(200).json(successResponse(status, req));
  }
);
