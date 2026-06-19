-- ============================================================================
-- 118_doctor_note_favorites.sql
-- subjective-tab · Phase 2 · subj-06
-- Date: 2026-06-03
-- ============================================================================
-- Per-doctor favourite phrases for subjective fields (complaint name, histories,
-- associated symptoms). Ranked by use_count for chip strips.
--
-- Rollback: DROP FUNCTION IF EXISTS increment_doctor_note_favorite_use(UUID, TEXT, TEXT);
--           DROP TABLE IF EXISTS doctor_note_favorites CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_note_favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_key    TEXT NOT NULL CHECK (field_key IN (
    'complaint_name',
    'family_history',
    'social_history',
    'past_surgical_history',
    'complaint_associated'
  )),
  value        TEXT NOT NULL CHECK (length(trim(value)) BETWEEN 1 AND 500),
  value_norm   TEXT GENERATED ALWAYS AS (lower(trim(value))) STORED,
  use_count    INT  NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS doctor_note_favorites_doctor_field_value_idx
  ON doctor_note_favorites (doctor_id, field_key, value_norm);

CREATE INDEX IF NOT EXISTS doctor_note_favorites_rank_idx
  ON doctor_note_favorites (doctor_id, field_key, use_count DESC, last_used_at DESC);

COMMENT ON TABLE doctor_note_favorites IS
  'subj-06: per-doctor subjective note favourites keyed by field_key. Max 30 per field enforced in app layer.';

DROP TRIGGER IF EXISTS update_doctor_note_favorites_updated_at ON doctor_note_favorites;
CREATE TRIGGER update_doctor_note_favorites_updated_at
  BEFORE UPDATE ON doctor_note_favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE doctor_note_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_note_favorites_owner_select ON doctor_note_favorites;
CREATE POLICY doctor_note_favorites_owner_select
  ON doctor_note_favorites FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS doctor_note_favorites_owner_modify ON doctor_note_favorites;
CREATE POLICY doctor_note_favorites_owner_modify
  ON doctor_note_favorites FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE OR REPLACE FUNCTION increment_doctor_note_favorite_use(
  p_doctor_id UUID,
  p_field_key TEXT,
  p_value TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value TEXT := trim(p_value);
BEGIN
  IF v_value = '' THEN
    RETURN;
  END IF;

  INSERT INTO doctor_note_favorites (doctor_id, field_key, value, use_count, last_used_at)
  VALUES (p_doctor_id, p_field_key, v_value, 1, now())
  ON CONFLICT (doctor_id, field_key, value_norm)
  DO UPDATE SET
    use_count = doctor_note_favorites.use_count + 1,
    last_used_at = EXCLUDED.last_used_at,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION increment_doctor_note_favorite_use(UUID, TEXT, TEXT) IS
  'subj-06: atomic use_count++ when a favourite chip is tapped or autocomplete item selected.';
