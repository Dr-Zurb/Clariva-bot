/**
 * Investigation Resolver Controller (plan-investigations-library · inv-lib-04)
 *
 * POST /api/v1/investigations/parse — gated, suggestion-only AI resolver for the
 *   free-text (no local catalog match) path. The model normalizes messy /
 *   vernacular / typo order text into clean order TERMS; PHI is redacted in the
 *   service before the model call; audit is metadata-only. The FRONTEND static
 *   catalog re-resolves every term. Mirrors `resolveDiagnosisHandler`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { validateResolveInvestigationRequest } from '../utils/validation';
import { resolveInvestigationWithAI } from '../services/investigation-resolver-service';

export const resolveInvestigationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const correlationId = req.correlationId || 'unknown';
    const body = validateResolveInvestigationRequest(req.body);

    const result = await resolveInvestigationWithAI(body, correlationId);

    res.status(200).json(successResponse(result, req));
  },
);
