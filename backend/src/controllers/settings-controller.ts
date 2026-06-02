/**
 * Settings Controller (e-task-2)
 *
 * Handles HTTP requests for doctor settings.
 * GET /api/v1/settings/doctor - Returns doctor's settings (auth required)
 * PATCH /api/v1/settings/doctor - Partial update (auth required)
 *
 * MUST: Use asyncHandler and successResponse - see STANDARDS.md
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import {
  getDoctorSettingsForUser,
  updateDoctorSettings,
  type UpdateDoctorSettingsPayload,
} from '../services/doctor-settings-service';
import { validatePatchDoctorSettings } from '../utils/validation';
import { UnauthorizedError } from '../utils/errors';

/**
 * Get doctor settings
 * GET /api/v1/settings/doctor
 *
 * Auth: Requires authenticated doctor. Returns 401 if unauthenticated.
 * Response: Doctor settings (row or defaults when no row exists).
 */
export const getDoctorSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const settings = await getDoctorSettingsForUser(userId, userId, correlationId);

  res.status(200).json(successResponse({ settings }, req));
});

/**
 * Patch doctor settings (partial update)
 * PATCH /api/v1/settings/doctor
 *
 * Auth: Requires authenticated doctor. Returns 401 if unauthenticated.
 * Body: Optional fields (practice_name, timezone, slot_interval_minutes, etc.)
 */
export const patchDoctorSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const payload = validatePatchDoctorSettings(req.body) as UpdateDoctorSettingsPayload;
  const settings = await updateDoctorSettings(userId, userId, payload, correlationId);

  res.status(200).json(successResponse({ settings }, req));
});
