-- ============================================================================
-- 122_complaint_master_clinical_categories.sql
-- subjective-tab · Phase 2 follow-up (subj-14)
-- Date: 2026-06-06
-- ============================================================================
-- Adds 7 more presentation categories so the card routes away from the generic
-- (de-pained) `default` schema for complaints where OLDCARTS is clinically wrong:
--   eye        — vision / red eye / watering / discharge
--   ear        — hearing loss / ringing / ear discharge
--   cardiac    — palpitations / chest discomfort
--   dizziness  — dizziness / vertigo / fainting / loss of consciousness
--   gynae      — irregular/heavy/missed periods / discharge
--   mental     — anxiety / low mood / sleep
--   trauma     — wound / burn / bites / accident / fall injury
--
-- 1. Widens the CHECK constraint to the full 16-value set.
-- 2. Re-tags existing seed rows (from 120/121) into the new categories by name.
--    Names not listed keep their prior category. Idempotent.
-- Rollback:
--   UPDATE complaint_master SET category = 'default'
--     WHERE category IN ('eye','ear','cardiac','dizziness','gynae','mental','trauma');
--   ALTER TABLE complaint_master DROP CONSTRAINT complaint_master_category_check;
--   ALTER TABLE complaint_master ADD CONSTRAINT complaint_master_category_check
--     CHECK (category IN
--       ('pain','fever','cough','git','urinary','respiratory','ent','derm','default'));
-- ============================================================================

ALTER TABLE complaint_master DROP CONSTRAINT IF EXISTS complaint_master_category_check;
ALTER TABLE complaint_master
  ADD CONSTRAINT complaint_master_category_check
  CHECK (category IN (
    'pain', 'fever', 'cough', 'git', 'urinary', 'respiratory', 'ent', 'derm',
    'eye', 'ear', 'cardiac', 'dizziness', 'gynae', 'mental', 'trauma', 'default'
  ));

COMMENT ON COLUMN complaint_master.category IS
  'Schema category consumed by subj-03 (pain/fever/cough/git/urinary/respiratory/ent/derm/eye/ear/cardiac/dizziness/gynae/mental/trauma/default).';

-- ---------- EYE ----------
UPDATE complaint_master SET category = 'eye'
WHERE lower(name) IN (
  'blurred vision', 'double vision', 'red eye', 'watering eye', 'something in eye'
);

-- ---------- EAR ----------
UPDATE complaint_master SET category = 'ear'
WHERE lower(name) IN (
  'hearing loss', 'ringing in ears', 'something in ear'
);

-- ---------- CARDIAC ----------
UPDATE complaint_master SET category = 'cardiac'
WHERE lower(name) IN (
  'heart racing', 'chest discomfort'
);

-- ---------- DIZZINESS ----------
UPDATE complaint_master SET category = 'dizziness'
WHERE lower(name) IN (
  'dizziness', 'spinning sensation', 'fainting', 'loss of consciousness'
);

-- ---------- GYNAE ----------
UPDATE complaint_master SET category = 'gynae'
WHERE lower(name) IN (
  'irregular periods', 'heavy periods', 'missed periods',
  'vaginal discharge', 'white discharge'
);

-- ---------- MENTAL HEALTH / SLEEP ----------
UPDATE complaint_master SET category = 'mental'
WHERE lower(name) IN (
  'anxiety', 'feeling low', 'difficulty sleeping', 'daytime sleepiness'
);

-- ---------- TRAUMA ----------
UPDATE complaint_master SET category = 'trauma'
WHERE lower(name) IN (
  'wound', 'burn', 'insect bite', 'snake bite', 'dog bite',
  'accident injury', 'fall injury'
);
