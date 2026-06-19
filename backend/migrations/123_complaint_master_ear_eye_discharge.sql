-- ============================================================================
-- 123_complaint_master_ear_eye_discharge.sql
-- subjective-tab · Phase 2 follow-up
-- Date: 2026-06-07
-- ============================================================================
-- Adds two high-frequency presentations missing from the patient-language seed
-- (120) and category pass (122): discharge from the ear (otorrhoea) and a
-- discharging / sticky eye (conjunctivitis). Both are common and were absent —
-- the catalog had Ear pain / Hearing loss / Ringing, and Red / Watering eye, but
-- no "fluid/pus coming out" complaint.
--
-- Patients don't say "discharge"; the lay phrasing lives in `synonyms` so search
-- still resolves "pus from ear", "sticky eyes", "crusty eyes", etc. Categories
-- are set directly (the 122 CHECK already allows 'ear'/'eye'); the card then
-- routes them to bespoke discharge schemas (subj-14 review) rather than asking a
-- contradictory "Discharge: none?".
--
-- Idempotent: WHERE NOT EXISTS guard (matches 120). Rollback:
--   DELETE FROM complaint_master WHERE lower(name) IN ('ear discharge','eye discharge');
-- ============================================================================

INSERT INTO complaint_master (name, synonyms, category)
SELECT v.name, v.synonyms, v.category
FROM (VALUES
  ('Ear discharge',
   '{otorrhoea,otorrhea,pus from ear,fluid from ear,discharge from ear,ear leaking,wet ear,water coming from ear}'::text[],
   'ear'),
  ('Eye discharge',
   '{sticky eye,sticky eyes,pus in eye,crusty eyes,gummy eye,gluey eye,discharge from eye,yellow discharge from eye}'::text[],
   'eye')
) AS v(name, synonyms, category)
WHERE NOT EXISTS (
  SELECT 1 FROM complaint_master c WHERE lower(c.name) = lower(v.name)
);
