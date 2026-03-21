/**
 * Consultation API Routes (e-task-3)
 *
 * POST /api/v1/consultation/start - Start video consultation (auth required)
 * GET /api/v1/consultation/token - Get Video access token (doctor: auth; patient: ?appointmentId=&token=)
 */

import { Router } from 'express';
import { authenticateToken, optionalAuthenticateToken } from '../../../middleware/auth';
import {
  startConsultationHandler,
  getConsultationTokenHandler,
} from '../../../controllers/consultation-controller';

const router = Router();

router.post('/start', authenticateToken, startConsultationHandler);
router.get('/token', optionalAuthenticateToken, getConsultationTokenHandler);

export default router;
