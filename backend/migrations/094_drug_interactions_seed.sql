-- ============================================================================
-- Drug Interactions seed (EHR Sub-batch C / Task C.2 / T4.19)
-- ============================================================================
-- Migration: 094_drug_interactions_seed.sql
-- Date:      2026-05-04
-- Depends on: 088_drug_master.sql, 089_drug_master_seed.sql,
--             093_drug_interactions.sql
-- ============================================================================
-- Delivers 200 clinically significant DDI pairs sourced from:
--   BNF Interactions A-Z (https://bnf.nice.org.uk/interactions/)
--   American Geriatrics Society Beers Criteria 2023 (Tables 2, 4, 5)
--
-- Structure
-- ---------
-- § 1  Extend drug_master with 36 drugs referenced by DDI pairs that are
--      not present in the 089 starter seed.  Uses the same idempotent
--      WHERE NOT EXISTS guard as 089.
-- § 2  Insert 200 DDI pairs grouped by mechanism (9 INSERT blocks).
--      Pattern:  INSERT … SELECT LEAST(a.id,b.id), GREATEST(a.id,b.id), …
--      The LEAST/GREATEST normalises the ordered-pair invariant regardless
--      of VALUES column order.  ON CONFLICT … DO NOTHING makes the seed
--      re-runnable without duplicates.
--      Pairs whose drugs are absent from drug_master are silently skipped
--      (the JOIN produces no row).
--
-- Follow-up: drug_master expansion to ~500 rows is tracked separately
-- (plan-t2-ehr-speed.md §T2.7).  The 36 drugs added here are the minimum
-- set to activate all 200 DDI pair rows.
-- ============================================================================

-- ============================================================================
-- § 1 — Extend drug_master (36 additional drugs for DDI coverage)
-- ============================================================================

INSERT INTO drug_master (generic_name, brand_names, strength, form, route_default)
SELECT * FROM (VALUES
  -- Anticoagulants (VKA)
  ('Warfarin',                          ARRAY['Coumadin','Warf','Warf 5'],             '5mg',       'tablet',     'oral'),
  ('Acenocoumarol',                     ARRAY['Acitrom','Sintrom'],                    '1mg',       'tablet',     'oral'),

  -- Direct oral anticoagulants (DOACs)
  ('Apixaban',                          ARRAY['Eliquis','Apixa'],                      '5mg',       'tablet',     'oral'),
  ('Rivaroxaban',                       ARRAY['Xarelto','Rivarox'],                    '10mg',      'tablet',     'oral'),
  ('Dabigatran',                        ARRAY['Pradaxa','Dabiga'],                     '110mg',     'capsule',    'oral'),

  -- Antibiotics (not in 089 seed)
  ('Erythromycin',                      ARRAY['Erythrocin','Eryc','Althrocin'],        '500mg',     'tablet',     'oral'),

  -- Antifungals (additional)
  ('Ketoconazole',                      ARRAY['Nizoral','Ketovate'],                   '200mg',     'tablet',     'oral'),
  ('Voriconazole',                      ARRAY['Vfend','Voritek'],                      '200mg',     'tablet',     'oral'),

  -- Antiepileptics / enzyme inducers
  ('Carbamazepine',                     ARRAY['Tegretol','Mazetol','Tegrital'],        '200mg',     'tablet',     'oral'),
  ('Phenytoin',                         ARRAY['Dilantin','Eptoin','Phenytek'],         '100mg',     'capsule',    'oral'),

  -- Antimycobacterials
  ('Rifampicin',                        ARRAY['Rifadin','Rimactane','Rimpin'],         '450mg',     'capsule',    'oral'),

  -- Antibiotic combination
  ('Trimethoprim-Sulfamethoxazole',     ARRAY['Septran','Bactrim','Co-trimoxazole'],   '960mg',     'tablet',     'oral'),

  -- Potassium-sparing diuretics
  ('Amiloride',                         ARRAY['Midamor','Amil'],                       '5mg',       'tablet',     'oral'),
  ('Triamterene',                       ARRAY['Dyrenium','Dytac'],                     '50mg',      'capsule',    'oral'),

  -- Electrolyte supplement
  ('Potassium Chloride',                ARRAY['Slow-K','K-Lor','Klor-Con'],            '600mg',     'tablet',     'oral'),

  -- Mood stabiliser
  ('Lithium',                           ARRAY['Priadel','Camcolit','Lithosun'],        '400mg',     'tablet',     'oral'),

  -- Statin (additional)
  ('Simvastatin',                       ARRAY['Zocor','Simcard','Simvotin'],           '20mg',      'tablet',     'oral'),

  -- HIV protease inhibitor (DDI perpetrator)
  ('Ritonavir',                         ARRAY['Norvir','Ritonavir boosted'],           '100mg',     'tablet',     'oral'),

  -- Immunosuppressant
  ('Cyclosporine',                      ARRAY['Sandimmune','Neoral','Panimun'],        '100mg',     'capsule',    'oral'),

  -- Fibrate
  ('Gemfibrozil',                       ARRAY['Lopid','Gemlipid'],                     '600mg',     'tablet',     'oral'),

  -- Antiarrhythmics
  ('Amiodarone',                        ARRAY['Cordarone','Amipace','Tachyra'],        '200mg',     'tablet',     'oral'),
  ('Sotalol',                           ARRAY['Sotacor','Betapace','Sotagard'],        '80mg',      'tablet',     'oral'),

  -- Antipsychotics
  ('Haloperidol',                       ARRAY['Haldol','Serenace','Aloperidin'],       '5mg',       'tablet',     'oral'),
  ('Quetiapine',                        ARRAY['Seroquel','Qutipin','Qutan'],           '25mg',      'tablet',     'oral'),

  -- Opioid analgesics
  ('Codeine',                           ARRAY['Codeine Phosphate','Codinovo'],         '30mg',      'tablet',     'oral'),
  ('Morphine',                          ARRAY['MS Contin','Morphgesic','Substitol'],   '10mg',      'tablet',     'oral'),
  ('Oxycodone',                         ARRAY['OxyContin','Oxynorm','Targin'],         '5mg',       'capsule',    'oral'),

  -- Benzodiazepine
  ('Lorazepam',                         ARRAY['Ativan','Larpose','Trapex'],            '1mg',       'tablet',     'oral'),

  -- Anticonvulsants / neuropathic pain
  ('Gabapentin',                        ARRAY['Neurontin','Gabapin','Gabatop'],        '300mg',     'capsule',    'oral'),
  ('Pregabalin',                        ARRAY['Lyrica','Pregarica','Pregalin'],        '75mg',      'capsule',    'oral'),

  -- SSRI / SNRI antidepressants (additional)
  ('Fluoxetine',                        ARRAY['Prozac','Fludac','Oleanz plus'],        '20mg',      'capsule',    'oral'),
  ('Duloxetine',                        ARRAY['Cymbalta','Duvanta','Dulane'],          '30mg',      'capsule',    'oral'),

  -- Oxazolidinone antibiotic (serotonin risk)
  ('Linezolid',                         ARRAY['Zyvox','Linzolid','Linospan'],          '600mg',     'tablet',     'oral'),

  -- Diagnostic / antidote (serotonin risk)
  ('Methylene Blue',                    ARRAY['Methythioninium','Urolene Blue'],       '50mg',      'injection',  'IV'),

  -- MAO-B inhibitor (serotonin risk)
  ('Selegiline',                        ARRAY['Eldepryl','Zelapar','Selgin'],          '5mg',       'tablet',     'oral'),

  -- COX-2 inhibitor (lithium interaction)
  ('Celecoxib',                         ARRAY['Celebrex','Celact','Celcoxx'],          '200mg',     'capsule',    'oral')

) AS seed(generic_name, brand_names, strength, form, route_default)
WHERE NOT EXISTS (
  SELECT 1 FROM drug_master dm
  WHERE lower(dm.generic_name) = lower(seed.generic_name)
);

-- ============================================================================
-- § 2 — DDI pairs  (200 pairs across 9 mechanism groups)
-- ============================================================================
-- All SELECTs use:
--   JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
--   JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
-- so a missing drug_master row is a silent no-op (no error, no pair).
-- The idempotent ON CONFLICT … DO NOTHING means this block is re-runnable.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Group 1 (25 pairs): Anticoagulant × NSAID/antiplatelet — bleeding risk
-- --------------------------------------------------------------------------
-- Mechanism: combined anticoagulant or antiplatelet effects increase
-- gastrointestinal and systemic bleeding risk.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  v.sev,
  'Combined anticoagulant or antiplatelet effects increase gastrointestinal and systemic bleeding risk.',
  'Avoid routine co-prescribing; use gastroprotection and close bleeding monitoring only when benefit clearly outweighs risk.',
  'BNF Interactions A-Z: anticoagulant/NSAID or antiplatelet interaction; Beers 2023 Table 2/5 anticoagulant-NSAID bleeding caution.',
  v.url
FROM (VALUES
  -- Warfarin (VKA) — all major
  ('warfarin',      'aspirin',      'major',    'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'clopidogrel',  'major',    'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'ibuprofen',    'major',    'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'diclofenac',   'major',    'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'naproxen',     'major',    'https://bnf.nice.org.uk/interactions/warfarin/'),
  -- Acenocoumarol (VKA) — all major
  ('acenocoumarol', 'aspirin',      'major',    'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'clopidogrel',  'major',    'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'ibuprofen',    'major',    'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'diclofenac',   'major',    'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'naproxen',     'major',    'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  -- Apixaban (DOAC) — antiplatelet moderate; NSAIDs major
  ('apixaban',      'aspirin',      'moderate', 'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',      'clopidogrel',  'moderate', 'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',      'ibuprofen',    'major',    'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',      'diclofenac',   'major',    'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',      'naproxen',     'major',    'https://bnf.nice.org.uk/interactions/apixaban/'),
  -- Rivaroxaban (DOAC)
  ('rivaroxaban',   'aspirin',      'moderate', 'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban',   'clopidogrel',  'moderate', 'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban',   'ibuprofen',    'major',    'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban',   'diclofenac',   'major',    'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban',   'naproxen',     'major',    'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  -- Dabigatran (DOAC)
  ('dabigatran',    'aspirin',      'moderate', 'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',    'clopidogrel',  'moderate', 'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',    'ibuprofen',    'major',    'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',    'diclofenac',   'major',    'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',    'naproxen',     'major',    'https://bnf.nice.org.uk/interactions/dabigatran/')
) AS v(drug_a, drug_b, sev, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Group 2 (20 pairs): VKA × potentiators — warfarin potentiation
-- --------------------------------------------------------------------------
-- Mechanism: the interacting drug may inhibit VKA metabolism, alter
-- vitamin K flora, or impair platelet function, raising bleeding risk.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  'major',
  'The interacting drug may inhibit anticoagulant metabolism, alter vitamin K flora, or impair platelet function, raising bleeding risk.',
  'Prefer an alternative; if unavoidable, check INR early and repeatedly and adjust anticoagulant dose.',
  'BNF Interactions A-Z: warfarin interactions; Beers 2023 Table 5 warfarin with amiodarone, ciprofloxacin, macrolides, TMP-SMX, SSRIs.',
  v.url
FROM (VALUES
  ('warfarin',      'clarithromycin',                 'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'erythromycin',                   'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'ciprofloxacin',                  'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'levofloxacin',                   'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'metronidazole',                  'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'trimethoprim-sulfamethoxazole',  'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'fluconazole',                    'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'amiodarone',                     'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'sertraline',                     'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('warfarin',      'fluoxetine',                     'https://bnf.nice.org.uk/interactions/warfarin/'),
  ('acenocoumarol', 'clarithromycin',                 'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'erythromycin',                   'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'ciprofloxacin',                  'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'levofloxacin',                   'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'metronidazole',                  'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'trimethoprim-sulfamethoxazole',  'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'fluconazole',                    'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'amiodarone',                     'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'sertraline',                     'https://bnf.nice.org.uk/interactions/acenocoumarol/'),
  ('acenocoumarol', 'fluoxetine',                     'https://bnf.nice.org.uk/interactions/acenocoumarol/')
) AS v(drug_a, drug_b, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Group 3 (24 pairs): DOAC × P-gp / CYP3A4 inhibitors and inducers
-- --------------------------------------------------------------------------
-- Mechanism: strong P-gp or CYP3A4 inhibition increases anticoagulant
-- exposure; enzyme induction reduces efficacy.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  'major',
  'Strong P-gp or CYP3A4 inhibition can increase anticoagulant exposure, while enzyme induction can reduce anticoagulant efficacy.',
  'Avoid strong inhibitors or inducers where possible and choose an alternative anticoagulant or antimicrobial with specialist input.',
  'BNF Interactions A-Z: direct oral anticoagulant interactions; Beers 2023 anticoagulant bleeding-risk principles.',
  v.url
FROM (VALUES
  ('apixaban',    'clarithromycin',  'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',    'ketoconazole',    'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',    'itraconazole',    'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',    'voriconazole',    'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',    'ritonavir',       'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',    'carbamazepine',   'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',    'phenytoin',       'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('apixaban',    'rifampicin',      'https://bnf.nice.org.uk/interactions/apixaban/'),
  ('rivaroxaban', 'clarithromycin',  'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban', 'ketoconazole',    'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban', 'itraconazole',    'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban', 'voriconazole',    'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban', 'ritonavir',       'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban', 'carbamazepine',   'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban', 'phenytoin',       'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('rivaroxaban', 'rifampicin',      'https://bnf.nice.org.uk/interactions/rivaroxaban/'),
  ('dabigatran',  'clarithromycin',  'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',  'ketoconazole',    'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',  'itraconazole',    'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',  'voriconazole',    'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',  'ritonavir',       'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',  'carbamazepine',   'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',  'phenytoin',       'https://bnf.nice.org.uk/interactions/dabigatran/'),
  ('dabigatran',  'rifampicin',      'https://bnf.nice.org.uk/interactions/dabigatran/')
) AS v(drug_a, drug_b, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Group 4 (32 pairs): RAS inhibitor × potassium-sparing / NSAID
-- --------------------------------------------------------------------------
-- Mechanism: reduced aldosterone activity, potassium retention, renal
-- prostaglandin inhibition, or trimethoprim-like potassium sparing can
-- precipitate hyperkalemia or acute kidney injury.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  v.sev,
  'Reduced aldosterone activity, potassium retention, renal prostaglandin inhibition, or trimethoprim-like potassium sparing can precipitate hyperkalemia or acute kidney injury.',
  'Avoid high-risk combinations in CKD or elderly patients; check creatinine and potassium within days if co-prescribing is necessary.',
  v.src,
  v.url
FROM (VALUES
  -- Enalapril × potassium-sparing/supplement/TMP-SMX (major)
  ('enalapril',   'spironolactone',               'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/enalapril/'),
  ('enalapril',   'amiloride',                    'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/enalapril/'),
  ('enalapril',   'triamterene',                  'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/enalapril/'),
  ('enalapril',   'potassium chloride',            'major',    'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/enalapril/'),
  ('enalapril',   'trimethoprim-sulfamethoxazole', 'major',    'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/enalapril/'),
  -- Enalapril × NSAIDs (moderate)
  ('enalapril',   'ibuprofen',                    'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/enalapril/'),
  ('enalapril',   'diclofenac',                   'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/enalapril/'),
  ('enalapril',   'naproxen',                     'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/enalapril/'),
  -- Ramipril × same pattern
  ('ramipril',    'spironolactone',               'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/ramipril/'),
  ('ramipril',    'amiloride',                    'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/ramipril/'),
  ('ramipril',    'triamterene',                  'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/ramipril/'),
  ('ramipril',    'potassium chloride',            'major',    'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/ramipril/'),
  ('ramipril',    'trimethoprim-sulfamethoxazole', 'major',    'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/ramipril/'),
  ('ramipril',    'ibuprofen',                    'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/ramipril/'),
  ('ramipril',    'diclofenac',                   'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/ramipril/'),
  ('ramipril',    'naproxen',                     'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/ramipril/'),
  -- Losartan (ARB)
  ('losartan',    'spironolactone',               'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/losartan/'),
  ('losartan',    'amiloride',                    'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/losartan/'),
  ('losartan',    'triamterene',                  'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/losartan/'),
  ('losartan',    'potassium chloride',            'major',    'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/losartan/'),
  ('losartan',    'trimethoprim-sulfamethoxazole', 'major',    'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/losartan/'),
  ('losartan',    'ibuprofen',                    'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/losartan/'),
  ('losartan',    'diclofenac',                   'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/losartan/'),
  ('losartan',    'naproxen',                     'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/losartan/'),
  -- Telmisartan (ARB)
  ('telmisartan', 'spironolactone',               'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/telmisartan/'),
  ('telmisartan', 'amiloride',                    'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/telmisartan/'),
  ('telmisartan', 'triamterene',                  'major',    'BNF Interactions A-Z: RAS inhibitor interactions; Beers 2023 Table 5 RAS inhibitor/potassium-sparing diuretic hyperkalemia warning.',    'https://bnf.nice.org.uk/interactions/telmisartan/'),
  ('telmisartan', 'potassium chloride',            'major',    'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/telmisartan/'),
  ('telmisartan', 'trimethoprim-sulfamethoxazole', 'major',    'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/telmisartan/'),
  ('telmisartan', 'ibuprofen',                    'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/telmisartan/'),
  ('telmisartan', 'diclofenac',                   'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/telmisartan/'),
  ('telmisartan', 'naproxen',                     'moderate', 'BNF Interactions A-Z: ACEI/ARB interactions; Beers 2023 Table 4 TMP-SMX hyperkalemia caution with ACEI/ARB in renal impairment.',       'https://bnf.nice.org.uk/interactions/telmisartan/')
) AS v(drug_a, drug_b, sev, src, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Group 5 (10 pairs): Lithium × diuretics / ACEIs / ARBs / NSAIDs
-- --------------------------------------------------------------------------
-- Mechanism: reduced renal lithium clearance can rapidly increase lithium
-- concentrations and neurotoxicity risk.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  'major',
  'Reduced renal lithium clearance can rapidly increase lithium concentrations and neurotoxicity risk.',
  'Avoid where possible; if essential, check lithium level and renal function soon after starting, stopping, or changing dose.',
  'BNF Interactions A-Z: lithium interactions; Beers 2023 Table 5 lithium with ACEIs/ARBs/ARNIs toxicity warning.',
  v.url
FROM (VALUES
  ('lithium', 'enalapril',                  'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'ramipril',                   'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'losartan',                   'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'telmisartan',                'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'hydrochlorothiazide',        'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'furosemide',                 'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'ibuprofen',                  'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'diclofenac',                 'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'naproxen',                   'https://bnf.nice.org.uk/interactions/lithium/'),
  ('lithium', 'celecoxib',                  'https://bnf.nice.org.uk/interactions/lithium/')
) AS v(drug_a, drug_b, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Group 6 (24 pairs): Statin × CYP3A4/P-gp inhibitors and fibrates
-- --------------------------------------------------------------------------
-- Mechanism: CYP3A4 or transporter inhibition, or fibrate co-toxicity,
-- increases statin exposure and risk of myopathy or rhabdomyolysis.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  v.sev,
  'CYP3A4 or transporter inhibition, or fibrate co-toxicity, increases statin exposure and risk of myopathy or rhabdomyolysis.',
  'Avoid or temporarily stop the statin during interacting therapy; use a safer statin strategy and counsel about muscle symptoms.',
  'BNF Interactions A-Z: statin interactions including simvastatin with macrolides/azoles and fibrates.',
  v.url
FROM (VALUES
  -- Simvastatin: contraindicated with strong inhibitors
  ('simvastatin',  'clarithromycin', 'contraindicated', 'https://bnf.nice.org.uk/interactions/simvastatin/'),
  ('simvastatin',  'erythromycin',   'contraindicated', 'https://bnf.nice.org.uk/interactions/simvastatin/'),
  ('simvastatin',  'itraconazole',   'contraindicated', 'https://bnf.nice.org.uk/interactions/simvastatin/'),
  ('simvastatin',  'ketoconazole',   'contraindicated', 'https://bnf.nice.org.uk/interactions/simvastatin/'),
  ('simvastatin',  'cyclosporine',   'contraindicated', 'https://bnf.nice.org.uk/interactions/simvastatin/'),
  ('simvastatin',  'ritonavir',      'contraindicated', 'https://bnf.nice.org.uk/interactions/simvastatin/'),
  -- Simvastatin: major with weaker inhibitors / fibrate
  ('simvastatin',  'fluconazole',    'major',           'https://bnf.nice.org.uk/interactions/simvastatin/'),
  ('simvastatin',  'gemfibrozil',    'major',           'https://bnf.nice.org.uk/interactions/simvastatin/'),
  -- Atorvastatin: major (more resilient than simvastatin)
  ('atorvastatin', 'clarithromycin', 'major',           'https://bnf.nice.org.uk/interactions/atorvastatin/'),
  ('atorvastatin', 'erythromycin',   'major',           'https://bnf.nice.org.uk/interactions/atorvastatin/'),
  ('atorvastatin', 'itraconazole',   'major',           'https://bnf.nice.org.uk/interactions/atorvastatin/'),
  ('atorvastatin', 'ketoconazole',   'major',           'https://bnf.nice.org.uk/interactions/atorvastatin/'),
  ('atorvastatin', 'fluconazole',    'major',           'https://bnf.nice.org.uk/interactions/atorvastatin/'),
  ('atorvastatin', 'gemfibrozil',    'major',           'https://bnf.nice.org.uk/interactions/atorvastatin/'),
  ('atorvastatin', 'cyclosporine',   'major',           'https://bnf.nice.org.uk/interactions/atorvastatin/'),
  ('atorvastatin', 'ritonavir',      'major',           'https://bnf.nice.org.uk/interactions/atorvastatin/'),
  -- Rosuvastatin
  ('rosuvastatin', 'clarithromycin', 'major',           'https://bnf.nice.org.uk/interactions/rosuvastatin/'),
  ('rosuvastatin', 'erythromycin',   'major',           'https://bnf.nice.org.uk/interactions/rosuvastatin/'),
  ('rosuvastatin', 'itraconazole',   'major',           'https://bnf.nice.org.uk/interactions/rosuvastatin/'),
  ('rosuvastatin', 'ketoconazole',   'major',           'https://bnf.nice.org.uk/interactions/rosuvastatin/'),
  ('rosuvastatin', 'fluconazole',    'major',           'https://bnf.nice.org.uk/interactions/rosuvastatin/'),
  ('rosuvastatin', 'gemfibrozil',    'major',           'https://bnf.nice.org.uk/interactions/rosuvastatin/'),
  ('rosuvastatin', 'cyclosporine',   'major',           'https://bnf.nice.org.uk/interactions/rosuvastatin/'),
  ('rosuvastatin', 'ritonavir',      'major',           'https://bnf.nice.org.uk/interactions/rosuvastatin/')
) AS v(drug_a, drug_b, sev, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Group 7 (25 pairs): QT-prolonging combinations
-- --------------------------------------------------------------------------
-- Mechanism: additive QT prolongation and electrolyte-sensitive
-- repolarisation delay increase torsades de pointes risk.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  'major',
  'Additive QT prolongation and electrolyte-sensitive repolarisation delay increase torsades de pointes risk.',
  'Avoid if possible; if unavoidable, correct electrolytes and obtain ECG monitoring in high-risk patients.',
  'BNF Interactions A-Z: QT-prolonging drug interactions; Beers 2023 CNS/cardiac adverse-effect principles in older adults.',
  v.url
FROM (VALUES
  ('amiodarone',   'azithromycin',    'https://bnf.nice.org.uk/interactions/amiodarone/'),
  ('amiodarone',   'clarithromycin',  'https://bnf.nice.org.uk/interactions/amiodarone/'),
  ('amiodarone',   'erythromycin',    'https://bnf.nice.org.uk/interactions/amiodarone/'),
  ('amiodarone',   'ciprofloxacin',   'https://bnf.nice.org.uk/interactions/amiodarone/'),
  ('amiodarone',   'levofloxacin',    'https://bnf.nice.org.uk/interactions/amiodarone/'),
  ('sotalol',      'azithromycin',    'https://bnf.nice.org.uk/interactions/sotalol/'),
  ('sotalol',      'clarithromycin',  'https://bnf.nice.org.uk/interactions/sotalol/'),
  ('sotalol',      'erythromycin',    'https://bnf.nice.org.uk/interactions/sotalol/'),
  ('sotalol',      'ciprofloxacin',   'https://bnf.nice.org.uk/interactions/sotalol/'),
  ('sotalol',      'levofloxacin',    'https://bnf.nice.org.uk/interactions/sotalol/'),
  ('haloperidol',  'azithromycin',    'https://bnf.nice.org.uk/interactions/haloperidol/'),
  ('haloperidol',  'clarithromycin',  'https://bnf.nice.org.uk/interactions/haloperidol/'),
  ('haloperidol',  'erythromycin',    'https://bnf.nice.org.uk/interactions/haloperidol/'),
  ('haloperidol',  'ciprofloxacin',   'https://bnf.nice.org.uk/interactions/haloperidol/'),
  ('haloperidol',  'levofloxacin',    'https://bnf.nice.org.uk/interactions/haloperidol/'),
  ('quetiapine',   'azithromycin',    'https://bnf.nice.org.uk/interactions/quetiapine/'),
  ('quetiapine',   'clarithromycin',  'https://bnf.nice.org.uk/interactions/quetiapine/'),
  ('quetiapine',   'erythromycin',    'https://bnf.nice.org.uk/interactions/quetiapine/'),
  ('quetiapine',   'ciprofloxacin',   'https://bnf.nice.org.uk/interactions/quetiapine/'),
  ('quetiapine',   'levofloxacin',    'https://bnf.nice.org.uk/interactions/quetiapine/'),
  ('escitalopram', 'azithromycin',    'https://bnf.nice.org.uk/interactions/escitalopram/'),
  ('escitalopram', 'clarithromycin',  'https://bnf.nice.org.uk/interactions/escitalopram/'),
  ('escitalopram', 'erythromycin',    'https://bnf.nice.org.uk/interactions/escitalopram/'),
  ('escitalopram', 'ciprofloxacin',   'https://bnf.nice.org.uk/interactions/escitalopram/'),
  ('escitalopram', 'levofloxacin',    'https://bnf.nice.org.uk/interactions/escitalopram/')
) AS v(drug_a, drug_b, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Group 8 (24 pairs): Opioid × CNS depressant — respiratory depression
-- --------------------------------------------------------------------------
-- Mechanism: additive central nervous system depression can cause
-- oversedation, falls, respiratory depression, coma, or death.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  'major',
  'Additive central nervous system depression can cause oversedation, falls, respiratory depression, coma, or death.',
  'Avoid routine co-prescribing; use the lowest effective dose only with explicit indication, counselling, and monitoring.',
  'BNF Interactions A-Z: opioid sedative interactions; Beers 2023 Table 5 opioid-benzodiazepine and opioid-gabapentinoid warnings.',
  v.url
FROM (VALUES
  ('tramadol',  'diazepam',    'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('tramadol',  'alprazolam',  'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('tramadol',  'clonazepam',  'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('tramadol',  'lorazepam',   'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('tramadol',  'gabapentin',  'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('tramadol',  'pregabalin',  'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('codeine',   'diazepam',    'https://bnf.nice.org.uk/interactions/codeine/'),
  ('codeine',   'alprazolam',  'https://bnf.nice.org.uk/interactions/codeine/'),
  ('codeine',   'clonazepam',  'https://bnf.nice.org.uk/interactions/codeine/'),
  ('codeine',   'lorazepam',   'https://bnf.nice.org.uk/interactions/codeine/'),
  ('codeine',   'gabapentin',  'https://bnf.nice.org.uk/interactions/codeine/'),
  ('codeine',   'pregabalin',  'https://bnf.nice.org.uk/interactions/codeine/'),
  ('morphine',  'diazepam',    'https://bnf.nice.org.uk/interactions/morphine/'),
  ('morphine',  'alprazolam',  'https://bnf.nice.org.uk/interactions/morphine/'),
  ('morphine',  'clonazepam',  'https://bnf.nice.org.uk/interactions/morphine/'),
  ('morphine',  'lorazepam',   'https://bnf.nice.org.uk/interactions/morphine/'),
  ('morphine',  'gabapentin',  'https://bnf.nice.org.uk/interactions/morphine/'),
  ('morphine',  'pregabalin',  'https://bnf.nice.org.uk/interactions/morphine/'),
  ('oxycodone', 'diazepam',    'https://bnf.nice.org.uk/interactions/oxycodone/'),
  ('oxycodone', 'alprazolam',  'https://bnf.nice.org.uk/interactions/oxycodone/'),
  ('oxycodone', 'clonazepam',  'https://bnf.nice.org.uk/interactions/oxycodone/'),
  ('oxycodone', 'lorazepam',   'https://bnf.nice.org.uk/interactions/oxycodone/'),
  ('oxycodone', 'gabapentin',  'https://bnf.nice.org.uk/interactions/oxycodone/'),
  ('oxycodone', 'pregabalin',  'https://bnf.nice.org.uk/interactions/oxycodone/')
) AS v(drug_a, drug_b, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Group 9 (16 pairs): Serotonin syndrome risk
-- --------------------------------------------------------------------------
-- Mechanism: serotonergic activity is additive and can precipitate
-- serotonin syndrome with autonomic instability, neuromuscular findings,
-- and confusion.
-- --------------------------------------------------------------------------
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source, source_url)
SELECT
  LEAST(a.id, b.id),
  GREATEST(a.id, b.id),
  v.sev,
  'Serotonergic activity is additive and can precipitate serotonin syndrome with autonomic instability, neuromuscular findings, and confusion.',
  'Avoid the combination or use specialist-supervised washout and monitoring if no alternative exists.',
  'BNF Interactions A-Z: serotonergic antidepressant interactions; Beers 2023 Table 5 CNS-active drug caution.',
  v.url
FROM (VALUES
  -- Tramadol × SSRIs/SNRI (major — serotonin syndrome risk)
  ('tramadol',       'sertraline',   'major',           'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('tramadol',       'fluoxetine',   'major',           'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('tramadol',       'escitalopram', 'major',           'https://bnf.nice.org.uk/interactions/tramadol/'),
  ('tramadol',       'duloxetine',   'major',           'https://bnf.nice.org.uk/interactions/tramadol/'),
  -- Linezolid × SSRIs/SNRI (contraindicated)
  ('linezolid',      'sertraline',   'contraindicated', 'https://bnf.nice.org.uk/interactions/linezolid/'),
  ('linezolid',      'fluoxetine',   'contraindicated', 'https://bnf.nice.org.uk/interactions/linezolid/'),
  ('linezolid',      'escitalopram', 'contraindicated', 'https://bnf.nice.org.uk/interactions/linezolid/'),
  ('linezolid',      'duloxetine',   'contraindicated', 'https://bnf.nice.org.uk/interactions/linezolid/'),
  -- Methylene Blue × SSRIs/SNRI (contraindicated)
  ('methylene blue', 'sertraline',   'contraindicated', 'https://bnf.nice.org.uk/interactions/methylene-blue/'),
  ('methylene blue', 'fluoxetine',   'contraindicated', 'https://bnf.nice.org.uk/interactions/methylene-blue/'),
  ('methylene blue', 'escitalopram', 'contraindicated', 'https://bnf.nice.org.uk/interactions/methylene-blue/'),
  ('methylene blue', 'duloxetine',   'contraindicated', 'https://bnf.nice.org.uk/interactions/methylene-blue/'),
  -- Selegiline (MAO-B) × SSRIs/SNRI (contraindicated)
  ('selegiline',     'sertraline',   'contraindicated', 'https://bnf.nice.org.uk/interactions/selegiline/'),
  ('selegiline',     'fluoxetine',   'contraindicated', 'https://bnf.nice.org.uk/interactions/selegiline/'),
  ('selegiline',     'escitalopram', 'contraindicated', 'https://bnf.nice.org.uk/interactions/selegiline/'),
  ('selegiline',     'duloxetine',   'contraindicated', 'https://bnf.nice.org.uk/interactions/selegiline/')
) AS v(drug_a, drug_b, sev, url)
JOIN drug_master a ON lower(a.generic_name) = lower(v.drug_a)
JOIN drug_master b ON lower(b.generic_name) = lower(v.drug_b)
ON CONFLICT (drug_a_id, drug_b_id) DO NOTHING;

-- ============================================================================
-- Summary: 200 interaction pairs across 9 mechanism groups.
-- Verify after applying:
--   SELECT severity, COUNT(*) FROM drug_interactions GROUP BY severity ORDER BY severity;
--   SELECT COUNT(*) FROM drug_interactions;  -- expected: 200
-- ============================================================================
