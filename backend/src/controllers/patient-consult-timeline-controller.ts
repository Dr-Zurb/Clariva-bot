/**
 * rec-28 — GET /api/v1/patients/:id/consult-timeline
 * Orchestrates only: Zod → service → successResponse.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { validateGetPatientParams } from '../utils/validation';
import { listPatientConsultTimeline } from '../services/patient-consult-timeline-service';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const getPatientConsultTimelineHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const { id } = validateGetPatientParams(req.params);
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query');
    }

    const data = await listPatientConsultTimeline({
      patientId: id,
      doctorId: userId,
      correlationId,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    res.set('Cache-Control', 'private, no-cache');
    res.status(200).json(successResponse(data, req));
  },
);
