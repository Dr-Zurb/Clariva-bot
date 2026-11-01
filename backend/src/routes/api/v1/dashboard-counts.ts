/**
 * Mounted at `/api/v1/dashboard/counts`.
 *
 * - `GET /` — badge counts for the signed-in doctor.
 */

import { Router } from 'express';
import { getDashboardCountsHandler } from '../../../controllers/dashboard-counts-controller';
import { authenticateToken } from '../../../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getDashboardCountsHandler);

export default router;
