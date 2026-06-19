/**
 * Medicine routes (medical-history med redesign)
 * POST /api/v1/medicines/parse   (gated AI free-text medication parse)
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { parseMedicineHandler } from '../../../controllers/medicine-parse-controller';

const router = Router();

router.post('/parse', authenticateToken, parseMedicineHandler);

export default router;
