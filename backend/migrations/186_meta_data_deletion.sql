-- ============================================================================
-- 186_meta_data_deletion.sql
-- instagram-launch-readiness · ilr-02 — make the Meta data-deletion callback
-- real: map the callback to a connected doctor and record every request.
-- Date:    2026-07-25
-- ============================================================================
-- Purpose:
--   Meta POSTs a signed_request to /data-deletion-callback when a person who
--   authorized the app via Facebook Login removes it. In Clariva the ONLY
--   Facebook-Login authorizer is the DOCTOR (they run the OAuth connect flow;
--   patients merely DM and never authorize the app). So the callback's
--   `user_id` is the doctor's Facebook (app-scoped) user id.
--
--   To honor a deletion we must (a) map `user_id` -> the doctor and (b) remove
--   the Meta-derived data we hold for them (their `doctor_instagram` row: page
--   token, username, page/user ids). This migration lands the two things the
--   code needs:
--
--     1. doctor_instagram.facebook_user_id — captured at connect so the
--        callback can reverse-map user_id -> doctor_id.
--     2. meta_data_deletion_requests — durable, service-role-only audit of
--        each request (confirmation_code, status) so the status URL Meta shows
--        the user reflects REAL progress, not a random code.
--
--   Patient IG-scoped PHI (patients / conversations / messages / comment_leads)
--   is deliberately OUT OF SCOPE here: patients do not authorize the app, so
--   this callback does not fire for them. Patient-initiated erasure keeps its
--   own path (account-deletion-worker). See ilr-02 Scope Guard.
--
-- Pattern:
--   Additive only. New nullable column + new table mirror Migrations 011
--   (doctor_instagram) and 183 (doctor_verification). CREATE ... IF NOT EXISTS
--   + DROP POLICY IF EXISTS / CREATE POLICY make re-runs idempotent. Reuses
--   `update_updated_at_column()` from Migration 001.
--
-- RLS:
--   · doctor_instagram — UNCHANGED (existing policies from 011 still apply).
--     facebook_user_id is just another column doctors already read on their own
--     row; no policy change needed.
--   · meta_data_deletion_requests — RLS ENABLED with NO policies. This is a
--     compliance/ops record about Meta identifiers, not something any doctor or
--     patient should read via PostgREST. With RLS on and zero policies, every
--     `anon` / `authenticated` request is denied by default; only the
--     service-role backend (which bypasses RLS) reads/writes it. The status
--     endpoint therefore serves it via the service-role client.
--
-- Safety:
--   · Purely additive — no existing column/row/policy is altered or dropped.
--   · facebook_user_id is NULL for every pre-existing connection; it is
--     backfilled naturally on the doctor's next connect/reconnect. A NULL
--     value simply means "we cannot reverse-map this legacy row yet" — the
--     callback records `no_match` for it, which is the correct, safe outcome.
--   · Reverse migration documented at the file foot.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. doctor_instagram.facebook_user_id — reverse-map for the deletion callback
--
-- The value is the Facebook (app-scoped) user id already fetched during
-- connect by exchangeCodeForShortLivedToken() and previously discarded.
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_instagram
  ADD COLUMN IF NOT EXISTS facebook_user_id TEXT NULL;

COMMENT ON COLUMN doctor_instagram.facebook_user_id IS
  'Facebook app-scoped user id of the doctor who authorized the app via '
  'Facebook Login (captured at connect). Used to reverse-map a Meta '
  'data-deletion callback (signed_request.user_id) -> this doctor. NULL for '
  'connections made before ilr-02; backfilled on next reconnect.';

-- Reverse lookup user_id -> doctor. Partial: only rows that carry the id.
CREATE INDEX IF NOT EXISTS idx_doctor_instagram_facebook_user_id
  ON doctor_instagram(facebook_user_id)
  WHERE facebook_user_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. meta_data_deletion_requests — durable audit of each Meta deletion request
--
-- confirmation_code is the natural key: it is unique, is what Meta echoes to
-- the user, and is what the status endpoint looks up. No surrogate uuid needed.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_data_deletion_requests (
  confirmation_code   TEXT PRIMARY KEY,
  -- Facebook app-scoped user id from the signed_request. A Meta identifier
  -- (personal data, not PHI). NEVER log its value; store for audit + mapping.
  meta_user_id        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received', 'completed', 'no_match', 'failed')),
  -- Doctor we disconnected, when the user_id mapped to one. ON DELETE SET NULL
  -- so the compliance record survives the doctor's own account deletion.
  matched_doctor_id   UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Short machine-readable note (e.g. 'disconnected doctor_instagram',
  -- 'no connection for user_id'). NEVER PHI.
  detail              TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ NULL
);

-- Audit: list every request seen for a given Meta user_id.
CREATE INDEX IF NOT EXISTS idx_meta_data_deletion_requests_meta_user_id
  ON meta_data_deletion_requests(meta_user_id);

COMMENT ON TABLE meta_data_deletion_requests IS
  'instagram-launch-readiness (ilr-02). One row per Meta data-deletion '
  'callback. Keyed by the confirmation_code Meta echoes to the user; the '
  'status endpoint reads it to show REAL progress. RLS is ENABLED with NO '
  'policies: anon/authenticated are denied by default and only the '
  'service-role backend reads/writes it. Never log meta_user_id.';

-- ----------------------------------------------------------------------------
-- 3. RLS — enabled, no policies (service-role only; deny all others)
-- ----------------------------------------------------------------------------
ALTER TABLE meta_data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. updated_at trigger (reuse update_updated_at_column from Migration 001)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS meta_data_deletion_requests_updated_at ON meta_data_deletion_requests;
CREATE TRIGGER meta_data_deletion_requests_updated_at
  BEFORE UPDATE ON meta_data_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling). Safe to
-- revert only if you accept losing the deletion audit trail. Dropping
-- facebook_user_id after go-live would break the callback's reverse-map:
--
--   DROP TRIGGER IF EXISTS meta_data_deletion_requests_updated_at
--     ON meta_data_deletion_requests;
--   DROP TABLE IF EXISTS meta_data_deletion_requests;
--   DROP INDEX IF EXISTS idx_doctor_instagram_facebook_user_id;
--   ALTER TABLE doctor_instagram DROP COLUMN IF EXISTS facebook_user_id;
-- ============================================================================
