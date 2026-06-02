/**
 * Doctor drug usage routes (rx-polish-favorites · rxf-05).
 *
 * Mounted at /api/v1/doctors/me/drug-usage.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { listMyDrugUsageHandler } from '../../../controllers/doctor-drug-usage-controller';

const router = Router();

router.get('/', authenticateToken, listMyDrugUsageHandler);

export default router;
