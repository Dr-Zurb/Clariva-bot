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
  getLastPrescriptionInEpisode,
  getLastSubjectiveForPatient,
  getLastVisitSummary,
  getPrescriptionById,
  listPrescriptionsByAppointment,
  listPrescriptionsByPatient,
  listRecentPrescriptionsByPatient,
  updatePrescription,
} from '../services/prescription-service';
import {
  createUploadUrl,
  registerAttachment,
  getAttachmentDownloadUrl,
  deleteAttachment,
} from '../services/prescription-attachment-service';
import { extractLabPdfFromAttachment } from '../services/lab-pdf-extract-service';
import { promoteVisitDocumentPageToPrescription } from '../services/visit-documents-service';
import { sendPrescriptionToPatient } from '../services/notification-service';
import { getDoctorTimezone } from '../services/doctor-settings-service';
import { reissuePrescriptionAsRevision } from '../services/prescription-revision-service';
import {
  forceRegeneratePrescriptionPdf,
  getOrCreateSignedPdfUrl,
  getPrescriptionPdfBytes,
} from '../services/prescription-pdf-service';
import { mintRxToken, buildShareUrl } from '../services/prescription-token-service';
import { env } from '../config/env';
import {
  validateCreatePrescriptionBody,
  validateUpdatePrescriptionBody,
  validatePrescriptionParams,
  validateListPrescriptionsQuery,
  validateCreateUploadUrlBody,
  validateRegisterAttachmentBody,
  validatePrescriptionAttachmentParams,
  validatePatientChartParentParams,
  validateLastVisitSummaryQuery,
  validateLastInEpisodeQuery,
  validateLastSubjectiveQuery,
  validateReissuePrescriptionBody,
  validatePrescriptionPdfMedicineKeyHeader,
} from '../utils/validation';
import { validatePromoteVisitDocumentPageBody } from '../utils/visit-document-promote-validation';
import { InternalError, ServiceUnavailableError, UnauthorizedError } from '../utils/errors';
import { prescriptionPdfFilenameFromRow } from '../utils/prescription-pdf-filename';

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
  const { filename, contentType, category, complaintId } = validateCreateUploadUrlBody(req.body);

  const { path, token } = await createUploadUrl(
    id,
    userId,
    filename,
    contentType,
    correlationId,
    category,
    complaintId
  );

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

  const attachment = await registerAttachment(
    id,
    filePath,
    fileType,
    caption ?? null,
    correlationId,
    userId
  );

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
 * Extract structured lab rows from an owned report attachment (rpt-05.2 / 05.6).
 * POST /api/v1/prescriptions/:id/attachments/:attachmentId/extract-lab
 *
 * Suggestion-only — nothing is written. The service dispatches on MIME: PDFs
 * to the deterministic text-layer reader, photos to the gated vision reader.
 * An unreadable file degrades to empty rows or a typed error (503 when photo
 * extraction is disabled); the visit stays editable either way.
 */
export const extractLabPdfFromAttachmentHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id, attachmentId } = validatePrescriptionAttachmentParams(req.params);
    const result = await extractLabPdfFromAttachment({
      prescriptionId: id,
      attachmentId,
      userId,
      correlationId,
    });

    res.status(200).json(successResponse(result, req));
  }
);

/**
 * Copy a front-desk visit page into prescription_attachments (DVP-Q3).
 * POST /api/v1/prescriptions/:id/attachments/from-visit-page
 *
 * Doctor-only. Suggestion extract stays on the existing extract-lab route.
 */
export const promoteVisitDocumentPageHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validatePrescriptionParams(req.params);
  const { appointmentId, documentId, pageId } = validatePromoteVisitDocumentPageBody(req.body);

  const attachment = await promoteVisitDocumentPageToPrescription(
    id,
    appointmentId,
    documentId,
    pageId,
    userId,
    correlationId,
    userId
  );

  res.status(201).json(successResponse({ attachment }, req));
});

/**
 * Delete a prescription attachment (DB row + storage object)
 * DELETE /api/v1/prescriptions/:id/attachments/:attachmentId
 *
 * obj-22: backs the Objective media strip's remove affordance. Reuses the existing
 * ownership check + shipped DELETE RLS policy (migration 026); no policy widening.
 */
export const deleteAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id, attachmentId } = validatePrescriptionAttachmentParams(req.params);

  await deleteAttachment(id, attachmentId, correlationId, userId);

  res.status(204).send();
});

/**
 * EHR Sub-batch A / T1.6 — list the N most recent prescriptions for a
 * patient (lightweight summary; powers the chart panel "Previous Rx"
 * surface). Mounted under /api/v1/patients/:patientId/prescriptions/recent.
 *
 * Query: ?limit=N (1-25, default 3)
 */
export const listRecentPrescriptionsByPatientHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const { patientId } = validatePatientChartParentParams(req.params);

    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 3;

    const prescriptions = await listRecentPrescriptionsByPatient(
      patientId,
      correlationId,
      userId,
      limit
    );

    res.status(200).json(successResponse({ prescriptions }, req));
  }
);

/**
 * Same-day revise — clone as Version N+1 (rxl-25).
 * POST /api/v1/prescriptions/:id/reissue
 */
export const reissuePrescriptionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const { id } = validatePrescriptionParams(req.params);
    const { reason } = validateReissuePrescriptionBody(req.body);
    const prescription = await reissuePrescriptionAsRevision(
      id,
      reason,
      correlationId,
      userId
    );

    res.status(201).json(successResponse({ prescription }, req));
  }
);

/**
 * Send prescription to patient via DM/email
 * POST /api/v1/prescriptions/:id/send
 */
export const sendPrescriptionToPatientHandler = asyncHandler(
  async (req: Request, res: Response) => {
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
          // T3.17: surface the PDF storage path + public share link in
          // the API response so the FE toast can offer "Copy share link"
          // immediately after a successful send (and a partial-failure
          // toast can still let the doctor recover via WhatsApp/SMS even
          // when both managed channels failed).
          pdfStoragePath: result.pdfStoragePath ?? null,
          publicLink: result.publicLink ?? null,
        },
        req
      )
    );
  }
);

/**
 * EHR Sub-batch B2 / T3.19 — "Regenerate PDF" kebab action.
 *
 * POST /api/v1/prescriptions/:id/regenerate-pdf
 *
 * Forces a fresh PDF render bypassing the 5-min cache. Used by the
 * doctor when their letterhead changed (clinic name, address, etc.)
 * and they want the next "Copy share link" / "Resend" to surface
 * the new branding without waiting for the cache to expire.
 *
 * No side effects beyond the storage write — does NOT re-fire any
 * patient channel and does NOT touch `sent_to_patient_at`.
 *
 * Auth: doctor must own the prescription. Ownership is verified by
 * `getPrescriptionById` (raises NotFoundError on mismatch — never
 * leaks existence of other doctors' Rx).
 */
export const regeneratePrescriptionPdfHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const { id } = validatePrescriptionParams(req.params);

    // Ownership guard — throws NotFoundError if the doctor doesn't
    // own this prescription. This also writes a `prescription_read`
    // audit row, which is the right footprint for a doctor action
    // that touches the artifact.
    await getPrescriptionById(id, correlationId, userId);

    const result = await forceRegeneratePrescriptionPdf(id, correlationId);

    res.status(200).json(
      successResponse(
        {
          storagePath: result.storagePath,
          signedUrl: result.signedUrl,
          generatedAt: result.generatedAt,
          byteCount: result.byteCount,
        },
        req
      )
    );
  }
);

/**
 * Doctor print — GET /api/v1/prescriptions/:id/pdf-url
 *
 * Returns a fresh 24h signed URL for the stored PDF. Generates the
 * artifact on demand when send never wrote one (partial failure).
 *
 * Auth: doctor must own the prescription. Ownership is verified by
 * `getPrescriptionById` (raises NotFoundError on mismatch).
 */
export const getPrescriptionPdfUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validatePrescriptionParams(req.params);
  const prescription = await getPrescriptionById(id, correlationId, userId);
  // RXL-Q1 relocked 2026-09-09: print does not attest. Finish / wrap-up does.
  const result = await getOrCreateSignedPdfUrl(
    prescription.id,
    prescription.doctor_id,
    correlationId
  );

  res.status(200).json(successResponse({ signedUrl: result.signedUrl }, req));
});

/**
 * Doctor print / download — GET /api/v1/prescriptions/:id/pdf
 *
 * Streams the PDF bytes directly (no storage signed-URL hop). Same
 * ownership as `pdf-url`. Print does not attest (RXL-Q1 / rxl-20).
 * Binary body, not `successResponse` — same pattern as invoice PDFs.
 */
export const getPrescriptionPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { id } = validatePrescriptionParams(req.params);
  const medicineKey = validatePrescriptionPdfMedicineKeyHeader(req.headers['x-rx-medicine-key']);
  const prescription = await getPrescriptionById(id, correlationId, userId);
  const [{ bytes }, timezone] = await Promise.all([
    getPrescriptionPdfBytes(prescription.id, correlationId, { medicineKey }),
    getDoctorTimezone(prescription.doctor_id),
  ]);
  const filename = prescriptionPdfFilenameFromRow(prescription, timezone);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Length', String(bytes.length));
  res.status(200).send(bytes);
});

/**
 * EHR Sub-batch B2 / T3.19 — "Copy share link" kebab action.
 *
 * POST /api/v1/prescriptions/:id/share-link
 *
 * Mints a fresh 24h HMAC token and returns the public share URL
 * (`{APP_BASE_URL}/r/<id>?t=<token>`). Idempotent — calling N times
 * yields N different tokens (each with its own 24h TTL); does NOT
 * write to the DB and does NOT re-trigger any send pipeline.
 *
 * Auth: doctor must own the prescription. We deliberately verify
 * ownership BEFORE minting so a request for someone else's
 * prescription returns the same 404 shape as the GET — no
 * information leak about which prescription IDs exist.
 *
 * Returns 503 (`SERVICE_UNAVAILABLE`) when `APP_BASE_URL` or
 * `RX_SHARE_TOKEN_SECRET` are missing — the API is reachable but
 * not yet operationally configured. The FE renders this as a
 * "Sharing not configured — contact support" toast.
 */
export const createPrescriptionShareLinkHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const { id } = validatePrescriptionParams(req.params);

    await getPrescriptionById(id, correlationId, userId);

    if (!env.APP_BASE_URL) {
      throw new ServiceUnavailableError('Share link unavailable: APP_BASE_URL is not configured');
    }

    let token: string;
    try {
      token = mintRxToken(id);
    } catch (err) {
      // mintRxToken throws when RX_SHARE_TOKEN_SECRET is missing/short.
      // We surface a 503 (operationally not configured) rather than
      // 500 so the FE can render a clear "contact support" toast.
      throw new InternalError(
        `Share link unavailable: ${err instanceof Error ? err.message : 'token mint failed'}`
      );
    }

    const url = buildShareUrl(env.APP_BASE_URL, id, token);
    // Default 24h matches `mintRxToken`'s `DEFAULT_TTL_SECONDS`.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    res.status(200).json(
      successResponse(
        {
          url,
          expiresAt,
        },
        req
      )
    );
  }
);

/**
 * EHR Sub-batch B1 / T2.14 — "Copy from last visit".
 *
 * GET /api/v1/prescriptions/last-in-episode?appointmentId=:id&excludePrescriptionId=
 *
 * Returns the most recent non-superseded prescription in the same care
 * episode. Optional `excludePrescriptionId` skips the working note
 * (rxl-08). Returns `{ prescription: null }` (200) when no prior Rx
 * exists. Auth: doctor must own `appointmentId`.
 */
export const getLastPrescriptionInEpisodeHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const { appointmentId, excludePrescriptionId } = validateLastInEpisodeQuery(req.query);
    const prescription = await getLastPrescriptionInEpisode(
      appointmentId,
      correlationId,
      userId,
      excludePrescriptionId
    );

    res.status(200).json(successResponse({ prescription }, req));
  }
);

/**
 * subjective-tab · subj-07 — carry-forward subjective from last visit.
 *
 * GET /api/v1/prescriptions/last-subjective?patientId=&appointmentId=&excludePrescriptionId=
 */
export const getLastSubjectiveForPatientHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');

    const { patientId, appointmentId, excludePrescriptionId } =
      validateLastSubjectiveQuery(req.query);

    const subjective = await getLastSubjectiveForPatient(
      patientId,
      appointmentId,
      correlationId,
      userId,
      excludePrescriptionId
    );

    res.status(200).json(successResponse({ subjective }, req));
  }
);

/**
 * last-visit-context · lvc-01
 *
 * GET /api/v1/patients/:patientId/last-visit-summary?appointmentId=
 *
 * Patient-scoped last prescription excluding the current appointment.
 * Returns `{ summary: null }` (200) when there is no prior Rx.
 */
export const getLastVisitSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');

  const { patientId } = validatePatientChartParentParams(req.params);
  const { appointmentId } = validateLastVisitSummaryQuery(req.query);

  const summary = await getLastVisitSummary(patientId, appointmentId, correlationId, userId);

  res.status(200).json(successResponse({ summary }, req));
});
