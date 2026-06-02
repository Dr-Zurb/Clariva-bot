-- ============================================================================
-- 058_regulatory_retention_policy_seed.sql
-- Plan 02 · Task 34 · Decision 4 LOCKED
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Seed `regulatory_retention_policy` with India-day-one + international
--   fallback rows. Lives in its own migration so legal / owner can edit
--   retention_years values without replaying the schema migration (055).
--
--   Idempotent: ON CONFLICT (country_code, specialty, effective_from) DO
--   NOTHING. Running this migration twice (or re-running after a policy row
--   has been versioned out) is a no-op.
--
-- !!!  OWNER / LEGAL REVIEW REQUIRED BEFORE MERGE  !!!
--   Every value below is illustrative until owner confirms against current
--   Indian regulator guidance + owner's chosen international stance. Wrong
--   values are a compliance failure in both directions:
--     * Over-retention: storage cost + DPDP "data minimisation" issue.
--     * Under-retention: cannot produce records under regulator subpoena.
--   PR reviewer MUST attach the legal-review note to the merge PR body.
--
-- Pediatric rationale (India):
--   * IMC Regulations 2002 baseline is 3 yr from last visit (general medicine).
--   * For minors, Limitation Act 1963 starts the clock at age-of-majority,
--     so "retain until patient is age 21 (majority 18 + 3 yr statute)" is
--     the safe interpretation. Encoded via `retention_until_age = 21`
--     with a bare `retention_years = 3` fallback for when DOB is missing.
--
-- Gynecology rationale (India):
--   * No single authoritative source; commonly cited 7 yr practice norm
--     (obstetric / stillbirth-related records often carry longer windows
--     per state). Owner to verify per-state; v1 ships with 7 yr.
--
-- International fallback:
--   * 7 yr is the conservative median across OECD jurisdictions without
--     specialty-specific overrides. Applies to all (country, specialty)
--     combinations not explicitly seeded.
--
--   Citations are stored in the `source` column (surfaced in
--   archival_history.deletion_reason for auditor traceability).
-- ============================================================================

INSERT INTO regulatory_retention_policy (
    country_code,
    specialty,
    retention_years,
    retention_until_age,
    patient_self_serve_days,
    source,
    effective_from
) VALUES
    (
        'IN',
        '*',
        3,
        NULL,
        90,
        'Indian Medical Council Regulations 2002 §1.3.1 — general baseline (3 yr from last visit). Owner to attach exact URL.',
        '2026-04-19'
    ),
    (
        'IN',
        'pediatrics',
        3,
        21,
        90,
        'IMC Regulations 2002 + Limitation Act 1963 for minors — retain until patient reaches age 21 (majority 18 + 3 yr statute). retention_years=3 is the fallback when patient DOB is unknown at worker run-time. Owner to verify.',
        '2026-04-19'
    ),
    (
        'IN',
        'gynecology',
        7,
        NULL,
        90,
        'Practice norm; obstetric records commonly retained 7+ yr. Verify per state. Owner to confirm and potentially split into ''obstetrics'' vs ''gynecology'' if state law differs.',
        '2026-04-19'
    ),
    (
        '*',
        '*',
        7,
        NULL,
        90,
        'International conservative fallback. Applies when (country, specialty) not explicitly seeded. OECD-median across jurisdictions without specialty overrides.',
        '2026-04-19'
    )
ON CONFLICT (country_code, specialty, effective_from) DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Verify seed after running:
--   SELECT country_code, specialty, retention_years, retention_until_age,
--          patient_self_serve_days, effective_from
--     FROM regulatory_retention_policy
--     ORDER BY country_code, specialty;
-- Expected: 4 rows. If you see fewer, the migration ran partially — re-run
-- (idempotent). If you see more for a given (country, specialty, effective_from),
-- that's a bug — should not be possible given the UNIQUE constraint in 055.
-- ============================================================================
