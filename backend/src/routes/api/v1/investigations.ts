/**
 * Investigations API Routes (plan-investigations-library · inv-lib-04)
 *
 * POST /api/v1/investigations/parse - gated, suggestion-only AI resolver for the
 *   free-text (no local catalog match) path. The model normalizes messy /
 *   vernacular / typo order text into clean order TERMS; PHI never logged. The
 *   frontend static catalog re-resolves every returned term.
 *
 * Auth: requires an authenticated doctor.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { resolveInvestigationHandler } from '../../../controllers/investigation-resolver-controller';

const router = Router();

router.post('/parse', authenticateToken, resolveInvestigationHandler);

export default router;
