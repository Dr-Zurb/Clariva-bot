/**
 * Public doctor endpoints (pdm-07) — no auth; used by the booking widget.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { getSupabaseAdminClient } from '../config/database';
import { resolveModePolicyForDateRange } from '../services/opd/opd-mode-service';
import { ValidationError } from '../utils/errors';
import { errorResponse } from '../utils/response';

/**
 * GET /api/v1/public/doctors/:id/mode-schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Bulk policy resolver for the booking date picker (DL-16).
 */
export const getPublicDoctorModeSchedule = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { from, to } = req.query;

  if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    res.status(400).json({ error: 'Query param `from` (YYYY-MM-DD) is required.' });
    return;
  }
  if (typeof to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({ error: 'Query param `to` (YYYY-MM-DD) is required.' });
    return;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    res
      .status(503)
      .json(errorResponse({ code: 'InternalError', message: 'Service unavailable', statusCode: 503 }, req));
    return;
  }

  try {
    const modeByDate = await resolveModePolicyForDateRange(supabase, id, from, to);
    res.json({ doctorId: id, from, to, modeByDate });
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});
