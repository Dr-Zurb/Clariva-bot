/**
 * Doctor Settings — front-desk staff (many logins, one active).
 * JWT doctor only (no allowStaff). Never logs email / display_name.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import {
  deleteDoctorClinicStaff,
  listDoctorClinicStaff,
  provisionDoctorClinicStaff,
  setDoctorClinicStaffStatus,
  updateDoctorClinicStaffDisplayName,
} from '../services/doctor-clinic-staff-service';

const provisionBodySchema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
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

function requireDoctorId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    throw new UnauthorizedError('Authentication required');
  }
  return id;
}

export const listDoctorClinicStaffHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const doctorId = requireDoctorId(req);
    const items = await listDoctorClinicStaff(doctorId, req.correlationId ?? 'unknown');
    res.status(200).json(successResponse({ items }, req));
  }
);

export const provisionDoctorClinicStaffHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const doctorId = requireDoctorId(req);
    const parsed = provisionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const result = await provisionDoctorClinicStaff(
      doctorId,
      parsed.data,
      req.correlationId ?? 'unknown'
    );
    res.status(result.created ? 201 : 200).json(successResponse(result, req));
  }
);

export const patchDoctorClinicStaffHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const doctorId = requireDoctorId(req);
    const params = staffIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0]?.message ?? 'Invalid id');
    }
    const body = patchBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ValidationError(body.error.issues[0]?.message ?? 'Invalid request');
    }
    const cid = req.correlationId ?? 'unknown';
    let link = null;
    if (body.data.status !== undefined) {
      link = await setDoctorClinicStaffStatus(
        doctorId,
        params.data.id,
        body.data.status,
        cid
      );
    }
    if (body.data.displayName !== undefined) {
      link = await updateDoctorClinicStaffDisplayName(
        doctorId,
        params.data.id,
        body.data.displayName.length > 0 ? body.data.displayName : null,
        cid
      );
    }
    if (!link) {
      throw new ValidationError('Nothing to update');
    }
    res.status(200).json(successResponse({ staff: link }, req));
  }
);

export const deleteDoctorClinicStaffHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const doctorId = requireDoctorId(req);
    const params = staffIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationError(params.error.issues[0]?.message ?? 'Invalid id');
    }
    await deleteDoctorClinicStaff(
      doctorId,
      params.data.id,
      req.correlationId ?? 'unknown'
    );
    res.status(200).json(successResponse({ deleted: true }, req));
  }
);
