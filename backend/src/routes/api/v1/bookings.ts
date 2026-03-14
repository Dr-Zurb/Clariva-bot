/**
 * Booking API Routes (e-task-3)
 *
 * GET /api/v1/bookings/day-slots - All slots with status (token + date)
 * POST /api/v1/bookings/select-slot - Save selection, send message, redirect
 * POST /api/v1/bookings/select-slot-and-pay - Create appointment + payment link (unified flow)
 * GET /api/v1/bookings/redirect-url - Instagram DM URL for success page (token, allows expired)
 * GET /api/v1/bookings/slot-page-info - Page metadata (token)
 *
 * No auth required; token is the auth.
 */

import { Router } from 'express';
import {
  getDaySlotsHandler,
  selectSlotHandler,
  selectSlotAndPayHandler,
  getRedirectUrlHandler,
  getSlotPageInfoHandler,
} from '../../../controllers/booking-controller';

const router = Router();

router.get('/day-slots', getDaySlotsHandler);
router.post('/select-slot', selectSlotHandler);
router.post('/select-slot-and-pay', selectSlotAndPayHandler);
router.get('/redirect-url', getRedirectUrlHandler);
router.get('/slot-page-info', getSlotPageInfoHandler);

export default router;
