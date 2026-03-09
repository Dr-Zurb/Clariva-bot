/**
 * Availability API Routes (e-task-3)
 *
 * GET /api/v1/availability - List doctor's weekly availability (auth required)
 * PUT /api/v1/availability - Replace entire availability (auth required)
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  getAvailabilityHandler,
  putAvailabilityHandler,
} from '../../../controllers/availability-controller';

const router = Router();

router.get('/', authenticateToken, getAvailabilityHandler);
router.put('/', authenticateToken, putAvailabilityHandler);

export default router;
