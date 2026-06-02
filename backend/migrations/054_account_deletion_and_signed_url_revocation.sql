-- ============================================================================
-- 054_account_deletion_and_signed_url_revocation.sql
-- Plan 02 · Task 33 · Decision 4 LOCKED
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Decision 4 locked: patient self-serve replay TTL = 90 days, regulatory
--   retention indefinite, doctor dashboard access unrestricted (subject to
--   retention). The implication is that on patient account-deletion we
--   **revoke the patient's access** to their recordings without **deleting**
--   the underlying clinical artifact — DPDP Act 2023 + GDPR Article 9
--   medical-record carve-outs explicitly preserve clinical content under
--   retention obligations even after account deletion.
--
--   This migration lands two tables that together implement that doctrine:
--
--     1. `signed_url_revocation` — a blocklist of URL prefixes. Plan 07's
--        `mintReplayUrl()` will check this list at every request and refuse
--        to mint a signed URL for a prefix on the blocklist. The prefix
--        convention is documented in `recording-consent-service.ts` and
--        takes the shape `recordings/patient_<uuid>/` so Plans 04 / 05 / 07
--        converge on one revocation semantics.
--
--     2. `account_deletion_audit` — one row per deletion request with
--        `requested_at`, `grace_window_until`, and (once the grace expires
--        and the cron finalizes the deletion) `finalized_at` /
--        `artifact_prefix_count`. `cancelled_at` is set if the patient
--        recovers within the grace window. The table is **never pruned** —
--        it is our proof that we honored the deletion request.
--
--   A 7-day soft-delete grace window (configurable via
--   `ACCOUNT_DELETION_GRACE_DAYS`, default 7, never 0 in production) sits
--   between `requested_at` and the cron-driven finalize step, so accidental
--   deletions can be recovered by the patient logging back in.
--
-- Out of scope (documented for reviewers):
--   - Plan 07's replay-URL minting that *reads* this revocation list.
--     This migration only lands the table; the read side is Plan 07's job.
--   - Hard-deleting log entries from Loki / Sentry. The patient-row PII
--     scrub done at finalize time covers the DPDP "right to erasure" basic
--     contract; log-store sweep is a hardening follow-up.
--   - Doctor account deletion. Separate policy entirely.
--
-- Safety:
--   · Both tables use `CREATE TABLE IF NOT EXISTS` so re-running is a no-op.
--   · Both tables have RLS enabled. Service-role-only writes; service-role
--     reads. Admin role may SELECT via a platform-level policy (handled
--     when/if an admin UI is added; not in scope here).
--   · No FK to `patients(id)` on either table — the patient row is scrubbed
--     (not deleted) on finalize, but keeping the FK-free design means that
--     if a future migration ever does hard-delete the row, the audit trail
--     survives.
--
-- Rollback:
--   Reverse operations are documented at the bottom of this file. A revert
--   after any revocation has been written means the blocklist disappears
--   and Plan 07's replay player will happily mint URLs for deleted-account
--   patients. Prefer superseding with a new migration over reverting.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: signed_url_revocation
-- One row per revoked artifact prefix. PRIMARY KEY is the prefix itself so
-- duplicate revocations collapse into a single row (we use ON CONFLICT
-- DO NOTHING at the worker layer).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signed_url_revocation (
    url_prefix          TEXT PRIMARY KEY,
    revoked_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    revocation_reason   TEXT NOT NULL,
    initiated_by_user   UUID
);

CREATE INDEX IF NOT EXISTS idx_signed_url_revocation_revoked_at
    ON signed_url_revocation(revoked_at DESC);

COMMENT ON TABLE signed_url_revocation IS
    'Plan 02 Task 33 · Blocklist of recording artifact URL prefixes. Plan 07 `mintReplayUrl()` checks this list before minting a signed URL. Never deleted — revocations are terminal.';
COMMENT ON COLUMN signed_url_revocation.url_prefix IS
    'Artifact prefix, e.g. ''recordings/patient_<uuid>/''. Plans 04/05/07 must follow this convention (see recording-consent-service.ts).';
COMMENT ON COLUMN signed_url_revocation.revocation_reason IS
    'Free-text reason tag. Examples: ''account_deleted'', ''support_request_<date>'', ''legal_hold_<case_id>''.';
COMMENT ON COLUMN signed_url_revocation.initiated_by_user IS
    'Patient ID (self-request) or admin user-id (support). NULL for system-initiated revocations.';

-- Enable RLS. Service role bypasses RLS. No anon / authenticated policies
-- are created because no patient / doctor code-path SELECTs from this table
-- directly — Plan 07's read lives in backend code using the admin client.
ALTER TABLE signed_url_revocation ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Table: account_deletion_audit
-- One row per deletion request. Never deleted.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_deletion_audit (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id              UUID NOT NULL,
    requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    requested_by            UUID,
    reason                  TEXT,
    grace_window_until      TIMESTAMPTZ NOT NULL,
    finalized_at            TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    cancelled_by            UUID,
    artifact_prefix_count   INT NOT NULL DEFAULT 0,
    notes                   TEXT,
    CONSTRAINT account_deletion_audit_exclusive_terminal_state
        CHECK (finalized_at IS NULL OR cancelled_at IS NULL)
);

-- Partial index for the cron scan: "rows whose grace expired and have
-- neither finalized nor been cancelled". Keeps the scan O(pending).
CREATE INDEX IF NOT EXISTS idx_account_deletion_audit_pending_finalize
    ON account_deletion_audit(grace_window_until)
    WHERE finalized_at IS NULL AND cancelled_at IS NULL;

-- Lookup index for "does this patient have a pending deletion?" — used by
-- the cancel route and by the recovery banner.
CREATE INDEX IF NOT EXISTS idx_account_deletion_audit_patient_id
    ON account_deletion_audit(patient_id);

COMMENT ON TABLE account_deletion_audit IS
    'Plan 02 Task 33 · Append-only audit of patient account-deletion requests. Never deleted — our proof that we honored the DPDP / GDPR erasure request. `finalized_at` / `cancelled_at` are mutually exclusive (CHECK constraint).';
COMMENT ON COLUMN account_deletion_audit.patient_id IS
    'Target patient. No FK — the patient row may be PII-scrubbed (not deleted) at finalize time, and keeping the FK-free shape means audit survives any future hard-delete migration.';
COMMENT ON COLUMN account_deletion_audit.requested_by IS
    'Who triggered the request. Usually equals `patient_id` (self-serve). For admin-initiated deletions this is the admin user-id.';
COMMENT ON COLUMN account_deletion_audit.grace_window_until IS
    'Hard cutoff. Before this, cancel is allowed; after this, the nightly cron finalizes.';
COMMENT ON COLUMN account_deletion_audit.finalized_at IS
    'Set by `finalizeAccountDeletion`. Implies revocation rows written + PII scrub complete + explainer DM sent.';
COMMENT ON COLUMN account_deletion_audit.cancelled_at IS
    'Set by `cancelAccountDeletion` if the patient recovers before the grace cutoff. Mutually exclusive with `finalized_at`.';
COMMENT ON COLUMN account_deletion_audit.artifact_prefix_count IS
    'Informational — how many `signed_url_revocation` rows were inserted at finalize. Useful for the support dashboard; not consulted by any code path.';
COMMENT ON COLUMN account_deletion_audit.reason IS
    'Patient-supplied free text, truncated to 500 chars at insert, passed through `redactPhiForAI` so the audit table does not accidentally collect PHI.';

ALTER TABLE account_deletion_audit ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Reverse (documented only; kept in-file so the reverse op is one grep away).
--
--   DROP INDEX IF EXISTS idx_account_deletion_audit_patient_id;
--   DROP INDEX IF EXISTS idx_account_deletion_audit_pending_finalize;
--   DROP TABLE IF EXISTS account_deletion_audit;
--
--   DROP INDEX IF EXISTS idx_signed_url_revocation_revoked_at;
--   DROP TABLE IF EXISTS signed_url_revocation;
-- ============================================================================
