-- ============================================================================
-- 227_consultation_transcripts_provider_groq.sql
-- Cost-cut stack step 5 — English STT via Groq Whisper Large v3 Turbo.
-- Date:    2026-09-04
-- ============================================================================
-- Purpose:
--   Widen consultation_transcripts.provider so English rows can persist
--   as groq_whisper. Hindi stays deepgram_nova_2. openai_whisper remains
--   valid (fallback when GROQ_API_KEY is unset; existing rows).
--
-- Hard-rules:
--   - CHECK widen only. No new columns. No backfill.
--   - RLS unchanged (service-role + existing 068 participant read).
--   - Unique (consultation_session_id, provider) is unchanged — a session
--     can hold both an old openai_whisper row and a new groq_whisper row.
--
-- Rollback (document only):
--   DELETE FROM consultation_transcripts WHERE provider = 'groq_whisper';
--   ALTER TABLE consultation_transcripts
--     DROP CONSTRAINT IF EXISTS consultation_transcripts_provider_check;
--   ALTER TABLE consultation_transcripts
--     ADD CONSTRAINT consultation_transcripts_provider_check
--     CHECK (provider IN ('openai_whisper', 'deepgram_nova_2'));
-- ============================================================================

ALTER TABLE consultation_transcripts
  DROP CONSTRAINT IF EXISTS consultation_transcripts_provider_check;

ALTER TABLE consultation_transcripts
  ADD CONSTRAINT consultation_transcripts_provider_check
  CHECK (provider IN ('openai_whisper', 'deepgram_nova_2', 'groq_whisper'));

COMMENT ON COLUMN consultation_transcripts.provider IS
  'openai_whisper | deepgram_nova_2 | groq_whisper. See voice-transcription-service.ts#selectProvider.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged. Existing whisper / nova-2 rows untouched.
-- ============================================================================
