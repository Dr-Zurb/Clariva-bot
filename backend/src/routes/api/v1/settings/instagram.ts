/**
 * Instagram Settings Routes (OAuth connect flow + disconnect + status)
 *
 * GET    /api/v1/settings/instagram/status    - Connection status for current doctor (auth required)
 * GET    /api/v1/settings/instagram/connect  - Start connect (auth required), redirect to Meta
 * GET    /api/v1/settings/instagram/callback - OAuth callback (no auth), exchange code and save
 * DELETE /api/v1/settings/instagram/disconnect - Remove doctor's Instagram link (auth required)
 *
 * @see docs/Development/Daily-plans/2026-02-06/e-task-3-instagram-connect-flow-oauth.md
 * @see docs/Development/Daily-plans/2026-02-06/e-task-4-instagram-disconnect-endpoint.md
 * @see docs/Development/Daily-plans/2026-02-06/e-task-5-frontend-settings-instagram-ui.md
 */

import { Router } from 'express';
import { authenticateToken } from '../../../../middleware/auth';
import {
  statusHandler,
  connectHandler,
  callbackHandler,
  disconnectHandler,
} from '../../../../controllers/instagram-connect-controller';

const router = Router();

router.get('/status', authenticateToken, statusHandler);
router.get('/connect', authenticateToken, connectHandler);
router.get('/callback', callbackHandler);
router.delete('/disconnect', authenticateToken, disconnectHandler);

export default router;
