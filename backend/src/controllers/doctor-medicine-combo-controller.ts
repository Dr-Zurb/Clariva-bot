/**
 * Doctor medicine-combo controller.
 *
 * GET /api/v1/doctors/me/medicine-combos → { combos: DoctorMedicineCombo[] }
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { listMyMedicineCombos } from '../services/doctor-medicine-combo-service';

export const listMyMedicineCombosHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const correlationId = req.correlationId || 'unknown';
  const combos = await listMyMedicineCombos(correlationId, userId);

  res.set('Cache-Control', 'private, max-age=300');
  res.status(200).json(successResponse({ combos }, req));
});
