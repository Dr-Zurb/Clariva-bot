/**
 * Prescription Controller (Prescription V1)
 *
 * Handles HTTP requests for prescription endpoints.
 * POST /api/v1/prescriptions - Create prescription
 * GET /api/v1/prescriptions/:id - Get prescription by ID
 * GET /api/v1/prescriptions - List by appointmentId or patientId
 * PATCH /api/v1/prescriptions/:id - Update prescription
 *
 * Auth: All endpoints require authenticated doctor.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import {
  createPrescription,
  getPrescriptionById,
  listPrescriptionsByAppointment,
  listPrescriptionsByPatient,
  updatePrescription,
} from '../services/prescription-service';
import {
  createUploadUrl,
  registerAttachment,
  getAttachmentDownloadUrl,
} from '../services/prescription-attachment-service';
import { sendPrescriptionToPatient } from '../services/notification-service';
import {
  validateCreatePrescriptionBody,
  validateUpdatePrescriptionBody,
  validatePrescriptionParams,
  validateListPrescriptionsQuery,
  validateCreateUploadUrlBody,
  validateRegisterAttachmentBody,
  validatePrescriptionAttachmentParams,
} from '../utils/validation';
import { UnauthorizedError } from '../utils/errors';

/**
 * Create prescription
 * POST /api/v1/prescriptions
 */
export const createPrescriptionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const data = validateCreatePrescriptionBody(req.body);
  const prescription = await createPrescription(data, correlationId, userId);

  res.status(201).json(successResponse({ prescription }, req));
});

/**
 * Get prescription by ID
 * GET /api/v1/prescriptions/:id
 */
export const getPrescriptionByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validatePrescriptionParams(req.params);
  const prescription = await getPrescriptionById(id, correlationId, userId);

  res.status(200).json(successResponse({ prescription }, req));
});

/**
 * List prescriptions
 * GET /api/v1/prescriptions?appointmentId=X or ?patientId=X
 */
export const listPrescriptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const query = req.query as Record<string, string | string[] | undefined>;
  const normalized: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    normalized[k] = typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }

  const { appointmentId, patientId } = validateListPrescriptionsQuery(normalized);

  let prescriptions;
  if (appointmentId) {
    prescriptions = await listPrescriptionsByAppointment(appointmentId, correlationId, userId);
  } else {
    prescriptions = await listPrescriptionsByPatient(patientId!, correlationId, userId);
  }

  res.status(200).json(successResponse({ prescriptions }, req));
});

/**
 * Update prescription
 * PATCH /api/v1/prescriptions/:id
 */
export const updatePrescriptionHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validatePrescriptionParams(req.params);
  const updates = validateUpdatePrescriptionBody(req.body);
  const prescription = await updatePrescription(id, updates, correlationId, userId);

  res.status(200).json(successResponse({ prescription }, req));
});

// ============================================================================
// Prescription Attachments (e-task-3)
// ============================================================================

/**
 * Create signed upload URL for prescription attachment
 * POST /api/v1/prescriptions/:id/attachments/upload-url
 */
export const createUploadUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validatePrescriptionParams(req.params);
  const { filename, contentType } = validateCreateUploadUrlBody(req.body);

  const { path, token } = await createUploadUrl(id, userId, filename, contentType, correlationId);

  res.status(200).json(successResponse({ path, token }, req));
});

/**
 * Register attachment after client uploads to signed URL
 * POST /api/v1/prescriptions/:id/attachments
 */
export const registerAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validatePrescriptionParams(req.params);
  const { filePath, fileType, caption } = validateRegisterAttachmentBody(req.body);

  const attachment = await registerAttachment(id, filePath, fileType, caption ?? null, correlationId, userId);

  res.status(201).json(successResponse({ attachment }, req));
});

/**
 * Get signed download URL for attachment
 * GET /api/v1/prescriptions/:id/attachments/:attachmentId/download-url
 */
export const getAttachmentDownloadUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id, attachmentId } = validatePrescriptionAttachmentParams(req.params);

  const { downloadUrl } = await getAttachmentDownloadUrl(id, attachmentId, correlationId, userId);

  res.status(200).json(successResponse({ downloadUrl }, req));
});

/**
 * Send prescription to patient via DM/email
 * POST /api/v1/prescriptions/:id/send
 */
export const sendPrescriptionToPatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validatePrescriptionParams(req.params);
  const result = await sendPrescriptionToPatient(id, correlationId, userId as string);

  res.status(200).json(
    successResponse(
      {
        sent: result.sent,
        channels: result.channels,
        reason: result.reason,
      },
      req
    )
  );
});
