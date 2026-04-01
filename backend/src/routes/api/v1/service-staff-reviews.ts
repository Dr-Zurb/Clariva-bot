/**
 * ARM-06: Service catalog staff review queue (authenticated doctor).
 *
 * GET    /api/v1/service-staff-reviews
 * GET    /api/v1/service-staff-reviews/:id
 * POST   /api/v1/service-staff-reviews/:id/confirm
 * POST   /api/v1/service-staff-reviews/:id/reassign
 * POST   /api/v1/service-staff-reviews/:id/cancel
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  cancelServiceStaffReviewHandler,
  confirmServiceStaffReviewHandler,
  getServiceStaffReviewHandler,
  listServiceStaffReviewsHandler,
  reassignServiceStaffReviewHandler,
} from '../../../controllers/service-staff-review-controller';

const router = Router();

router.get('/', authenticateToken, listServiceStaffReviewsHandler);
router.get('/:id', authenticateToken, getServiceStaffReviewHandler);
router.post('/:id/confirm', authenticateToken, confirmServiceStaffReviewHandler);
router.post('/:id/reassign', authenticateToken, reassignServiceStaffReviewHandler);
router.post('/:id/cancel', authenticateToken, cancelServiceStaffReviewHandler);

export default router;
