/**
 * Consultation Controller (e-task-3)
 *
 * Handles HTTP requests for video consultation endpoints.
 * POST /api/v1/consultation/start - Start consultation (auth required)
 * GET /api/v1/consultation/token - Get Video access token (doctor: auth; patient: token param)
 *
 * No PHI in logs or response.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import {
  startConsultation,
  getConsultationToken,
  getConsultationTokenForPatient,
} from '../services/appointment-service';
import {
  validateStartConsultationBody,
  validateGetConsultationTokenQuery,
} from '../utils/validation';
import { UnauthorizedError } from '../utils/errors';

/**
 * Start consultation
 * POST /api/v1/consultation/start
 *
 * Body: { appointmentId }
 * Auth: Required (doctor).
 */
export const startConsultationHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { appointmentId } = validateStartConsultationBody(req.body);
  const result = await startConsultation(appointmentId, correlationId, userId);

  res.status(200).json(successResponse(result, req));
});

/**
 * Get consultation token
 * GET /api/v1/consultation/token?appointmentId=xxx&token=xxx (patient)
 * GET /api/v1/consultation/token?appointmentId=xxx (doctor, auth required)
 *
 * Doctor path: auth required, returns doctor Video token.
 * Patient path: token query param required, returns patient Video token.
 */
export const getConsultationTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  const query = validateGetConsultationTokenQuery(
    req.query as Record<string, string | string[] | undefined>
  );

  let result: { token: string; roomName: string };
  if (userId && query.appointmentId) {
    result = await getConsultationToken(query.appointmentId, correlationId, { userId });
  } else if (query.token) {
    result = await getConsultationTokenForPatient(query.token, correlationId);
  } else {
    throw new UnauthorizedError('Authentication or consultation token required');
  }
  res.status(200).json(successResponse(result, req));
});
