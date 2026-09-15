/**
 * POST /api/v1/appointments/:id/desk-reschedule
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 * Lean payload — no clinical_notes.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import { validateDeskRescheduleBody, validateGetAppointmentParams } from '../utils/validation';
import { rescheduleAppointmentForDesk } from '../services/desk-reschedule-service';

export const deskRescheduleAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateDeskRescheduleBody(req.body);
  const result = await rescheduleAppointmentForDesk(
    id,
    doctorId,
    actorId,
    body.appointmentDate,
    correlationId
  );
  res.status(200).json(successResponse(result, req));
});
