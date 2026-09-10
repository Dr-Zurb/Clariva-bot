/**
 * POST /api/v1/appointments/:id/desk-cancel
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 * Lean payload — no clinical_notes.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import { validateDeskCancelBody, validateGetAppointmentParams } from '../utils/validation';
import { cancelAppointmentForDesk } from '../services/desk-cancel-service';

export const deskCancelAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  validateDeskCancelBody(req.body);
  const result = await cancelAppointmentForDesk(id, doctorId, actorId, correlationId);
  res.status(200).json(successResponse(result, req));
});
