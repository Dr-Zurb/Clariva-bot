/**
 * Doctor billing — GET /api/v1/billing/me
 * authenticateToken only. Do not mount on the admin billing router.
 */

import { Router } from 'express';
import { myBillingHandler } from '../../../controllers/billing-controller';
import { authenticateToken } from '../../../middleware/auth';

const router = Router();

router.get('/me', authenticateToken, myBillingHandler);

export default router;
