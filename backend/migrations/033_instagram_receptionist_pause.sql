-- Migration: 033_instagram_receptionist_pause.sql
-- RBH-09: Doctor-controlled pause for Instagram DM + comment automation (human handoff).

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS instagram_receptionist_paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS instagram_receptionist_pause_message TEXT NULL;

COMMENT ON COLUMN doctor_settings.instagram_receptionist_paused IS
  'When true, Instagram DM bot and comment auto-DM/public-reply are skipped; optional handoff message sent on DM. RBH-09.';
COMMENT ON COLUMN doctor_settings.instagram_receptionist_pause_message IS
  'Optional custom DM text when paused; null = product default (no immediate-response promise). RBH-09.';
