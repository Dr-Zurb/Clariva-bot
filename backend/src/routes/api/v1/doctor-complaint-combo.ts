/**
 * Doctor complaint-combo routes.
 *
 * Mounted at /api/v1/doctors/me/complaint-combos.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  clearMyComplaintComboHandler,
  listMyComplaintCombosHandler,
} from '../../../controllers/doctor-complaint-combo-controller';

const router = Router();

router.get('/', authenticateToken, listMyComplaintCombosHandler);
router.post('/clear', authenticateToken, clearMyComplaintComboHandler);

export default router;
