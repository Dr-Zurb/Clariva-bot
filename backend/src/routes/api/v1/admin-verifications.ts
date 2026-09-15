/**
 * Admin Verification Routes (doctor-verification-v1 · ver-04 +
 * verification-v2 · verv2-03).
 *
 * Mounted at `/api/v1/admin/verifications` from `routes/api/v1/index.ts`.
 * Every route is gated by `requireAdminJwtOrSecret` — an admin JWT
 * (`app_metadata.role='admin'`, for the browser console) OR the CRON_SECRET
 * shared secret (ops fallback). Least privilege: the service-role key stays
 * server-side (admin-console-v1 · acon-01).
 *
 * - GET  /                          — list by ?status (default pending_review).
 * - GET  /:doctorId                 — detail + short-lived signed document URLs.
 * - POST /:doctorId/approve         — approve.
 * - POST /:doctorId/reject          — reject (reason required).
 * - POST /:doctorId/request-changes — soft re-upload request (note required).
 */

import { Router } from 'express';
import { requireAdminJwtOrSecret } from '../../../middleware/require-admin';
import {
  approveVerificationHandler,
  getVerificationDetailHandler,
  listVerificationsHandler,
  rejectVerificationHandler,
  requestChangesVerificationHandler,
} from '../../../controllers/admin-verification-controller';

const router = Router();

router.use(requireAdminJwtOrSecret);

router.get('/', listVerificationsHandler);
router.get('/:doctorId', getVerificationDetailHandler);
router.post('/:doctorId/approve', approveVerificationHandler);
router.post('/:doctorId/reject', rejectVerificationHandler);
router.post('/:doctorId/request-changes', requestChangesVerificationHandler);

export default router;
