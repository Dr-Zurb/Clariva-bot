-- ============================================================================
-- 121_complaint_master_category_expansion.sql
-- subjective-tab · Phase 2 follow-up (subj-14)
-- Date: 2026-06-06
-- ============================================================================
-- Expands complaint_master.category beyond pain/fever/cough/default so the
-- card can route to richer, presentation-specific field schemas:
--   git          — vomiting / loose stools / constipation / acidity
--   urinary      — burning / frequency / blood in urine
--   respiratory  — breathlessness / wheeze / chest tightness
--   ent          — cold / blocked nose / sore throat / loss of smell
--   derm         — rash / itching / hives / skin allergy
--
-- 1. Widens the CHECK constraint to the new value set.
-- 2. Re-tags existing seed rows (from 120) into the new categories by name.
--    Names not listed keep their prior category. Idempotent.
-- Rollback:
--   UPDATE complaint_master SET category = 'default'
--     WHERE category IN ('git','urinary','respiratory','ent','derm');
--   ALTER TABLE complaint_master DROP CONSTRAINT complaint_master_category_check;
--   ALTER TABLE complaint_master ADD CONSTRAINT complaint_master_category_check
--     CHECK (category IN ('pain','fever','cough','default'));
-- ============================================================================

ALTER TABLE complaint_master DROP CONSTRAINT IF EXISTS complaint_master_category_check;
ALTER TABLE complaint_master
  ADD CONSTRAINT complaint_master_category_check
  CHECK (category IN (
    'pain', 'fever', 'cough', 'git', 'urinary', 'respiratory', 'ent', 'derm', 'default'
  ));

COMMENT ON COLUMN complaint_master.category IS
  'Schema category consumed by subj-03 (pain/fever/cough/git/urinary/respiratory/ent/derm/default).';

-- ---------- GIT ----------
UPDATE complaint_master SET category = 'git'
WHERE lower(name) IN (
  'nausea', 'vomiting', 'loose stools', 'constipation', 'bloating',
  'loss of appetite', 'difficulty swallowing', 'heartburn', 'acid reflux',
  'acidity', 'burping', 'bleeding from back passage', 'black stools',
  'gas trouble', 'indigestion', 'food poisoning'
);

-- ---------- URINARY ----------
UPDATE complaint_master SET category = 'urinary'
WHERE lower(name) IN (
  'burning urination', 'frequent urination', 'decreased urination',
  'sudden urge to urinate', 'urine leakage', 'blood in urine', 'bedwetting'
);

-- ---------- RESPIRATORY ----------
UPDATE complaint_master SET category = 'respiratory'
WHERE lower(name) IN (
  'shortness of breath', 'chest tightness', 'wheezing'
);

-- ---------- ENT ----------
UPDATE complaint_master SET category = 'ent'
WHERE lower(name) IN (
  'mucus dripping in throat', 'sore throat', 'hoarse voice', 'blocked nose',
  'runny nose', 'sneezing', 'cold', 'loss of smell', 'loss of taste'
);

-- ---------- DERM ----------
UPDATE complaint_master SET category = 'derm'
WHERE lower(name) IN (
  'rash', 'itching', 'hives', 'acne', 'skin allergy', 'boil',
  'dry skin', 'oily skin', 'dark patches on skin', 'sunburn'
);
