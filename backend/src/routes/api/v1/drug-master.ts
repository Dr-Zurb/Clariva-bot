/**
 * Drug Master Routes (EHR Sub-batch B1 / T2.7)
 *
 * Mounted at /api/v1/drugs (see api/v1/index.ts).
 *
 * Endpoints:
 *   GET /search?q=<text>&limit=<n>   — search the drug catalogue
 *
 * Auth: doctor JWT (authenticateToken). Lookup data isn't PHI but the
 * endpoint is doctor-only to avoid anonymous catalogue scraping.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { searchDrugsHandler } from '../../../controllers/drug-master-controller';

const router = Router();

router.get('/search', authenticateToken, searchDrugsHandler);

export default router;
