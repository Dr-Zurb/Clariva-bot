/**
 * POST /api/v1/appointments/:id/desk-left
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 * Lean payload — no clinical_notes.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import { validateDeskLeftBody, validateGetAppointmentParams } from '../utils/validation';
import { leaveAppointmentForDesk } from '../services/desk-left-service';

export const deskLeftAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateDeskLeftBody(req.body);
  const result = await leaveAppointmentForDesk(id, doctorId, actorId, correlationId, body);
  res.status(200).json(successResponse(result, req));
});
