/**
 * Admin clinic-staff console (RQ1 fast-follow).
 * Gated by requireAdminJwtOrSecret. Never logs email / display_name.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { ValidationError } from '../utils/errors';
import {
  deleteAdminClinicStaff,
  listAdminClinicStaff,
  provisionAdminClinicStaff,
  setAdminClinicStaffStatus,
  updateAdminClinicStaffDisplayName,
} from '../services/admin-clinic-staff-service';

const provisionBodySchema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
  doctorId: z.string().uuid('doctorId must be a UUID'),
  displayName: z.string().trim().max(80).optional(),
});

const staffIdParamsSchema = z.object({
  id: z.string().uuid('Invalid staff link id'),
});

const patchBodySchema = z
  .object({
    status: z.enum(['active', 'suspended']).optional(),
    displayName: z.string().trim().max(80).optional(),
  })
  .refine((body) => body.status !== undefined || body.displayName !== undefined, {
    message: 'Nothing to update',
  });

function adminActor(req: Request): string {
  return req.adminActor ?? 'ops';
}

export const listAdminClinicStaffHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const items = await listAdminClinicStaff(req.correlationId ?? 'unknown');
    res.status(200).json(successResponse({ items }, req));
  }
);

export const provisionAdminClinicStaffHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = provisionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const result = await provisionAdminClinicStaff(
      parsed.data,
      req.correlationId ?? 'unknown',
      adminActor(req)
    );
    res.status(result.created ? 201 : 200).json(successResponse(result, req));
  }
);

export const patchAdminClinicStaffHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const params = staffIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0]?.message ?? 'Invalid id');
    }
    const body = patchBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0]?.message ?? 'Invalid request');
    }
    const cid = req.correlationId ?? 'unknown';
    const actor = adminActor(req);
    let link = null;
    if (body.data.status !== undefined) {
      link = await setAdminClinicStaffStatus(
        params.data.id,
        body.data.status,
        cid,
        actor
      );
    }
    if (body.data.displayName !== undefined) {
      link = await updateAdminClinicStaffDisplayName(
        params.data.id,
        body.data.displayName.length > 0 ? body.data.displayName : null,
        cid,
        actor
      );
    }
    if (!link) {
      throw new ValidationError('Nothing to update');
    }
    res.status(200).json(successResponse({ staff: link }, req));
  }
);

export const deleteAdminClinicStaffHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const params = staffIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0]?.message ?? 'Invalid id');
    }
    await deleteAdminClinicStaff(
      params.data.id,
      req.correlationId ?? 'unknown',
      adminActor(req)
    );
    res.status(200).json(successResponse({ deleted: true }, req));
  }
);
