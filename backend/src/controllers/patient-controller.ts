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
import { getPatientForDoctor } from '../services/patient-service';
import { validateGetPatientParams } from '../utils/validation';
import { UnauthorizedError } from '../utils/errors';

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
