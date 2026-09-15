/**
 * Front-desk visit documents.
 * /api/v1/appointments/:id/documents…
 *
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import {
  validateAddVisitDocumentPageBody,
  validateCreateVisitDocumentBody,
  validateGetAppointmentParams,
  validateUpdateVisitDocumentBody,
  validateVisitDocumentPageParams,
  validateVisitDocumentParams,
  validateVisitDocumentUploadUrlBody,
} from '../utils/validation';
import {
  addVisitDocumentPage,
  confirmVisitDocumentExtractedResults,
  createVisitDocument,
  createVisitDocumentUploadUrl,
  deleteVisitDocument,
  deleteVisitDocumentPage,
  extractLabFromVisitPage,
  getVisitDocumentPageDownloadUrl,
  listVisitDocuments,
  listVisitDocumentsForPatient,
  updateVisitDocument,
} from '../services/visit-documents-service';
import { validateConfirmVisitExtractedResultsBody } from '../utils/visit-document-extract-validation';
import { validatePatientChartParentParams } from '../utils/validation';

function actorIsStaff(req: Request): boolean {
  return req.actorKind === 'staff';
}

function actorCapabilities(req: Request): readonly string[] | undefined {
  return req.actorKind === 'staff' ? req.staffCapabilities ?? [] : undefined;
}

/** Doctor-only chart read for FilesTab. No allowStaff. */
export const listPatientVisitDocumentsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const { doctorId, actorId } = requireResolvedDoctor(req);
    const { patientId } = validatePatientChartParentParams(req.params);
    const documents = await listVisitDocumentsForPatient(
      patientId,
      doctorId,
      correlationId,
      actorId
    );
    res.status(200).json(successResponse({ documents }, req));
  }
);

export const listVisitDocumentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const documents = await listVisitDocuments(
    id,
    doctorId,
    correlationId,
    actorId,
    actorCapabilities(req)
  );
  res.status(200).json(successResponse({ documents }, req));
});

export const createVisitDocumentUploadUrlHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const { doctorId, actorId } = requireResolvedDoctor(req);
    const { id } = validateGetAppointmentParams(req.params);
    const { filename, contentType } = validateVisitDocumentUploadUrlBody(req.body);
    const { path, token } = await createVisitDocumentUploadUrl(
      id,
      doctorId,
      filename,
      contentType,
      correlationId,
      actorId
    );
    res.status(200).json(successResponse({ path, token }, req));
  }
);

export const createVisitDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateCreateVisitDocumentBody(req.body);
  const document = await createVisitDocument(
    id,
    doctorId,
    body,
    correlationId,
    actorId,
    actorCapabilities(req)
  );
  res.status(201).json(successResponse({ document }, req));
});

export const addVisitDocumentPageHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id, documentId } = validateVisitDocumentParams(req.params);
  const body = validateAddVisitDocumentPageBody(req.body);
  const document = await addVisitDocumentPage(
    id,
    documentId,
    doctorId,
    body,
    correlationId,
    actorId,
    actorCapabilities(req)
  );
  res.status(201).json(successResponse({ document }, req));
});

export const updateVisitDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id, documentId } = validateVisitDocumentParams(req.params);
  const body = validateUpdateVisitDocumentBody(req.body);
  const document = await updateVisitDocument(
    id,
    documentId,
    doctorId,
    body,
    correlationId,
    actorId,
    actorCapabilities(req)
  );
  res.status(200).json(successResponse({ document }, req));
});

export const getVisitDocumentPageDownloadUrlHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const { doctorId, actorId } = requireResolvedDoctor(req);
    const { id, documentId, pageId } = validateVisitDocumentPageParams(req.params);
    const { downloadUrl } = await getVisitDocumentPageDownloadUrl(
      id,
      documentId,
      pageId,
      doctorId,
      correlationId,
      actorId,
      actorCapabilities(req)
    );
    res.status(200).json(successResponse({ downloadUrl }, req));
  }
);

export const deleteVisitDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id, documentId } = validateVisitDocumentParams(req.params);
  await deleteVisitDocument(
    id,
    documentId,
    doctorId,
    correlationId,
    actorId,
    actorIsStaff(req),
    actorCapabilities(req)
  );
  res.status(204).send();
});

export const extractVisitDocumentPageLabHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const { doctorId, actorId } = requireResolvedDoctor(req);
    const { id, documentId, pageId } = validateVisitDocumentPageParams(req.params);
    const result = await extractLabFromVisitPage(
      id,
      documentId,
      pageId,
      doctorId,
      correlationId,
      actorId,
      {},
      actorCapabilities(req)
    );
    res.status(200).json(successResponse(result, req));
  }
);

export const confirmVisitDocumentExtractedResultsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const { doctorId, actorId } = requireResolvedDoctor(req);
    const { id, documentId } = validateVisitDocumentParams(req.params);
    const { panels } = validateConfirmVisitExtractedResultsBody(req.body);
    const document = await confirmVisitDocumentExtractedResults(
      id,
      documentId,
      doctorId,
      panels,
      correlationId,
      actorId,
      actorCapabilities(req)
    );
    res.status(200).json(successResponse({ document }, req));
  }
);

export const deleteVisitDocumentPageHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id, documentId, pageId } = validateVisitDocumentPageParams(req.params);
  const document = await deleteVisitDocumentPage(
    id,
    documentId,
    pageId,
    doctorId,
    correlationId,
    actorId,
    actorIsStaff(req),
    actorCapabilities(req)
  );
  res.status(200).json(successResponse({ document }, req));
});
