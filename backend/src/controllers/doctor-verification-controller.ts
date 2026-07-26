/**
 * Doctor Verification Controller (doctor-verification-v1 · ver-03).
 *
 * Doctor-facing endpoints:
 *   POST /api/v1/verification/upload-url — mint a signed upload URL for a doc.
 *   POST /api/v1/verification/submit     — submit details + doc paths.
 *   GET  /api/v1/verification/status     — the doctor's own status.
 *
 * Auth: `authenticateToken`. `req.user.id` is the ONLY doctor id — never
 * trust body/query. Orchestration only (validate → service → respond).
 *
 * @see backend/src/services/doctor-verification-service.ts
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { VERIFICATION_DOC_KINDS } from '../types/doctor-verification';
import {
  VERIFICATION_ALLOWED_MIME,
  createVerificationUploadUrl,
  getVerificationStatus,
  submitVerification,
} from '../services/doctor-verification-service';

function requireUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return userId;
}

const uploadUrlSchema = z.object({
  kind: z.enum(VERIFICATION_DOC_KINDS),
  contentType: z.enum(VERIFICATION_ALLOWED_MIME),
});

// Bounded strings so a crafted payload can't bloat the row. Paths are
// re-validated for ownership in the service.
const submitSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(200),
  registrationNumber: z
    .string()
    .trim()
    .min(1, 'Registration number is required')
    .max(100),
  councilState: z
    .string()
    .trim()
    .min(1, 'State council / NMC is required')
    .max(120),
  specialty: z.string().trim().max(120).optional(),
  certificatePath: z.string().trim().min(1).max(400),
  govIdPath: z.string().trim().min(1).max(400).optional(),
});

export const createUploadUrlHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { kind, contentType } = uploadUrlSchema.parse(req.body);

    const result = await createVerificationUploadUrl(
      userId,
      kind,
      contentType,
      req.correlationId ?? '',
    );

    res.status(200).json(successResponse(result, req));
  },
);

export const submitVerificationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const input = submitSchema.parse(req.body);

    const status = await submitVerification(
      userId,
      input,
      req.correlationId ?? '',
    );

    res.status(200).json(successResponse(status, req));
  },
);

export const getVerificationStatusHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    const status = await getVerificationStatus(userId, req.correlationId ?? '');

    res.status(200).json(successResponse(status, req));
  },
);
