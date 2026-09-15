/**
 * Admin Doctors Controller (admin-console-v3 · acon3-01).
 *
 * Ops/admin directory endpoint (gated by `requireAdminJwtOrSecret`):
 *   GET /api/v1/admin/doctors?status=… — list with derived funnel status.
 *
 * Orchestration only (validate → service → respond). Never logs email/PII.
 *
 * @see backend/src/services/admin-doctors-service.ts
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { listAdminDoctors } from '../services/admin-doctors-service';
import { ADMIN_DOCTOR_FUNNEL_STATUSES } from '../types/admin-doctor';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';

const listQuerySchema = z.object({
  status: z.enum(ADMIN_DOCTOR_FUNNEL_STATUSES).optional(),
});

export const listDoctorsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { status } = listQuerySchema.parse(req.query);
    const items = await listAdminDoctors(req.correlationId ?? '', status);
    res.status(200).json(successResponse({ items }, req));
  },
);
