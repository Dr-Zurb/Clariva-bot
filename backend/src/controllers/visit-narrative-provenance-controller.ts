/**
 * Visit-narrative provenance (vnt-04 §4).
 *
 * POST /api/v1/visit-narrative/provenance
 * Doctor-only. Insert failure still returns 200 with recorded: false.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { validateRecordVisitNarrativeProvenanceRequest } from '../utils/validation';
import { recordVisitNarrativeProvenance } from '../services/visit-narrative-provenance-service';

export const recordVisitNarrativeProvenanceHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const body = validateRecordVisitNarrativeProvenanceRequest(req.body);
    const result = await recordVisitNarrativeProvenance({
      consultationSessionId: body.consultationSessionId,
      transcriptId: body.transcriptId,
      spanStart: body.spanStart,
      spanEnd: body.spanEnd,
      targetKind: body.targetKind,
      createdRowId: body.createdRowId,
      doctorId: userId,
      correlationId: req.correlationId || 'unknown',
      actorRole: req.user?.app_metadata?.role,
    });

    res.status(200).json(successResponse(result, req));
  },
);
