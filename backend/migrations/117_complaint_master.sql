-- ============================================================================
-- 117_complaint_master.sql
-- subjective-tab · Phase 2 · subj-06
-- Date: 2026-06-03
-- ============================================================================
-- Read-only lookup for complaint autocomplete. Non-PHI; globally readable RLS.
-- Seed: ~150 common OPD presentations with category for subj-03 schema routing.
-- Rollback: DROP TABLE IF EXISTS complaint_master CASCADE;
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS complaint_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  synonyms    TEXT[] NOT NULL DEFAULT '{}',
  category    TEXT NOT NULL CHECK (category IN ('pain', 'fever', 'cough', 'default')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE complaint_master IS 'Curated chief-complaint lookup; powers ComplaintAutocomplete. Non-PHI.';
COMMENT ON COLUMN complaint_master.name IS 'Canonical presentation label (e.g. Headache).';
COMMENT ON COLUMN complaint_master.synonyms IS 'Alternate labels searched in autocomplete.';
COMMENT ON COLUMN complaint_master.category IS 'Schema category consumed by subj-03 (pain/fever/cough/default).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_complaint_master_name_lower
  ON complaint_master (lower(name));

CREATE INDEX IF NOT EXISTS idx_complaint_master_name_trgm
  ON complaint_master USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_complaint_master_name_prefix
  ON complaint_master (lower(name) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_complaint_master_synonyms_gin
  ON complaint_master USING gin (synonyms);

DROP TRIGGER IF EXISTS update_complaint_master_updated_at ON complaint_master;
CREATE TRIGGER update_complaint_master_updated_at
  BEFORE UPDATE ON complaint_master
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE complaint_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS complaint_master_read_all ON complaint_master;
CREATE POLICY complaint_master_read_all
  ON complaint_master FOR SELECT
  USING (true);

-- Seed (idempotent)
INSERT INTO complaint_master (name, synonyms, category)
SELECT v.name, v.synonyms, v.category
FROM (VALUES
  ('Headache', '{cephalgia}'::text[], 'pain'),
  ('Migraine', '{}'::text[], 'pain'),
  ('Tension headache', '{}'::text[], 'pain'),
  ('Cluster headache', '{}'::text[], 'pain'),
  ('Sinus headache', '{}'::text[], 'pain'),
  ('Back pain', '{}'::text[], 'pain'),
  ('Lower back pain', '{LBA,lumbago}'::text[], 'pain'),
  ('Upper back pain', '{}'::text[], 'pain'),
  ('Neck pain', '{}'::text[], 'pain'),
  ('Shoulder pain', '{}'::text[], 'pain'),
  ('Knee pain', '{}'::text[], 'pain'),
  ('Hip pain', '{}'::text[], 'pain'),
  ('Ankle pain', '{}'::text[], 'pain'),
  ('Foot pain', '{}'::text[], 'pain'),
  ('Heel pain', '{plantar fasciitis}'::text[], 'pain'),
  ('Leg pain', '{}'::text[], 'pain'),
  ('Arm pain', '{}'::text[], 'pain'),
  ('Elbow pain', '{}'::text[], 'pain'),
  ('Wrist pain', '{}'::text[], 'pain'),
  ('Hand pain', '{}'::text[], 'pain'),
  ('Finger pain', '{}'::text[], 'pain'),
  ('Chest pain', '{}'::text[], 'pain'),
  ('Abdominal pain', '{stomach ache}'::text[], 'pain'),
  ('Epigastric pain', '{}'::text[], 'pain'),
  ('Pelvic pain', '{}'::text[], 'pain'),
  ('Flank pain', '{}'::text[], 'pain'),
  ('Joint pain', '{arthralgia}'::text[], 'pain'),
  ('Muscle pain', '{myalgia}'::text[], 'pain'),
  ('Body ache', '{}'::text[], 'pain'),
  ('Toothache', '{}'::text[], 'pain'),
  ('Ear pain', '{otalgia}'::text[], 'pain'),
  ('Eye pain', '{}'::text[], 'pain'),
  ('Throat pain', '{}'::text[], 'pain'),
  ('Testicular pain', '{}'::text[], 'pain'),
  ('Breast pain', '{}'::text[], 'pain'),
  ('Sciatica', '{}'::text[], 'pain'),
  ('Radicular pain', '{}'::text[], 'pain'),
  ('Bone pain', '{}'::text[], 'pain'),
  ('Osteoarthritis pain', '{}'::text[], 'pain'),
  ('Rheumatic pain', '{}'::text[], 'pain'),
  ('Facial pain', '{}'::text[], 'pain'),
  ('Jaw pain', '{TMJ pain}'::text[], 'pain'),
  ('Groin pain', '{}'::text[], 'pain'),
  ('Calf pain', '{}'::text[], 'pain'),
  ('Fever', '{pyrexia}'::text[], 'fever'),
  ('High-grade fever', '{}'::text[], 'fever'),
  ('Low-grade fever', '{}'::text[], 'fever'),
  ('Fever with chills', '{}'::text[], 'fever'),
  ('Fever with rigors', '{}'::text[], 'fever'),
  ('Intermittent fever', '{}'::text[], 'fever'),
  ('Continuous fever', '{}'::text[], 'fever'),
  ('Post-vaccination fever', '{}'::text[], 'fever'),
  ('Fever of unknown origin', '{FUO}'::text[], 'fever'),
  ('Night sweats with fever', '{}'::text[], 'fever'),
  ('Fever with rash', '{}'::text[], 'fever'),
  ('Dengue-like fever', '{}'::text[], 'fever'),
  ('Typhoid-like fever', '{}'::text[], 'fever'),
  ('Recurrent fever', '{}'::text[], 'fever'),
  ('Febrile illness', '{}'::text[], 'fever'),
  ('Cough', '{}'::text[], 'cough'),
  ('Dry cough', '{}'::text[], 'cough'),
  ('Productive cough', '{}'::text[], 'cough'),
  ('Chronic cough', '{}'::text[], 'cough'),
  ('Acute cough', '{}'::text[], 'cough'),
  ('Cough with sputum', '{}'::text[], 'cough'),
  ('Cough with hemoptysis', '{}'::text[], 'cough'),
  ('Night cough', '{}'::text[], 'cough'),
  ('Morning cough', '{}'::text[], 'cough'),
  ('Barking cough', '{}'::text[], 'cough'),
  ('Whooping cough', '{}'::text[], 'cough'),
  ('Cough with wheeze', '{}'::text[], 'cough'),
  ('Post-nasal drip', '{}'::text[], 'cough'),
  ('Sore throat', '{pharyngitis}'::text[], 'cough'),
  ('Hoarseness', '{}'::text[], 'cough'),
  ('Blocked nose', '{nasal blockage}'::text[], 'cough'),
  ('Runny nose', '{rhinorrhea}'::text[], 'cough'),
  ('Nasal congestion', '{}'::text[], 'cough'),
  ('Sneezing', '{}'::text[], 'cough'),
  ('Cold and cough', '{}'::text[], 'cough'),
  ('Nausea', '{}'::text[], 'default'),
  ('Vomiting', '{emesis}'::text[], 'default'),
  ('Diarrhea', '{loose stools}'::text[], 'default'),
  ('Loose stools', '{}'::text[], 'default'),
  ('Constipation', '{}'::text[], 'default'),
  ('Abdominal distension', '{bloating}'::text[], 'default'),
  ('Bloating', '{}'::text[], 'default'),
  ('Loss of appetite', '{anorexia}'::text[], 'default'),
  ('Weight loss', '{}'::text[], 'default'),
  ('Weight gain', '{}'::text[], 'default'),
  ('Fatigue', '{tiredness}'::text[], 'default'),
  ('Weakness', '{generalized weakness}'::text[], 'default'),
  ('Malaise', '{}'::text[], 'default'),
  ('Dizziness', '{giddiness}'::text[], 'default'),
  ('Vertigo', '{}'::text[], 'default'),
  ('Palpitations', '{}'::text[], 'default'),
  ('Shortness of breath', '{breathlessness,SOB}'::text[], 'default'),
  ('Chest tightness', '{}'::text[], 'default'),
  ('Edema', '{swelling}'::text[], 'default'),
  ('Swelling', '{}'::text[], 'default'),
  ('Rash', '{}'::text[], 'default'),
  ('Itching', '{pruritus}'::text[], 'default'),
  ('Urticaria', '{hives}'::text[], 'default'),
  ('Acne', '{}'::text[], 'default'),
  ('Hair fall', '{alopecia}'::text[], 'default'),
  ('Insomnia', '{sleep disturbance}'::text[], 'default'),
  ('Anxiety', '{}'::text[], 'default'),
  ('Depressed mood', '{}'::text[], 'default'),
  ('Burning urination', '{dysuria}'::text[], 'default'),
  ('Increased urination', '{polyuria}'::text[], 'default'),
  ('Decreased urination', '{oliguria}'::text[], 'default'),
  ('Urinary urgency', '{}'::text[], 'default'),
  ('Urinary incontinence', '{}'::text[], 'default'),
  ('Hematuria', '{blood in urine}'::text[], 'default'),
  ('Vaginal discharge', '{}'::text[], 'default'),
  ('White discharge', '{leucorrhea}'::text[], 'default'),
  ('Irregular periods', '{}'::text[], 'default'),
  ('Heavy periods', '{menorrhagia}'::text[], 'default'),
  ('Amenorrhea', '{}'::text[], 'default'),
  ('Erectile dysfunction', '{}'::text[], 'default'),
  ('Decreased libido', '{}'::text[], 'default'),
  ('Hearing loss', '{}'::text[], 'default'),
  ('Tinnitus', '{ringing in ears}'::text[], 'default'),
  ('Visual blurring', '{blurred vision}'::text[], 'default'),
  ('Double vision', '{diplopia}'::text[], 'default'),
  ('Red eye', '{}'::text[], 'default'),
  ('Watering eye', '{epiphora}'::text[], 'default'),
  ('Numbness', '{}'::text[], 'default'),
  ('Tingling', '{paresthesia}'::text[], 'default'),
  ('Tremors', '{}'::text[], 'default'),
  ('Convulsions', '{seizures}'::text[], 'default'),
  ('Confusion', '{}'::text[], 'default'),
  ('Memory loss', '{}'::text[], 'default'),
  ('Difficulty swallowing', '{dysphagia}'::text[], 'default'),
  ('Heartburn', '{}'::text[], 'default'),
  ('Acid reflux', '{GERD}'::text[], 'default'),
  ('Belching', '{}'::text[], 'default'),
  ('Excessive thirst', '{polydipsia}'::text[], 'default'),
  ('Excessive hunger', '{polyphagia}'::text[], 'default'),
  ('Cold intolerance', '{}'::text[], 'default'),
  ('Heat intolerance', '{}'::text[], 'default'),
  ('Excessive sweating', '{hyperhidrosis}'::text[], 'default'),
  ('Pallor', '{}'::text[], 'default'),
  ('Easy bruising', '{}'::text[], 'default'),
  ('Bleeding gums', '{}'::text[], 'default'),
  ('Mouth ulcer', '{}'::text[], 'default'),
  ('Bad breath', '{halitosis}'::text[], 'default'),
  ('Limp', '{}'::text[], 'default'),
  ('Difficulty walking', '{}'::text[], 'default'),
  ('Stiffness', '{}'::text[], 'default'),
  ('Reduced mobility', '{}'::text[], 'default'),
  ('Wound', '{}'::text[], 'default'),
  ('Burn', '{}'::text[], 'default'),
  ('Insect bite', '{}'::text[], 'default'),
  ('Allergic reaction', '{}'::text[], 'default'),
  ('Foreign body sensation', '{}'::text[], 'default'),
  ('Foreign body in eye', '{}'::text[], 'default'),
  ('Foreign body in ear', '{}'::text[], 'default'),
  ('Motion sickness', '{}'::text[], 'default'),
  ('Hiccups', '{}'::text[], 'default'),
  ('Snoring', '{}'::text[], 'default'),
  ('Bedwetting', '{enuresis}'::text[], 'default'),
  ('Daytime sleepiness', '{}'::text[], 'default'),
  ('Loss of consciousness', '{syncope}'::text[], 'default'),
  ('Fainting', '{}'::text[], 'default'),
  ('Bleeding per rectum', '{}'::text[], 'default'),
  ('Piles', '{hemorrhoids}'::text[], 'default'),
  ('Anal pain', '{}'::text[], 'default'),
  ('Gas trouble', '{flatulence}'::text[], 'default'),
  ('Indigestion', '{dyspepsia}'::text[], 'default'),
  ('Lactose intolerance symptoms', '{}'::text[], 'default'),
  ('Food poisoning', '{}'::text[], 'default'),
  ('Dehydration', '{}'::text[], 'default'),
  ('Heat exhaustion', '{}'::text[], 'default'),
  ('Sunburn', '{}'::text[], 'default'),
  ('Dry skin', '{}'::text[], 'default'),
  ('Oily skin', '{}'::text[], 'default'),
  ('Pigmentation', '{}'::text[], 'default'),
  ('Dark circles', '{}'::text[], 'default'),
  ('Excessive hair growth', '{hirsutism}'::text[], 'default'),
  ('Breath odor', '{}'::text[], 'default'),
  ('Chest discomfort', '{}'::text[], 'default'),
  ('Leg cramps', '{}'::text[], 'default'),
  ('Restless legs', '{}'::text[], 'default'),
  ('Snake bite', '{}'::text[], 'default'),
  ('Dog bite', '{}'::text[], 'default'),
  ('Road traffic accident injury', '{RTA}'::text[], 'default'),
  ('Fall injury', '{}'::text[], 'default')
) AS v(name, synonyms, category)
WHERE NOT EXISTS (
  SELECT 1 FROM complaint_master c WHERE lower(c.name) = lower(v.name)
);
