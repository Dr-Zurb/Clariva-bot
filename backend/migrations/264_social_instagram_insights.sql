-- ============================================================================
-- 264_social_instagram_insights.sql
-- social-assist · phase 10
-- Date: 2026-10-19
-- ============================================================================
-- Purpose:
--   Store Instagram's post numbers and one account row per day.
--   The Analytics tab reads these rows. It does not call Instagram.
--   No patient, no comment, no token.
--
-- Safety:
--   Additive. A doctor who has not granted insights keeps the clinic page.
--
-- Reverse migration (document only):
--   DROP TABLE IF EXISTS social_account_reach;
--   DROP TABLE IF EXISTS social_account_days;
--   DROP TABLE IF EXISTS social_card_stats;
--   ALTER TABLE doctor_instagram DROP COLUMN IF EXISTS insights_status;
-- ============================================================================

ALTER TABLE doctor_instagram
  ADD COLUMN IF NOT EXISTS insights_status TEXT;

COMMENT ON COLUMN doctor_instagram.insights_status IS
  'Phase 10: null until a refresh, ready after a granted read, missing when the token cannot read insights. Not a patient field.';

CREATE TABLE IF NOT EXISTS social_card_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES social_cards(id) ON DELETE CASCADE,
  views INTEGER,
  reach INTEGER,
  likes INTEGER,
  comments INTEGER,
  saves INTEGER,
  shares INTEGER,
  watch_ms INTEGER,
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (card_id)
);

CREATE INDEX IF NOT EXISTS social_card_stats_doctor_idx
  ON social_card_stats (doctor_id);

COMMENT ON TABLE social_card_stats IS
  'Phase 10: lifetime Instagram numbers for one card. Empty cells are unmeasured, not zero. No comment text.';

CREATE TABLE IF NOT EXISTS social_account_days (
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  followers INTEGER,
  views INTEGER,
  measured_at TIMESTAMPTZ,
  PRIMARY KEY (doctor_id, day)
);

COMMENT ON TABLE social_account_days IS
  'Phase 10: one account snapshot per day. followers is the count that day. views is the views on that day.';

CREATE TABLE IF NOT EXISTS social_account_reach (
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  span INTEGER NOT NULL CHECK (span IN (7, 30, 90)),
  reach INTEGER,
  previous_reach INTEGER,
  interactions INTEGER,
  previous_interactions INTEGER,
  measured_at TIMESTAMPTZ,
  PRIMARY KEY (doctor_id, span)
);

COMMENT ON TABLE social_account_reach IS
  'Phase 10: reach and interactions for a whole period. Daily reach is not added up.';

ALTER TABLE social_card_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_account_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_account_reach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_card_stats_select_own ON social_card_stats;
CREATE POLICY social_card_stats_select_own
  ON social_card_stats FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS social_account_days_select_own ON social_account_days;
CREATE POLICY social_account_days_select_own
  ON social_account_days FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS social_account_reach_select_own ON social_account_reach;
CREATE POLICY social_account_reach_select_own
  ON social_account_reach FOR SELECT
  USING (doctor_id = auth.uid());
