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

/**
 * objective-tab / P5-D4 (obj-22) — objective media is the SAME `prescription_attachments`
 * storage, tagged by an `objective/` path segment (no new column / bucket / RLS policy).
 * The prescription-scoped RLS policy (migration 026) already covers every object under
 * `{doctor_id}/{prescription_id}/…`, so the segment does not widen access.
 *
 * soap-data-placement / P2 (sdp-02) — `subjective` pins a photo to a complaint via a deeper
 * `subjective/{complaintId}/` segment under the SAME prescription folder. Still no new column /
 * bucket / policy: the bucket is private and reached only through service-role signed URLs gated
 * by `verifyPrescriptionOwnership`, so the deeper folder is covered by the same ownership flow
 * and does not widen access (verify-not-widen, P2-D2). The `complaintId` is an opaque sanitized
 * folder segment — never matched against the `complaints` JSONB.
 */
export type AttachmentCategory = 'objective' | 'subjective' | 'advice';

const COMPLAINT_ID_SEGMENT_MAX = 64;

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return base || 'file';
}

/**
 * Reduce an opaque complaint id to a safe single folder segment. Treated as opaque (P2-D2):
 * no existence check against the prescription's `complaints` JSONB. An empty/unsafe value
 * collapses to `unpinned` so the upload still lands under a deterministic folder.
 */
function sanitizeComplaintIdSegment(complaintId: string): string {
  const base = complaintId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, COMPLAINT_ID_SEGMENT_MAX);
  return base || 'unpinned';
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
  correlationId: string,
  category?: AttachmentCategory,
  complaintId?: string
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
  // obj-22 / sdp-02 / advice-handouts: category tags as path segments under the
  // prescription folder. Omitted = legacy photo-Rx path.
  let segment = '';
  if (category === 'objective') {
    segment = 'objective/';
  } else if (category === 'subjective') {
    segment = `subjective/${sanitizeComplaintIdSegment(complaintId ?? '')}/`;
  } else if (category === 'advice') {
    segment = 'advice/';
  }
  const path = `${doctorId}/${prescriptionId}/${segment}${randomUUID()}-${baseName}`;

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

export interface AdviceHandoutPublicItem {
  id: string;
  file_type: string;
  /** Display name derived from path — never logs the full path. */
  label: string;
  download_url: string;
}

function adviceHandoutLabelFromPath(filePath: string): string {
  const last = filePath.split('/').pop() ?? '';
  const stripped = last.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  );
  return stripped || last || 'Handout';
}

/**
 * List advice-tagged attachments with short-lived signed download URLs.
 * Caller must already have authorized the prescription (e.g. public Rx token).
 * Only paths containing an `advice` segment are returned — chart media stays private.
 */
export async function listAdviceHandoutsForPublicShare(
  prescriptionId: string,
  correlationId: string,
): Promise<AdviceHandoutPublicItem[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('prescription_attachments')
    .select('id, file_path, file_type')
    .eq('prescription_id', prescriptionId)
    .order('created_at', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const rows = (data ?? []).filter((row) =>
    String(row.file_path ?? '')
      .split('/')
      .includes('advice'),
  );

  const out: AdviceHandoutPublicItem[] = [];
  for (const row of rows) {
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, DOWNLOAD_EXPIRY_SEC);
    if (signErr || !signed?.signedUrl) {
      continue;
    }
    out.push({
      id: row.id,
      file_type: row.file_type,
      label: adviceHandoutLabelFromPath(row.file_path),
      download_url: signed.signedUrl,
    });
  }
  return out;
}

/**
 * Delete a prescription attachment (DB row + storage object).
 *
 * obj-22: lets the Objective media strip remove a mis-uploaded photo/scan. Uses the SAME
 * ownership check + the DELETE RLS policy already shipped in migration 026 — no policy
 * widening. PHI-safe: never logs the file path / patient context.
 */
export async function deleteAttachment(
  prescriptionId: string,
  attachmentId: string,
  correlationId: string,
  userId: string
): Promise<void> {
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

  const { error: storageError } = await admin.storage.from(BUCKET).remove([att.file_path]);
  if (storageError) {
    handleSupabaseError(storageError, correlationId);
  }

  const { error: delError } = await admin
    .from('prescription_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('prescription_id', prescriptionId);

  if (delError) {
    handleSupabaseError(delError, correlationId);
  }

  await logDataModification(correlationId, userId, 'delete', 'prescription_attachment', attachmentId);
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
