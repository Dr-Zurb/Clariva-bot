/**
 * Patient Controller
 *
 * Handles HTTP requests for patient-related endpoints.
 * GET /api/v1/patients/:id - Get patient by ID (doctor-only, requires auth).
 *
 * Auth: Requires authenticated doctor (req.user). Returns 401 if unauthenticated.
 * Access: Doctor may only view patients linked via conversations or appointments (RLS-aligned).
 * MUST: Use asyncHandler and successResponse - see STANDARDS.md
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { getPatientForDoctor, listPatientsForDoctor, mergePatients } from '../services/patient-service';
import { listPossibleDuplicates } from '../services/patient-matching-service';
import { validateGetPatientParams, validateMergePatientsBody } from '../utils/validation';
import { UnauthorizedError } from '../utils/errors';

/**
 * List patients for authenticated doctor
 * GET /api/v1/patients
 *
 * Returns patients linked via appointments or conversations.
 * Response: { success: true, data: { patients: PatientSummary[] }, meta }
 */
export const listPatientsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const patients = await listPatientsForDoctor(userId, correlationId);

  res.status(200).json(successResponse({ patients }, req));
});

/**
 * Get patient by ID
 * GET /api/v1/patients/:id
 *
 * Auth: Requires authenticated doctor (req.user). Returns 401 if unauthenticated.
 * Response: { success: true, data: { patient: Patient }, meta }
 * 403 if doctor has no conversation or appointment link to patient; 404 if patient not found.
 */
export const getPatientByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validateGetPatientParams(req.params);
  const patient = await getPatientForDoctor(id, userId, correlationId);

  res.status(200).json(successResponse({ patient }, req));
});

/**
 * List possible duplicate patient groups
 * GET /api/v1/patients/possible-duplicates
 *
 * Returns groups of patients that might be duplicates (same phone, etc.).
 */
export const listPossibleDuplicatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { groups } = await listPossibleDuplicates(userId, correlationId);

  res.status(200).json(successResponse({ groups }, req));
});

/**
 * Merge two patients
 * POST /api/v1/patients/merge
 *
 * Body: { sourcePatientId, targetPatientId }
 * Merges source into target; source is anonymized.
 */
export const mergePatientsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { sourcePatientId, targetPatientId } = validateMergePatientsBody(req.body);

  await mergePatients(userId, sourcePatientId, targetPatientId, correlationId);

  res.status(200).json(successResponse({ merged: true }, req));
});
