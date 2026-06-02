/**
 * Doctor OPD operational API (e-task-opd-06).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  getOpdModeScheduleTestDate,
  getOpdSessionHandler,
  getOpdQueueSessionHandler,
  getOpdSlotSessionHandler,
  postConvertSessionHandler,
  postPreviewConvertSessionHandler,
  postOfferEarlyJoinHandler,
  postSessionDelayHandler,
  patchQueueEntryHandler,
  postMarkNoShowHandler,
  postRequeueQueueEntryHandler,
  getOpdSessionOverrun,
  postOpdSessionOverrunBulkResolve,
} from '../../../controllers/opd-doctor-controller';

const router = Router();

router.get('/mode-schedule/test-date', authenticateToken, getOpdModeScheduleTestDate);
router.get('/session', authenticateToken, getOpdSessionHandler);
router.get('/slot-session', authenticateToken, getOpdSlotSessionHandler);
router.get('/queue-session', authenticateToken, getOpdQueueSessionHandler);
router.post('/session/convert', authenticateToken, postConvertSessionHandler);
router.post('/session/preview-convert', authenticateToken, postPreviewConvertSessionHandler);
router.post('/appointments/:id/offer-early-join', authenticateToken, postOfferEarlyJoinHandler);
router.post('/appointments/:id/session-delay', authenticateToken, postSessionDelayHandler);
router.patch('/queue-entries/:entryId', authenticateToken, patchQueueEntryHandler);
router.post('/queue-entries/:entryId/requeue', authenticateToken, postRequeueQueueEntryHandler);
router.post('/appointments/:id/mark-no-show', authenticateToken, postMarkNoShowHandler);
router.get('/session/overrun', authenticateToken, getOpdSessionOverrun);
router.post('/session/overrun/bulk-resolve', authenticateToken, postOpdSessionOverrunBulkResolve);

export default router;
