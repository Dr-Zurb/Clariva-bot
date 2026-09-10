/**
 * Doctor medicine-combo routes.
 *
 * Mounted at /api/v1/doctors/me/medicine-combos.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { listMyMedicineCombosHandler } from '../../../controllers/doctor-medicine-combo-controller';

const router = Router();

router.get('/', authenticateToken, listMyMedicineCombosHandler);

export default router;
