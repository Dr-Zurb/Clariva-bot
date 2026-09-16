/**
 * Doctor medicine-combo controller.
 *
 * GET  /api/v1/doctors/me/medicine-combos
 * POST /api/v1/doctors/me/medicine-combos/clear
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  clearMyMedicineCombo,
  listMyMedicineCombos,
} from '../services/doctor-medicine-combo-service';

const nullableTrimmed = z.string().trim().max(200).nullable();

const clearMedicineComboSchema = z.object({
  nameKey: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(200),
  doseQty: z.number().nullable(),
  doseUnit: nullableTrimmed,
  frequencyCode: nullableTrimmed,
  frequency: z.string().trim().max(200),
  durationValue: z.number().nullable(),
  durationUnit: nullableTrimmed,
  duration: z.string().trim().max(200),
  foodTiming: nullableTrimmed,
  routeCode: nullableTrimmed,
  form: nullableTrimmed,
});

export const listMyMedicineCombosHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const correlationId = req.correlationId || 'unknown';
  const combos = await listMyMedicineCombos(correlationId, userId);

  res.set('Cache-Control', 'private, no-store');
  res.status(200).json(successResponse({ combos }, req));
});

export const clearMyMedicineComboHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const habit = clearMedicineComboSchema.parse(req.body);
  const correlationId = req.correlationId || 'unknown';
  const result = await clearMyMedicineCombo(correlationId, userId, habit);

  res.set('Cache-Control', 'no-store');
  res.status(200).json(successResponse(result, req));
});
