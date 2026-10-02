/**
 * Booking API Routes (e-task-3)
 *
 * GET /api/v1/bookings/day-slots - All slots with status (token + date)
 * POST /api/v1/bookings/select-slot - Save selection, send message, redirect
 * POST /api/v1/bookings/select-slot-and-pay - Create appointment + payment link (unified flow)
 * GET /api/v1/bookings/redirect-url - Instagram DM URL for success page (token, allows expired)
 * GET /api/v1/bookings/slot-page-info - Page metadata (token)
 * GET /api/v1/bookings/public/page-info - Practice header (public slug)
 * GET /api/v1/bookings/public/day-slots - Day slots (public slug)
 * GET /api/v1/bookings/public/chat-visits - Upcoming visits from this chat (public slug + code)
 * POST /api/v1/bookings/public/checkout - Book without a conversation (public slug)
 * GET /api/v1/bookings/session/snapshot - OPD session snapshot (consultation token; e-task-opd-04)
 * POST /api/v1/bookings/session/early-join/accept | decline - early join (e-task-opd-04)
 *
 * No auth required; token is the auth.
 */

import express, { Router } from 'express';
import {
  getDaySlotsHandler,
  selectSlotHandler,
  selectSlotAndPayHandler,
  getRedirectUrlHandler,
  getSlotPageInfoHandler,
  getPublicClinicPageInfoHandler,
  getPublicClinicDaySlotsHandler,
  getPublicChatVisitsHandler,
  postPublicClinicCheckoutHandler,
} from '../../../controllers/booking-controller';
import {
  getPublicClinicHistoryHandler,
  getPublicClinicMedicineSuggestHandler,
  postPublicClinicHistoryHandler,
} from '../../../controllers/public-clinic-history-controller';
import {
  deletePublicClinicPhotoHandler,
  getPublicClinicPhotosHandler,
  postPublicClinicPhotoHandler,
} from '../../../controllers/public-clinic-photo-controller';
import { getSessionPrepLinkHandler } from '../../../controllers/public-clinic-prep-link-controller';
import {
  getSessionSnapshotHandler,
  acceptEarlyJoinHandler,
  declineEarlyJoinHandler,
  lobbyHeartbeatHandler,
  lobbyPresenceTokenHandler,
} from '../../../controllers/opd-session-controller';
import { publicSessionLimiter } from '../../../middleware/rate-limiters';

const router = Router();

router.get('/day-slots', getDaySlotsHandler);
router.post('/select-slot', selectSlotHandler);
router.post('/select-slot-and-pay', selectSlotAndPayHandler);
router.get('/redirect-url', getRedirectUrlHandler);
router.get('/slot-page-info', getSlotPageInfoHandler);

router.get('/public/page-info', publicSessionLimiter, getPublicClinicPageInfoHandler);
router.get('/public/day-slots', publicSessionLimiter, getPublicClinicDaySlotsHandler);
router.get('/public/chat-visits', publicSessionLimiter, getPublicChatVisitsHandler);
router.post('/public/checkout', publicSessionLimiter, postPublicClinicCheckoutHandler);
router.get('/public/history', publicSessionLimiter, getPublicClinicHistoryHandler);
router.get('/public/history/medicines', publicSessionLimiter, getPublicClinicMedicineSuggestHandler);
router.post('/public/history', publicSessionLimiter, postPublicClinicHistoryHandler);
router.post(
  '/public/history/photos',
  publicSessionLimiter,
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    limit: '10mb',
  }),
  postPublicClinicPhotoHandler
);
router.get('/public/history/photos', publicSessionLimiter, getPublicClinicPhotosHandler);
router.delete(
  '/public/history/photos/:documentId',
  publicSessionLimiter,
  deletePublicClinicPhotoHandler
);

router.get('/session/snapshot', publicSessionLimiter, getSessionSnapshotHandler);
router.get('/session/prep-link', publicSessionLimiter, getSessionPrepLinkHandler);
router.post('/session/early-join/accept', publicSessionLimiter, acceptEarlyJoinHandler);
router.post('/session/early-join/decline', publicSessionLimiter, declineEarlyJoinHandler);
router.post('/session/lobby-heartbeat', publicSessionLimiter, lobbyHeartbeatHandler);
router.post('/session/lobby-presence-token', publicSessionLimiter, lobbyPresenceTokenHandler);

export default router;
