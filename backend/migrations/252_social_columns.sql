-- ============================================================================
-- 252_social_columns.sql
-- social-assist · soc-20
-- Date: 2026-10-12
-- ============================================================================
-- Purpose:
--   Columns the doctor names, kept before Ready. The four opening columns
--   stay. A posted card is not in a column. Do not log a column name.
--
-- Safety:
--   Additive. Existing cards keep their stage. Opening columns are seeded
--   for doctors who already have cards. A custom stage cannot hold a file:
--   the Ready check already requires every other stage to have none.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS column_id;
--   DROP TABLE IF EXISTS social_columns;
-- ============================================================================

CREATE TABLE IF NOT EXISTS social_columns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('thoughts', 'chosen', 'making', 'ready', 'custom')),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  position    INTEGER NOT NULL CHECK (position >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, position)
);

CREATE UNIQUE INDEX IF NOT EXISTS social_columns_one_opening_idx
  ON social_columns (doctor_id, kind)
  WHERE kind <> 'custom';

COMMENT ON TABLE social_columns IS
  'soc-20: doctor board columns. Do not log the name.';

DROP TRIGGER IF EXISTS update_social_columns_updated_at ON social_columns;
CREATE TRIGGER update_social_columns_updated_at
  BEFORE UPDATE ON social_columns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE social_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_columns_owner_select ON social_columns;
CREATE POLICY social_columns_owner_select
  ON social_columns FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS social_columns_owner_modify ON social_columns;
CREATE POLICY social_columns_owner_modify
  ON social_columns FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

DO $$
DECLARE
  existing text;
BEGIN
  FOR existing IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'social_cards'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%stage IN (%'
  LOOP
    EXECUTE format('ALTER TABLE social_cards DROP CONSTRAINT %I', existing);
  END LOOP;
END $$;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_stage_check
  CHECK (stage IN ('thoughts', 'chosen', 'making', 'ready', 'custom', 'posted'));

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS column_id UUID NULL REFERENCES social_columns(id) ON DELETE RESTRICT;

COMMENT ON COLUMN social_cards.column_id IS
  'soc-20: which column this card sits in. Null when the card is posted. Do not log a column name.';

INSERT INTO social_columns (doctor_id, kind, name, position)
SELECT doctor_id, 'thoughts', 'Thoughts and ideas', 0
FROM (SELECT DISTINCT doctor_id FROM social_cards) doctors
WHERE NOT EXISTS (
  SELECT 1 FROM social_columns existing
  WHERE existing.doctor_id = doctors.doctor_id AND existing.kind = 'thoughts'
);

INSERT INTO social_columns (doctor_id, kind, name, position)
SELECT doctor_id, 'chosen', 'Chosen', 1
FROM (SELECT DISTINCT doctor_id FROM social_cards) doctors
WHERE NOT EXISTS (
  SELECT 1 FROM social_columns existing
  WHERE existing.doctor_id = doctors.doctor_id AND existing.kind = 'chosen'
);

INSERT INTO social_columns (doctor_id, kind, name, position)
SELECT doctor_id, 'making', 'Making', 2
FROM (SELECT DISTINCT doctor_id FROM social_cards) doctors
WHERE NOT EXISTS (
  SELECT 1 FROM social_columns existing
  WHERE existing.doctor_id = doctors.doctor_id AND existing.kind = 'making'
);

INSERT INTO social_columns (doctor_id, kind, name, position)
SELECT doctor_id, 'ready', 'Ready', 3
FROM (SELECT DISTINCT doctor_id FROM social_cards) doctors
WHERE NOT EXISTS (
  SELECT 1 FROM social_columns existing
  WHERE existing.doctor_id = doctors.doctor_id AND existing.kind = 'ready'
);

UPDATE social_cards AS card
SET column_id = column_row.id
FROM social_columns AS column_row
WHERE column_row.doctor_id = card.doctor_id
  AND column_row.kind = card.stage
  AND card.stage IN ('thoughts', 'chosen', 'making', 'ready')
  AND card.column_id IS NULL;
