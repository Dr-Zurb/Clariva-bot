/**
 * GET /api/v1/dashboard/counts
 *
 * Doctor id comes from the session. There is no query string and no body.
 */

import type { Request, Response } from 'express';
import { getDashboardCountsForDoctor } from '../services/dashboard-counts-service';
import { asyncHandler } from '../utils/async-handler';
import { UnauthorizedError } from '../utils/errors';
import { successResponse } from '../utils/response';

export const getDashboardCountsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const counts = await getDashboardCountsForDoctor(
      userId,
      req.correlationId || 'unknown',
    );
    res.status(200).json(successResponse(counts, req));
  },
);
