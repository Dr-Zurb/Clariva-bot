/**
 * Dashboard Onboarding Routes (doctor-onboarding-v1 · onb-01).
 *
 * Mounted at `/api/v1/dashboard/onboarding` from `routes/api/v1/index.ts`.
 *
 * - `GET /status` — go-live checklist booleans (auth required).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { getOnboardingStatusHandler } from '../../../controllers/dashboard-onboarding-controller';

const router = Router();

router.get('/status', authenticateToken, getOnboardingStatusHandler);

export default router;
