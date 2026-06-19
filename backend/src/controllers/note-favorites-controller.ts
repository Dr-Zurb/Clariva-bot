/**
 * Doctor note favorites controller (subjective-tab · subj-06)
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  validateCreateDoctorNoteFavoriteBody,
  validateDoctorNoteFavoriteParams,
  validateListDoctorNoteFavoritesQuery,
  validateRecordDoctorNoteFavoriteUseBody,
} from '../utils/validation';
import {
  createDoctorNoteFavorite,
  deleteDoctorNoteFavorite,
  listDoctorNoteFavorites,
  recordDoctorNoteFavoriteUse,
} from '../services/note-favorites-service';

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
}

export const listDoctorNoteFavoritesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const { fieldKey } = validateListDoctorNoteFavoritesQuery(req.query);
    const favorites = await listDoctorNoteFavorites(correlationId, userId, fieldKey);
    res.status(200).json(successResponse({ favorites }, req));
  },
);

export const createDoctorNoteFavoriteHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const body = validateCreateDoctorNoteFavoriteBody(req.body);
    const favorite = await createDoctorNoteFavorite(body, correlationId, userId);
    res.status(201).json(successResponse({ favorite }, req));
  },
);

export const deleteDoctorNoteFavoriteHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const { id } = validateDoctorNoteFavoriteParams(req.params);
    await deleteDoctorNoteFavorite(id, correlationId, userId);
    res.status(204).send();
  },
);

export const recordDoctorNoteFavoriteUseHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const correlationId = req.correlationId || 'unknown';
    const body = validateRecordDoctorNoteFavoriteUseBody(req.body);
    await recordDoctorNoteFavoriteUse(body, correlationId, userId);
    res.status(204).send();
  },
);
