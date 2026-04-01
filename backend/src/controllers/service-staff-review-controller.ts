/**
 * ARM-06: Service staff review queue API (doctor-authenticated).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  cancelServiceStaffReviewRequestByStaff,
  confirmServiceStaffReviewRequest,
  getServiceStaffReviewRequestForDoctor,
  listEnrichedServiceStaffReviewsForDoctor,
  reassignServiceStaffReviewRequest,
} from '../services/service-staff-review-service';
import {
  validateCancelServiceStaffReviewBody,
  validateConfirmServiceStaffReviewBody,
  validateListServiceStaffReviewsQuery,
  validateReassignServiceStaffReviewBody,
  validateServiceStaffReviewIdParams,
} from '../utils/validation';

export const listServiceStaffReviewsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { status } = validateListServiceStaffReviewsQuery(req.query as Record<string, string | string[] | undefined>);
  const items = await listEnrichedServiceStaffReviewsForDoctor(userId, correlationId, status);

  res.status(200).json(successResponse({ reviews: items }, req));
});

export const getServiceStaffReviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validateServiceStaffReviewIdParams(req.params);
  const review = await getServiceStaffReviewRequestForDoctor(id, userId, correlationId);

  res.status(200).json(successResponse({ review }, req));
});

export const confirmServiceStaffReviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validateServiceStaffReviewIdParams(req.params);
  const body = validateConfirmServiceStaffReviewBody(req.body);
  const review = await confirmServiceStaffReviewRequest({
    doctorId: userId,
    actorUserId: userId,
    reviewId: id,
    correlationId,
    note: body.note,
  });

  res.status(200).json(successResponse({ review }, req));
});

export const reassignServiceStaffReviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validateServiceStaffReviewIdParams(req.params);
  const body = validateReassignServiceStaffReviewBody(req.body);
  const review = await reassignServiceStaffReviewRequest({
    doctorId: userId,
    actorUserId: userId,
    reviewId: id,
    correlationId,
    catalogServiceKey: body.catalogServiceKey,
    catalogServiceId: body.catalogServiceId,
    consultationModality: body.consultationModality,
    note: body.note,
  });

  res.status(200).json(successResponse({ review }, req));
});

export const cancelServiceStaffReviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validateServiceStaffReviewIdParams(req.params);
  const body = validateCancelServiceStaffReviewBody(req.body);
  const review = await cancelServiceStaffReviewRequestByStaff({
    doctorId: userId,
    actorUserId: userId,
    reviewId: id,
    correlationId,
    note: body.note,
  });

  res.status(200).json(successResponse({ review }, req));
});
