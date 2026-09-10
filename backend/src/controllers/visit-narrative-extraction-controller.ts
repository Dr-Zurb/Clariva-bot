/**
 * Visit-narrative extraction (vnt-02).
 *
 * POST /api/v1/visit-narrative/extract
 * Doctor-only. Clinic staff are refused explicitly (VNT-Q3).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { validateExtractVisitNarrativeRequest } from '../utils/validation';
import { extractVisitNarrative } from '../services/visit-narrative-extraction-service';

export const extractVisitNarrativeHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const body = validateExtractVisitNarrativeRequest(req.body);
  const result = await extractVisitNarrative({
    consultationSessionId: body.consultationSessionId,
    doctorId: userId,
    correlationId: req.correlationId || 'unknown',
    actorRole: req.user?.app_metadata?.role,
  });

  res.status(200).json(successResponse(result, req));
});
