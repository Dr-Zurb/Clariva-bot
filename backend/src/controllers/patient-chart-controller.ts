/**
 * Patient Chart Controller (EHR Sub-batch A / T1.2)
 *
 * Express handlers for the three resource groups under
 *   /api/v1/patients/:patientId/chart/{allergies,conditions,vitals}
 *
 * Auth: All endpoints require authenticated doctor (via authenticateToken
 * mounted on the parent router).
 *
 * Soft delete: PATCH /:id with body { archivedAt: <ISO> | 'now' | null } is
 * the V1 way to archive (or revive) a row. There is no DELETE endpoint —
 * hard delete is opt-in only and not exposed.
 *
 * Response shape mirrors the prescription-controller convention:
 *   POST/PATCH → 201/200 + { <resource>: <row> }
 *   GET (list) → 200 + { <resource>: <row[]> }
 */

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import {
  validatePatientChartParentParams,
  validatePatientChartChildParams,
  validateCreatePatientAllergyBody,
  validateUpdatePatientAllergyBody,
  validateCreatePatientConditionBody,
  validateUpdatePatientConditionBody,
  validateCreatePatientMedicationBody,
  validateUpdatePatientMedicationBody,
  validateLinkConditionMedicationBody,
  validateUpdateMedicalBackgroundNotesBody,
  validateCreatePatientVitalsBody,
  validateUpdatePatientVitalsBody,
} from '../utils/validation';
import {
  createAllergy,
  createChronicCondition,
  createMedication,
  createVitals,
  getMedicalBackground,
  getProblemList,
  linkConditionMedication,
  listAllergies,
  listChronicConditions,
  listMedications,
  listVitals,
  unlinkConditionMedication,
  updateAllergy,
  updateChronicCondition,
  updateMedication,
  upsertMedicalBackgroundNotes,
  updateVitals,
} from '../services/patient-chart-service';

// ============================================================================
// Internal helpers
// ============================================================================

function requireUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return userId;
}

// ============================================================================
// Allergies
// ============================================================================

export const listAllergiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);

  const allergies = await listAllergies(patientId, correlationId, userId);
  res.status(200).json(successResponse({ allergies }, req));
});

export const createAllergyHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);
  const body = validateCreatePatientAllergyBody(req.body);

  const allergy = await createAllergy(patientId, body, correlationId, userId);
  res.status(201).json(successResponse({ allergy }, req));
});

export const updateAllergyHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId, id } = validatePatientChartChildParams(req.params);
  const body = validateUpdatePatientAllergyBody(req.body);

  const allergy = await updateAllergy(patientId, id, body, correlationId, userId);
  res.status(200).json(successResponse({ allergy }, req));
});

// ============================================================================
// Chronic conditions
// ============================================================================

export const listConditionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);

  const conditions = await listChronicConditions(patientId, correlationId, userId);
  res.status(200).json(successResponse({ conditions }, req));
});

export const createConditionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);
  const body = validateCreatePatientConditionBody(req.body);

  const condition = await createChronicCondition(patientId, body, correlationId, userId);
  res.status(201).json(successResponse({ condition }, req));
});

export const updateConditionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId, id } = validatePatientChartChildParams(req.params);
  const body = validateUpdatePatientConditionBody(req.body);

  const condition = await updateChronicCondition(patientId, id, body, correlationId, userId);
  res.status(200).json(successResponse({ condition }, req));
});

// ============================================================================
// Medications
// ============================================================================

export const listMedicationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);

  const medications = await listMedications(patientId, correlationId, userId);
  res.status(200).json(successResponse({ medications }, req));
});

export const createMedicationHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);
  const body = validateCreatePatientMedicationBody(req.body);

  const medication = await createMedication(patientId, body, correlationId, userId);
  res.status(201).json(successResponse({ medication }, req));
});

export const updateMedicationHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId, id } = validatePatientChartChildParams(req.params);
  const body = validateUpdatePatientMedicationBody(req.body);

  const medication = await updateMedication(patientId, id, body, correlationId, userId);
  res.status(200).json(successResponse({ medication }, req));
});

// ============================================================================
// Medical background (Phase B — grouped conditions + meds)
// ============================================================================

export const getMedicalBackgroundHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);

  const medicalBackground = await getMedicalBackground(patientId, correlationId, userId);
  res.status(200).json(successResponse({ medicalBackground }, req));
});

export const updateMedicalBackgroundNotesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = requireUserId(req);
    const { patientId } = validatePatientChartParentParams(req.params);
    const body = validateUpdateMedicalBackgroundNotesBody(req.body);

    const notes = await upsertMedicalBackgroundNotes(patientId, body, correlationId, userId);
    res.status(200).json(successResponse({ notes }, req));
  },
);

export const linkConditionMedicationHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);
  const body = validateLinkConditionMedicationBody(req.body);

  const link = await linkConditionMedication(patientId, body, correlationId, userId);
  res.status(201).json(successResponse({ link }, req));
});

export const unlinkConditionMedicationHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId, id } = validatePatientChartChildParams(req.params);

  await unlinkConditionMedication(patientId, id, correlationId, userId);
  res.status(200).json(successResponse({ unlinked: true }, req));
});

// ============================================================================
// Vitals
// ============================================================================

export const listVitalsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);

  const limitRaw = typeof req.query.limit === 'string' ? req.query.limit : undefined;
  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const limit = limitParsed && Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 500) : undefined;

  const vitals = await listVitals(patientId, correlationId, userId, limit);
  res.status(200).json(successResponse({ vitals }, req));
});

export const createVitalsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);
  const body = validateCreatePatientVitalsBody(req.body);

  const vitals = await createVitals(patientId, body, correlationId, userId);
  res.status(201).json(successResponse({ vitals }, req));
});

export const updateVitalsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId, id } = validatePatientChartChildParams(req.params);
  const body = validateUpdatePatientVitalsBody(req.body);

  const vitals = await updateVitals(patientId, id, body, correlationId, userId);
  res.status(200).json(successResponse({ vitals }, req));
});

// ============================================================================
// Problem list (T5.25)
// ============================================================================

export const listProblemsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = requireUserId(req);
  const { patientId } = validatePatientChartParentParams(req.params);

  const problems = await getProblemList(patientId, correlationId, userId);
  res.status(200).json(successResponse({ problems }, req));
});
