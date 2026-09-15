/**
 * Doctor recording attestation (recording-governance-v2 · rec-07 / rec-11).
 *
 * Mirrors the `doctor_recording_attestation` table (migration 210).
 * Append-only per `(doctor_id, policy_version)` — REC2-D2. The gate asks
 * whether a row exists for the currently-active owner-approved policy
 * version (REC-D2). Service-role reads and writes only (REC2-D4).
 */

/** Full row shape (service-role reads). */
export interface DoctorRecordingAttestationRow {
  id: string;
  doctor_id: string;
  policy_version: string;
  accepted_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Doctor-facing acceptance view. Deliberately minimal — version + when,
 * never a raw row id list of historical versions unless the service
 * explicitly asks for them.
 */
export interface DoctorRecordingAttestationStatusView {
  accepted: boolean;
  policyVersion: string;
  acceptedAt: string | null;
}
