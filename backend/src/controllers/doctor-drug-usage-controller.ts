/**
 * Doctor drug usage controller (rx-polish-favorites · rxf-05).
 *
 * GET /api/v1/doctors/me/drug-usage → { scores: { [drug_master_id]: usage_count } }
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { listMyDrugUsage } from '../services/doctor-drug-usage-service';

export const listMyDrugUsageHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const correlationId = req.correlationId || 'unknown';
  const scores = await listMyDrugUsage(correlationId, userId);

  res.set('Cache-Control', 'private, max-age=300');
  res.status(200).json(successResponse({ scores }, req));
});
