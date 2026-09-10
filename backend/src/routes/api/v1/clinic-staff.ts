/**
 * GET /api/v1/clinic-staff/me — acting-doctor context for /desk (P4).
 * GET /api/v1/clinic-staff/hisab?date=YYYY-MM-DD — day's desk tally.
 * GET/POST /api/v1/clinic-staff + PATCH/DELETE /:id — doctor Settings (no allowStaff).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { allowStaff } from '../../../middleware/allow-staff';
import { resolveActingDoctor } from '../../../middleware/resolve-acting-doctor';
import { clinicStaffProvisionLimiter } from '../../../middleware/rate-limiters';
import { getClinicStaffMeHandler } from '../../../controllers/clinic-staff-controller';
import { getDeskHisabHandler } from '../../../controllers/visit-payments-controller';
import {
  deleteDoctorClinicStaffHandler,
  listDoctorClinicStaffHandler,
  patchDoctorClinicStaffHandler,
  provisionDoctorClinicStaffHandler,
} from '../../../controllers/doctor-clinic-staff-controller';

const router = Router();

router.get('/me', allowStaff, authenticateToken, resolveActingDoctor, getClinicStaffMeHandler);
router.get('/hisab', allowStaff, authenticateToken, resolveActingDoctor, getDeskHisabHandler);
router.get('/', authenticateToken, listDoctorClinicStaffHandler);
router.post(
  '/',
  authenticateToken,
  clinicStaffProvisionLimiter,
  provisionDoctorClinicStaffHandler
);
router.patch('/:id', authenticateToken, patchDoctorClinicStaffHandler);
router.delete('/:id', authenticateToken, deleteDoctorClinicStaffHandler);

export default router;
