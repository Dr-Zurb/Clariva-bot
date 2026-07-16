-- ============================================================================
-- 162_diagnosis_catalog.sql
-- assessment-tab · Wave 6 · task asmt-06 (ICD-coded diagnosis entry)
-- Date: 2026-07-11
-- ============================================================================
-- Read-only ICD-11 reference lookup that powers <DiagnosisAutocomplete> and,
-- later (Wave 7), constrains the gated AI diagnosis resolver (the catalog is
-- the whitelist — the model may never surface a code absent from this table).
--
-- Vocabulary: WHO ICD-11 MMS (Mortality and Morbidity Statistics). Codes are
-- stem/category codes from the MMS linearization; post-coordination + child
-- codes (e.g. BA00.0) are intentionally NOT seeded here — this is a curated
-- common-OPD subset meant to be EXPANDABLE, not a full MMS import. Titles use
-- the WHO canonical spelling. Reconcile against the live WHO ICD-11 browser
-- (https://icd.who.int/browse11) before any statutory / insurance reporting.
--
-- Licence: ICD-11 is published by WHO under CC BY-ND 3.0 IGO.
--
-- Refresh story: today the seed is hand-curated + idempotent (re-run adds only
-- missing codes, keyed on lower(code)). A later enhancement may sync from the
-- WHO ICD-11 API; the table shape is designed to absorb that without change.
--
-- PHI: NONE. This is a public code list — it holds no patient data. Rows carry
--   nothing doctor- or patient-identifying, so the table is globally readable
--   by any authenticated session (mirrors `complaint_master`, migration 117).
--   The diagnosis LABEL a doctor writes stays PHI and lives on
--   `prescriptions.diagnoses_json` (migration 161); this table only stores the
--   canonical code/title the row may reference.
--
-- Idempotency: CREATE TABLE/INDEX/POLICY IF NOT EXISTS + seed guarded by
--   `WHERE NOT EXISTS (… lower(code) …)`. Re-running is a no-op.
--
-- Rollback (documented only — not shipped as a separate migration):
--   DROP TABLE IF EXISTS diagnosis_catalog CASCADE;
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS diagnosis_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL,
  title       TEXT NOT NULL,
  synonyms    TEXT[] NOT NULL DEFAULT '{}',
  chapter     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE diagnosis_catalog IS
  'Curated ICD-11 (MMS) diagnosis lookup; powers DiagnosisAutocomplete and constrains the Wave 7 AI resolver. Public code list — NON-PHI, globally readable. assessment-tab / asmt-06.';
COMMENT ON COLUMN diagnosis_catalog.code IS 'ICD-11 MMS stem code (e.g. BA00). Whitelist key for the AI resolver (asmt-07).';
COMMENT ON COLUMN diagnosis_catalog.title IS 'WHO canonical ICD-11 title (e.g. Essential hypertension).';
COMMENT ON COLUMN diagnosis_catalog.synonyms IS 'Alternate labels / vernacular searched by the autocomplete (e.g. sugar → diabetes).';
COMMENT ON COLUMN diagnosis_catalog.chapter IS 'Optional grouping label for display (not the WHO chapter number).';

-- `code` is the whitelist key — enforce uniqueness (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_diagnosis_catalog_code_lower
  ON diagnosis_catalog (lower(code));

CREATE INDEX IF NOT EXISTS idx_diagnosis_catalog_title_trgm
  ON diagnosis_catalog USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_diagnosis_catalog_title_prefix
  ON diagnosis_catalog (lower(title) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_diagnosis_catalog_synonyms_gin
  ON diagnosis_catalog USING gin (synonyms);

DROP TRIGGER IF EXISTS update_diagnosis_catalog_updated_at ON diagnosis_catalog;
CREATE TRIGGER update_diagnosis_catalog_updated_at
  BEFORE UPDATE ON diagnosis_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE diagnosis_catalog ENABLE ROW LEVEL SECURITY;

-- Non-PHI public code list: readable by any authenticated session (no
-- per-doctor scoping). Mirrors complaint_master (migration 117). No INSERT /
-- UPDATE / DELETE policy — the table is seeded by migration only.
DROP POLICY IF EXISTS diagnosis_catalog_read_all ON diagnosis_catalog;
CREATE POLICY diagnosis_catalog_read_all
  ON diagnosis_catalog FOR SELECT
  USING (true);

-- ============================================================================
-- Seed — curated common-OPD ICD-11 (MMS) subset (idempotent, keyed on code).
-- Synonyms carry vernacular / abbreviations so patient phrasing resolves
-- ("sugar" → diabetes, "BP high" → hypertension); they also ground the Wave 7
-- AI resolver. EXPANDABLE: add rows here (or via a later WHO-API sync).
-- ============================================================================
INSERT INTO diagnosis_catalog (code, title, synonyms, chapter)
SELECT v.code, v.title, v.synonyms, v.chapter
FROM (VALUES
  -- Circulatory
  ('BA00', 'Essential hypertension', '{hypertension,high blood pressure,HTN,BP high,high BP,raised BP}'::text[], 'Circulatory'),
  ('BA01', 'Hypertensive heart disease', '{}'::text[], 'Circulatory'),
  ('BA40', 'Angina pectoris', '{angina,cardiac chest pain}'::text[], 'Circulatory'),
  ('BA41', 'Acute myocardial infarction', '{heart attack,MI,myocardial infarction}'::text[], 'Circulatory'),
  -- Endocrine / metabolic
  ('5A11', 'Type 2 diabetes mellitus', '{T2DM,type 2 diabetes,sugar,high sugar,diabetes,DM}'::text[], 'Endocrine / metabolic'),
  ('5A10', 'Type 1 diabetes mellitus', '{T1DM,type 1 diabetes,juvenile diabetes}'::text[], 'Endocrine / metabolic'),
  ('5A00', 'Hypothyroidism', '{underactive thyroid,low thyroid,thyroid low}'::text[], 'Endocrine / metabolic'),
  ('5A02', 'Thyrotoxicosis', '{hyperthyroidism,overactive thyroid,thyroid high}'::text[], 'Endocrine / metabolic'),
  ('5C80', 'Hyperlipoproteinaemia', '{dyslipidaemia,dyslipidemia,high cholesterol,hyperlipidaemia,hyperlipidemia}'::text[], 'Endocrine / metabolic'),
  ('5B81', 'Obesity', '{overweight}'::text[], 'Endocrine / metabolic'),
  ('5B57', 'Vitamin D deficiency', '{low vitamin d,vit d deficiency}'::text[], 'Endocrine / metabolic'),
  -- Blood
  ('3A00', 'Iron deficiency anaemia', '{anaemia,anemia,low haemoglobin,low hb,iron deficiency}'::text[], 'Blood'),
  ('3A9Z', 'Anaemias or other erythrocyte disorders, unspecified', '{anaemia unspecified,anemia unspecified}'::text[], 'Blood'),
  -- Respiratory
  ('CA23', 'Asthma', '{bronchial asthma,reactive airway disease}'::text[], 'Respiratory'),
  ('CA22', 'Chronic obstructive pulmonary disease', '{COPD,emphysema,chronic bronchitis}'::text[], 'Respiratory'),
  ('CA40', 'Pneumonia', '{chest infection,lung infection}'::text[], 'Respiratory'),
  ('CA42', 'Acute bronchitis', '{bronchitis}'::text[], 'Respiratory'),
  ('CA07', 'Acute upper respiratory infections of multiple and unspecified sites', '{URI,URTI,common cold,viral cold,cold,cold and cough}'::text[], 'Respiratory'),
  ('CA02', 'Acute pharyngitis', '{sore throat,throat infection}'::text[], 'Respiratory'),
  ('CA03', 'Acute tonsillitis', '{tonsillitis}'::text[], 'Respiratory'),
  ('CA01', 'Acute sinusitis', '{sinusitis,sinus,sinus infection}'::text[], 'Respiratory'),
  ('CA0A', 'Chronic rhinosinusitis', '{chronic sinusitis}'::text[], 'Respiratory'),
  ('CA05', 'Acute laryngitis or tracheitis', '{laryngitis,hoarseness,tracheitis}'::text[], 'Respiratory'),
  ('CA08', 'Vasomotor or allergic rhinitis', '{allergic rhinitis,nasal allergy,hay fever}'::text[], 'Respiratory'),
  -- Ear
  ('AB00', 'Acute otitis media', '{ear infection,middle ear infection}'::text[], 'Ear'),
  ('AA42', 'Impacted cerumen', '{ear wax,wax,cerumen}'::text[], 'Ear'),
  -- Eye
  ('9A60', 'Conjunctivitis', '{pink eye,red eye,eye infection}'::text[], 'Eye'),
  -- Digestive
  ('DA22', 'Gastro-oesophageal reflux disease', '{GERD,acid reflux,heartburn,acidity,reflux}'::text[], 'Digestive'),
  ('DA42', 'Gastritis', '{stomach inflammation,acidity}'::text[], 'Digestive'),
  ('DA60', 'Gastric ulcer', '{stomach ulcer}'::text[], 'Digestive'),
  ('DA63', 'Duodenal ulcer', '{peptic ulcer}'::text[], 'Digestive'),
  ('DD91', 'Irritable bowel syndrome or certain specified functional bowel disorders', '{IBS,irritable bowel}'::text[], 'Digestive'),
  ('DB60', 'Haemorrhoids', '{piles,hemorrhoids,haemorrhoids}'::text[], 'Digestive'),
  ('DB92', 'Non-alcoholic fatty liver disease', '{fatty liver,NAFLD}'::text[], 'Digestive'),
  -- Skin
  ('EA80', 'Atopic eczema', '{eczema,atopic dermatitis}'::text[], 'Skin'),
  ('EA81', 'Seborrhoeic dermatitis and related conditions', '{seborrhoeic dermatitis,dandruff}'::text[], 'Skin'),
  ('EK00', 'Allergic contact dermatitis', '{contact dermatitis,allergic dermatitis}'::text[], 'Skin'),
  ('EK02', 'Irritant contact dermatitis', '{irritant dermatitis}'::text[], 'Skin'),
  ('ED80', 'Acne', '{pimples,acne vulgaris}'::text[], 'Skin'),
  ('EB00', 'Spontaneous urticaria', '{urticaria,hives,allergic rash}'::text[], 'Skin'),
  ('1F28', 'Dermatophytosis', '{ringworm,tinea,fungal infection}'::text[], 'Infections'),
  ('1G04', 'Scabies', '{itch mite,scabies}'::text[], 'Infections'),
  ('1F00', 'Herpes simplex infections', '{herpes,cold sore}'::text[], 'Infections'),
  -- Musculoskeletal
  ('FA01', 'Osteoarthritis of knee', '{knee OA,knee arthritis,osteoarthritis}'::text[], 'Musculoskeletal'),
  ('FA20', 'Rheumatoid arthritis', '{RA}'::text[], 'Musculoskeletal'),
  ('FA25', 'Gout', '{gouty arthritis}'::text[], 'Musculoskeletal'),
  ('ME84', 'Spinal pain', '{back pain,low back pain,backache,lumbago,LBA,neck pain}'::text[], 'Musculoskeletal'),
  ('8B93', 'Radiculopathy', '{sciatica,nerve root compression,pinched nerve}'::text[], 'Neurology'),
  -- Neurology
  ('8A80', 'Migraine', '{migraine headache}'::text[], 'Neurology'),
  ('8A81', 'Tension-type headache', '{tension headache,headache}'::text[], 'Neurology'),
  -- Mental health
  ('6A70', 'Single episode depressive disorder', '{depression,depressive episode}'::text[], 'Mental health'),
  ('6A71', 'Recurrent depressive disorder', '{recurrent depression}'::text[], 'Mental health'),
  ('6B00', 'Generalised anxiety disorder', '{GAD,anxiety,anxiety disorder}'::text[], 'Mental health'),
  ('6B01', 'Panic disorder', '{panic attacks}'::text[], 'Mental health'),
  -- Genitourinary
  ('GC08', 'Urinary tract infection, site not specified', '{UTI,urine infection,burning urination,dysuria}'::text[], 'Genitourinary'),
  -- Infections (India-relevant febrile illness)
  ('1D2Z', 'Dengue, unspecified', '{dengue,dengue fever}'::text[], 'Infections'),
  ('1D20', 'Dengue without warning signs', '{dengue}'::text[], 'Infections'),
  ('1F4Z', 'Malaria, unspecified', '{malaria}'::text[], 'Infections'),
  ('1F41', 'Malaria due to Plasmodium vivax', '{vivax malaria}'::text[], 'Infections'),
  ('1F40', 'Malaria due to Plasmodium falciparum', '{falciparum malaria}'::text[], 'Infections'),
  ('1E32', 'Influenza, virus not identified', '{influenza,flu,viral fever}'::text[], 'Infections')
) AS v(code, title, synonyms, chapter)
WHERE NOT EXISTS (
  SELECT 1 FROM diagnosis_catalog d WHERE lower(d.code) = lower(v.code)
);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- NON-PHI reference table (public ICD-11 code list); globally readable RLS.
-- No prescriptions RLS touched. Diagnosis LABELS remain PHI on migration 161's
-- diagnoses_json. Coding is additive metadata on the row and NEVER alters the
-- derived provisional_diagnosis / differential_diagnosis TEXT (ASMT-D4 / D4').
-- ============================================================================
