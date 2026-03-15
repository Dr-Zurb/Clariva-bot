-- Migration: 015_patients_age.sql
-- Date: 2026-03-16
-- Description: Add age column to patients for proper field separation.
--   Prevents concatenating age into name when user sends newline-separated input.

ALTER TABLE patients ADD COLUMN IF NOT EXISTS age INTEGER NULL;
COMMENT ON COLUMN patients.age IS 'Patient age (1-120). Optional; collected with name, phone, etc.';
