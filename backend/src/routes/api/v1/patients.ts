/**
 * Patient API Routes
 *
 * GET /api/v1/patients - List patients for doctor (requires auth; staff opted in)
 * POST /api/v1/patients - Front-desk / manual create (staff opted in)
 * GET /api/v1/patients/kpis - KPI tile counts for the patients list header (pr-03 / DL-6)
 * GET /api/v1/patients/possible-duplicates - List possible duplicate groups (requires auth)
 * PATCH /api/v1/patients/bulk-tag - Bulk add/remove/set/clear patient_tags
 * POST /api/v1/patients/merge - Merge two patients (requires auth)
 * PATCH /api/v1/patients/:id - Front-desk demographic edit (staff opted in)
 * POST /api/v1/patients/:id/archive - Front-desk hide (staff opted in)
 * POST /api/v1/patients/:id/restore - Front-desk restore (staff opted in)
 * GET /api/v1/patients/:id - Get patient by ID (doctor-only, requires auth)
 * GET /api/v1/patients/:id/overview - Composed overview (pr-03 / DL-5)
 * GET /api/v1/patients/:id/consult-timeline - rec-28 doctor consult timeline
 * GET /api/v1/patients/:patientId/prescriptions/recent
 *   - List N most recent Rx for the patient (lightweight; EHR T1.6)
 * GET /api/v1/patients/:patientId/last-visit-summary
 *   - Last visit complaints / diagnoses / medicines (lvc-01)
 *
 * Sub-routers (mounted under /:patientId):
 *   /:patientId/chart/{allergies,conditions,vitals}  → patient-chart-routes
 *     (EHR Sub-batch A / T1.2)
 *
 * Route ordering: every literal-path route (`/kpis`, `/possible-duplicates`,
 * `/merge`) MUST be registered BEFORE any parameterised `/:id` route,
 * otherwise Express resolves the literal as the param value and 404s when
 * the handler tries to UUID-parse `'kpis'`.
 *
 * Auth: All routes require authenticateToken (doctor JWT).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { staffCapability } from '../../../middleware/allow-staff';
import { STAFF_CAPABILITIES } from '../../../auth/staff-capabilities';
import { resolveActingDoctor } from '../../../middleware/resolve-acting-doctor';
import {
  bulkTagPatientsHandler,
  createPatientHandler,
  listPatientsHandler,
  getPatientByIdHandler,
  listPossibleDuplicatesHandler,
  mergePatientsHandler,
  archivePatientHandler,
  restorePatientHandler,
  updatePatientHandler,
} from '../../../controllers/patient-controller';
import {
  getPatientOverviewHandler,
  getPatientsKpisHandler,
} from '../../../controllers/patient-overview-controller';
import { getPatientConsultTimelineHandler } from '../../../controllers/patient-consult-timeline-controller';
import {
  getLastVisitSummaryHandler,
  listRecentPrescriptionsByPatientHandler,
} from '../../../controllers/prescription-controller';
import patientChartRoutes from './patient-chart-routes';

const router = Router();

router.get('/', staffCapability(...STAFF_CAPABILITIES), authenticateToken, resolveActingDoctor, listPatientsHandler);
router.post('/', staffCapability('front_desk'), authenticateToken, resolveActingDoctor, createPatientHandler);
// `/kpis` BEFORE `/:id` so the literal doesn't get caught by the param.
router.get('/kpis', authenticateToken, getPatientsKpisHandler);
router.get('/possible-duplicates', authenticateToken, listPossibleDuplicatesHandler);
router.patch('/bulk-tag', authenticateToken, bulkTagPatientsHandler);
router.post('/merge', authenticateToken, mergePatientsHandler);
router.patch('/:id', staffCapability('front_desk'), authenticateToken, resolveActingDoctor, updatePatientHandler);
router.post(
  '/:id/archive',
  staffCapability('front_desk'),
  authenticateToken,
  resolveActingDoctor,
  archivePatientHandler
);
router.post(
  '/:id/restore',
  staffCapability('front_desk'),
  authenticateToken,
  resolveActingDoctor,
  restorePatientHandler
);
router.get('/:id', staffCapability(...STAFF_CAPABILITIES), authenticateToken, resolveActingDoctor, getPatientByIdHandler);
router.get('/:id/overview', authenticateToken, getPatientOverviewHandler);
router.get('/:id/consult-timeline', authenticateToken, getPatientConsultTimelineHandler);

// Patient chart context (allergies / chronic conditions / vitals).
// Mounted as a sub-router so it can use mergeParams to inherit :patientId
// from this parent router. authenticateToken is re-applied inside the
// sub-router for safety.
router.use('/:patientId/chart', patientChartRoutes);

// EHR Sub-batch A / T1.6 — lightweight "recent prescriptions" list for
// the chart panel's Previous Rx section. Mounted directly here (not as
// a sub-router) because there's exactly one endpoint and the param name
// matches the schema (patientId). authenticateToken applied inline.
router.get(
  '/:patientId/prescriptions/recent',
  authenticateToken,
  listRecentPrescriptionsByPatientHandler
);

router.get('/:patientId/last-visit-summary', authenticateToken, getLastVisitSummaryHandler);

export default router;
