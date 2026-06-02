/**
 * Drug Interactions Routes (EHR Sub-batch C / Task C.2 / T4.19)
 *
 * Mounted at /api/v1/drug-interactions (see api/v1/index.ts).
 *
 * Endpoints:
 *   GET /check?ids=<uuid,uuid,…>   — check DDI pairs for a set of drugs
 *
 * Auth: doctor JWT (authenticateToken).  Not PHI, but doctor-only to
 * prevent anonymous catalogue enumeration.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { checkInteractionsHandler } from '../../../controllers/drug-interactions-controller';

const router = Router();

router.get('/check', authenticateToken, checkInteractionsHandler);

export default router;
