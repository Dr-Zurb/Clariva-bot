/**
 * Front-desk history sidecar.
 * GET/PUT /api/v1/appointments/:id/history-submission
 * PATCH /api/v1/appointments/:id/history-submission/accept (doctor JWT only)
 *
 * Auth: GET/PUT doctor or opted-in staff. Accept is doctor-only.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import { UnauthorizedError } from '../utils/errors';
import {
  validateAcceptHistorySubmissionBody,
  validateGetAppointmentParams,
  validateUpsertHistorySubmissionBody,
} from '../utils/validation';
import {
  acceptHistorySubmissionItem,
  getHistorySubmissionView,
  upsertHistorySubmission,
} from '../services/patient-history-submissions-service';

function actorIsStaff(req: Request): boolean {
  return req.actorKind === 'staff';
}

export const getHistorySubmissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const view = await getHistorySubmissionView(id, doctorId, correlationId, actorId);
  res.status(200).json(successResponse(view, req));
});

export const upsertHistorySubmissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateUpsertHistorySubmissionBody(req.body);
  const submission = await upsertHistorySubmission(
    id,
    doctorId,
    {
      ...body,
      source: req.staffRole === 'assistant' ? 'assistant' : 'front_desk',
    },
    correlationId,
    actorId,
    actorIsStaff(req)
  );
  res.status(200).json(successResponse({ submission }, req));
});

export const acceptHistorySubmissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateAcceptHistorySubmissionBody(req.body);
  const result = await acceptHistorySubmissionItem(id, userId, body, correlationId);
  res.status(200).json(successResponse(result, req));
});
