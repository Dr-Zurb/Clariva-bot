/**
 * Medicine parse controller (medical-history med redesign).
 *
 * POST /api/v1/medicines/parse — gated, suggestion-only AI parse of a doctor's
 * free-text medication line into schema-bounded fields. PHI is redacted in the
 * service before the model call; audit is metadata-only.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { validateParseMedicineRequest } from '../utils/validation';
import { parseMedicineWithAI } from '../services/medicine-parse-service';

export const parseMedicineHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const correlationId = req.correlationId || 'unknown';
  const body = validateParseMedicineRequest(req.body);

  const result = await parseMedicineWithAI(body, correlationId);

  res.status(200).json(successResponse(result, req));
});
