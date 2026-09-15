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
import { errorResponse, successResponse } from '../utils/response';
import {
  bulkTagPatientsForDoctor,
  createPatientForFrontDesk,
  getPatientForDoctor,
  listPatientsForDoctor,
  listPatientsForDoctorFiltered,
  mergePatients,
  archivePatientForFrontDesk,
  restorePatientForFrontDesk,
  updatePatientForFrontDesk,
} from '../services/patient-service';
import { listPossibleDuplicates } from '../services/patient-matching-service';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import {
  hasPatientListQueryParams,
  validateBulkTagPatientsBody,
  validateCreateFrontDeskPatientBody,
  validateGetPatientParams,
  validateMergePatientsBody,
  validatePatientListQuery,
  validateUpdateFrontDeskPatientBody,
} from '../utils/validation';
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
  const { doctorId, actorId } = requireResolvedDoctor(req);

  const query = req.query as Record<string, string | string[] | undefined>;

  if (!hasPatientListQueryParams(query)) {
    const patients = await listPatientsForDoctor(doctorId, correlationId, actorId);
    res.status(200).json(
      successResponse(
        {
          patients,
          total: patients.length,
          page: 1,
          pageSize: patients.length,
        },
        req
      )
    );
    return;
  }

  const filters = validatePatientListQuery(query);
  const result = await listPatientsForDoctorFiltered(doctorId, filters, correlationId, actorId);

  res.status(200).json(successResponse(result, req));
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
  const { doctorId, actorId } = requireResolvedDoctor(req);

  const { id } = validateGetPatientParams(req.params);
  const patient = await getPatientForDoctor(id, doctorId, correlationId, actorId);

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
 * Bulk tag ops on selected patients (pr-07 / patients-multi-tag).
 * PATCH /api/v1/patients/bulk-tag
 */
export const bulkTagPatientsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { ids, op, tags } = validateBulkTagPatientsBody(req.body);
  const result = await bulkTagPatientsForDoctor(userId, ids, { op, tags }, correlationId);

  res.status(200).json(successResponse(result, req));
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

/**
 * Manual / front-desk patient create
 * POST /api/v1/patients
 *
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 * 409 + details.matches when possible duplicates exist and confirmNew is not set.
 */
export const createPatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const body = validateCreateFrontDeskPatientBody(req.body);

  const result = await createPatientForFrontDesk(doctorId, body, correlationId, actorId);

  if (result.kind === 'possible_duplicates') {
    res.status(409).json(
      errorResponse(
        {
          code: 'ConflictError',
          message: 'Possible existing patient. Confirm to create a new record.',
          statusCode: 409,
          details: { matches: result.matches, confirmRequired: true },
        },
        req
      )
    );
    return;
  }

  res.status(201).json(successResponse({ patient: result.patient }, req));
});

/**
 * Front-desk demographic edit (no delete).
 * PATCH /api/v1/patients/:id
 *
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 * 409 + details.matches when the new mobile hits another owned patient.
 */
export const updatePatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetPatientParams(req.params);
  const body = validateUpdateFrontDeskPatientBody(req.body);

  const result = await updatePatientForFrontDesk(doctorId, id, body, correlationId, actorId);

  if (result.kind === 'possible_duplicates') {
    res.status(409).json(
      errorResponse(
        {
          code: 'ConflictError',
          message: 'Possible existing patient. Confirm to keep this record.',
          statusCode: 409,
          details: { matches: result.matches, confirmRequired: true },
        },
        req
      )
    );
    return;
  }

  res.status(200).json(successResponse({ patient: result.patient }, req));
});

const CLINICAL_ARCHIVE_MESSAGE =
  'This record has clinical data. Merge it into the right patient instead of archiving.';

/**
 * Front-desk hide (no delete).
 * POST /api/v1/patients/:id/archive
 */
export const archivePatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetPatientParams(req.params);

  const result = await archivePatientForFrontDesk(doctorId, id, correlationId, actorId);

  if (result.kind === 'has_clinical_data') {
    res.status(409).json(
      errorResponse(
        {
          code: 'ConflictError',
          message: CLINICAL_ARCHIVE_MESSAGE,
          statusCode: 409,
          details: { reason: 'has_clinical_data' },
        },
        req
      )
    );
    return;
  }

  res.status(200).json(successResponse({ patient: result.patient }, req));
});

/**
 * Front-desk restore.
 * POST /api/v1/patients/:id/restore
 */
export const restorePatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetPatientParams(req.params);

  const patient = await restorePatientForFrontDesk(doctorId, id, correlationId, actorId);
  res.status(200).json(successResponse({ patient }, req));
});
