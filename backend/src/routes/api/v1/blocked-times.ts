/**
 * Blocked Times API Routes (e-task-3)
 *
 * GET    /api/v1/blocked-times - List doctor's blocked times (auth required)
 * POST   /api/v1/blocked-times - Create blocked time (auth required)
 * DELETE /api/v1/blocked-times/:id - Delete blocked time (auth required)
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  getBlockedTimesHandler,
  postBlockedTimeHandler,
  deleteBlockedTimeHandler,
} from '../../../controllers/blocked-times-controller';

const router = Router();

router.get('/', authenticateToken, getBlockedTimesHandler);
router.post('/', authenticateToken, postBlockedTimeHandler);
router.delete('/:id', authenticateToken, deleteBlockedTimeHandler);

export default router;
