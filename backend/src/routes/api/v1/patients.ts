/**
 * Patient API Routes
 *
 * GET /api/v1/patients - List patients for doctor (requires auth)
 * GET /api/v1/patients/possible-duplicates - List possible duplicate groups (requires auth)
 * POST /api/v1/patients/merge - Merge two patients (requires auth)
 * GET /api/v1/patients/:id - Get patient by ID (doctor-only, requires auth)
 *
 * Auth: All routes require authenticateToken (doctor JWT).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  listPatientsHandler,
  getPatientByIdHandler,
  listPossibleDuplicatesHandler,
  mergePatientsHandler,
} from '../../../controllers/patient-controller';

const router = Router();

router.get('/', authenticateToken, listPatientsHandler);
router.get('/possible-duplicates', authenticateToken, listPossibleDuplicatesHandler);
router.post('/merge', authenticateToken, mergePatientsHandler);
router.get('/:id', authenticateToken, getPatientByIdHandler);

export default router;
