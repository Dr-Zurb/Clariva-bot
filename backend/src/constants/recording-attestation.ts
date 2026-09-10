/**
 * Doctor recording attestation — version + six clauses (rec-11 / REC-D4).
 *
 * REC-D2 / rec-12: the version string is owner-approved. This draft must
 * not ship to production. Do not reuse retired patient consent `v1.0`.
 *
 * Clauses are verbatim from charter §Attestation. One accept covers all
 * six; they are not configurable and not individually checkable.
 */

/** Draft policy version. Replace with the owner-approved string in rec-12. */
export const RECORDING_ATTESTATION_POLICY_VERSION = 'DRAFT-REC-D2-UNAPPROVED';

/**
 * Charter §Attestation — six clauses, in order, unedited.
 */
export const RECORDING_ATTESTATION_CLAUSES = [
  'Every voice and video consult is audio-recorded. You cannot disable this.',
  'You cannot delete a recording. Deletion is policy-driven and automatic.',
  'The patient has the same access you do, self-serve for 90 days.',
  'Your replays are logged and the patient is notified.',
  'Streaming only. No download, no re-recording, no sharing outside the platform.',
  'Video capture requires explicit patient consent, every single time.',
] as const;

export type RecordingAttestationClause = (typeof RECORDING_ATTESTATION_CLAUSES)[number];
