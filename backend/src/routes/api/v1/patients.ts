/**
 * Patient API Routes
 *
 * GET /api/v1/patients/:id - Get patient by ID (doctor-only, requires auth)
 *
 * Auth: All routes require authenticateToken (doctor JWT).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { getPatientByIdHandler } from '../../../controllers/patient-controller';

const router = Router();

router.get('/:id', authenticateToken, getPatientByIdHandler);

export default router;
