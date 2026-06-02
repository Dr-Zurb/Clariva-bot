/**
 * Public doctor routes (pdm-07) — no auth.
 *
 * GET /api/v1/public/doctors/:id/mode-schedule
 */

import { Router } from 'express';
import { getPublicDoctorModeSchedule } from '../../../controllers/public-doctor-controller';
import { publicModeScheduleLimiter } from '../../../middleware/rate-limiters';

const router = Router();

router.get('/doctors/:id/mode-schedule', publicModeScheduleLimiter, getPublicDoctorModeSchedule);

export default router;
