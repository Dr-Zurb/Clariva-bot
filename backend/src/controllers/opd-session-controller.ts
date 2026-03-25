/**
 * Patient OPD session APIs (e-task-opd-04).
 * Auth: signed consultation token (query); no PHI in responses.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { verifyConsultationTokenAllowExpired } from '../utils/consultation-token';
import { validateSessionTokenQuery } from '../utils/validation';
import {
  acceptEarlyJoin,
  buildPatientOpdSnapshot,
  declineEarlyJoin,
} from '../services/opd-snapshot-service';

function normalizeTokenQuery(req: Request): Record<string, string | undefined> {
  const query = req.query as Record<string, string | string[] | undefined>;
  return {
    token: typeof query.token === 'string' ? query.token : Array.isArray(query.token) ? query.token[0] : undefined,
  };
}

/**
 * GET /api/v1/bookings/session/snapshot?token=
 * Consultation token (allows expired for long polling; signature must be valid).
 */
export const getSessionSnapshotHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { token } = validateSessionTokenQuery(normalizeTokenQuery(req));
  const { appointmentId } = verifyConsultationTokenAllowExpired(token);
  const snapshot = await buildPatientOpdSnapshot(appointmentId, correlationId);

  res.setHeader('Cache-Control', `public, max-age=${snapshot.suggestedPollSeconds}`);
  res.status(200).json(successResponse({ snapshot }, req));
});

/**
 * POST /api/v1/bookings/session/early-join/accept?token=
 */
export const acceptEarlyJoinHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { token } = validateSessionTokenQuery(normalizeTokenQuery(req));
  const { appointmentId } = verifyConsultationTokenAllowExpired(token);
  await acceptEarlyJoin(appointmentId, correlationId);
  res.status(200).json(successResponse({ accepted: true }, req));
});

/**
 * POST /api/v1/bookings/session/early-join/decline?token=
 */
export const declineEarlyJoinHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { token } = validateSessionTokenQuery(normalizeTokenQuery(req));
  const { appointmentId } = verifyConsultationTokenAllowExpired(token);
  await declineEarlyJoin(appointmentId, correlationId);
  res.status(200).json(successResponse({ declined: true }, req));
});
