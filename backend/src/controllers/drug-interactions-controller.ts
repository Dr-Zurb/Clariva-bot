/**
 * Drug Interactions Controller (EHR Sub-batch C / Task C.2 / T4.19)
 *
 * Single endpoint:
 *   GET /api/v1/drug-interactions/check?ids=<uuid1,uuid2,…>
 *
 * Auth: doctor JWT (authenticateToken in the route file).
 * Interaction data is not PHI but the endpoint is doctor-only to prevent
 * anonymous enumeration of the DDI catalogue.
 *
 * Validation:
 *   - ids param is required and must be a non-empty comma-separated list
 *   - max 20 ids (hard ceiling, prevents excessive pair computation)
 *   - Each id is passed as-is to the service; unknown ids silently return
 *     no rows (no false-positive errors for free-text medicines).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { checkInteractions } from '../services/drug-interactions-service';

/** Hard ceiling on the number of drug ids per request. */
const MAX_IDS = 20;

export const checkInteractionsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const rawIds =
      typeof req.query.ids === 'string' ? req.query.ids.trim() : '';

    if (!rawIds) {
      throw new ValidationError(
        'Query parameter "ids" is required (comma-separated drug_master UUIDs)'
      );
    }

    const ids = rawIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      throw new ValidationError('At least one drug id is required');
    }

    if (ids.length > MAX_IDS) {
      throw new ValidationError(
        `At most ${MAX_IDS} drug ids may be checked per request`
      );
    }

    const results = await checkInteractions(ids);

    res.status(200).json(successResponse({ results }, req));
  }
);
