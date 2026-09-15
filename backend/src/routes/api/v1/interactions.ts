/**
 * Interactions Inbox (ibi-03+) — doctor-authenticated read APIs.
 *
 * GET /api/v1/interactions
 * GET /api/v1/interactions/:id
 * GET /api/v1/interactions/:id/messages
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  getInteractionHandler,
  listInteractionMessagesHandler,
  listInteractionsHandler,
} from '../../../controllers/interaction-controller';

const router = Router();

router.get('/', authenticateToken, listInteractionsHandler);
router.get('/:id/messages', authenticateToken, listInteractionMessagesHandler);
router.get('/:id', authenticateToken, getInteractionHandler);

export default router;
