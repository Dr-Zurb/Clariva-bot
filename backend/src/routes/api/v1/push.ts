/**
 * Web Push subscription routes (task-text-D6b).
 */

import { Router } from 'express';
import {
  listPushSubscriptionsHandler,
  subscribePushHandler,
  unsubscribePushHandler,
} from '../../../controllers/push-controller';

const router = Router();

router.post('/subscribe', subscribePushHandler);
router.delete('/subscribe/:id', unsubscribePushHandler);
router.get('/subscriptions', listPushSubscriptionsHandler);

export default router;
