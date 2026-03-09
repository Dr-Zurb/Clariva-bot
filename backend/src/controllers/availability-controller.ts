/**
 * Availability Controller (e-task-3)
 *
 * GET /api/v1/availability - List doctor's weekly availability (auth required)
 * PUT /api/v1/availability - Replace entire availability (auth required)
 *
 * MUST: Use asyncHandler and successResponse - see STANDARDS.md
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import {
  getDoctorAvailability,
  replaceDoctorAvailability,
} from '../services/availability-service';
import { validatePutAvailability } from '../utils/validation';
import { UnauthorizedError } from '../utils/errors';

/**
 * Get availability
 * GET /api/v1/availability
 *
 * Auth: Requires authenticated doctor.
 */
export const getAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const availability = await getDoctorAvailability(userId, correlationId, userId);

  res.status(200).json(successResponse({ availability }, req));
});

/**
 * Replace availability (PUT)
 * PUT /api/v1/availability
 *
 * Body: { slots: [{ day_of_week, start_time, end_time }, ...] }
 * Auth: Requires authenticated doctor.
 */
export const putAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { slots } = validatePutAvailability(req.body);

  const availability = await replaceDoctorAvailability(
    userId,
    slots,
    correlationId,
    userId
  );

  res.status(200).json(successResponse({ availability }, req));
});
