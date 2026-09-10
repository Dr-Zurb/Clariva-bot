/**
 * Visit-narrative extraction (vnt-02).
 *
 * POST /api/v1/visit-narrative/extract
 *
 * Auth: doctor only. `authenticateToken` already refuses staff unless
 * `allowStaff` is set — this route does not set it (VNT-Q3).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { visitNarrativeExtractLimiter } from '../../../middleware/rate-limiters';
import { extractVisitNarrativeHandler } from '../../../controllers/visit-narrative-extraction-controller';
import { recordVisitNarrativeProvenanceHandler } from '../../../controllers/visit-narrative-provenance-controller';

const router = Router();

router.post('/extract', authenticateToken, visitNarrativeExtractLimiter, extractVisitNarrativeHandler);
router.post('/provenance', authenticateToken, recordVisitNarrativeProvenanceHandler);

export default router;
