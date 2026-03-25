/**
 * Doctor OPD dashboard API (e-task-opd-06).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  listDoctorQueueSession,
  doctorOfferEarlyJoin,
  doctorSetSessionDelay,
  doctorUpdateQueueEntryStatus,
  doctorMarkAppointmentNoShow,
  doctorRequeueQueueEntry,
} from '../services/opd-doctor-service';
import {
  validateGetAppointmentParams,
  validateOpdQueueSessionQuery,
  validateOfferEarlyJoinBody,
  validateSessionDelayBody,
  validatePatchQueueEntryBody,
  validateQueueEntryParams,
  validateRequeueQueueEntryBody,
} from '../utils/validation';
import type { OpdQueueEntryStatus } from '../types/database';

/**
 * GET /api/v1/opd/queue-session?date=YYYY-MM-DD
 */
export const getOpdQueueSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { date } = validateOpdQueueSessionQuery(req.query as Record<string, string | undefined>);
  const entries = await listDoctorQueueSession(userId, date, correlationId);
  res.status(200).json(successResponse({ entries, date }, req));
});

/**
 * POST /api/v1/opd/appointments/:id/offer-early-join
 */
export const postOfferEarlyJoinHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateOfferEarlyJoinBody(req.body);
  const mins = body.expiresInMinutes ?? 15;
  await doctorOfferEarlyJoin(id, userId, mins, correlationId);
  res.status(200).json(successResponse({ offered: true, expiresInMinutes: mins }, req));
});

/**
 * POST /api/v1/opd/appointments/:id/session-delay
 */
export const postSessionDelayHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateGetAppointmentParams(req.params);
  const { delayMinutes } = validateSessionDelayBody(req.body);
  await doctorSetSessionDelay(id, userId, delayMinutes, correlationId);
  res.status(200).json(successResponse({ updated: true, delayMinutes }, req));
});

/**
 * PATCH /api/v1/opd/queue-entries/:entryId
 */
export const patchQueueEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { entryId } = validateQueueEntryParams(req.params);
  const { status } = validatePatchQueueEntryBody(req.body);
  await doctorUpdateQueueEntryStatus(entryId, userId, status as OpdQueueEntryStatus, correlationId);
  res.status(200).json(successResponse({ updated: true, status }, req));
});

/**
 * POST /api/v1/opd/appointments/:id/mark-no-show
 */
export const postMarkNoShowHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateGetAppointmentParams(req.params);
  await doctorMarkAppointmentNoShow(id, userId, correlationId);
  res.status(200).json(successResponse({ marked: true, status: 'no_show' }, req));
});

/**
 * POST /api/v1/opd/queue-entries/:entryId/requeue
 */
export const postRequeueQueueEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { entryId } = validateQueueEntryParams(req.params);
  const { strategy } = validateRequeueQueueEntryBody(req.body);
  await doctorRequeueQueueEntry(entryId, userId, strategy, correlationId);
  res.status(200).json(successResponse({ requeued: true, strategy }, req));
});
