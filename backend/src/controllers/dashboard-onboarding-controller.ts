/**
 * Dashboard Onboarding Controller (doctor-onboarding-v1 · onb-01).
 *
 * `GET /api/v1/dashboard/onboarding/status` — go-live checklist booleans.
 *
 * Auth: `authenticateToken`. `req.user.id` is the ONLY doctor id — never
 * trust body/query. Orchestration only (validate → service → respond).
 *
 * @see backend/src/services/dashboard-onboarding-service.ts
 * @see backend/src/controllers/dashboard-insights-controller.ts (pattern)
 */

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { getOnboardingStatus } from '../services/dashboard-onboarding-service';

export const getOnboardingStatusHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const status = await getOnboardingStatus({
      doctorId: userId,
      correlationId: req.correlationId ?? '',
    });

    res.status(200).json(successResponse(status, req));
  }
);
