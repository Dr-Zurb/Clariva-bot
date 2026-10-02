/**
 * Patient photos on a visit (clk-15, clk-16).
 * History-form token only. Does not call the desk upload.
 * Path prefix is {doctor_id}/patient/{appointment_id}/.
 * Logs carry the appointment id and a count. Never a filename or the bytes.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { logAuditEvent } from '../utils/audit-logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import {
  historyFormDenyStatus,
  readHistoryFormAppointmentId,
  verifyHistoryFormToken,
  type HistoryFormDenyReason,
} from '../utils/history-form-token';
import { VISIT_DOCUMENT_TYPES, type VisitDocumentType } from '../types/visit-documents';

const BUCKET = 'prescription-attachments';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PATIENT_FILES = 5;
const DOWNLOAD_EXPIRY_SEC = 300;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export interface StorePatientPhotoInput {
  token: string;
  documentType: VisitDocumentType;
  contentType: string;
  bytes: Buffer;
}

export interface PatientPhotoView {
  id: string;
  documentType: VisitDocumentType;
  downloadUrl: string;
}

type Admin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

function client(): Admin {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new ValidationError('Service is unavailable');
  return supabase;
}

function deny(reason: HistoryFormDenyReason): never {
  throw new AppError('This prep link is no longer available', historyFormDenyStatus(reason));
}

function assertType(documentType: string): VisitDocumentType {
  if (!(VISIT_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
    throw new ValidationError('That file type is not available');
  }
  return documentType as VisitDocumentType;
}

async function openVisit(
  token: string,
  correlationId: string
): Promise<{ supabase: Admin; appointment: Record<string, unknown> }> {
  const opened = readHistoryFormAppointmentId(token);
  if (!opened.ok) deny(opened.reason);

  const supabase = client();
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, doctor_id, patient_id, status, appointment_date, patient_checked_in_at')
    .eq('id', opened.appointmentId)
    .maybeSingle();
  if (appointmentError) handleSupabaseError(appointmentError, correlationId);
  if (!appointment) throw new NotFoundError('This visit was not found');

  const { data: settings, error: settingsError } = await supabase
    .from('doctor_settings')
    .select('slot_interval_minutes')
    .eq('doctor_id', appointment.doctor_id)
    .maybeSingle();
  if (settingsError) handleSupabaseError(settingsError, correlationId);

  const start = new Date(appointment.appointment_date as string);
  const minutes = Number(settings?.slot_interval_minutes ?? 15);
  const scheduledEnd = Number.isNaN(start.getTime())
    ? null
    : new Date(start.getTime() + minutes * 60 * 1000);
  const verified = verifyHistoryFormToken(
    token,
    { id: appointment.id as string, status: appointment.status as string, scheduledEnd },
    new Date()
  );
  if (!verified.ok) deny(verified.reason);
  if (!appointment.patient_id) throw new ValidationError('This visit has no patient');
  return { supabase, appointment };
}

export async function storePatientPhoto(
  input: StorePatientPhotoInput,
  correlationId: string
): Promise<{ documentId: string }> {
  const contentType = input.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = MIME_EXT[contentType];
  if (!ext) throw new ValidationError('Use a JPEG, PNG, WebP, or PDF');
  if (!input.bytes.length) throw new ValidationError('Choose a file');
  if (input.bytes.length > MAX_BYTES) throw new ValidationError('That file is over 10 MB');
  const documentType = assertType(input.documentType);

  const { supabase, appointment } = await openVisit(input.token, correlationId);
  const { data: existing, error: countError } = await supabase
    .from('visit_documents')
    .select('id')
    .eq('appointment_id', appointment.id)
    .eq('source', 'patient');
  if (countError) handleSupabaseError(countError, correlationId);
  if ((existing?.length ?? 0) >= MAX_PATIENT_FILES) {
    throw new ConflictError('This visit already has five files');
  }

  const objectPath = `${appointment.doctor_id}/patient/${appointment.id}/${randomUUID()}-file${ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, input.bytes, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    logger.info({ appointmentId: appointment.id }, 'patient_photo_upload_failed');
    throw new ValidationError('Could not store that file');
  }

  const { data: document, error: insertError } = await supabase
    .from('visit_documents')
    .insert({
      doctor_id: appointment.doctor_id,
      patient_id: appointment.patient_id,
      appointment_id: appointment.id,
      document_type: documentType,
      ordered_by: 'outside',
      source: 'patient',
      actor_id: appointment.patient_id,
    })
    .select('id')
    .single();
  if (insertError || !document) {
    await supabase.storage.from(BUCKET).remove([objectPath]);
    handleSupabaseError(insertError, correlationId);
  }

  const { error: pageError } = await supabase.from('visit_document_pages').insert({
    document_id: document.id,
    doctor_id: appointment.doctor_id,
    file_path: objectPath,
    file_type: contentType,
    page_index: 0,
  });
  if (pageError) {
    await supabase.from('visit_documents').delete().eq('id', document.id);
    await supabase.storage.from(BUCKET).remove([objectPath]);
    handleSupabaseError(pageError, correlationId);
  }

  logger.info(
    { appointmentId: appointment.id, patientFileCount: (existing?.length ?? 0) + 1 },
    'patient_photo_stored'
  );
  await logAuditEvent({
    correlationId,
    action: 'create_visit_document',
    resourceType: 'appointment',
    resourceId: appointment.id as string,
    status: 'success',
    metadata: { patientFileCount: (existing?.length ?? 0) + 1 },
  });
  return { documentId: document.id as string };
}

export async function listPatientPhotos(
  token: string,
  correlationId: string
): Promise<{ photos: PatientPhotoView[]; canRemove: boolean }> {
  const { supabase, appointment } = await openVisit(token, correlationId);
  const { data: documents, error } = await supabase
    .from('visit_documents')
    .select('id, document_type, source')
    .eq('appointment_id', appointment.id)
    .eq('source', 'patient');
  if (error) handleSupabaseError(error, correlationId);

  const photos: PatientPhotoView[] = [];
  for (const document of documents ?? []) {
    const { data: page, error: pageError } = await supabase
      .from('visit_document_pages')
      .select('file_path')
      .eq('document_id', document.id)
      .order('page_index', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pageError) handleSupabaseError(pageError, correlationId);
    if (!page?.file_path) continue;
    const signed = await supabase.storage.from(BUCKET).createSignedUrl(page.file_path, DOWNLOAD_EXPIRY_SEC);
    if (signed.error || !signed.data?.signedUrl) continue;
    photos.push({
      id: document.id as string,
      documentType: document.document_type as VisitDocumentType,
      downloadUrl: signed.data.signedUrl,
    });
  }

  logger.info({ appointmentId: appointment.id, patientFileCount: photos.length }, 'patient_photo_read');
  return { photos, canRemove: appointment.patient_checked_in_at == null };
}

export async function deletePatientPhoto(
  token: string,
  documentId: string,
  correlationId: string
): Promise<void> {
  const { supabase, appointment } = await openVisit(token, correlationId);

  const { data: document, error } = await supabase
    .from('visit_documents')
    .select('id, source')
    .eq('id', documentId)
    .eq('appointment_id', appointment.id)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!document || document.source !== 'patient') {
    throw new NotFoundError('This file was not found');
  }
  if (appointment.patient_checked_in_at) {
    throw new ConflictError('This file can no longer be removed');
  }

  const { data: pages, error: pageError } = await supabase
    .from('visit_document_pages')
    .select('file_path')
    .eq('document_id', documentId);
  if (pageError) handleSupabaseError(pageError, correlationId);

  const { error: deleteError } = await supabase
    .from('visit_documents')
    .delete()
    .eq('id', documentId)
    .eq('source', 'patient');
  if (deleteError) handleSupabaseError(deleteError, correlationId);

  const paths = (pages ?? []).map((page) => page.file_path).filter((path): path is string => typeof path === 'string');
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }
  logger.info({ appointmentId: appointment.id }, 'patient_photo_deleted');
}
