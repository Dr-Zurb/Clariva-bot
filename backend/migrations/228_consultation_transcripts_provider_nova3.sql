-- ============================================================================
-- 228_consultation_transcripts_provider_nova3.sql
-- Cost-cut stack step 6 — Hindi / Hinglish STT via Deepgram Nova-3.
-- Date:    2026-09-04
-- ============================================================================
-- Purpose:
--   Widen consultation_transcripts.provider so Hindi rows can persist
--   as deepgram_nova_3. deepgram_nova_2 stays valid (in-flight / QA
--   override). English stays groq_whisper / openai_whisper.
--
-- Hard-rules:
--   - CHECK widen only. No new columns. No backfill. RLS unchanged.
--
-- Rollback (document only):
--   DELETE FROM consultation_transcripts WHERE provider = 'deepgram_nova_3';
--   ALTER TABLE consultation_transcripts
--     DROP CONSTRAINT IF EXISTS consultation_transcripts_provider_check;
--   ALTER TABLE consultation_transcripts
--     ADD CONSTRAINT consultation_transcripts_provider_check
--     CHECK (provider IN ('openai_whisper', 'deepgram_nova_2', 'groq_whisper'));
-- ============================================================================

ALTER TABLE consultation_transcripts
  DROP CONSTRAINT IF EXISTS consultation_transcripts_provider_check;

ALTER TABLE consultation_transcripts
  ADD CONSTRAINT consultation_transcripts_provider_check
  CHECK (provider IN (
    'openai_whisper',
    'deepgram_nova_2',
    'groq_whisper',
    'deepgram_nova_3'
  ));

COMMENT ON COLUMN consultation_transcripts.provider IS
  'openai_whisper | deepgram_nova_2 | groq_whisper | deepgram_nova_3. See voice-transcription-service.ts#selectProvider.';
