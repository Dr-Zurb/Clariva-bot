/**
 * Doctor medicine-combo routes.
 *
 * Mounted at /api/v1/doctors/me/medicine-combos.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  clearMyMedicineComboHandler,
  listMyMedicineCombosHandler,
} from '../../../controllers/doctor-medicine-combo-controller';

const router = Router();

router.get('/', authenticateToken, listMyMedicineCombosHandler);
router.post('/clear', authenticateToken, clearMyMedicineComboHandler);

export default router;
