/**
 * Dashboard Events Routes (Plan 07 · Task 30).
 *
 * Mounted at `/api/v1/dashboard/events` from `routes/api/v1/index.ts`.
 *
 * - `GET    /`                       — list events (auth required).
 * - `POST   /:eventId/acknowledge`   — mark event read (auth required).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  acknowledgeDashboardEventHandler,
  getDashboardEventsHandler,
} from '../../../controllers/dashboard-events-controller';

const router = Router();

router.get('/', authenticateToken, getDashboardEventsHandler);
router.post(
  '/:eventId/acknowledge',
  authenticateToken,
  acknowledgeDashboardEventHandler,
);

export default router;
