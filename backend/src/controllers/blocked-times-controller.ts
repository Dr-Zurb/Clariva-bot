/**
 * Blocked Times Controller (e-task-3)
 *
 * GET    /api/v1/blocked-times - List doctor's blocked times (auth required)
 * POST   /api/v1/blocked-times - Create blocked time (auth required)
 * DELETE /api/v1/blocked-times/:id - Delete blocked time (auth required)
 *
 * MUST: Use asyncHandler and successResponse - see STANDARDS.md
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import {
  getBlockedTimesForDoctor,
  createBlockedTimeForDoctor,
  deleteBlockedTimeForDoctor,
} from '../services/availability-service';
import {
  validatePostBlockedTime,
  validateGetBlockedTimesQuery,
  validateDeleteBlockedTimeParams,
} from '../utils/validation';
import { UnauthorizedError } from '../utils/errors';

/**
 * Get blocked times
 * GET /api/v1/blocked-times?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 *
 * Auth: Requires authenticated doctor.
 */
export const getBlockedTimesHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const query = validateGetBlockedTimesQuery(
    req.query as Record<string, string | string[] | undefined>
  );
  const filters =
    query.start_date || query.end_date
      ? { startDate: query.start_date, endDate: query.end_date }
      : undefined;

  const blockedTimes = await getBlockedTimesForDoctor(
    userId,
    correlationId,
    userId,
    filters
  );

  res.status(200).json(successResponse({ blockedTimes }, req));
});

/**
 * Create blocked time
 * POST /api/v1/blocked-times
 *
 * Body: { start_time, end_time, reason? } (ISO datetime)
 * Auth: Requires authenticated doctor.
 */
export const postBlockedTimeHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const data = validatePostBlockedTime(req.body);

  const blockedTime = await createBlockedTimeForDoctor(
    userId,
    { start_time: data.start_time, end_time: data.end_time, reason: data.reason },
    correlationId,
    userId
  );

  res.status(201).json(successResponse({ blockedTime }, req));
});

/**
 * Delete blocked time
 * DELETE /api/v1/blocked-times/:id
 *
 * Auth: Requires authenticated doctor.
 */
export const deleteBlockedTimeHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validateDeleteBlockedTimeParams(req.params);

  await deleteBlockedTimeForDoctor(id, userId, correlationId, userId);

  res.status(204).send();
});
