# Task 33: Account-deletion → patient-side access severance + signed-URL revocation list

## 19 April 2026 — Plan [Recording governance foundation](../Plans/plan-02-recording-governance-foundation.md) — Phase E (Decision 4 LOCKED)

---

## Task overview

Decision 4 in the master plan locked **patient self-serve replay TTL = 90 days**, **regulatory retention indefinite**, and **doctor dashboard access unrestricted (subject to retention)**. The implication is non-trivial: when a patient deletes their account, we **revoke their access** to recordings, but we **must NOT delete the underlying clinical artifact** — DPDP Act 2023 + GDPR Article 9 medical-record carve-outs explicitly preserve clinical content under retention obligations even after account deletion.

Today the codebase has no unified account-deletion path — `frontend/app/data-deletion/page.tsx` exists as a Meta-platform compliance landing page but the backend wiring is ad-hoc per surface. This task lands:

1. The `signed_url_revocation` table that stores **revoked URL prefixes** (the replay player from Plan 07 will check this list before minting any signed URL).
2. The unified `account-deletion-worker.ts` that on patient account-deletion: enumerates the patient's recording artifact prefixes, writes them to the revocation list, scrubs PII from operational logs, sends a one-time explainer DM citing the legal basis, and **leaves the clinical artifact intact**.
3. A 7-day **soft-delete grace period** before revocation actually fires, so accidental-deletion recovery is possible (Plan 02 open question #3 — recommendation accepted).
4. The audit row pattern for "this patient deleted their account on this date for this reason."

This is the Plan 02 task that ships **after Task 27** (which establishes the consent column shape) and **in parallel with Task 34**. It must land before Plan 07 ships the replay player, because Plan 07's URL minting reads the revocation list at every request.

**Estimated time:** ~3 hours

**Status:** Not started

**Depends on:**
- **Soft:** Task 27 (the `appointments.recording_consent_*` columns exist; the explainer DM cites consent-version captured at booking).
- **Hard for Plan 07:** Plan 07's `mintReplayUrl()` reads `signed_url_revocation`. Plan 07 cannot ship until this task is in production.

**Plan:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md)

---

## Acceptance criteria

- [ ] **Migration `0NN_signed_url_revocation.sql` ships** (next free number after Task 27's migration):
  ```sql
  CREATE TABLE IF NOT EXISTS signed_url_revocation (
    url_prefix         TEXT PRIMARY KEY,            -- e.g. 'recordings/patient_<uuid>/'
    revoked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    revocation_reason  TEXT NOT NULL,               -- 'account_deleted' | 'support_request_<date>' | ...
    initiated_by_user  UUID                         -- patient/admin who triggered; NULL for system
  );

  CREATE INDEX IF NOT EXISTS idx_signed_url_revocation_revoked_at
    ON signed_url_revocation(revoked_at DESC);
  ```
  Reverse migration drops the table. RLS enabled, service-role-only INSERT/UPDATE; SELECT allowed for admin role only.
- [ ] **Migration `0NN_account_deletion_audit.sql`** (or fold into the same migration as the revocation table):
  ```sql
  CREATE TABLE IF NOT EXISTS account_deletion_audit (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID NOT NULL,                 -- no FK (patient row may be soft-deleted)
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    grace_window_until  TIMESTAMPTZ NOT NULL,          -- requested_at + ACCOUNT_DELETION_GRACE_DAYS
    finalized_at        TIMESTAMPTZ,                   -- NULL until grace expires
    cancelled_at        TIMESTAMPTZ,                   -- NULL unless patient recovers within grace
    artifact_prefix_count INT NOT NULL DEFAULT 0,      -- how many prefixes were revoked at finalize
    notes               TEXT
  );
  ```
- [ ] **`backend/src/workers/account-deletion-worker.ts`** (NEW) exporting:
  ```ts
  export async function requestAccountDeletion(input: {
    patientId:     string;
    requestedBy:   string;       // patient_id self-request, OR admin user-id
    reason?:       string;
    correlationId: string;
  }): Promise<{ graceWindowUntil: Date }>;

  export async function cancelAccountDeletion(input: {
    patientId:     string;
    cancelledBy:   string;
    correlationId: string;
  }): Promise<void>;

  export async function finalizeAccountDeletion(input: {
    patientId:     string;
    correlationId: string;
  }): Promise<{ revokedPrefixes: string[] }>;
  ```
  - `requestAccountDeletion` writes `account_deletion_audit` row with `grace_window_until = now() + env.ACCOUNT_DELETION_GRACE_DAYS days`. Returns the grace cutoff.
  - `cancelAccountDeletion` sets `cancelled_at` if before grace cutoff; throws `BadRequestError` after.
  - `finalizeAccountDeletion` enumerates artifact prefixes for the patient, INSERTs into `signed_url_revocation`, scrubs operational logs (see PII-scrub bullet), sends explainer DM, sets `finalized_at` + `artifact_prefix_count`.
- [ ] **Cron driver** in `backend/src/workers/account-deletion-cron.ts` (or extend existing nightly cron entry-point) that calls `finalizeAccountDeletion` for every audit row whose `grace_window_until < now() AND finalized_at IS NULL AND cancelled_at IS NULL`. Runs nightly. Idempotent — re-run on the same row is a no-op once `finalized_at` is set.
- [ ] **Env var:** `ACCOUNT_DELETION_GRACE_DAYS` (default `7`, min `0`) in `backend/src/config/env.ts`. Setting `0` disables grace entirely (test override only — must NOT be `0` in production).
- [ ] **PII scrub:** `finalizeAccountDeletion` calls a new helper `scrubPatientPiiFromLogs(patientId, correlationId)` that:
  - Replaces `patient.name`, `patient.phone`, `patient.email`, `patient.platform_external_id`, and `patient.dob` with `'<scrubbed>'` placeholders **in the patient row** (NOT in `appointments` / `prescriptions` / `consultation_messages` clinical content — those are retained under medical-record carve-out).
  - Logs a structured `account_deletion_pii_scrubbed` event with the patient_id only (no scrubbed values, obviously).
  - Out of scope for v1: scrubbing log lines in Loki / Sentry. That's a follow-up that requires a new env var pointing at the log retention API; document in this task's Notes section.
- [ ] **Explainer DM:** `dm-copy.ts#buildAccountDeletionExplainerDm({ citation: string, finalizedAt: Date }): string`. Sent via `notification-service.ts` using the existing best-channel cascade (NOT the urgent fan-out — this is a non-urgent informational DM). Copy summary: "Your account is closed. We've removed your access to your recordings and chats. Your medical records are retained per [citation]. Your doctor still has access for clinical follow-up."
- [ ] **Public surface:** `frontend/app/data-deletion/page.tsx` extended with a real "Request account deletion" form (currently it's a static landing page). On submit, hits a new `POST /api/v1/me/account-deletion` route (auth required — patient must be logged in OR provide a verified booking token + OTP). Shows the 7-day grace window in the confirmation: "Your account will be closed on {date}. To cancel, log in before then and click 'Recover account'."
- [ ] **Tests:**
  - `backend/tests/unit/workers/account-deletion-worker.test.ts` — happy path (request → grace → finalize), cancel within grace works, cancel after grace throws, finalize is idempotent on second run, PII scrub redacts patient row but leaves appointments/prescriptions intact, revocation rows written for every artifact prefix.
  - `backend/tests/unit/utils/dm-copy-account-deletion.test.ts` — snapshot fixture for the explainer.
  - Integration test (or unit with mocked DB): `signed_url_revocation` PRIMARY KEY conflict on duplicate prefix is handled gracefully (UPSERT or `ON CONFLICT DO NOTHING`).
- [ ] **Type-check + lint clean.** All migrations apply forward + reverse. No regression on existing notification-service / patient-service tests.

---

## Out of scope

- Plan 07's replay-URL minting code that reads from `signed_url_revocation`. This task only lands the **table**; reading + 404 enforcement is Plan 07's job.
- Doctor account deletion. Different policy entirely (doctor account deletion would orphan a clinic's worth of patient records — needs explicit clinic-handoff doctrine, separate plan).
- Hard-deleting log entries from Loki / Sentry / structured-log retention. Out of scope for v1 — see PII-scrub bullet's note. The patient row scrub is enough for DPDP "right to erasure" basic compliance; the log-store sweep is a hardening follow-up.
- Recording artifact deletion at regulatory expiry. That's Task 34's `recording-archival-worker.ts` — different worker, different cron, different rules.
- Re-activation flow for patients who deleted then want to come back. Recommendation: ship a separate `POST /api/v1/me/account-recovery` endpoint behind email-OTP verification in a follow-up; not in v1.
- `instagram-connect-service.ts` token revocation. The patient deletes their Clariva account; their IG account is unaffected. If we ever ship a "disconnect IG" feature, that's a separate flow.

---

## Files expected to touch

**Backend:**

- `backend/migrations/0NN_signed_url_revocation.sql` — new
- `backend/migrations/0NN_account_deletion_audit.sql` — new (or merged with the revocation migration)
- `backend/src/workers/account-deletion-worker.ts` — new (the three-function module above)
- `backend/src/workers/account-deletion-cron.ts` — new (or wire into existing nightly cron entry)
- `backend/src/services/account-deletion-pii-scrub.ts` — new (the `scrubPatientPiiFromLogs` helper)
- `backend/src/config/env.ts` — add `ACCOUNT_DELETION_GRACE_DAYS` (default 7)
- `backend/src/utils/dm-copy.ts` — add `buildAccountDeletionExplainerDm`
- `backend/src/routes/me.ts` (or wherever patient-self routes live) — `POST /api/v1/me/account-deletion` + `POST /api/v1/me/account-recovery` (recovery within grace)

**Frontend:**

- `frontend/app/data-deletion/page.tsx` — extend the static landing page with the real request form + confirmation state

**Tests:**

- `backend/tests/unit/workers/account-deletion-worker.test.ts` — new
- `backend/tests/unit/utils/dm-copy-account-deletion.test.ts` — new
- `backend/tests/unit/services/account-deletion-pii-scrub.test.ts` — new (verifies appointments/prescriptions are NOT touched)

---

## Notes / open decisions

1. **What counts as a "recording artifact prefix" for a patient?** Today only video composition URIs exist (Twilio Video composition output). Plan 04 will add Supabase chat exports; Plan 05 will add audio compositions; Plan 07 will add transcript PDFs. For v1, enumerate via a stable convention: every recording artifact gets a path of the form `recordings/patient_<uuid>/<session_id>/<artifact_type>.<ext>` and the prefix written to revocation is `recordings/patient_<uuid>/`. Document this convention in `recording-consent-service.ts` so Plans 04 / 05 / 07 follow it.
2. **PII-scrub log-store sweep is a follow-up.** Sentry has a per-event PII-redaction API; Loki doesn't support deletion below the log-line level (you redact by re-ingesting + dropping the original block). For v1 we accept that operational logs older than a week may still contain raw patient names — but the patient row itself is scrubbed, so any new log line tagged with their `patient_id` will pull `<scrubbed>` from the join. Realistic compliance posture: document the limitation publicly on the privacy page.
3. **7-day grace is configurable but should never be 0 in production.** Add a startup-time assertion that fails if `NODE_ENV === 'production' && ACCOUNT_DELETION_GRACE_DAYS === 0`. Belt-and-suspenders.
4. **Cancel-during-grace UX:** the patient logs back in within the grace window and sees a banner: "Your account is scheduled for deletion on {date}. [Cancel deletion]". One-click cancel sets `cancelled_at`. No re-confirmation UI — the patient already confirmed when they requested deletion; making them re-confirm cancellation is friction.
5. **Doctor view post-deletion:** the doctor's appointment list, prescription list, and (Plan 07) recording dashboard continue to show the patient's records under whatever name was stored at appointment-time. The doctor's UI should NOT proactively flag "this patient deleted their account" — that's a privacy leak. Just keep the records as-is.
6. **Audit retention for `account_deletion_audit`:** the audit table itself is **never** deleted (it's our proof that we honored the deletion request). Document this in the table's migration comment.
7. **Reason field handling:** `account_deletion_audit.notes` is free-text and patient-supplied. Truncate to 500 chars on insert. Run through `redactPhiForAI` before persisting to avoid storing PHI in the audit table by accident.

---

## References

- **Plan:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md) — Migration D + Task 33 service deliverables.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 LOCKED entry, "regulatory retention overrides patient deletion" doctrine.
- **DPDP Act 2023 / GDPR Article 9 medical-record carve-out:** owner to attach exact citations to this task's PR body.
- **Existing data-deletion landing page:** `frontend/app/data-deletion/page.tsx`
- **Existing notification-service cascade helpers:** `backend/src/services/notification-service.ts` (`sendConsultationLinkToPatient` pattern — we use this for non-urgent DMs; the new fan-out helpers from Task 16 are for urgent moments only)
- **Existing PHI redactor:** `backend/src/services/ai-service.ts#redactPhiForAI`

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started
