/**
 * Clinic staff context for the desk portal (receptionist-portal P4).
 * Returns the acting doctor id + clinic calendar day. No PHI.
 */

import { Request, Response } from 'express';
import { DateTime } from 'luxon';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import { getDoctorTimezone } from '../services/doctor-settings-service';

export const getClinicStaffMeHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId } = requireResolvedDoctor(req);
  const timezone = await getDoctorTimezone(doctorId);
  const today = DateTime.now().setZone(timezone).toISODate();

  res.status(200).json(
    successResponse(
      {
        doctorId,
        actorKind: req.actorKind ?? 'doctor',
        timezone,
        today,
      },
      req
    )
  );
});
