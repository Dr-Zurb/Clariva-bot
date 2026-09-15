/**
 * Facebook Settings Routes (fbm-03)
 *
 * GET    /api/v1/settings/facebook/status
 * GET    /api/v1/settings/facebook/connect
 * GET    /api/v1/settings/facebook/callback
 * DELETE /api/v1/settings/facebook/disconnect
 */

import { Router } from 'express';
import { authenticateToken } from '../../../../middleware/auth';
import {
  facebookStatusHandler,
  facebookConnectHandler,
  facebookCallbackHandler,
  facebookDisconnectHandler,
} from '../../../../controllers/facebook-connect-controller';

const router = Router();

router.get('/status', authenticateToken, facebookStatusHandler);
router.get('/connect', authenticateToken, facebookConnectHandler);
router.get('/callback', facebookCallbackHandler);
router.delete('/disconnect', authenticateToken, facebookDisconnectHandler);

export default router;
