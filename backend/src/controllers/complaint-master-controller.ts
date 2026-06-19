/**
 * Complaint Master Controller (subjective-tab · subj-06)
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { validateParseComplaintRequest } from '../utils/validation';
import { searchComplaints } from '../services/complaint-master-service';
import { parseComplaintWithAI } from '../services/complaint-parse-service';

export const searchComplaintsHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
  const rawLimitStr = typeof req.query.limit === 'string' ? req.query.limit : '';
  const parsedLimit = Number(rawLimitStr);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

  const results = await searchComplaints(rawQuery, limit);

  res.status(200).json(successResponse({ results }, req));
});

/**
 * POST /api/v1/complaints/parse (subj-14) — gated, suggestion-only AI parse of a
 * doctor's free-text complaint line into schema-bounded fields. PHI is redacted
 * in the service before the model call; audit is metadata-only.
 */
export const parseComplaintHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const correlationId = req.correlationId || 'unknown';
  const body = validateParseComplaintRequest(req.body);

  const result = await parseComplaintWithAI(body, correlationId);

  res.status(200).json(successResponse(result, req));
});
