/**
 * Patient Chart Routes (EHR Sub-batch A / T1.2)
 *
 * Mounted under  /api/v1/patients/:patientId/chart  by patients.ts (mergeParams=true
 * so :patientId is forwarded from the parent router).
 *
 * Three resource groups under /chart:
 *   - allergies
 *   - conditions  (chronic conditions)
 *   - vitals
 *
 * Each group exposes:
 *   - GET  /                — list (non-archived)
 *   - POST /                — create
 *   - PATCH /:id            — update incl. soft-delete via `archivedAt`
 *
 * No DELETE endpoint in V1 — soft delete via PATCH with `archivedAt: 'now'` is
 * the canonical way to remove a row. Hard delete is opt-in only and not exposed.
 *
 * Auth: doctor JWT enforced by the parent (patients.ts) authenticateToken
 * middleware on each route. We re-apply per-route here too so the file is
 * safe regardless of where it gets mounted.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  createAllergyHandler,
  createConditionHandler,
  createVitalsHandler,
  listAllergiesHandler,
  listConditionsHandler,
  listProblemsHandler,
  listVitalsHandler,
  updateAllergyHandler,
  updateConditionHandler,
  updateVitalsHandler,
} from '../../../controllers/patient-chart-controller';

const router = Router({ mergeParams: true });

router.use(authenticateToken);

// Allergies
router.get('/allergies', listAllergiesHandler);
router.post('/allergies', createAllergyHandler);
router.patch('/allergies/:id', updateAllergyHandler);

// Chronic conditions
router.get('/conditions', listConditionsHandler);
router.post('/conditions', createConditionHandler);
router.patch('/conditions/:id', updateConditionHandler);

// Vitals
router.get('/vitals', listVitalsHandler);
router.post('/vitals', createVitalsHandler);
router.patch('/vitals/:id', updateVitalsHandler);

// Problem list (T5.25 — read-only; derived from patient_problem_list_v)
router.get('/problems', listProblemsHandler);

export default router;
