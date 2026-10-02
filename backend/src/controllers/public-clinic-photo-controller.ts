/**
 * Public patient photos (clk-15, clk-16). Token is the auth.
 * The controller does not talk to storage.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { VISIT_DOCUMENT_TYPES } from '../types/visit-documents';
import {
  deletePatientPhoto,
  listPatientPhotos,
  storePatientPhoto,
} from '../services/public-clinic-photo-service';

const querySchema = z
  .object({
    token: z.string().trim().min(1),
    documentType: z.enum(VISIT_DOCUMENT_TYPES).optional().default('other'),
  })
  .strict();

const tokenQuery = z.object({ token: z.string().trim().min(1) }).strict();
const deleteParams = z.object({ documentId: z.string().uuid() }).strict();

export const postPublicClinicPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = querySchema.parse(req.query);
  const contentType = (req.header('content-type') ?? '').split(';')[0]?.trim() ?? '';
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = await storePatientPhoto(
    { token: query.token, documentType: query.documentType, contentType, bytes },
    req.correlationId || 'unknown'
  );
  res.status(201).json(successResponse(result, req));
});

export const getPublicClinicPhotosHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = tokenQuery.parse(req.query);
  const result = await listPatientPhotos(query.token, req.correlationId || 'unknown');
  res.status(200).json(successResponse(result, req));
});

export const deletePublicClinicPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = tokenQuery.parse(req.query);
  const params = deleteParams.parse(req.params);
  await deletePatientPhoto(query.token, params.documentId, req.correlationId || 'unknown');
  res.status(200).json(successResponse({ deleted: true }, req));
});
