/**
 * Diagnoses API Routes (pf-02 — Patient seeing flow)
 *
 * GET /api/v1/diagnoses/recent?limit=20 - Authenticated doctor's most-used
 *   diagnosis tags across `completed` appointments in the last 90 days.
 *   Powers the wrap-up dialog's tag autocomplete (pf-04). Cacheable for 60s
 *   per-doctor (private cache).
 *
 * Auth: requires authenticated doctor — query is always scoped to req.user.id.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { getRecentDiagnosisTagsHandler } from '../../../controllers/appointment-controller';

const router = Router();

router.get('/recent', authenticateToken, getRecentDiagnosisTagsHandler);

export default router;
