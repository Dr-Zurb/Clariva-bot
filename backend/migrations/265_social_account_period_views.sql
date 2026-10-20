-- ============================================================================
-- 265_social_account_period_views.sql
-- social-assist · phase 10
-- Date: 2026-10-19
-- ============================================================================
-- Purpose:
--   Instagram returns account views as one total for the period, not as a
--   day-by-day series. Store that total beside reach so the Views tile can show.
--
-- Safety:
--   Additive. Empty cells stay unmeasured.
--
-- Reverse migration (document only):
--   ALTER TABLE social_account_reach DROP COLUMN IF EXISTS views;
--   ALTER TABLE social_account_reach DROP COLUMN IF EXISTS previous_views;
-- ============================================================================

ALTER TABLE social_account_reach
  ADD COLUMN IF NOT EXISTS views INTEGER,
  ADD COLUMN IF NOT EXISTS previous_views INTEGER;

COMMENT ON COLUMN social_account_reach.views IS
  'Phase 10: Instagram view total for this span. Not a sum of daily reach.';

COMMENT ON COLUMN social_account_reach.previous_views IS
  'Phase 10: Instagram view total for the previous span of the same length.';
