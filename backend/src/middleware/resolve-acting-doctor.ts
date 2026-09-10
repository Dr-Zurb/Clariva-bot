/**
 * Resolve tenant vs actor (receptionist-portal P1).
 *
 * Requires `authenticateToken` to have populated `req.user`.
 *
 *   - No staff role → actingDoctorId = actorId = req.user.id (zero DB queries).
 *   - Staff role + active clinic_staff row → actingDoctorId = row.doctor_id.
 *   - Staff role + no row / suspended → 403 (fail closed).
 */

import type { NextFunction, Request, Response } from 'express';
import { isStaffRole } from '../auth/staff-roles';
import { findStaffLink } from '../services/clinic-staff-service';
import { asyncHandler } from '../utils/async-handler';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export const resolveActingDoctor = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    const correlationId = req.correlationId || 'unknown';
    const role = user.app_metadata?.role;

    if (!isStaffRole(role)) {
      req.actingDoctorId = user.id;
      req.actorId = user.id;
      req.actorKind = 'doctor';
      next();
      return;
    }

    const link = await findStaffLink(user.id, correlationId);

    if (!link) {
      throw new ForbiddenError('Staff account is not linked to a practice');
    }

    if (link.status === 'suspended') {
      throw new ForbiddenError('Staff access has been suspended');
    }

    req.actingDoctorId = link.doctorId;
    req.actorId = user.id;
    req.actorKind = 'staff';
    req.staffRole = link.role;
    next();
  }
);

/** Tenant + actor after authenticateToken (and resolveActingDoctor when opted in). */
export function requireResolvedDoctor(req: Request): {
  doctorId: string;
  actorId: string;
} {
  const actorId = req.user?.id;
  if (!actorId) {
    throw new UnauthorizedError('Authentication required');
  }
  return {
    doctorId: req.actingDoctorId ?? actorId,
    actorId,
  };
}
