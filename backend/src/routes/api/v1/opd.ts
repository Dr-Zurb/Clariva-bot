/**
 * Doctor OPD operational API (e-task-opd-06).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  getOpdQueueSessionHandler,
  postOfferEarlyJoinHandler,
  postSessionDelayHandler,
  patchQueueEntryHandler,
  postMarkNoShowHandler,
  postRequeueQueueEntryHandler,
} from '../../../controllers/opd-doctor-controller';

const router = Router();

router.get('/queue-session', authenticateToken, getOpdQueueSessionHandler);
router.post('/appointments/:id/offer-early-join', authenticateToken, postOfferEarlyJoinHandler);
router.post('/appointments/:id/session-delay', authenticateToken, postSessionDelayHandler);
router.patch('/queue-entries/:entryId', authenticateToken, patchQueueEntryHandler);
router.post('/queue-entries/:entryId/requeue', authenticateToken, postRequeueQueueEntryHandler);
router.post('/appointments/:id/mark-no-show', authenticateToken, postMarkNoShowHandler);

export default router;
