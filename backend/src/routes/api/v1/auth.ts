/**
 * Public auth helpers (auth-password · AP-D17).
 *
 * POST /api/v1/auth/email-status — signup preflight (no JWT).
 */

import { Router } from 'express';
import { emailStatusHandler } from '../../../controllers/auth-email-status-controller';
import { publicAuthEmailStatusLimiter } from '../../../middleware/rate-limiters';

const router = Router();

router.post('/email-status', publicAuthEmailStatusLimiter, emailStatusHandler);

export default router;
