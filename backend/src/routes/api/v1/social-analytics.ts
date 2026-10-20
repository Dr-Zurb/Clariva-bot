/**
 * Social analytics (phase 9).
 * Mounted at /api/v1/social/analytics
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { getSocialAnalyticsHandler } from '../../../controllers/social-analytics-controller';

const router = Router();

router.get('/', authenticateToken, getSocialAnalyticsHandler);

export default router;
