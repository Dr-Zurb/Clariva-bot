-- ============================================================================
-- 183_doctor_verification.sql
-- doctor-verification-v1 · ver-01 — licensed-doctor verification record + RLS.
-- Date:    2026-07-22
-- ============================================================================
-- Purpose:
--   Prove a signed-up account is a real, licensed doctor before they go
--   patient-facing. This migration lands the durable record; the storage
--   bucket for the actual documents lands in ver-02
--   (184_doctor_verification_docs_bucket.sql).
--
--   A "doctor" IS the `auth.users` row (there is no `doctors` table — see
--   doctor-funnel DF-D2), so this table keys 1:1 on `auth.users(id)` exactly
--   like `doctor_settings` (migration 009) and `doctor_instagram` (011).
--
-- Status lifecycle (VER-D1):
--   unverified ──submit──▶ pending_review ──review──▶ verified
--                                           └────────▶ rejected ──resubmit──▶ pending_review
--
-- Collected fields (VER-D2):
--   full_name (as registered), registration_number, council_state (state
--   council / NMC), specialty, certificate_path (+ optional gov_id_path).
--   The *_path columns hold Storage object keys (ver-02), never file blobs.
--
-- ────────────────────────────────────────────────────────────────────────
-- RLS — SELECT-only for doctors; ALL writes go through the service-role
-- backend. This is a deliberate privilege-escalation guard:
--
--   Supabase exposes PostgREST directly to any holder of an `authenticated`
--   JWT. If doctors had an UPDATE policy on their own row, a doctor could
--   `PATCH /rest/v1/doctor_verification?doctor_id=eq.<self>` and set
--   status='verified' themselves — self-certifying past the whole gate.
--   Therefore doctors get NO insert/update policy: the submit endpoint
--   (ver-03) writes via the service-role admin client and hard-codes
--   status='pending_review'; review (ver-04) writes the terminal states.
--   Service-role bypasses RLS, so no allow-policy is needed for it.
--
--   Doctors keep a SELECT-own policy (defense-in-depth: a direct read only
--   ever returns their own row) so the status surface can be read either via
--   the backend or, later, a user-scoped client without a policy change.
--
--   Admin SELECT/UPDATE policies key on a SERVER-MINTED `auth.jwt()->>'role'
--   = 'admin'` claim (the convention documented in 002_rls_policies.sql).
--   v1's admin review path is CRON_SECRET-gated + runs service-role, so these
--   admin policies do NOT fire today — they are forward-compatible scaffolding
--   for the "proper admin-role middleware" separate plan. The claim must be
--   minted server-side from a trusted source and NEVER client-controlled.
-- ────────────────────────────────────────────────────────────────────────
--
-- Retention / deletion:
--   `doctor_id` FK ON DELETE CASCADE → the row is removed automatically when
--   the `auth.users` account is deleted. Storage objects are purged in ver-02
--   / account-deletion follow-up (they live in the bucket, not this table).
--
-- Safety:
--   · Additive only — new table, no existing object touched.
--   · CREATE TABLE / INDEX IF NOT EXISTS + DROP POLICY IF EXISTS / CREATE
--     POLICY pairs make re-runs idempotent.
--   · Reuses `update_updated_at_column()` from migration 001.
--   · Reverse migration documented at the file foot.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_verification (
  doctor_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (status IN ('unverified', 'pending_review', 'verified', 'rejected')),
  -- Registration details (NULL until the doctor submits — VER-D2).
  full_name           TEXT NULL,   -- Name as it appears on the registration certificate
  registration_number TEXT NULL,   -- Medical registration / license number
  council_state       TEXT NULL,   -- Issuing state medical council / NMC
  specialty           TEXT NULL,
  -- Storage object keys (ver-02 bucket `doctor-verification-docs`), NOT blobs.
  certificate_path    TEXT NULL,   -- Registration certificate (required at submit)
  gov_id_path         TEXT NULL,   -- Optional government ID
  -- Review audit trail.
  submitted_at        TIMESTAMPTZ NULL,
  reviewed_at         TIMESTAMPTZ NULL,
  reviewed_by         TEXT NULL,   -- Operator identifier (e.g. 'ops'); TEXT so the
                                   -- CRON_SECRET ops path need not map to an auth.users row.
  reject_reason       TEXT NULL,   -- Populated when status='rejected'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin listing scans by status (e.g. WHERE status='pending_review').
CREATE INDEX IF NOT EXISTS idx_doctor_verification_status
  ON doctor_verification(status);

COMMENT ON TABLE doctor_verification IS
  'doctor-verification-v1 (ver-01). One row per auth.users doctor. Status '
  'lifecycle unverified→pending_review→verified/rejected. Doctors are '
  'SELECT-only via RLS; ALL writes go through the service-role backend so a '
  'doctor cannot self-set status=verified via direct PostgREST access.';

COMMENT ON COLUMN doctor_verification.certificate_path IS
  'Storage object key in bucket doctor-verification-docs (ver-02), never a blob.';

-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_verification ENABLE ROW LEVEL SECURITY;

-- Doctors may read ONLY their own row (defense-in-depth; the status surface
-- normally reads via the backend). No INSERT/UPDATE policy for doctors — the
-- privilege-escalation guard documented in the header.
DROP POLICY IF EXISTS "Doctors can read own verification" ON doctor_verification;
CREATE POLICY "Doctors can read own verification"
  ON doctor_verification FOR SELECT
  USING (doctor_id = auth.uid());

-- Admin (server-minted role claim) may read all rows. Forward-compat only:
-- v1's review path is CRON_SECRET + service-role (bypasses RLS). NEVER trust a
-- client-supplied role claim — mint it server-side from a trusted source.
DROP POLICY IF EXISTS "Admins can read all verifications" ON doctor_verification;
CREATE POLICY "Admins can read all verifications"
  ON doctor_verification FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');

-- Admin (server-minted role claim) may update all rows (approve/reject).
-- Same forward-compat caveat as above.
DROP POLICY IF EXISTS "Admins can update all verifications" ON doctor_verification;
CREATE POLICY "Admins can update all verifications"
  ON doctor_verification FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger (reuse update_updated_at_column from migration 001)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS doctor_verification_updated_at ON doctor_verification;
CREATE TRIGGER doctor_verification_updated_at
  BEFORE UPDATE ON doctor_verification
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling). Do NOT
-- revert once verification rows exist in production — the go-live gate and the
-- doctor's verification status surface would regress.
--
--   DROP TRIGGER IF EXISTS doctor_verification_updated_at ON doctor_verification;
--   DROP POLICY  IF EXISTS "Admins can update all verifications" ON doctor_verification;
--   DROP POLICY  IF EXISTS "Admins can read all verifications"   ON doctor_verification;
--   DROP POLICY  IF EXISTS "Doctors can read own verification"   ON doctor_verification;
--   DROP INDEX   IF EXISTS idx_doctor_verification_status;
--   DROP TABLE   IF EXISTS doctor_verification;
-- ============================================================================
