/**
 * Dashboard Insights Routes (insights-v1 · ins-01…05).
 *
 * Mounted at `/api/v1/dashboard/insights` from `routes/api/v1/index.ts`.
 *
 * - `GET /overview`      — Tier-1 practice-health aggregates (auth required).
 * - `GET /funnel`        — Tier-2 booking funnel + review SLA (auth required).
 * - `GET /clinical-mix`  — Tier-3 de-identified top Dx / meds / investigations.
 * - `GET /telehealth`    — Tier-4 telehealth quality (auth required).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  getInsightsClinicalMixHandler,
  getInsightsFunnelHandler,
  getInsightsOverviewHandler,
  getInsightsTelehealthHandler,
} from '../../../controllers/dashboard-insights-controller';

const router = Router();

router.get('/overview', authenticateToken, getInsightsOverviewHandler);
router.get('/funnel', authenticateToken, getInsightsFunnelHandler);
router.get('/clinical-mix', authenticateToken, getInsightsClinicalMixHandler);
router.get('/telehealth', authenticateToken, getInsightsTelehealthHandler);

export default router;
