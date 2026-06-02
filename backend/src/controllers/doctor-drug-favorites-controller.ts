/**
 * Doctor drug favorites controller (rx-polish-favorites · rxf-04).
 *
 * GET    /api/v1/doctors/me/drug-favorites
 * POST   /api/v1/doctors/me/drug-favorites
 * PATCH  /api/v1/doctors/me/drug-favorites/:id
 * DELETE /api/v1/doctors/me/drug-favorites/:id
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  validateCreateDoctorDrugFavoriteBody,
  validateDoctorDrugFavoriteParams,
  validateUpdateDoctorDrugFavoriteBody,
} from '../utils/validation';
import {
  createDoctorDrugFavorite,
  deleteDoctorDrugFavorite,
  listDoctorDrugFavorites,
  updateDoctorDrugFavorite,
} from '../services/doctor-drug-favorites-service';

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
}

export const listDoctorDrugFavoritesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const favorites = await listDoctorDrugFavorites(correlationId, userId);
    res.status(200).json(successResponse({ favorites }, req));
  },
);

export const createDoctorDrugFavoriteHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const body = validateCreateDoctorDrugFavoriteBody(req.body);
    const favorite = await createDoctorDrugFavorite(body, correlationId, userId);
    res.status(201).json(successResponse({ favorite }, req));
  },
);

export const updateDoctorDrugFavoriteHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const { id } = validateDoctorDrugFavoriteParams(req.params);
    const body = validateUpdateDoctorDrugFavoriteBody(req.body);
    const favorite = await updateDoctorDrugFavorite(id, body, correlationId, userId);
    res.status(200).json(successResponse({ favorite }, req));
  },
);

export const deleteDoctorDrugFavoriteHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const { id } = validateDoctorDrugFavoriteParams(req.params);
    await deleteDoctorDrugFavorite(id, correlationId, userId);
    res.status(204).send();
  },
);
