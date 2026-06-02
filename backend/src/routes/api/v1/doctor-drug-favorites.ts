/**
 * Doctor drug favorites routes (rx-polish-favorites · rxf-04).
 *
 * Mounted at /api/v1/doctors/me/drug-favorites.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  createDoctorDrugFavoriteHandler,
  deleteDoctorDrugFavoriteHandler,
  listDoctorDrugFavoritesHandler,
  updateDoctorDrugFavoriteHandler,
} from '../../../controllers/doctor-drug-favorites-controller';

const router = Router();

router.get('/', authenticateToken, listDoctorDrugFavoritesHandler);
router.post('/', authenticateToken, createDoctorDrugFavoriteHandler);
router.patch('/:id', authenticateToken, updateDoctorDrugFavoriteHandler);
router.delete('/:id', authenticateToken, deleteDoctorDrugFavoriteHandler);

export default router;
