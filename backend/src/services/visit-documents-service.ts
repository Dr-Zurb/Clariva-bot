/**
 * Front-desk visit documents (desk-visit-prep P1).
 *
 * Appointment-scoped scans in the existing `prescription-attachments` bucket
 * under `{doctor_id}/desk/{appointment_id}/…`. Staff write via allowStaff +
 * acting doctor. No PHI in logs (ids and counts only).
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { canWriteVisitDocumentKind } from '../auth/staff-capabilities';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import type { PrescriptionAttachment } from '../types/prescription';
import type {
  AddVisitDocumentPageInput,
  CreateVisitDocumentInput,
  UpdateVisitDocumentInput,
  VisitDocument,
  VisitDocumentPage,
  VisitExtractedLabPanel,
  VisitExtractedLabPanelInput,
} from '../types/visit-documents';
import { assertPrescriptionContentWritable } from './prescription-service';
import {
  ATTACHMENT_DOWNLOAD_MAX_BYTES,
  registerAttachment,
} from './prescription-attachment-service';
import {
  extractLabFromBytes,
  type ExtractLabPdfFromAttachmentDeps,
  type LabPdfExtractFromAttachmentResult,
} from './lab-pdf-extract-service';

const BUCKET = 'prescription-attachments';
const DOWNLOAD_EXPIRY_SEC = 300;
const MAX_PAGES_PER_APPOINTMENT = 24;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

type Admin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

type DeskAppointmentRow = {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  status: string;
  patient_checked_in_at: string | null;
};

type DocumentRow = {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string;
  document_type: VisitDocument['document_type'];
  report_date: string | null;
  ordered_by: VisitDocument['ordered_by'];
  source: VisitDocument['source'];
  actor_id: string;
  created_at: string;
  updated_at: string;
  extracted_results?: unknown;
};

type PageRow = {
  id: string;
  document_id: string;
  doctor_id: string;
  file_path: string;
  file_type: string;
  page_index: number;
  created_at: string;
};

function assertDocumentWrite(
  capabilities: readonly string[] | undefined,
  documentType: string,
  orderedBy: string
): void {
  if (!canWriteVisitDocumentKind(capabilities, documentType, orderedBy)) {
    throw new ForbiddenError('This login cannot file that kind of paper');
  }
}

function visibleDocuments(
  documents: VisitDocument[],
  capabilities: readonly string[] | undefined
): VisitDocument[] {
  if (capabilities === undefined) return documents;
  return documents.filter((doc) =>
    canWriteVisitDocumentKind(capabilities, doc.document_type, doc.ordered_by)
  );
}

function admin(): Admin {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new InternalError('Service role client not available');
  }
  return client;
}

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return base || 'file';
}

function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return map[mime] || '';
}

function assertAllowedMime(mime: string): void {
  if (!ALLOWED_MIME.includes(mime as (typeof ALLOWED_MIME)[number])) {
    throw new ForbiddenError(
      'Invalid file type. Allowed: image/jpeg, image/png, image/webp, application/pdf'
    );
  }
}

function publicPage(row: PageRow): VisitDocumentPage {
  return {
    id: row.id,
    document_id: row.document_id,
    file_type: row.file_type,
    page_index: row.page_index,
    created_at: row.created_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Fail-closed: a malformed column never leaks into the API as a partial panel. */
export function parseExtractedResults(raw: unknown): VisitExtractedLabPanel[] {
  if (!Array.isArray(raw)) return [];
  const out: VisitExtractedLabPanel[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.pageId !== 'string') continue;
    if (!isRecord(item.report) || !Array.isArray(item.rows)) continue;
    if (typeof item.report.id !== 'string' || item.report.kind !== 'lab') continue;
    if (typeof item.report.title !== 'string') continue;
    if (!Array.isArray(item.report.attachmentIds)) continue;
    const rows: VisitExtractedLabPanel['rows'] = [];
    for (const row of item.rows) {
      if (!isRecord(row) || typeof row.id !== 'string' || typeof row.name !== 'string') continue;
      rows.push({
        id: row.id,
        source: 'patient_report',
        name: row.name,
        value: asNullableString(row.value),
        unit: asNullableString(row.unit),
        date: asNullableString(row.date),
        interpretation: null,
        notes: null,
        reportId: asNullableString(row.reportId),
        refLow: asNullableNumber(row.refLow),
        refHigh: asNullableNumber(row.refHigh),
        refText: asNullableString(row.refText),
        method: asNullableString(row.method),
      });
    }
    out.push({
      pageId: item.pageId,
      report: {
        id: item.report.id,
        kind: 'lab',
        title: item.report.title,
        reportDate: asNullableString(item.report.reportDate),
        labName: asNullableString(item.report.labName),
        attachmentIds: item.report.attachmentIds.filter(
          (id): id is string => typeof id === 'string'
        ),
        findings: null,
        entryMethod: 'extracted',
      },
      rows,
      confirmed_at: asNullableString(item.confirmed_at) ?? '',
      confirmed_by: asNullableString(item.confirmed_by) ?? '',
    });
  }
  return out;
}

function publicDocument(row: DocumentRow, pages: PageRow[]): VisitDocument {
  return {
    id: row.id,
    doctor_id: row.doctor_id,
    patient_id: row.patient_id,
    appointment_id: row.appointment_id,
    document_type: row.document_type,
    report_date: row.report_date,
    ordered_by: row.ordered_by,
    source: row.source,
    actor_id: row.actor_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    pages: pages
      .slice()
      .sort((a, b) => a.page_index - b.page_index)
      .map(publicPage),
    extracted_results: parseExtractedResults(row.extracted_results),
  };
}

async function loadOwnedAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<DeskAppointmentRow> {
  const { data, error } = await admin()
    .from('appointments')
    .select('id, doctor_id, patient_id, status, patient_checked_in_at')
    .eq('id', appointmentId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!data || data.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }
  return data as DeskAppointmentRow;
}

async function loadWritableAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<DeskAppointmentRow> {
  const appointment = await loadOwnedAppointment(appointmentId, doctorId, correlationId);

  if (appointment.status === 'cancelled') {
    throw new ValidationError('Cannot add documents to a cancelled appointment');
  }
  if (!appointment.patient_checked_in_at) {
    throw new ValidationError('Upload documents after check-in');
  }
  if (!appointment.patient_id) {
    throw new ValidationError('Appointment has no patient');
  }
  return appointment;
}

function assertDeskPath(filePath: string, doctorId: string, appointmentId: string): void {
  const prefix = `${doctorId}/desk/${appointmentId}/`;
  if (!filePath.startsWith(prefix) || filePath.includes('..')) {
    throw new ForbiddenError('Invalid file path for this appointment');
  }
}

async function countPagesForAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<number> {
  const { data, error } = await admin()
    .from('visit_documents')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('appointment_id', appointmentId);

  if (error) handleSupabaseError(error, correlationId);
  const ids = (data ?? []).map((row) => row.id as string);
  if (ids.length === 0) return 0;

  const { count, error: countError } = await admin()
    .from('visit_document_pages')
    .select('id', { count: 'exact', head: true })
    .eq('doctor_id', doctorId)
    .in('document_id', ids);

  if (countError) handleSupabaseError(countError, correlationId);
  return count ?? 0;
}

async function loadPages(
  documentIds: string[],
  doctorId: string,
  correlationId: string
): Promise<PageRow[]> {
  if (documentIds.length === 0) return [];
  const { data, error } = await admin()
    .from('visit_document_pages')
    .select('id, document_id, doctor_id, file_path, file_type, page_index, created_at')
    .eq('doctor_id', doctorId)
    .in('document_id', documentIds)
    .order('page_index', { ascending: true });

  if (error) handleSupabaseError(error, correlationId);
  return (data ?? []) as PageRow[];
}

async function loadDocumentRow(
  documentId: string,
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<DocumentRow> {
  const { data, error } = await admin()
    .from('visit_documents')
    .select('*')
    .eq('id', documentId)
    .eq('appointment_id', appointmentId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Document not found');
  return data as DocumentRow;
}

async function assembleDocuments(
  rows: DocumentRow[],
  doctorId: string,
  correlationId: string
): Promise<VisitDocument[]> {
  const pages = await loadPages(
    rows.map((row) => row.id),
    doctorId,
    correlationId
  );
  const byDoc = new Map<string, PageRow[]>();
  for (const page of pages) {
    const list = byDoc.get(page.document_id) ?? [];
    list.push(page);
    byDoc.set(page.document_id, list);
  }
  return rows.map((row) => publicDocument(row, byDoc.get(row.id) ?? []));
}

export async function listVisitDocuments(
  appointmentId: string,
  doctorId: string,
  correlationId: string,
  actorId: string,
  actorCapabilities?: readonly string[]
): Promise<VisitDocument[]> {
  const appointment = await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  const { data, error } = await admin()
    .from('visit_documents')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: true });

  if (error) handleSupabaseError(error, correlationId);
  const documents = await assembleDocuments((data ?? []) as DocumentRow[], doctorId, correlationId);
  await logDataAccess(correlationId, actorId, 'visit_document', appointment.patient_id ?? appointmentId);
  return visibleDocuments(documents, actorCapabilities);
}

export async function listVisitDocumentsForPatient(
  patientId: string,
  doctorId: string,
  correlationId: string,
  actorId: string
): Promise<VisitDocument[]> {
  const { data, error } = await admin()
    .from('visit_documents')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });

  if (error) handleSupabaseError(error, correlationId);
  const documents = await assembleDocuments((data ?? []) as DocumentRow[], doctorId, correlationId);
  await logDataAccess(correlationId, actorId, 'visit_document', patientId);
  return documents;
}

export async function createVisitDocumentUploadUrl(
  appointmentId: string,
  doctorId: string,
  filename: string,
  contentType: string,
  correlationId: string,
  actorId: string
): Promise<{ path: string; token: string }> {
  await loadWritableAppointment(appointmentId, doctorId, correlationId);
  assertAllowedMime(contentType);

  const pageCount = await countPagesForAppointment(appointmentId, doctorId, correlationId);
  if (pageCount >= MAX_PAGES_PER_APPOINTMENT) {
    throw new ValidationError(`At most ${MAX_PAGES_PER_APPOINTMENT} pages per visit`);
  }

  const sanitized = sanitizeFilename(filename);
  const ext = sanitized.includes('.') ? '' : extensionFromMime(contentType);
  const baseName = sanitized.endsWith(ext) ? sanitized : `${sanitized}${ext}`;
  const path = `${doctorId}/desk/${appointmentId}/${randomUUID()}-${baseName}`;

  const { data, error } = await admin()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error) handleSupabaseError(error, correlationId);
  if (!data?.path || !data?.token) {
    throw new InternalError('Failed to create upload URL');
  }

  await logDataModification(correlationId, actorId, 'create', 'visit_document_upload', appointmentId);
  return { path: data.path, token: data.token };
}

export async function createVisitDocument(
  appointmentId: string,
  doctorId: string,
  input: CreateVisitDocumentInput,
  correlationId: string,
  actorId: string,
  actorCapabilities?: readonly string[]
): Promise<VisitDocument> {
  const appointment = await loadWritableAppointment(appointmentId, doctorId, correlationId);
  assertDocumentWrite(actorCapabilities, input.documentType, input.orderedBy ?? 'outside');
  assertAllowedMime(input.fileType);
  assertDeskPath(input.filePath, doctorId, appointmentId);

  const pageCount = await countPagesForAppointment(appointmentId, doctorId, correlationId);
  if (pageCount >= MAX_PAGES_PER_APPOINTMENT) {
    throw new ValidationError(`At most ${MAX_PAGES_PER_APPOINTMENT} pages per visit`);
  }

  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  const { data, error } = await admin()
    .from('visit_documents')
    .insert({
      doctor_id: doctorId,
      patient_id: appointment.patient_id,
      appointment_id: appointmentId,
      document_type: input.documentType,
      report_date: input.reportDate ?? null,
      ordered_by: input.orderedBy ?? 'outside',
      source: 'front_desk',
      actor_id: actorId,
    })
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as DocumentRow;

  const { data: page, error: pageError } = await admin()
    .from('visit_document_pages')
    .insert({
      document_id: row.id,
      doctor_id: doctorId,
      file_path: input.filePath,
      file_type: input.fileType,
      page_index: 0,
    })
    .select('*')
    .single();

  if (pageError || !page) handleSupabaseError(pageError, correlationId);

  await logDataModification(
    correlationId,
    actorId,
    'create',
    'visit_document',
    row.id,
    undefined,
    onBehalf
  );
  return publicDocument(row, [page as PageRow]);
}

export async function addVisitDocumentPage(
  appointmentId: string,
  documentId: string,
  doctorId: string,
  input: AddVisitDocumentPageInput,
  correlationId: string,
  actorId: string,
  actorCapabilities?: readonly string[]
): Promise<VisitDocument> {
  await loadWritableAppointment(appointmentId, doctorId, correlationId);
  assertAllowedMime(input.fileType);
  assertDeskPath(input.filePath, doctorId, appointmentId);

  const document = await loadDocumentRow(documentId, appointmentId, doctorId, correlationId);
  assertDocumentWrite(actorCapabilities, document.document_type, document.ordered_by);
  const pageCount = await countPagesForAppointment(appointmentId, doctorId, correlationId);
  if (pageCount >= MAX_PAGES_PER_APPOINTMENT) {
    throw new ValidationError(`At most ${MAX_PAGES_PER_APPOINTMENT} pages per visit`);
  }

  const existing = await loadPages([documentId], doctorId, correlationId);
  const nextIndex = existing.reduce((max, page) => Math.max(max, page.page_index), -1) + 1;

  const { data: page, error } = await admin()
    .from('visit_document_pages')
    .insert({
      document_id: documentId,
      doctor_id: doctorId,
      file_path: input.filePath,
      file_type: input.fileType,
      page_index: nextIndex,
    })
    .select('*')
    .single();

  if (error || !page) handleSupabaseError(error, correlationId);

  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId,
    'create',
    'visit_document_page',
    (page as PageRow).id,
    undefined,
    onBehalf
  );
  return publicDocument(document, [...existing, page as PageRow]);
}

export async function updateVisitDocument(
  appointmentId: string,
  documentId: string,
  doctorId: string,
  input: UpdateVisitDocumentInput,
  correlationId: string,
  actorId: string,
  actorCapabilities?: readonly string[]
): Promise<VisitDocument> {
  await loadWritableAppointment(appointmentId, doctorId, correlationId);
  const current = await loadDocumentRow(documentId, appointmentId, doctorId, correlationId);
  assertDocumentWrite(actorCapabilities, current.document_type, current.ordered_by);
  const nextType = input.documentType ?? current.document_type;
  const nextOrdered = input.orderedBy ?? current.ordered_by;
  assertDocumentWrite(actorCapabilities, nextType, nextOrdered);

  const update: Record<string, unknown> = {};
  if (input.documentType !== undefined) update.document_type = input.documentType;
  if (input.reportDate !== undefined) update.report_date = input.reportDate;
  if (input.orderedBy !== undefined) update.ordered_by = input.orderedBy;
  if (Object.keys(update).length === 0) {
    throw new ValidationError('Nothing to update');
  }

  const { data, error } = await admin()
    .from('visit_documents')
    .update(update)
    .eq('id', documentId)
    .eq('doctor_id', doctorId)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const pages = await loadPages([documentId], doctorId, correlationId);
  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId,
    'update',
    'visit_document',
    documentId,
    Object.keys(update),
    onBehalf
  );
  return publicDocument(data as DocumentRow, pages);
}

export async function getVisitDocumentPageDownloadUrl(
  appointmentId: string,
  documentId: string,
  pageId: string,
  doctorId: string,
  correlationId: string,
  actorId: string,
  actorCapabilities?: readonly string[]
): Promise<{ downloadUrl: string }> {
  await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  const document = await loadDocumentRow(documentId, appointmentId, doctorId, correlationId);
  assertDocumentWrite(actorCapabilities, document.document_type, document.ordered_by);

  const { data: page, error } = await admin()
    .from('visit_document_pages')
    .select('id, document_id, file_path')
    .eq('id', pageId)
    .eq('document_id', documentId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!page) throw new NotFoundError('Page not found');

  const { data: signed, error: signError } = await admin()
    .storage.from(BUCKET)
    .createSignedUrl(page.file_path, DOWNLOAD_EXPIRY_SEC);

  if (signError) handleSupabaseError(signError, correlationId);
  if (!signed?.signedUrl) {
    throw new InternalError('Failed to create download URL');
  }

  await logDataAccess(correlationId, actorId, 'visit_document_page', pageId);
  return { downloadUrl: signed.signedUrl };
}

export async function deleteVisitDocument(
  appointmentId: string,
  documentId: string,
  doctorId: string,
  correlationId: string,
  actorId: string,
  _actorIsStaff: boolean,
  actorCapabilities?: readonly string[]
): Promise<void> {
  await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  const document = await loadDocumentRow(documentId, appointmentId, doctorId, correlationId);
  assertDocumentWrite(actorCapabilities, document.document_type, document.ordered_by);

  const pages = await loadPages([documentId], doctorId, correlationId);
  const paths = pages.map((page) => page.file_path);

  const { error } = await admin()
    .from('visit_documents')
    .delete()
    .eq('id', documentId)
    .eq('doctor_id', doctorId);

  if (error) handleSupabaseError(error, correlationId);
  if (paths.length > 0) {
    void admin().storage.from(BUCKET).remove(paths);
  }

  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId,
    'delete',
    'visit_document',
    documentId,
    undefined,
    onBehalf
  );
}

export async function deleteVisitDocumentPage(
  appointmentId: string,
  documentId: string,
  pageId: string,
  doctorId: string,
  correlationId: string,
  actorId: string,
  _actorIsStaff: boolean,
  actorCapabilities?: readonly string[]
): Promise<VisitDocument | null> {
  await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  const document = await loadDocumentRow(documentId, appointmentId, doctorId, correlationId);
  assertDocumentWrite(actorCapabilities, document.document_type, document.ordered_by);

  const pages = await loadPages([documentId], doctorId, correlationId);
  const target = pages.find((page) => page.id === pageId);
  if (!target) throw new NotFoundError('Page not found');

  const { error } = await admin()
    .from('visit_document_pages')
    .delete()
    .eq('id', pageId)
    .eq('document_id', documentId)
    .eq('doctor_id', doctorId);

  if (error) handleSupabaseError(error, correlationId);
  void admin().storage.from(BUCKET).remove([target.file_path]);

  const remaining = pages.filter((page) => page.id !== pageId);
  const keptResults = parseExtractedResults(document.extracted_results).filter(
    (panel) => panel.pageId !== pageId
  );
  if (remaining.length > 0) {
    const { error: resultsError } = await admin()
      .from('visit_documents')
      .update({ extracted_results: keptResults })
      .eq('id', documentId)
      .eq('doctor_id', doctorId);
    if (resultsError) handleSupabaseError(resultsError, correlationId);
  }
  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId,
    'delete',
    'visit_document_page',
    pageId,
    undefined,
    onBehalf
  );

  if (remaining.length === 0) {
    const { error: docError } = await admin()
      .from('visit_documents')
      .delete()
      .eq('id', documentId)
      .eq('doctor_id', doctorId);
    if (docError) handleSupabaseError(docError, correlationId);
    return null;
  }

  return publicDocument({ ...document, extracted_results: keptResults }, remaining);
}

export type ExtractLabFromVisitPageResult = {
  pageId: string;
  rows: LabPdfExtractFromAttachmentResult['rows'];
  pageCount: number;
  skippedPageIndexes: number[];
  source: LabPdfExtractFromAttachmentResult['source'];
};

/**
 * Suggestion-only extract from a desk page. Writes nothing.
 * Same MIME readers as prescription extract-lab (PDF text / gated vision).
 */
export async function extractLabFromVisitPage(
  appointmentId: string,
  documentId: string,
  pageId: string,
  doctorId: string,
  correlationId: string,
  actorId: string,
  deps: ExtractLabPdfFromAttachmentDeps = {},
  actorCapabilities?: readonly string[]
): Promise<ExtractLabFromVisitPageResult> {
  await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  const owned = await loadDocumentRow(documentId, appointmentId, doctorId, correlationId);
  assertDocumentWrite(actorCapabilities, owned.document_type, owned.ordered_by);

  const { data: page, error } = await admin()
    .from('visit_document_pages')
    .select('id, document_id, doctor_id, file_path, file_type, page_index, created_at')
    .eq('id', pageId)
    .eq('document_id', documentId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!page) throw new NotFoundError('Page not found');

  const pageRow = page as PageRow;
  assertAllowedMime(pageRow.file_type);

  const { data, error: downloadError } = await admin().storage.from(BUCKET).download(pageRow.file_path);
  if (downloadError) handleSupabaseError(downloadError, correlationId);
  if (!data) {
    throw new InternalError('Failed to read visit document page');
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length > ATTACHMENT_DOWNLOAD_MAX_BYTES) {
    throw new ValidationError('Attachment is too large to extract');
  }

  await logDataAccess(correlationId, actorId, 'visit_document_page', pageId);

  const extracted = await extractLabFromBytes(
    {
      sourceId: pageId,
      bytes,
      fileType: pageRow.file_type,
      correlationId,
    },
    deps
  );

  return {
    pageId,
    rows: extracted.rows,
    pageCount: extracted.pageCount,
    skippedPageIndexes: extracted.skippedPageIndexes,
    source: extracted.source,
  };
}

/**
 * Merge staff-confirmed panels by pageId. Does not wipe other pages.
 */
export async function confirmVisitDocumentExtractedResults(
  appointmentId: string,
  documentId: string,
  doctorId: string,
  panels: VisitExtractedLabPanelInput[],
  correlationId: string,
  actorId: string,
  actorCapabilities?: readonly string[]
): Promise<VisitDocument> {
  await loadWritableAppointment(appointmentId, doctorId, correlationId);
  const document = await loadDocumentRow(documentId, appointmentId, doctorId, correlationId);
  assertDocumentWrite(actorCapabilities, document.document_type, document.ordered_by);
  const pages = await loadPages([documentId], doctorId, correlationId);
  const pageIds = new Set(pages.map((page) => page.id));

  for (const panel of panels) {
    if (!pageIds.has(panel.pageId)) {
      throw new ValidationError('Page not found on this document');
    }
  }

  const now = new Date().toISOString();
  const incoming = new Map<string, VisitExtractedLabPanel>();
  for (const panel of panels) {
    incoming.set(panel.pageId, {
      ...panel,
      confirmed_at: now,
      confirmed_by: actorId,
    });
  }

  const merged: VisitExtractedLabPanel[] = [];
  const replaced = new Set<string>();
  for (const panel of parseExtractedResults(document.extracted_results)) {
    const next = incoming.get(panel.pageId);
    if (next) {
      merged.push(next);
      replaced.add(panel.pageId);
    } else {
      merged.push(panel);
    }
  }
  for (const [pageId, panel] of incoming) {
    if (!replaced.has(pageId)) merged.push(panel);
  }

  const { data, error } = await admin()
    .from('visit_documents')
    .update({ extracted_results: merged })
    .eq('id', documentId)
    .eq('doctor_id', doctorId)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);

  const onBehalf = actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId,
    'update',
    'visit_document_extract',
    documentId,
    [`pages:${panels.length}`],
    onBehalf
  );
  return publicDocument(data as DocumentRow, pages);
}

function filenameFromDeskPath(filePath: string): string {
  const last = filePath.split('/').pop() ?? 'file';
  const stripped = last.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    ''
  );
  return sanitizeFilename(stripped);
}

type StorageBucket = ReturnType<Admin['storage']['from']>;

async function copyDeskObjectToObjective(
  fromPath: string,
  toPath: string,
  fileType: string,
  correlationId: string
): Promise<void> {
  const bucket = admin().storage.from(BUCKET) as StorageBucket & {
    copy?: (
      from: string,
      to: string
    ) => Promise<{ error: { message?: string } | null }>;
  };

  if (typeof bucket.copy === 'function') {
    const { error } = await bucket.copy(fromPath, toPath);
    if (!error) return;
  }

  const { data, error: downloadError } = await bucket.download(fromPath);
  if (downloadError) handleSupabaseError(downloadError, correlationId);
  if (!data) {
    throw new InternalError('Failed to read visit document page');
  }

  const { error: uploadError } = await bucket.upload(toPath, data, {
    contentType: fileType,
    upsert: false,
  });
  if (uploadError) handleSupabaseError(uploadError, correlationId);
}

/**
 * DVP-Q3 — copy a desk page into `{doctor}/{prescription}/objective/…` and
 * register a normal `prescription_attachments` row so extract-lab can run.
 * Never logs file_path.
 */
export async function promoteVisitDocumentPageToPrescription(
  prescriptionId: string,
  appointmentId: string,
  documentId: string,
  pageId: string,
  doctorId: string,
  correlationId: string,
  actorId: string
): Promise<PrescriptionAttachment> {
  await loadOwnedAppointment(appointmentId, doctorId, correlationId);
  await loadDocumentRow(documentId, appointmentId, doctorId, correlationId);

  const { data: page, error: pageError } = await admin()
    .from('visit_document_pages')
    .select('id, document_id, doctor_id, file_path, file_type, page_index, created_at')
    .eq('id', pageId)
    .eq('document_id', documentId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (pageError) handleSupabaseError(pageError, correlationId);
  if (!page) throw new NotFoundError('Page not found');

  const pageRow = page as PageRow;
  assertAllowedMime(pageRow.file_type);
  assertDeskPath(pageRow.file_path, doctorId, appointmentId);

  const { data: prescription, error: rxError } = await admin()
    .from('prescriptions')
    .select('id, doctor_id, appointment_id')
    .eq('id', prescriptionId)
    .maybeSingle();

  if (rxError) handleSupabaseError(rxError, correlationId);
  if (!prescription || prescription.doctor_id !== doctorId) {
    throw new NotFoundError('Prescription not found');
  }
  if (prescription.appointment_id !== appointmentId) {
    throw new ValidationError('Prescription does not belong to this appointment');
  }

  await assertPrescriptionContentWritable(prescriptionId, doctorId, correlationId);

  const destPath = `${doctorId}/${prescriptionId}/objective/${randomUUID()}-${filenameFromDeskPath(pageRow.file_path)}`;
  await copyDeskObjectToObjective(pageRow.file_path, destPath, pageRow.file_type, correlationId);

  const attachment = await registerAttachment(
    prescriptionId,
    destPath,
    pageRow.file_type,
    null,
    correlationId,
    doctorId
  );

  await logDataModification(
    correlationId,
    actorId,
    'create',
    'visit_document_promote',
    pageId
  );
  return attachment;
}
