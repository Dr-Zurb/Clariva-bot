-- ============================================================================
-- Migration: 032_normalize_legacy_slot_conversation_steps.sql
-- RBH-06: One-time backfill — legacy `selecting_slot` / `confirming_slot` → `awaiting_slot_selection`
--
-- Safe: only touches rows whose metadata.step is legacy; clears keys the DM
-- migration used to clear (slotSelectionDate, slotToConfirm). Slot choice remains
-- in `slot_selections` where applicable.
--
-- Run in Supabase SQL editor or psql after deploy. Verify with:
--   SELECT COUNT(*) FROM conversations
--   WHERE metadata->>'step' IN ('selecting_slot', 'confirming_slot');
--   (expect 0 after migration + worker normalize)
-- ============================================================================

UPDATE conversations
SET metadata = (
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'step',
    'awaiting_slot_selection',
    'updatedAt',
    to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
) - 'slotSelectionDate' - 'slotToConfirm'
WHERE metadata->>'step' IN ('selecting_slot', 'confirming_slot');

-- ============================================================================
-- Migration complete
-- ============================================================================
