-- ============================================================================
-- 055_regulatory_retention_policy.sql
-- Plan 02 · Task 34 · Decision 4 LOCKED
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Decision 4 in the master plan locked two opposing retention requirements:
--
--     * Patient self-serve replay TTL = 90 days.
--     * Doctor / regulatory retention = indefinite, subject to local law.
--
--   Implementing that doctrine requires a policy table that codifies **how
--   long** clinical recordings must be kept, per (country, specialty), before
--   the nightly archival worker is allowed to hard-delete them. This migration
--   ships that policy table. Seed rows for India (general medicine, pediatrics,
--   gynecology) plus a conservative international fallback are loaded by a
--   separate seed migration (058) so that seed values can be reviewed and
--   edited by owner / legal without blocking the schema landing.
--
--   The table is versioned by `effective_from` / `effective_until`: updating a
--   retention rule means inserting a new row with a later `effective_from` and
--   stamping the old row's `effective_until`, never UPDATE-ing the active row.
--   That shape preserves the audit trail of what was in force when, which is
--   what a regulator subpoena would ask for.
--
--   Pediatric retention in India is the one exception to a pure "years since
--   session" formula: IMC regs say retain until the minor reaches majority
--   (~age 21 with statute-of-limitations buffer). Rather than hard-code that
--   in the worker, the table carries an optional `retention_until_age` column;
--   `regulatory-retention-service.resolveRetentionPolicy(...)` returns both
--   fields and the worker picks the later of the two deadlines per-artifact.
--
-- Out of scope (documented for reviewers):
--   * The seed rows themselves — landed by 058 so legal review can iterate on
--     values without replaying the schema migration.
--   * `recording_artifact_index` and `archival_history` — landed by 056 / 057
--     respectively. They depend on `consultation_sessions` (Plan 01 Task 15).
--   * Per-doctor override of policy (e.g. "retain longer than regulator
--     requires"). Future v2 — out of scope.
--
-- Why service-role-only RLS:
--   * Policy rows drive the hard-delete worker. Letting a doctor write them
--     would let them ship-around retention. Reading is useful for surfacing
--     "your recordings are kept for X years" in the doctor UI, but even that
--     is derivative of the worker state — we expose it via a read-only API
--     (Plan 02 admin-preview route) rather than opening the table up directly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS regulatory_retention_policy (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ISO 3166-1 alpha-2 country code, or '*' for the international fallback.
    -- The worker resolves most-specific first: (country, specialty) → (country, '*') → ('*', '*').
    country_code            TEXT        NOT NULL,

    -- Specialty key matching `doctor_settings.specialty`, or '*' for any-specialty
    -- within the country. The current specialty strings in doctor_settings are
    -- free-text today; callers of resolveRetentionPolicy case-normalize before lookup.
    specialty               TEXT        NOT NULL,

    -- Hard-delete threshold in whole years since `consultation_sessions.actual_ended_at`.
    -- MUST be > 0. Short ranges (1-2 yr) are accepted at schema level but would
    -- trigger legal review — the owner-sign-off note on the PR catches those.
    retention_years         INT         NOT NULL CHECK (retention_years > 0),

    -- Optional: retention-until-patient-age-N override. Used for pediatrics in
    -- India (retain until age 21 per IMC + Limitation Act for minors). If set
    -- AND the patient's date_of_birth is known at worker run-time, the worker
    -- computes max(session_end + retention_years, dob + retention_until_age)
    -- and defers hard-delete to the later date. If dob is unknown, the
    -- retention_years branch wins.
    retention_until_age     INT                     CHECK (retention_until_age IS NULL OR retention_until_age > 0),

    -- Patient self-serve replay TTL, in whole days since session end. Default
    -- 90 matches the Decision 4 LOCKED value. Different per-specialty TTLs are
    -- schema-allowed but should require legal review — the default is what
    -- ships everywhere in v1.
    patient_self_serve_days INT         NOT NULL DEFAULT 90 CHECK (patient_self_serve_days > 0),

    -- Human-readable source citation (regulator URL, internal memo, owner
    -- email thread). Required so the hard-delete audit trail in
    -- `archival_history` can reference back to why a specific value was set.
    source                  TEXT        NOT NULL,

    -- Policy versioning. A row is active when `effective_from <= now()` and
    -- (`effective_until` IS NULL OR `effective_until > now()`). Overlapping
    -- `effective_from` dates for the same (country, specialty) are blocked by
    -- the unique constraint below.
    effective_from          DATE        NOT NULL,
    effective_until         DATE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Inserting a second policy row with the same (country, specialty,
    -- effective_from) is a bug — the owner meant to stamp `effective_until`
    -- on the old row and bump the date on the new one.
    UNIQUE (country_code, specialty, effective_from)
);

-- Worker hot-path index. `resolveRetentionPolicy` reads by (country, specialty)
-- ordered by `effective_from DESC` and picks the first row that is active at
-- `asOf`. DESC on `effective_from` keeps the latest active row at the head.
CREATE INDEX IF NOT EXISTS idx_retention_policy_lookup
    ON regulatory_retention_policy (country_code, specialty, effective_from DESC);

-- ----------------------------------------------------------------------------
-- RLS: service-role only. Policy rows are the knob that drives hard-deletion.
-- ----------------------------------------------------------------------------
ALTER TABLE regulatory_retention_policy ENABLE ROW LEVEL SECURITY;

-- Deliberately no SELECT policy for authenticated users. If a future doctor-
-- facing surface needs to read "how long are my recordings kept?", it should
-- go through a server-side read endpoint (Plan 02 admin-preview route) that
-- filters to the caller's (country, specialty), rather than exposing the raw
-- table.

COMMENT ON TABLE regulatory_retention_policy IS
    'Per-country/per-specialty clinical-recording retention policy. Drives the nightly archival worker. See task-34-regulatory-retention-policy-and-archival-worker.md.';
COMMENT ON COLUMN regulatory_retention_policy.country_code IS
    'ISO 3166-1 alpha-2, or ''*'' for the international fallback row.';
COMMENT ON COLUMN regulatory_retention_policy.specialty IS
    'Specialty key matching doctor_settings.specialty, or ''*'' for any-specialty within the country.';
COMMENT ON COLUMN regulatory_retention_policy.retention_years IS
    'Hard-delete threshold in whole years since consultation_sessions.actual_ended_at. Must be > 0.';
COMMENT ON COLUMN regulatory_retention_policy.retention_until_age IS
    'Optional retention-until-patient-age override (e.g. 21 for pediatrics in India). When set AND patient DOB is known, the worker defers hard-delete to max(session_end+years, dob+age).';
COMMENT ON COLUMN regulatory_retention_policy.patient_self_serve_days IS
    'Patient self-serve replay TTL in days since session end. Default 90 matches Decision 4 LOCKED.';
COMMENT ON COLUMN regulatory_retention_policy.source IS
    'Human-readable regulator citation / memo URL. Surfaced in archival_history.deletion_reason.';
COMMENT ON COLUMN regulatory_retention_policy.effective_from IS
    'Policy active from this date (inclusive). Used for versioning; newest-effective wins.';
COMMENT ON COLUMN regulatory_retention_policy.effective_until IS
    'Policy active until this date (exclusive), or NULL if currently in force.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
