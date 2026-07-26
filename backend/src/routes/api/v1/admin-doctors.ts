/**
 * Admin Doctor Routes (admin-console-v3 · acon3-01; invite retired in auth-v2).
 *
 * Mounted at `/api/v1/admin/doctors` from `routes/api/v1/index.ts`.
 * Gated by `requireAdminJwtOrSecret` (admin JWT OR CRON_SECRET).
 *
 * - GET / — doctors directory with derived funnel status.
 */

import { Router } from 'express';
import { listDoctorsHandler } from '../../../controllers/admin-doctors-controller';
import { requireAdminJwtOrSecret } from '../../../middleware/require-admin';

const router = Router();

router.use(requireAdminJwtOrSecret);

router.get('/', listDoctorsHandler);

export default router;
