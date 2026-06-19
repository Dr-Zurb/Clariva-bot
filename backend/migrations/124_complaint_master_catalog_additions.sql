-- ============================================================================
-- 124_complaint_master_catalog_additions.sql
-- subjective-tab · Phase 2 follow-up (subj-14 audit)
-- Date: 2026-06-07
-- ============================================================================
-- Adds six more high-frequency presentations flagged as missing in the audit,
-- all in patient language (lay phrasing lives in `synonyms` so search resolves
-- "blocked ear", "ringworm", "swollen feet", etc.):
--   Nosebleed      (epistaxis)              -> ent  (card uses bespoke override)
--   Blocked ear    (ear fullness)           -> ear
--   Itchy eyes     (eye allergy)            -> eye
--   Stye           (swollen eyelid)         -> eye
--   Ringworm       (fungal skin infection)  -> derm
--   Leg swelling   (pedal oedema)           -> default
--
-- Also tidies one routing inconsistency: hair fall belongs with skin (derm).
--
-- Categories use the 16-value set from 122. Idempotent: WHERE NOT EXISTS guard
-- (matches 120/123). Rollback:
--   DELETE FROM complaint_master WHERE lower(name) IN
--     ('nosebleed','blocked ear','itchy eyes','stye','ringworm','leg swelling');
--   UPDATE complaint_master SET category = 'default' WHERE lower(name) = 'hair fall';
-- ============================================================================

INSERT INTO complaint_master (name, synonyms, category)
SELECT v.name, v.synonyms, v.category
FROM (VALUES
  ('Nosebleed',
   '{epistaxis,nose bleed,nose bleeding,bleeding from nose,blood from nose,blood coming from nose}'::text[],
   'ent'),
  ('Blocked ear',
   '{ear fullness,ear blocked,clogged ear,ear congestion,plugged ear,ear feels full,ear pressure}'::text[],
   'ear'),
  ('Itchy eyes',
   '{eye itching,itchy eye,itching in eyes,eyes itching,eye allergy}'::text[],
   'eye'),
  ('Stye',
   '{swollen eyelid,eyelid swelling,hordeolum,boil on eyelid,lump on eyelid,swelling on eyelid}'::text[],
   'eye'),
  ('Ringworm',
   '{fungal infection,fungal skin infection,dhobie itch,jock itch,tinea,ring shaped rash,itchy round patch}'::text[],
   'derm'),
  ('Leg swelling',
   '{swollen legs,swollen feet,swollen ankles,ankle swelling,pedal edema,pedal oedema,feet swelling,swelling in legs}'::text[],
   'default')
) AS v(name, synonyms, category)
WHERE NOT EXISTS (
  SELECT 1 FROM complaint_master c WHERE lower(c.name) = lower(v.name)
);

-- ---------- ROUTING TIDY-UP ----------
-- Hair fall is a dermatology complaint, not generic OLDCARTS.
UPDATE complaint_master SET category = 'derm'
WHERE lower(name) IN ('hair fall', 'hair loss');
