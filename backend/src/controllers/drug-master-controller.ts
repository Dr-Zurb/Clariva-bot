/**
 * Drug Master Controller (EHR Sub-batch B1 / T2.7)
 *
 * Single endpoint: GET /api/v1/drugs/search?q=<text>&limit=<n>
 *
 * Auth: requires a valid doctor JWT (mounted with authenticateToken in
 * the route file). Lookup data isn't PHI but we still gate at the API
 * boundary so anonymous traffic can't enumerate the full catalogue.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { searchDrugs } from '../services/drug-master-service';

export const searchDrugsHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
  const rawLimitStr = typeof req.query.limit === 'string' ? req.query.limit : '';
  const parsedLimit = Number(rawLimitStr);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

  const results = await searchDrugs(rawQuery, limit);

  res.status(200).json(successResponse({ results }, req));
});
