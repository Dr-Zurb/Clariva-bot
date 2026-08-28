/**
 * Doctor Verification types (doctor-verification-v1 · ver-01/03/04 +
 * verification-v2 · verv2-02).
 *
 * Mirrors the `doctor_verification` table (migrations 183 + 185). The status
 * lifecycle is
 * `unverified → pending_review → verified | rejected | changes_requested`
 * (`changes_requested` is non-terminal; doctor re-submit → pending_review).
 */

export const VERIFICATION_STATUSES = [
  'unverified',
  'pending_review',
  'verified',
  'rejected',
  'changes_requested',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Which document slot an upload targets. */
export const VERIFICATION_DOC_KINDS = ['certificate', 'gov_id'] as const;
export type VerificationDocKind = (typeof VERIFICATION_DOC_KINDS)[number];

/** Full row shape (service-role reads). */
export interface DoctorVerificationRow {
  doctor_id: string;
  status: VerificationStatus;
  full_name: string | null;
  registration_number: string | null;
  council_state: string | null;
  specialty: string | null;
  certificate_path: string | null;
  gov_id_path: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Reviewer note when status is `rejected` or `changes_requested`. */
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Doctor-facing status view (ver-03 GET /verification/status). Deliberately
 * minimal — never exposes reviewer identity or raw document paths.
 * `rejectReason` doubles as the "changes requested" note (verification-v2).
 */
export interface DoctorVerificationStatusView {
  status: VerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
}

/** Validated submit payload (ver-03 POST /verification/submit). */
export interface SubmitVerificationInput {
  fullName: string;
  registrationNumber: string;
  councilState: string;
  specialty?: string;
  certificatePath: string;
  govIdPath?: string;
}

/** Admin list item (ver-04) — minimal fields, no signed URLs. */
export interface AdminVerificationListItem {
  doctorId: string;
  status: VerificationStatus;
  fullName: string | null;
  registrationNumber: string | null;
  councilState: string | null;
  specialty: string | null;
  submittedAt: string | null;
}

/** Admin detail view (ver-04) — includes short-lived signed doc URLs. */
export interface AdminVerificationDetail extends AdminVerificationListItem {
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectReason: string | null;
  certificateSignedUrl: string | null;
  govIdSignedUrl: string | null;
}
