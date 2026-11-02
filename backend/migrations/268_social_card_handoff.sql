-- ============================================================================
-- 268_social_card_handoff.sql
-- social-assist · soc-31, soc-32
-- Date: 2026-10-31
-- ============================================================================
-- Purpose:
--   A Making card can be handed to a named person. The name is a label, not a
--   login. Messages on that card are the doctor's instructions about the
--   video. They are not a patient record and they do not change the file.
--
-- Reverse migration (document only):
--   DROP TABLE IF EXISTS social_card_turns;
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_handoff_stage;
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_handoff_pair;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS handoff;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS editor_name;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS editor_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS handoff TEXT NULL;

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_editor_name_len;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_editor_name_len
  CHECK (editor_name IS NULL OR char_length(btrim(editor_name)) BETWEEN 1 AND 80);

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_handoff_value;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_handoff_value
  CHECK (handoff IS NULL OR handoff = 'with_editor');

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_handoff_pair;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_handoff_pair
  CHECK ((handoff IS NULL) = (editor_name IS NULL));

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_handoff_stage;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_handoff_stage
  CHECK (handoff IS NULL OR stage = 'making');

COMMENT ON COLUMN social_cards.editor_name IS
  'Display name of the person cutting this Making card. Not a login. Do not log it.';

COMMENT ON COLUMN social_cards.handoff IS
  'with_editor while a Making card is handed over. Null otherwise. Do not log the name.';

CREATE TABLE IF NOT EXISTS social_card_turns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id     UUID NOT NULL REFERENCES social_cards(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  at_ms       INTEGER NULL CHECK (at_ms IS NULL OR at_ms >= 0),
  end_ms      INTEGER NULL CHECK (end_ms IS NULL OR end_ms >= 0),
  scrap_id    UUID NULL REFERENCES social_card_scraps(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_card_turns_range CHECK (
    end_ms IS NULL OR (at_ms IS NOT NULL AND end_ms > at_ms)
  )
);

CREATE INDEX IF NOT EXISTS social_card_turns_card_idx
  ON social_card_turns (card_id, created_at);

COMMENT ON TABLE social_card_turns IS
  'soc-32: doctor instruction about a Making card video. Do not log body.';

ALTER TABLE social_card_turns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_card_turns_owner_select ON social_card_turns;
CREATE POLICY social_card_turns_owner_select
  ON social_card_turns FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS social_card_turns_owner_modify ON social_card_turns;
CREATE POLICY social_card_turns_owner_modify
  ON social_card_turns FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
