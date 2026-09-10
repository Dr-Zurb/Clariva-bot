/**
 * Desk hisab: collect against a visit, or load the day's tally.
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import {
  validateCollectVisitPaymentBody,
  validateDeskHisabQuery,
  validateGetAppointmentParams,
} from '../utils/validation';
import { collectVisitPayment, getDeskHisab } from '../services/visit-payments-service';

export const collectVisitPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateCollectVisitPaymentBody(req.body);
  const result = await collectVisitPayment(id, doctorId, body, correlationId, actorId);
  res.status(201).json(successResponse(result, req));
});

export const getDeskHisabHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { date } = validateDeskHisabQuery(req.query as Record<string, string | string[] | undefined>);
  const hisab = await getDeskHisab(doctorId, date, correlationId, actorId);
  res.status(200).json(successResponse({ hisab }, req));
});
