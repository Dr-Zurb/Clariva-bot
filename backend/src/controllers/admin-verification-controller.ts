/**
 * Admin Verification Controller (doctor-verification-v1 · ver-04 +
 * verification-v2 · verv2-03).
 *
 * Ops/admin review endpoints (gated by `requireAdminJwtOrSecret`):
 *   GET  /api/v1/admin/verifications?status=pending_review — list.
 *   GET  /api/v1/admin/verifications/:doctorId            — detail + signed docs.
 *   POST /api/v1/admin/verifications/:doctorId/approve    — approve.
 *   POST /api/v1/admin/verifications/:doctorId/reject     — reject (reason req).
 *   POST /api/v1/admin/verifications/:doctorId/request-changes — soft re-upload.
 *
 * The admin identity comes from the authz guard (admin-console-v1 · acon-01):
 * `req.adminActor` is the admin's `auth.users` id on the JWT (console) path, or
 * `'ops'` on the CRON_SECRET path. `reviewed_by` records that actor; a
 * caller-supplied `reviewedBy` in the body is a legacy fallback only.
 * Orchestration only (validate → service → respond).
 *
 * @see backend/src/middleware/require-admin.ts
 * @see backend/src/services/doctor-verification-service.ts
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { VERIFICATION_STATUSES } from '../types/doctor-verification';
import {
  approveVerification,
  getVerificationForReview,
  listVerifications,
  rejectVerification,
  requestChangesVerification,
} from '../services/doctor-verification-service';

const listQuerySchema = z.object({
  status: z.enum(VERIFICATION_STATUSES).default('pending_review'),
});

const doctorIdParamSchema = z.object({
  doctorId: z.string().uuid('doctorId must be a UUID'),
});

const approveBodySchema = z.object({
  reviewedBy: z.string().trim().min(1).max(120).optional(),
});

const rejectBodySchema = z.object({
  reason: z.string().trim().min(1, 'Reject reason is required').max(500),
  reviewedBy: z.string().trim().min(1).max(120).optional(),
});

const requestChangesBodySchema = z.object({
  note: z.string().trim().min(1, 'A note is required').max(500),
  reviewedBy: z.string().trim().min(1).max(120).optional(),
});

export const listVerificationsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { status } = listQuerySchema.parse(req.query);
    const items = await listVerifications(status, req.correlationId ?? '');
    res.status(200).json(successResponse({ items }, req));
  },
);

export const getVerificationDetailHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { doctorId } = doctorIdParamSchema.parse(req.params);
    const detail = await getVerificationForReview(
      doctorId,
      req.correlationId ?? '',
    );
    res.status(200).json(successResponse(detail, req));
  },
);

export const approveVerificationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { doctorId } = doctorIdParamSchema.parse(req.params);
    const { reviewedBy } = approveBodySchema.parse(req.body ?? {});
    await approveVerification(
      doctorId,
      req.adminActor ?? reviewedBy ?? 'ops',
      req.correlationId ?? '',
    );
    res.status(200).json(successResponse({ doctorId, status: 'verified' }, req));
  },
);

export const rejectVerificationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { doctorId } = doctorIdParamSchema.parse(req.params);
    const { reason, reviewedBy } = rejectBodySchema.parse(req.body ?? {});
    await rejectVerification(
      doctorId,
      reason,
      req.adminActor ?? reviewedBy ?? 'ops',
      req.correlationId ?? '',
    );
    res.status(200).json(successResponse({ doctorId, status: 'rejected' }, req));
  },
);

export const requestChangesVerificationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { doctorId } = doctorIdParamSchema.parse(req.params);
    const { note, reviewedBy } = requestChangesBodySchema.parse(req.body ?? {});
    await requestChangesVerification(
      doctorId,
      note,
      req.adminActor ?? reviewedBy ?? 'ops',
      req.correlationId ?? '',
    );
    res.status(200).json(
      successResponse({ doctorId, status: 'changes_requested' }, req),
    );
  },
);
