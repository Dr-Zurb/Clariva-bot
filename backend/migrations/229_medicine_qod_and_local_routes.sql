-- ============================================================================
-- 229_medicine_qod_and_local_routes.sql
-- Widen medicine frequency / route CHECKs for alternate-day + eye/ear.
-- Date:    2026-09-06
-- ============================================================================
-- Purpose:
--   Clinic shorthand "qod" / "alternate days" and eye-vs-ear drops have
--   nowhere to land today. This migration only widens existing CHECKs.
--
--   frequency_code += QOD
--     - patient_medications (already has interval Q4H…QW from 136)
--     - prescription_medicines (still on the 090 set; QOD only)
--
--   route_code += ophthalmic | otic
--     - prescription_medicines only (patient_medications has no route_code)
--
-- Hard-rules:
--   - CHECK widen only. No new columns. No backfill. RLS unchanged.
--   - App unions / Zod / display labels / parser aliases are a follow-up:
--     until those accept QOD / ophthalmic / otic, the UI cannot persist them.
--
-- Rollback (document only):
--   After deleting any rows that used the new values:
--   restore the prior IN-lists from 136 (patient_medications frequency)
--   and 090 (prescription_medicines frequency + route).
-- ============================================================================

ALTER TABLE patient_medications
  DROP CONSTRAINT IF EXISTS patient_medications_frequency_code_check;
ALTER TABLE patient_medications
  ADD CONSTRAINT patient_medications_frequency_code_check
  CHECK (
    frequency_code IS NULL
    OR frequency_code IN (
      'OD','BID','TID','QID','QHS','PRN','STAT','CUSTOM',
      'Q4H','Q6H','Q8H','Q12H','Q24H','QW',
      'QOD'
    )
  );

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_frequency_code_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_frequency_code_check
  CHECK (
    frequency_code IS NULL
    OR frequency_code IN (
      'OD','BID','TID','QID','QHS','PRN','STAT','CUSTOM',
      'QOD'
    )
  );

ALTER TABLE prescription_medicines
  DROP CONSTRAINT IF EXISTS prescription_medicines_route_code_check;
ALTER TABLE prescription_medicines
  ADD CONSTRAINT prescription_medicines_route_code_check
  CHECK (
    route_code IS NULL
    OR route_code IN (
      'oral','IV','IM','SC','topical','inhaled','rectal','nasal','sublingual','other',
      'ophthalmic','otic'
    )
  );

COMMENT ON COLUMN patient_medications.frequency_code IS
  'Structured frequency (OD/BID/…/PRN/Q4H…QW/QOD). Legacy `frequency` carries readable label.';

COMMENT ON COLUMN prescription_medicines.frequency_code IS
  'Structured frequency (OD/BID/…/CUSTOM/QOD). Legacy `frequency` carries readable label.';

COMMENT ON COLUMN prescription_medicines.route_code IS
  'Structured route (oral/IV/IM/SC/topical/inhaled/rectal/nasal/sublingual/ophthalmic/otic/other).';
