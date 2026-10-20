/**
 * Social analytics (phase 9). Validate the period, then the service.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { readSocialAnalytics } from '../services/social-analytics-service';

const querySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
}

export const getSocialAnalyticsHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = getUserId(req);
  const query = querySchema.parse(req.query);
  const report = await readSocialAnalytics(doctorId, query.from, query.to, req.correlationId || 'unknown');
  res.status(200).json(successResponse(report, req));
});
