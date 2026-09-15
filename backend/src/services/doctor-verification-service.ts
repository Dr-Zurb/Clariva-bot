/**
 * Doctor Verification Service (doctor-verification-v1 · ver-02/03/04).
 *
 * Business logic for the "prove you're a licensed doctor" gate:
 *   - mint signed upload URLs for the registration certificate / gov ID,
 *   - accept a submission (→ pending_review),
 *   - expose the doctor's own status,
 *   - list + review (approve/reject) for the ops/admin path.
 *
 * ## Security doctrine
 *
 * ALL writes here go through the service-role admin client. Doctors have NO
 * write RLS on `doctor_verification` (migration 183) or the
 * `doctor-verification-docs` bucket (migration 184) — so a doctor can never
 * self-set `status='verified'` or upload under another doctor's prefix. The
 * canonical object path is ALWAYS computed server-side as `{doctorId}/...`;
 * the submit path re-validates ownership of the supplied path as defense in
 * depth.
 *
 * ## PII
 *
 * Never log `full_name`, `registration_number`, `council_state`, or document
 * paths (they embed the doctor id). Structured logs carry only `doctorId` +
 * `correlationId` + the event name.
 *
 * @see backend/migrations/183_doctor_verification.sql
 * @see backend/migrations/184_doctor_verification_docs_bucket.sql
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import type {
  AdminVerificationDetail,
  AdminVerificationListItem,
  DoctorVerificationRow,
  DoctorVerificationStatusView,
  SubmitVerificationInput,
  VerificationDocKind,
  VerificationStatus,
} from '../types/doctor-verification';

/** Private bucket provisioned in migration 184. */
export const VERIFICATION_DOCS_BUCKET = 'doctor-verification-docs';

/** Allowed document MIME types (validated here + at the bucket, ver-02 §3.1). */
export const VERIFICATION_ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

type AllowedMime = (typeof VERIFICATION_ALLOWED_MIME)[number];

/** Short-lived signed URL TTL for reviewer document reads (seconds). */
const SIGNED_URL_TTL_SEC = 300; // 5 minutes

const MIME_EXT: Record<AllowedMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function requireAdmin(): SupabaseClient {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  return admin;
}

/**
 * Canonical object key for a doctor's verification document. doctor_id-first
 * so Storage RLS gates on the first folder segment (migration 184).
 */
export function verificationDocPath(
  doctorId: string,
  kind: VerificationDocKind,
  contentType: string,
): string {
  const ext = MIME_EXT[contentType as AllowedMime];
  if (!ext) {
    throw new ForbiddenError(
      'Invalid file type. Allowed: application/pdf, image/jpeg, image/png',
    );
  }
  const name = kind === 'certificate' ? 'certificate' : 'gov-id';
  return `${doctorId}/${name}.${ext}`;
}

/**
 * Mint a short-lived signed upload URL for the browser (ver-02 §2.1). The
 * doctor uploads directly to Storage via `uploadToSignedUrl(path, token, file)`
 * — the service-role key never reaches the browser. `upsert: true` so a
 * re-submission overwrites the prior document at the canonical key.
 */
export async function createVerificationUploadUrl(
  doctorId: string,
  kind: VerificationDocKind,
  contentType: string,
  correlationId: string,
): Promise<{ path: string; token: string }> {
  const admin = requireAdmin();

  if (!VERIFICATION_ALLOWED_MIME.includes(contentType as AllowedMime)) {
    throw new ForbiddenError(
      'Invalid file type. Allowed: application/pdf, image/jpeg, image/png',
    );
  }

  const path = verificationDocPath(doctorId, kind, contentType);

  const { data, error } = await admin.storage
    .from(VERIFICATION_DOCS_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data?.path || !data?.token) {
    throw new InternalError('Failed to create verification upload URL');
  }

  logger.info(
    { correlationId, doctorId, kind, event: 'verification_upload_url_minted' },
    'verification_upload_url_minted',
  );

  return { path: data.path, token: data.token };
}

/**
 * Guard: a supplied document path MUST live under the doctor's own prefix.
 * Prevents a crafted submit from attaching another doctor's object.
 */
function assertOwnedPath(doctorId: string, path: string): void {
  const prefix = `${doctorId}/`;
  if (!path.startsWith(prefix)) {
    throw new ForbiddenError('Document path does not belong to this doctor');
  }
}

/**
 * Accept a verification submission. Upserts the row into `pending_review` and
 * clears any prior review verdict (idempotent re-submit after rejection —
 * ver-03 §1.2). Writes via service role (doctors have no write RLS).
 */
export async function submitVerification(
  doctorId: string,
  input: SubmitVerificationInput,
  correlationId: string,
): Promise<DoctorVerificationStatusView> {
  const admin = requireAdmin();

  assertOwnedPath(doctorId, input.certificatePath);
  if (input.govIdPath) {
    assertOwnedPath(doctorId, input.govIdPath);
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('doctor_verification')
    .upsert(
      {
        doctor_id: doctorId,
        status: 'pending_review' as VerificationStatus,
        full_name: input.fullName,
        registration_number: input.registrationNumber,
        council_state: input.councilState,
        specialty: input.specialty ?? null,
        certificate_path: input.certificatePath,
        gov_id_path: input.govIdPath ?? null,
        submitted_at: nowIso,
        // Clear any prior verdict on re-submit.
        reviewed_at: null,
        reviewed_by: null,
        reject_reason: null,
      },
      { onConflict: 'doctor_id' },
    )
    .select(
      'status, submitted_at, reviewed_at, reject_reason',
    )
    .single();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data) {
    throw new InternalError('Failed to submit verification');
  }

  logger.info(
    { correlationId, doctorId, event: 'verification_submitted' },
    'verification_submitted',
  );

  return {
    status: data.status as VerificationStatus,
    submittedAt: data.submitted_at ?? null,
    reviewedAt: data.reviewed_at ?? null,
    rejectReason: data.reject_reason ?? null,
  };
}

/**
 * The doctor's own verification status. A doctor with no row yet is
 * `unverified` (fresh account) — never throws for the missing-row case.
 */
export async function getVerificationStatus(
  doctorId: string,
  correlationId: string,
): Promise<DoctorVerificationStatusView> {
  const admin = requireAdmin();

  const { data, error } = await admin
    .from('doctor_verification')
    .select('status, submitted_at, reviewed_at, reject_reason')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data) {
    return {
      status: 'unverified',
      submittedAt: null,
      reviewedAt: null,
      rejectReason: null,
    };
  }

  return {
    status: data.status as VerificationStatus,
    submittedAt: data.submitted_at ?? null,
    reviewedAt: data.reviewed_at ?? null,
    rejectReason: data.reject_reason ?? null,
  };
}

/**
 * Whether a doctor is verified. Used by the future go-live gate (ver-05) and
 * safe to call widely — returns false for a missing row.
 */
export async function isDoctorVerified(
  doctorId: string,
  correlationId: string,
): Promise<boolean> {
  const status = await getVerificationStatus(doctorId, correlationId);
  return status.status === 'verified';
}

// ─────────────────────────────────────────────────────────────────────────
// Admin / ops review path (ver-04). Callers are CRON_SECRET-gated.
// ─────────────────────────────────────────────────────────────────────────

/** List verifications by status (default pending_review). Minimal fields. */
export async function listVerifications(
  status: VerificationStatus,
  correlationId: string,
): Promise<AdminVerificationListItem[]> {
  const admin = requireAdmin();

  const { data, error } = await admin
    .from('doctor_verification')
    .select(
      'doctor_id, status, full_name, registration_number, council_state, specialty, submitted_at',
    )
    .eq('status', status)
    .order('submitted_at', { ascending: true, nullsFirst: false });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (data ?? []).map((row) => ({
    doctorId: row.doctor_id as string,
    status: row.status as VerificationStatus,
    fullName: (row.full_name as string | null) ?? null,
    registrationNumber: (row.registration_number as string | null) ?? null,
    councilState: (row.council_state as string | null) ?? null,
    specialty: (row.specialty as string | null) ?? null,
    submittedAt: (row.submitted_at as string | null) ?? null,
  }));
}

async function signDoc(
  path: string | null,
  correlationId: string,
): Promise<string | null> {
  if (!path) return null;
  const admin = requireAdmin();
  const { data, error } = await admin.storage
    .from(VERIFICATION_DOCS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    logger.warn(
      { correlationId, event: 'verification_doc_sign_failed' },
      'verification_doc_sign_failed',
    );
    return null;
  }
  return data.signedUrl;
}

/** Full review detail incl. short-lived signed document URLs (ver-04 §2.3). */
export async function getVerificationForReview(
  doctorId: string,
  correlationId: string,
): Promise<AdminVerificationDetail> {
  const admin = requireAdmin();

  const { data, error } = await admin
    .from('doctor_verification')
    .select('*')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data) {
    throw new NotFoundError('Verification not found');
  }

  const row = data as DoctorVerificationRow;
  const [certificateSignedUrl, govIdSignedUrl] = await Promise.all([
    signDoc(row.certificate_path, correlationId),
    signDoc(row.gov_id_path, correlationId),
  ]);

  return {
    doctorId: row.doctor_id,
    status: row.status,
    fullName: row.full_name,
    registrationNumber: row.registration_number,
    councilState: row.council_state,
    specialty: row.specialty,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectReason: row.reject_reason,
    certificateSignedUrl,
    govIdSignedUrl,
  };
}

/** Approve → status='verified'. Stamps review audit fields. */
export async function approveVerification(
  doctorId: string,
  reviewedBy: string,
  correlationId: string,
): Promise<void> {
  const admin = requireAdmin();

  const { data, error } = await admin
    .from('doctor_verification')
    .update({
      status: 'verified' as VerificationStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      reject_reason: null,
    })
    .eq('doctor_id', doctorId)
    .select('doctor_id')
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data) {
    throw new NotFoundError('Verification not found');
  }

  logger.info(
    { correlationId, doctorId, event: 'verification_approved' },
    'verification_approved',
  );
}

/** Reject → status='rejected' with a required reason. */
export async function rejectVerification(
  doctorId: string,
  reason: string,
  reviewedBy: string,
  correlationId: string,
): Promise<void> {
  const admin = requireAdmin();

  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ValidationError('Reject reason is required');
  }

  const { data, error } = await admin
    .from('doctor_verification')
    .update({
      status: 'rejected' as VerificationStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      reject_reason: trimmed,
    })
    .eq('doctor_id', doctorId)
    .select('doctor_id')
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data) {
    throw new NotFoundError('Verification not found');
  }

  logger.info(
    { correlationId, doctorId, event: 'verification_rejected' },
    'verification_rejected',
  );
}

/**
 * Request changes → status='changes_requested' with a required note
 * (verification-v2 · verv2-02). Soft "please re-upload / fix" verdict; reuses
 * `reject_reason` as the doctor-facing note. Never log the note.
 */
export async function requestChangesVerification(
  doctorId: string,
  note: string,
  reviewedBy: string,
  correlationId: string,
): Promise<void> {
  const admin = requireAdmin();

  const trimmed = note.trim();
  if (!trimmed) {
    throw new ValidationError('A note is required');
  }

  const { data, error } = await admin
    .from('doctor_verification')
    .update({
      status: 'changes_requested' as VerificationStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      reject_reason: trimmed,
    })
    .eq('doctor_id', doctorId)
    .select('doctor_id')
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data) {
    throw new NotFoundError('Verification not found');
  }

  logger.info(
    { correlationId, doctorId, event: 'verification_changes_requested' },
    'verification_changes_requested',
  );
}
