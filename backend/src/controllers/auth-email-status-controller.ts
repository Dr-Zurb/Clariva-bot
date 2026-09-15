/**
 * Auth email-status controller (auth-password · AP-D17).
 *
 * POST /api/v1/auth/email-status — public signup preflight.
 * Orchestration only (validate → service → respond). Never logs email/PII.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { getEmailStatus } from '../services/auth-email-status-service';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
});

export const emailStatusHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = bodySchema.parse(req.body);
    const result = await getEmailStatus(email, req.correlationId ?? '');
    res.status(200).json(successResponse(result, req));
  }
);
