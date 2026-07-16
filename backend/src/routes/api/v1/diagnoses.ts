/**
 * Diagnoses API Routes (pf-02 — Patient seeing flow)
 *
 * GET /api/v1/diagnoses/recent?limit=20 - Authenticated doctor's most-used
 *   diagnosis tags across `completed` appointments in the last 90 days.
 *   Powers the wrap-up dialog's tag autocomplete (pf-04). Cacheable for 60s
 *   per-doctor (private cache).
 * GET /api/v1/diagnoses/search?q=&limit= - ICD-11 (MMS) catalog autocomplete
 *   (assessment-tab · asmt-06). Read-only, NON-PHI reference lookup.
 * POST /api/v1/diagnoses/parse - gated, suggestion-only AI ICD-11 resolver for
 *   the free-text (no catalog match) path (assessment-tab · asmt-07). PHI never
 *   logged; every suggestion is re-resolved against the catalog.
 *
 * Auth: requires authenticated doctor — query is always scoped to req.user.id.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { getRecentDiagnosisTagsHandler } from '../../../controllers/appointment-controller';
import {
  resolveDiagnosisHandler,
  searchDiagnosisCatalogHandler,
} from '../../../controllers/diagnosis-catalog-controller';

const router = Router();

router.get('/recent', authenticateToken, getRecentDiagnosisTagsHandler);
router.get('/search', authenticateToken, searchDiagnosisCatalogHandler);
router.post('/parse', authenticateToken, resolveDiagnosisHandler);

export default router;
