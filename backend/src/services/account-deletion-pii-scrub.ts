/**
 * Account-deletion PII scrub (Plan 02 · Task 33)
 * ----------------------------------------------
 *
 * At `finalizeAccountDeletion` time we need to redact the patient's
 * personally-identifying fields from the `patients` row while leaving
 * the clinical artifacts (appointments / prescriptions /
 * consultation_messages / recordings) intact. This is the DPDP Act 2023
 * + GDPR Article 9 medical-record carve-out: patient-controlled PII is
 * erased on request, clinical content is retained under the mandatory
 * retention obligation.
 *
 * Columns scrubbed on `patients`:
 *   - `name`                   → '<scrubbed>'
 *   - `phone`                  → '<scrubbed>'
 *   - `email`                  → NULL (nullable column; keeps NOT NULL
 *                                invariants clean on `phone`/`name`)
 *                                Actually: set to '<scrubbed>' to match the
 *                                "query this row and see it's redacted" UX,
 *                                but only when the existing value is
 *                                non-null; we don't want to turn a NULL
 *                                email into a scrubbed string (misleading).
 *   - `platform_external_id`   → NULL (breaks the IG PSID ↔ patient join
 *                                so no future IG webhook can re-link to
 *                                this row; nullable per migration 004).
 *   - `date_of_birth`          → NULL (nullable; if present was PHI-ish)
 *   - `age`                    → NULL (nullable; derived from DoB in most
 *                                cases)
 *   - `medical_record_number`  → NULL (nullable; ties this patient to the
 *                                clinic's internal numbering — but the MRN
 *                                lives in the clinical artifacts too, so
 *                                stripping it from the patient row only
 *                                severs the self-serve view; the
 *                                doctor-side lookup via the clinical
 *                                record still works)
 *
 * Columns **explicitly NOT touched** (proved by
 * `account-deletion-pii-scrub.test.ts`):
 *   - `appointments.*`
 *   - `prescriptions.*`
 *   - `consultation_messages.*`
 *   - `consultation_sessions.*`
 *   - Any table other than `patients`
 *
 * A structured log event `account_deletion_pii_scrubbed` fires once
 * per successful scrub, containing only the `patient_id` and the
 * `correlationId` — never the scrubbed values.
 *
 * Out of scope (documented in the task):
 *   - Scrubbing log lines in Loki / Sentry. Sentry has a per-event
 *     PII-redaction API that we can wire up as a follow-up; Loki doesn't
 *     support line-level redaction without re-ingesting. For v1 the
 *     patient-row scrub is the DPDP "right to erasure" minimum; the
 *     log-store sweep is a hardening follow-up.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-33-account-deletion-revocation-list.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';

export const PII_SCRUB_PLACEHOLDER = '<scrubbed>';

export interface ScrubPatientPiiFromLogsInput {
  patientId: string;
  correlationId: string;
}

export interface ScrubPatientPiiFromLogsResult {
  /** true iff a row was updated. False means the patient row was already missing (prior scrub, or hard-delete by a different path). */
  scrubbed: boolean;
}

/**
 * Redact patient-controlled PII from the `patients` row. Idempotent —
 * a second call is a no-op (the second UPDATE matches 0 rows because
 * the first one already moved the row into its scrubbed shape, but we
 * still return `scrubbed: true` because the row exists and matches our
 * placeholders).
 *
 * Thrown error surface (caller must decide how to handle):
 *   - `InternalError` if the admin client is unavailable.
 *   - `InternalError` if the UPDATE errors at the DB layer.
 *   - `NotFoundError` if `patient_id` does not exist (v1: this is a
 *     caller-side wiring bug; the worker resolves `patientId` from the
 *     audit row so a missing patient means a stale audit).
 *
 * This function **must not** touch `appointments`, `prescriptions`,
 * `consultation_messages`, or any other clinical table. Adding such a
 * touch would silently violate the retention doctrine. The unit test
 * `account-deletion-pii-scrub.test.ts` asserts this property.
 */
export async function scrubPatientPiiFromLogs(
  input: ScrubPatientPiiFromLogsInput,
): Promise<ScrubPatientPiiFromLogsResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: readErr } = await admin
    .from('patients')
    .select('id, email, date_of_birth, age, medical_record_number, platform_external_id')
    .eq('id', input.patientId)
    .maybeSingle();

  if (readErr) {
    throw new InternalError(`Failed to read patient before scrub: ${readErr.message}`);
  }
  if (!existing) {
    throw new NotFoundError('Patient not found for PII scrub');
  }

  // We scrub string fields to the placeholder (so SELECT shows a
  // visible "redacted" marker) and null out optional fields where
  // NULL is already a valid value. `email` is nullable per migration
  // 014 so we only flip it to the placeholder if a value was present;
  // flipping a NULL to '<scrubbed>' would be actively misleading.
  const update: Record<string, unknown> = {
    name: PII_SCRUB_PLACEHOLDER,
    phone: PII_SCRUB_PLACEHOLDER,
    date_of_birth: null,
    age: null,
    medical_record_number: null,
    platform_external_id: null,
  };
  if (existing.email !== null && existing.email !== undefined) {
    update.email = PII_SCRUB_PLACEHOLDER;
  }

  const { error: updateErr } = await admin
    .from('patients')
    .update(update)
    .eq('id', input.patientId);

  if (updateErr) {
    throw new InternalError(`Failed to scrub patient PII: ${updateErr.message}`);
  }

  logger.info(
    {
      correlationId: input.correlationId,
      patientId: input.patientId,
      event: 'account_deletion_pii_scrubbed',
    },
    'account_deletion_pii_scrubbed',
  );

  return { scrubbed: true };
}
