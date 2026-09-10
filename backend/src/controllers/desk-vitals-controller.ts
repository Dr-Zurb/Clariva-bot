/**
 * Front-desk vitals after check-in.
 * GET/PUT /api/v1/appointments/:id/desk-vitals
 *
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import { validateDeskVitalsBody, validateGetAppointmentParams } from '../utils/validation';
import { getDeskVitals, upsertDeskVitals } from '../services/desk-vitals-service';

export const getDeskVitalsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const vitals = await getDeskVitals(id, doctorId, correlationId, actorId);
  res.status(200).json(successResponse({ vitals }, req));
});

export const upsertDeskVitalsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateDeskVitalsBody(req.body);
  const vitals = await upsertDeskVitals(id, doctorId, body, correlationId, actorId);
  res.status(200).json(successResponse({ vitals }, req));
});
