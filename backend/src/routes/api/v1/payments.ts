/**
 * Payment API Routes
 *
 * POST /api/v1/payments/create-link - Create payment link
 * GET /api/v1/payments/:id - Get payment by ID (doctor auth)
 *
 * Auth: Phase 0 - create-link unauthenticated; getById requires auth (doctor).
 */

import { Router } from 'express';
import {
  createPaymentLinkHandler,
  getPaymentByIdHandler,
} from '../../../controllers/payment-controller';
import { authenticateToken } from '../../../middleware/auth';

const router = Router();

router.post('/create-link', createPaymentLinkHandler);
router.get('/:id', authenticateToken, getPaymentByIdHandler);

export default router;
