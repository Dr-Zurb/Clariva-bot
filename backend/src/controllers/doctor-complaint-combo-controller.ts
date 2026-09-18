/**
 * Doctor complaint-combo controller.
 *
 * GET  /api/v1/doctors/me/complaint-combos
 * POST /api/v1/doctors/me/complaint-combos/clear
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  clearMyComplaintCombo,
  listMyComplaintCombos,
} from '../services/doctor-complaint-combo-service';

const nullableTrimmed = z.string().trim().max(200).nullable();

const clearComplaintComboSchema = z.object({
  nameKey: z.string().trim().min(1).max(200),
  category: nullableTrimmed,
  severityBand: nullableTrimmed,
  laterality: nullableTrimmed,
  character: nullableTrimmed,
  associatedNames: z.array(z.string().trim().max(200)).max(20),
});

export const listMyComplaintCombosHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const correlationId = req.correlationId || 'unknown';
  const combos = await listMyComplaintCombos(correlationId, userId);

  res.set('Cache-Control', 'private, no-store');
  res.status(200).json(successResponse({ combos }, req));
});

export const clearMyComplaintComboHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const habit = clearComplaintComboSchema.parse(req.body);
  const correlationId = req.correlationId || 'unknown';
  const result = await clearMyComplaintCombo(correlationId, userId, habit);

  res.set('Cache-Control', 'no-store');
  res.status(200).json(successResponse(result, req));
});
