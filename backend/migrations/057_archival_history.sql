-- ============================================================================
-- 057_archival_history.sql
-- Plan 02 · Task 34
-- Date:    2026-04-19
-- ============================================================================
-- Purpose:
--   Append-only audit trail of every clinical-recording artifact the archival
--   worker has hard-deleted. Never UPDATE-d, never DELETE-d. One row per
--   artifact at the moment the underlying storage object is removed.
--
--   This is the regulator-facing answer to "why is this patient's recording
--   no longer retrievable?" — each row carries:
--     * session_id + artifact_kind + storage_uri — what was deleted
--     * policy_id + deletion_reason              — under which policy + why
--     * deleted_at                               — when
--     * bytes                                    — for ops "how much storage
--                                                   did the worker free?" reports
--
--   No foreign keys: both `recording_artifact_index.id` and
--   `regulatory_retention_policy.id` may themselves be archived / re-versioned
--   by the time a regulator asks. Denormalised `session_id` + `storage_uri`
--   survive. If the policy row was versioned out (effective_until set), we
--   still carry its id so the PR + memo that justified the deletion is
--   traceable.
--
-- Retention of this table itself:
--   * Never pruned. This is our proof of process compliance — DPDP Act 2023
--     §10 + similar laws require demonstrable records-management discipline.
--     If and when ops determines we have 10+ yr of deleted-artifact rows and
--     volume matters, move to a partitioned table or cold-store archive —
--     not a row DELETE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS archival_history (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Not FK'd: the index row is deleted atomically with this row's insert.
    artifact_id     UUID        NOT NULL,

    -- Denormalised so this table stands alone even after consultation_sessions
    -- is (separately) pruned. Kept as UUID NOT NULL — every artifact had a
    -- session when it was written; there is no orphan case.
    session_id     UUID        NOT NULL,

    artifact_kind   TEXT        NOT NULL,

    -- The URI that was passed to storage-service.deleteObject. Useful when a
    -- regulator asks "were you storing this recording in-region" — the URI's
    -- bucket segment encodes region.
    storage_uri     TEXT        NOT NULL,

    -- Informational. NULL if the size was not captured at index-time.
    bytes           BIGINT,

    deleted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Human-readable reason. Convention:
    --   'retention_expired_country=IN_specialty=*_years=3'
    --   'retention_expired_country=IN_specialty=pediatrics_age=21'
    -- Callers build this string from the resolved policy — grep-friendly for
    -- ops dashboards ("how many rows were deleted under pediatric policy").
    deletion_reason TEXT        NOT NULL,

    -- Policy id at deletion time (no FK; the row may be archived / re-versioned).
    -- NULL only when deletion was manual (support-driven) — worker deletions
    -- always set this.
    policy_id       UUID
);

CREATE INDEX IF NOT EXISTS idx_archival_history_session
    ON archival_history(session_id);
CREATE INDEX IF NOT EXISTS idx_archival_history_deleted_at
    ON archival_history(deleted_at DESC);

-- ----------------------------------------------------------------------------
-- RLS: service-role only. This is an audit surface; queries go through a
-- server-side admin endpoint.
-- ----------------------------------------------------------------------------
ALTER TABLE archival_history ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE archival_history IS
    'Append-only audit log of every artifact the archival worker hard-deletes. Never pruned. See task-34-regulatory-retention-policy-and-archival-worker.md.';
COMMENT ON COLUMN archival_history.artifact_id IS
    'Denormalised recording_artifact_index.id at time of deletion. No FK because the index row is deleted atomically with this insert.';
COMMENT ON COLUMN archival_history.deletion_reason IS
    'Grep-friendly reason string, e.g. retention_expired_country=IN_specialty=*_years=3.';
COMMENT ON COLUMN archival_history.policy_id IS
    'regulatory_retention_policy.id at the moment of deletion. No FK: policy rows may be versioned out.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
