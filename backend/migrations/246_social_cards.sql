-- ============================================================================
-- 246_social_cards.sql
-- social-assist · soc-03
-- Date: 2026-10-11
-- ============================================================================
-- Purpose:
--   One marketing card for the signed-in doctor. Column, title, optional
--   format and topic, and the words. Not a patient record. No time, no
--   Instagram URL, no visit count, no file.
--
-- Pattern:
--   Doctor-owned table, same owner policies as doctor_note_favorites.
--   Service role writes still filter by doctor_id. RLS is the second guard.
--
-- Safety:
--   Additive. Re-run safe (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Reverse migration (document only):
--   DROP TABLE IF EXISTS social_cards;
-- ============================================================================

CREATE TABLE IF NOT EXISTS social_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL DEFAULT 'thoughts'
              CHECK (stage IN ('thoughts', 'chosen', 'making', 'ready')),
  title       TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  format      TEXT NULL CHECK (format IS NULL OR format IN ('post', 'reel', 'story')),
  topic       TEXT NULL CHECK (topic IS NULL OR char_length(btrim(topic)) BETWEEN 1 AND 80),
  words       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_cards_words_object CHECK (jsonb_typeof(words) = 'object'),
  CONSTRAINT social_cards_words_no_patient CHECK (
    NOT (
      words ?| ARRAY[
        'patientId',
        'patient_id',
        'patientName',
        'patient_name',
        'name',
        'phone',
        'complaint',
        'diagnosis'
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS social_cards_doctor_updated_idx
  ON social_cards (doctor_id, updated_at DESC);

COMMENT ON TABLE social_cards IS
  'soc-03: doctor marketing card. No patient columns. Do not log title or words.';

DROP TRIGGER IF EXISTS update_social_cards_updated_at ON social_cards;
CREATE TRIGGER update_social_cards_updated_at
  BEFORE UPDATE ON social_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE social_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_cards_owner_select ON social_cards;
CREATE POLICY social_cards_owner_select
  ON social_cards FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS social_cards_owner_modify ON social_cards;
CREATE POLICY social_cards_owner_modify
  ON social_cards FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
