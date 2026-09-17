/**
 * Doctor medicine-pack suggestion controller.
 *
 * GET  /api/v1/doctors/me/medicine-pack-suggestions
 * POST /api/v1/doctors/me/medicine-pack-suggestions/dismiss
 * POST /api/v1/doctors/me/medicine-pack-suggestions/seen
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  dismissMyMedicinePackSuggestion,
  listMyMedicinePackSuggestions,
  markMyMedicinePackSuggestionsSeen,
} from '../services/doctor-medicine-pack-suggestion-service';

const nullableTrimmed = z.string().trim().max(200).nullable();

const packHabitSchema = z.object({
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

const dismissMedicinePackSchema = z.object({
  medicines: z.array(packHabitSchema).min(2).max(20),
});

export const listMyMedicinePackSuggestionsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const correlationId = req.correlationId || 'unknown';
    const result = await listMyMedicinePackSuggestions(correlationId, userId);

    res.set('Cache-Control', 'private, no-store');
    res.status(200).json(successResponse(result, req));
  }
);

export const dismissMyMedicinePackSuggestionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const body = dismissMedicinePackSchema.parse(req.body);
    const correlationId = req.correlationId || 'unknown';
    const result = await dismissMyMedicinePackSuggestion(
      correlationId,
      userId,
      body.medicines
    );

    res.set('Cache-Control', 'no-store');
    res.status(200).json(successResponse(result, req));
  }
);

export const markMyMedicinePackSuggestionsSeenHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const correlationId = req.correlationId || 'unknown';
    const result = await markMyMedicinePackSuggestionsSeen(correlationId, userId);

    res.set('Cache-Control', 'no-store');
    res.status(200).json(successResponse(result, req));
  }
);
