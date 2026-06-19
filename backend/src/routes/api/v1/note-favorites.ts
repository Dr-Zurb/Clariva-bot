/**
 * Doctor note favorites routes (subjective-tab · subj-06)
 * Mounted at /api/v1/doctors/me/note-favorites
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  createDoctorNoteFavoriteHandler,
  deleteDoctorNoteFavoriteHandler,
  listDoctorNoteFavoritesHandler,
  recordDoctorNoteFavoriteUseHandler,
} from '../../../controllers/note-favorites-controller';

const router = Router();

router.get('/', authenticateToken, listDoctorNoteFavoritesHandler);
router.post('/', authenticateToken, createDoctorNoteFavoriteHandler);
router.post('/record-use', authenticateToken, recordDoctorNoteFavoriteUseHandler);
router.delete('/:id', authenticateToken, deleteDoctorNoteFavoriteHandler);

export default router;
