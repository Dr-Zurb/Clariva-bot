/**
 * Patient Overview Controller (Patients tab redesign / pr-03 / DL-5 + DL-6).
 *
 * Two thin handlers that delegate to `patient-overview-service.ts` for the
 * actual SQL composition + derivation. The controller layer is responsible
 * for:
 *   - Auth gating (every handler requires `req.user.id`).
 *   - Param validation (UUID for `:id`).
 *   - Cache-Control headers + response shape (the service returns plain
 *     objects; the controller wraps with `successResponse` to match the
 *     standard envelope).
 *
 * The two surfaces:
 *   - GET /api/v1/patients/:id/overview  → never cached server-side (the
 *       doctor expects fresh vitals after entering them; `private, no-cache`).
 *   - GET /api/v1/patients/kpis          → 60s process-local LRU per doctor;
 *       browser `Cache-Control: private, max-age=60`.
 *
 * RLS posture is enforced inside the service layer (admin client +
 * TS-enforced `doctor_id = userId`); see the long header comment on
 * `patient-overview-service.ts` for the full belt-and-suspenders rationale.
 */

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { validateGetPatientParams } from '../utils/validation';
import {
  computePatientsKpis,
  getPatientOverview,
} from '../services/patient-overview-service';

function requireUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return userId;
}

/**
 * GET /api/v1/patients/:id/overview
 *
 * Returns the composed {@link PatientOverviewData} payload (snapshot, problems,
 * allergies, conditions, vitals, current meds, six-visit strip, recent
 * activity, derived care plan + risk flags).
 *
 * 404 if the patient does not exist, OR if the authenticated doctor has no
 * appointment / conversation link to the patient (tenant isolation; we
 * deliberately return 404 — not 403 — to avoid leaking the existence of
 * other doctors' patients via the status-code differential).
 *
 * Cache-Control: `private, no-cache` — every patient view re-hydrates from
 * source. The hot path is "doctor just entered vitals → reload chart →
 * expect the new reading", so server-side caching would surprise.
 */
export const getPatientOverviewHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = requireUserId(req);
    const { id } = validateGetPatientParams(req.params);

    const data = await getPatientOverview(id, correlationId, userId);

    res.set('Cache-Control', 'private, no-cache');
    res.status(200).json(successResponse(data, req));
  }
);

/**
 * GET /api/v1/patients/kpis
 *
 * Returns the five KPI counts for the authenticated doctor with a 60-second
 * process-local cache. The browser also gets `Cache-Control: private,
 * max-age=60` so back-to-back navigations within the window don't hit the
 * server at all (and a refresh after 60s gets a fresh count).
 *
 * Cache eviction on patient mutation is deferred to Phase 2 — the 60s
 * staleness window is acceptable for the "New this month" / "Open episodes"
 * tiles per DL-6 § discussion.
 *
 * The handler emits a single response header — `X-KPIs-Cache: hit | miss`
 * — that is read by the integration test to assert cache behavior without
 * having to instrument the service.
 */
export const getPatientsKpisHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = requireUserId(req);

    const { data, fromCache } = await computePatientsKpis(userId, correlationId);

    res.set('Cache-Control', `private, max-age=${data.cache_ttl_seconds}`);
    res.set('X-KPIs-Cache', fromCache ? 'hit' : 'miss');
    res.status(200).json(successResponse(data, req));
  }
);
