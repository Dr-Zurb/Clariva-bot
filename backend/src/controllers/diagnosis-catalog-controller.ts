/**
 * Diagnosis Catalog Controller (assessment-tab · asmt-06 / asmt-07)
 *
 * GET  /api/v1/diagnoses/search?q=&limit= — ICD-11 (MMS) catalog autocomplete.
 *   Read-only, NON-PHI lookup. Mirrors `searchComplaintsHandler`.
 * POST /api/v1/diagnoses/parse — gated, suggestion-only AI ICD-11 resolver for
 *   the free-text (no catalog match) path. PHI is redacted in the service before
 *   the model call; audit is metadata-only. Mirrors `parseComplaintHandler`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { validateResolveDiagnosisRequest } from '../utils/validation';
import { searchDiagnosisCatalog } from '../services/diagnosis-catalog-service';
import { resolveDiagnosisWithAI } from '../services/diagnosis-resolver-service';

export const searchDiagnosisCatalogHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
    const rawLimitStr = typeof req.query.limit === 'string' ? req.query.limit : '';
    const parsedLimit = Number(rawLimitStr);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

    const results = await searchDiagnosisCatalog(rawQuery, limit);

    res.status(200).json(successResponse({ results }, req));
  },
);

export const resolveDiagnosisHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const correlationId = req.correlationId || 'unknown';
    const body = validateResolveDiagnosisRequest(req.body);

    const result = await resolveDiagnosisWithAI(body, correlationId);

    res.status(200).json(successResponse(result, req));
  },
);
