/**
 * Booking API Routes (e-task-3)
 *
 * GET /api/v1/bookings/day-slots - All slots with status (token + date)
 * POST /api/v1/bookings/select-slot - Save selection, send message, redirect
 * GET /api/v1/bookings/slot-page-info - Page metadata (token)
 *
 * No auth required; token is the auth.
 */

import { Router } from 'express';
import {
  getDaySlotsHandler,
  selectSlotHandler,
  getSlotPageInfoHandler,
} from '../../../controllers/booking-controller';

const router = Router();

router.get('/day-slots', getDaySlotsHandler);
router.post('/select-slot', selectSlotHandler);
router.get('/slot-page-info', getSlotPageInfoHandler);

export default router;
