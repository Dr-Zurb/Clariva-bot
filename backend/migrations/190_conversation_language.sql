-- ============================================================================
-- 190_conversation_language.sql
-- bot-language-policy · lang-02 — persist reply language per DM thread
-- Date:    2026-08-02
-- ============================================================================
-- Purpose:
--   Store the resolved receptionist reply language on conversations so every
--   turn (and out-of-band sender) reads one sticky value instead of
--   re-detecting from the latest message. NULL = undecided → English on the
--   next turn (LANG1-D6). Locale code only — not PHI.
--
-- Pattern:
--   Additive nullable column + idempotent CHECK (mirrors 188_comment_leads
--   platform guard). No DEFAULT — NULL is a meaningful state. No index, no
--   RLS change (existing conversations policies cover the row).
--
-- Safety:
--   Purely additive. Re-run safe (IF NOT EXISTS + pg_constraint guard).
--   Allowed codes match ConversationLanguage in conversation-language.ts
--   (LANG-D7): en | hi | hi-Latn | pa | pa-Latn | other.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. conversations.language
-- ----------------------------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS language TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_language_check'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_language_check
      CHECK (
        language IS NULL
        OR language IN ('en', 'hi', 'hi-Latn', 'pa', 'pa-Latn', 'other')
      );
  END IF;
END $$;

COMMENT ON COLUMN conversations.language IS
  'Resolved reply language for this thread (lang-02). NULL = undecided → English. Locale code, not PHI.';
