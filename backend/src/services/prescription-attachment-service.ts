/**
 * Prescription Attachment Service (Prescription V1)
 *
 * Signed upload/download URLs for prescription attachments (handwritten Rx, lab reports).
 * Uses admin client for Storage. Ownership verified via prescription.doctor_id.
 * PHI in files; no PHI in logs.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { PrescriptionAttachment } from '../types/prescription';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification, logDataAccess } from '../utils/audit-logger';
import { ForbiddenError, InternalError, NotFoundError } from '../utils/errors';

const BUCKET = 'prescription-attachments';
const DOWNLOAD_EXPIRY_SEC = 300; // 5 min

const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return base || 'file';
}

/**
 * Verify prescription exists and is owned by userId.
 */
async function verifyPrescriptionOwnership(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  prescriptionId: string,
  userId: string
): Promise<{ doctorId: string }> {
  const { data, error } = await admin
    .from('prescriptions')
    .select('id, doctor_id')
    .eq('id', prescriptionId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Prescription not found');
  }

  if (data.doctor_id !== userId) {
    throw new NotFoundError('Prescription not found');
  }

  return { doctorId: data.doctor_id };
}

/**
 * Create signed upload URL for prescription attachment.
 * Path: {doctor_id}/{prescription_id}/{uuid}-{sanitizedFilename}
 */
export async function createUploadUrl(
  prescriptionId: string,
  userId: string,
  filename: string,
  contentType: string,
  correlationId: string
): Promise<{ path: string; token: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  if (!ALLOWED_MIME.includes(contentType as (typeof ALLOWED_MIME)[number])) {
    throw new ForbiddenError('Invalid file type. Allowed: image/jpeg, image/png, image/webp, application/pdf');
  }

  const { doctorId } = await verifyPrescriptionOwnership(admin, prescriptionId, userId);

  const sanitized = sanitizeFilename(filename);
  const ext = sanitized.includes('.') ? '' : getExtensionFromMime(contentType);
  const baseName = sanitized.endsWith(ext) ? sanitized : `${sanitized}${ext}`;
  const path = `${doctorId}/${prescriptionId}/${randomUUID()}-${baseName}`;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data?.path || !data?.token) {
    throw new InternalError('Failed to create upload URL');
  }

  return { path: data.path, token: data.token };
}

function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return map[mime] || '';
}

/**
 * Register attachment after client uploads to signed URL.
 */
export async function registerAttachment(
  prescriptionId: string,
  filePath: string,
  fileType: string,
  caption: string | null,
  correlationId: string,
  userId: string
): Promise<PrescriptionAttachment> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  if (!ALLOWED_MIME.includes(fileType as (typeof ALLOWED_MIME)[number])) {
    throw new ForbiddenError('Invalid file type. Allowed: image/jpeg, image/png, image/webp, application/pdf');
  }

  await verifyPrescriptionOwnership(admin, prescriptionId, userId);

  // Ensure filePath matches our pattern (doctor_id/prescription_id/...)
  const parts = filePath.split('/');
  if (parts.length < 3 || parts[1] !== prescriptionId) {
    throw new ForbiddenError('Invalid file path for this prescription');
  }

  const { data, error } = await admin
    .from('prescription_attachments')
    .insert({
      prescription_id: prescriptionId,
      file_path: filePath,
      file_type: fileType,
      caption: caption ?? null,
    })
    .select()
    .single();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const attachment = data as PrescriptionAttachment;
  await logDataModification(correlationId, userId, 'create', 'prescription_attachment', attachment.id);
  return attachment;
}

/**
 * Create signed download URL for attachment.
 */
export async function getAttachmentDownloadUrl(
  prescriptionId: string,
  attachmentId: string,
  correlationId: string,
  userId: string
): Promise<{ downloadUrl: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  await verifyPrescriptionOwnership(admin, prescriptionId, userId);

  const { data: att, error: attError } = await admin
    .from('prescription_attachments')
    .select('id, prescription_id, file_path')
    .eq('id', attachmentId)
    .eq('prescription_id', prescriptionId)
    .single();

  if (attError || !att) {
    throw new NotFoundError('Attachment not found');
  }

  const { data: signed, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(att.file_path, DOWNLOAD_EXPIRY_SEC);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!signed?.signedUrl) {
    throw new InternalError('Failed to create download URL');
  }

  await logDataAccess(correlationId, userId, 'prescription_attachment', attachmentId);
  return { downloadUrl: signed.signedUrl };
}

/**
 * Create signed URL for delivery (e.g. Instagram, email link).
 * Used internally by send flow; no user auth. Expiry typically 3600 (1hr) so Meta can fetch.
 */
export async function createAttachmentSignedUrlForDelivery(
  filePath: string,
  expirySec: number
): Promise<string> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(filePath, expirySec);
  if (error || !data?.signedUrl) {
    throw new InternalError('Failed to create delivery URL');
  }
  return data.signedUrl;
}
