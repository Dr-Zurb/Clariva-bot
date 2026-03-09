/**
 * Doctor Settings Routes (e-task-2)
 *
 * GET    /api/v1/settings/doctor - Get doctor's settings (auth required)
 * PATCH  /api/v1/settings/doctor - Partial update (auth required)
 */

import { Router } from 'express';
import { authenticateToken } from '../../../../middleware/auth';
import {
  getDoctorSettingsHandler,
  patchDoctorSettingsHandler,
} from '../../../../controllers/settings-controller';

const router = Router();

router.get('/', authenticateToken, getDoctorSettingsHandler);
router.patch('/', authenticateToken, patchDoctorSettingsHandler);

export default router;
