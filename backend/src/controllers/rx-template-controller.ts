/**
 * Doctor Rx Template Controller (EHR Sub-batch B1 / T2.11).
 *
 * Endpoints (all auth-required, doctor JWT):
 *   GET    /api/v1/rx-templates              — list active templates
 *   POST   /api/v1/rx-templates              — create
 *   PATCH  /api/v1/rx-templates/:id          — update (partial)
 *   POST   /api/v1/rx-templates/:id/use      — atomic counter bump (Apply)
 *   DELETE /api/v1/rx-templates/:id          — soft-delete (archive)
 *
 * Per Decision T2-D2 templates are per-doctor; the service enforces
 * ownership in code AND the table has owner-only RLS.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  validateCreateRxTemplateBody,
  validateListRxTemplatesQuery,
  validateUpdateRxTemplateBody,
  validateRxTemplateParams,
} from '../utils/validation';
import {
  archiveRxTemplate,
  createRxTemplate,
  listRxTemplates,
  recordRxTemplateUse,
  updateRxTemplate,
} from '../services/rx-template-service';

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
}

export const listRxTemplatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { scope } = validateListRxTemplatesQuery(req.query);
  const templates = await listRxTemplates(correlationId, userId, scope);
  res.status(200).json(successResponse({ templates }, req));
});

export const createRxTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const body = validateCreateRxTemplateBody(req.body);
  const template = await createRxTemplate(body, correlationId, userId);
  res.status(201).json(successResponse({ template }, req));
});

export const updateRxTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateRxTemplateParams(req.params);
  const body = validateUpdateRxTemplateBody(req.body);
  const template = await updateRxTemplate(id, body, correlationId, userId);
  res.status(200).json(successResponse({ template }, req));
});

export const recordRxTemplateUseHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateRxTemplateParams(req.params);
  const template = await recordRxTemplateUse(id, correlationId, userId);
  res.status(200).json(successResponse({ template }, req));
});

export const archiveRxTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateRxTemplateParams(req.params);
  const template = await archiveRxTemplate(id, correlationId, userId);
  res.status(200).json(successResponse({ template }, req));
});
