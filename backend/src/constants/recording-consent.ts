/**
 * Recording-consent constants (Plan 02 · Task 27 · Decision 4 LOCKED)
 *
 * Single source of truth for the patient-facing recording-consent body and
 * its version token. Both the IG-bot DM builder (`dm-copy.ts`) and the public
 * `/book` page re-pitch modal import from here; changing copy in only one
 * surface is how consent text drifts across channels.
 *
 * ## Versioning contract (read before editing)
 *
 * 1. **Bumping the body text MUST bump `RECORDING_CONSENT_VERSION` in the
 *    same PR.** The version string is what we persist on
 *    `appointments.recording_consent_version` at capture time — it is the
 *    legal-defensibility pointer back to the exact wording the patient saw.
 * 2. **Never reuse an old version token.** New patient saw new text → new
 *    version. Old rows keep their old token, so audit queries like "show me
 *    all consents captured under v1.0" stay stable forever.
 * 3. **Semver-lite.** Minor wording changes → patch bump (`v1.0` → `v1.1`).
 *    Substantive scope change (adds a new purpose, new retention window,
 *    new third party) → major bump (`v1.0` → `v2.0`) AND open a follow-up
 *    on whether to re-prompt future-dated bookings that consented under the
 *    old version. See Plan 02 open question #1 for the policy call.
 * 4. **`RECORDING_CONSENT_BODY_V1` is immutable once shipped.** Edits to
 *    that constant retroactively misrepresent what earlier patients saw —
 *    don't. Introduce `RECORDING_CONSENT_BODY_V1_1` (or `V2_0`) alongside
 *    and switch the active export to the new one.
 */

export const RECORDING_CONSENT_VERSION = 'v1.0';

export const RECORDING_CONSENT_BODY_V1 =
  'I agree to my consultation being recorded for medical records and quality. ' +
  'The doctor can pause recording at any time. I can review or download my recording ' +
  'for 90 days, or request access for the full medical-record retention period anytime.';
