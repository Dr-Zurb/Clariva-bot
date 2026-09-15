/**
 * GET/POST /api/v1/admin/clinic-staff
 * PATCH/DELETE /api/v1/admin/clinic-staff/:id
 * Gated by requireAdminJwtOrSecret.
 */

import { Router } from 'express';
import { requireAdminJwtOrSecret } from '../../../middleware/require-admin';
import {
  deleteAdminClinicStaffHandler,
  listAdminClinicStaffHandler,
  patchAdminClinicStaffHandler,
  provisionAdminClinicStaffHandler,
} from '../../../controllers/admin-clinic-staff-controller';

const router = Router();

router.use(requireAdminJwtOrSecret);

router.get('/', listAdminClinicStaffHandler);
router.post('/', provisionAdminClinicStaffHandler);
router.patch('/:id', patchAdminClinicStaffHandler);
router.delete('/:id', deleteAdminClinicStaffHandler);

export default router;
