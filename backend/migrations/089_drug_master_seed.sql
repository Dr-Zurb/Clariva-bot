-- ============================================================================
-- Drug Master seed (EHR Sub-batch B1 / Task T2.7)
-- ============================================================================
-- Migration: 089_drug_master_seed.sql
-- Date:      2026-05-03
-- Description:
--   Curated starter seed for `drug_master`. Ships ~80 rows covering the
--   common Indian-OPD therapeutic categories (analgesics, antibiotics,
--   PPIs, antihistamines, antihypertensives, antidiabetics, statins,
--   bronchodilators, common topicals, vitamins). Owner is expected to
--   expand this list to the planned ~500 rows in a follow-up migration
--   once the source CSV is reviewed.
--
--   FOLLOW-UP TRACKED: see plan-t2-ehr-speed.md §T2.7 risk note —
--   "Seed expanded to ~500" remains an open checkbox until the full
--   list is curated and shipped as 0XX_drug_master_seed_expand.sql.
--
--   Idempotent: every INSERT is guarded by NOT EXISTS so re-running on
--   a partial DB never produces dupes (the safe, ANSI-compatible path
--   that doesn't require a UNIQUE constraint on a fuzzy lookup column).
-- ============================================================================

-- We INSERT each row only if no existing row already has the same generic
-- name (case-insensitive). The doctor-facing search treats generics as
-- canonical; multiple strengths of the same generic would be a separate
-- enhancement (the current schema fits one canonical strength per row).

INSERT INTO drug_master (generic_name, brand_names, strength, form, route_default)
SELECT * FROM (VALUES
  -- Analgesics / antipyretics
  ('Paracetamol',                 ARRAY['Crocin','Calpol','Dolo','Pacimol'],         '500mg',      'tablet',     'oral'),
  ('Ibuprofen',                   ARRAY['Brufen','Combiflam','Ibugesic'],            '400mg',      'tablet',     'oral'),
  ('Diclofenac',                  ARRAY['Voveran','Volini','Dynapar'],               '50mg',       'tablet',     'oral'),
  ('Aspirin',                     ARRAY['Disprin','Ecosprin'],                       '75mg',       'tablet',     'oral'),
  ('Naproxen',                    ARRAY['Naprosyn','Xenobid'],                       '500mg',      'tablet',     'oral'),
  ('Tramadol',                    ARRAY['Tramazac','Ultracet'],                      '50mg',       'capsule',    'oral'),

  -- Antibiotics
  ('Amoxicillin',                 ARRAY['Mox','Novamox','Amoxil'],                   '500mg',      'capsule',    'oral'),
  ('Amoxicillin + Clavulanate',   ARRAY['Augmentin','Clavam','Moxikind-CV'],         '625mg',      'tablet',     'oral'),
  ('Azithromycin',                ARRAY['Azee','Zithromax','Azithral'],              '500mg',      'tablet',     'oral'),
  ('Cefixime',                    ARRAY['Taxim-O','Mahacef','Zifi'],                 '200mg',      'tablet',     'oral'),
  ('Cefpodoxime',                 ARRAY['Cefpod','Pody','Maxcef'],                   '200mg',      'tablet',     'oral'),
  ('Cefuroxime',                  ARRAY['Ceftum','Pulmocef','Spectrum'],             '500mg',      'tablet',     'oral'),
  ('Ciprofloxacin',               ARRAY['Cifran','Ciplox','Ciprobid'],               '500mg',      'tablet',     'oral'),
  ('Levofloxacin',                ARRAY['Levoflox','Glevo','Lebact'],                '500mg',      'tablet',     'oral'),
  ('Ofloxacin',                   ARRAY['Zanocin','Oflox','Tarivid'],                '200mg',      'tablet',     'oral'),
  ('Doxycycline',                 ARRAY['Doxt','Minicycline','Vibramycin'],          '100mg',      'capsule',    'oral'),
  ('Metronidazole',               ARRAY['Flagyl','Metrogyl','Aristogyl'],            '400mg',      'tablet',     'oral'),
  ('Clarithromycin',              ARRAY['Clarimac','Claribid','Crixan'],             '500mg',      'tablet',     'oral'),
  ('Clindamycin',                 ARRAY['Dalacin-C','Clincin'],                      '300mg',      'capsule',    'oral'),

  -- Antifungals
  ('Fluconazole',                 ARRAY['Forcan','Fluka','Syscan'],                  '150mg',      'tablet',     'oral'),
  ('Itraconazole',                ARRAY['Itrazole','Sporanox','Canditral'],          '100mg',      'capsule',    'oral'),
  ('Terbinafine',                 ARRAY['Terbinaforce','Sebifin','Lamisil'],         '250mg',      'tablet',     'oral'),

  -- Antivirals
  ('Acyclovir',                   ARRAY['Zovirax','Acivir'],                         '400mg',      'tablet',     'oral'),

  -- Acid-suppressants
  ('Omeprazole',                  ARRAY['Omez','Ocid','Omee'],                       '20mg',       'capsule',    'oral'),
  ('Pantoprazole',                ARRAY['Pan','Pantocid','Pantop'],                  '40mg',       'tablet',     'oral'),
  ('Esomeprazole',                ARRAY['Nexium','Esoz','Sompraz'],                  '40mg',       'tablet',     'oral'),
  ('Rabeprazole',                 ARRAY['Razo','Rabeloc','Rabicip'],                 '20mg',       'tablet',     'oral'),
  ('Ranitidine',                  ARRAY['Aciloc','Rantac','Zinetac'],                '150mg',      'tablet',     'oral'),
  ('Famotidine',                  ARRAY['Famocid','Topcid'],                         '40mg',       'tablet',     'oral'),
  ('Sucralfate',                  ARRAY['Sucrace','Sucral'],                         '1g',         'tablet',     'oral'),

  -- Antiemetics / prokinetics
  ('Ondansetron',                 ARRAY['Emeset','Ondem','Vomikind'],                '4mg',        'tablet',     'oral'),
  ('Domperidone',                 ARRAY['Domstal','Vomistop','Motilium'],            '10mg',       'tablet',     'oral'),
  ('Metoclopramide',              ARRAY['Perinorm','Reglan'],                        '10mg',       'tablet',     'oral'),

  -- Anti-diarrhoeal / GI
  ('Loperamide',                  ARRAY['Eldoper','Imodium','Lopamide'],             '2mg',        'capsule',    'oral'),
  ('ORS (oral rehydration salts)',ARRAY['Electral','Enerzal','Walyte'],              '21g',        'sachet',     'oral'),
  ('Lactulose',                   ARRAY['Duphalac','Looz','Lactihep'],               '10g/15ml',   'syrup',      'oral'),
  ('Pancreatin',                  ARRAY['Panlipase','Creon','Digiplex'],             '10000IU',    'capsule',    'oral'),
  ('Dicyclomine',                 ARRAY['Cyclopam','Spasmonil'],                     '10mg',       'tablet',     'oral'),

  -- Antihistamines
  ('Cetirizine',                  ARRAY['Cetzine','Alerid','Cetcip'],                '10mg',       'tablet',     'oral'),
  ('Levocetirizine',              ARRAY['Levocet','Vozet','Xyzal'],                  '5mg',        'tablet',     'oral'),
  ('Loratadine',                  ARRAY['Lorfast','Alaspan','Claritin'],             '10mg',       'tablet',     'oral'),
  ('Fexofenadine',                ARRAY['Allegra','Fexo','Histafree'],               '120mg',      'tablet',     'oral'),
  ('Hydroxyzine',                 ARRAY['Atarax','Hydroxine'],                       '25mg',       'tablet',     'oral'),
  ('Pheniramine',                 ARRAY['Avil'],                                     '25mg',       'tablet',     'oral'),

  -- Steroids
  ('Prednisolone',                ARRAY['Wysolone','Omnacortil','Predmet'],          '10mg',       'tablet',     'oral'),
  ('Hydrocortisone',              ARRAY['Efcorlin','Cortef'],                        '100mg',      'injection',  'IV'),
  ('Dexamethasone',               ARRAY['Decdan','Dexona','Decmax'],                 '4mg',        'tablet',     'oral'),
  ('Methylprednisolone',          ARRAY['Medrol','Solu-Medrol','Depo-Medrol'],       '16mg',       'tablet',     'oral'),

  -- Antihypertensives / cardiac
  ('Amlodipine',                  ARRAY['Amlodac','Amlokind','Amlovas'],             '5mg',        'tablet',     'oral'),
  ('Telmisartan',                 ARRAY['Telma','Telpres','Tazloc'],                 '40mg',       'tablet',     'oral'),
  ('Losartan',                    ARRAY['Repace','Losacar','Cozaar'],                '50mg',       'tablet',     'oral'),
  ('Atenolol',                    ARRAY['Aten','Tenormin','Betacard'],               '50mg',       'tablet',     'oral'),
  ('Metoprolol',                  ARRAY['Betaloc','Met XL','Lopresor'],              '50mg',       'tablet',     'oral'),
  ('Ramipril',                    ARRAY['Cardace','Ramcor','Hopace'],                '5mg',        'tablet',     'oral'),
  ('Enalapril',                   ARRAY['Envas','Enam','BQL'],                       '5mg',        'tablet',     'oral'),
  ('Hydrochlorothiazide',         ARRAY['Hydrazide','Aquazide'],                     '12.5mg',     'tablet',     'oral'),
  ('Furosemide',                  ARRAY['Lasix','Frusemide'],                        '40mg',       'tablet',     'oral'),
  ('Spironolactone',              ARRAY['Aldactone','Spirohealth'],                  '25mg',       'tablet',     'oral'),

  -- Lipids / antiplatelets / anticoagulants
  ('Atorvastatin',                ARRAY['Atorlip','Atocor','Storvas'],               '10mg',       'tablet',     'oral'),
  ('Rosuvastatin',                ARRAY['Rosuvas','Crestor','Rozavel'],              '10mg',       'tablet',     'oral'),
  ('Clopidogrel',                 ARRAY['Clopilet','Deplatt','Plavix'],              '75mg',       'tablet',     'oral'),

  -- Antidiabetics
  ('Metformin',                   ARRAY['Glycomet','Glucophage','Obimet'],           '500mg',      'tablet',     'oral'),
  ('Glimepiride',                 ARRAY['Amaryl','Glimer','Glimisave'],              '2mg',        'tablet',     'oral'),
  ('Glipizide',                   ARRAY['Glytop','Minidiab'],                        '5mg',        'tablet',     'oral'),
  ('Sitagliptin',                 ARRAY['Januvia','Istavel','Sitazit'],              '100mg',      'tablet',     'oral'),
  ('Vildagliptin',                ARRAY['Galvus','Jalra'],                           '50mg',       'tablet',     'oral'),
  ('Insulin (Glargine)',          ARRAY['Lantus','Basalog','Glaritus'],              '100IU/ml',   'injection',  'SC'),
  ('Insulin (Aspart)',            ARRAY['Novorapid','Novomix'],                      '100IU/ml',   'injection',  'SC'),

  -- Bronchodilators / respiratory
  ('Salbutamol',                  ARRAY['Asthalin','Ventolin','Levolin'],            '100mcg',     'inhaler',    'inhaled'),
  ('Levosalbutamol',              ARRAY['Levolin','Lovinox'],                        '50mcg',      'inhaler',    'inhaled'),
  ('Budesonide',                  ARRAY['Budecort','Pulmicort','Foracort'],          '200mcg',     'inhaler',    'inhaled'),
  ('Montelukast',                 ARRAY['Montair','Telekast','Romilast'],            '10mg',       'tablet',     'oral'),
  ('Theophylline',                ARRAY['Theoasthalin','Deriphyllin'],               '300mg',      'tablet',     'oral'),
  ('Ambroxol',                    ARRAY['Mucolite','Ambrolite','Ambrodil'],          '30mg',       'tablet',     'oral'),
  ('Bromhexine',                  ARRAY['Bromex','Bisolvon'],                        '8mg',        'tablet',     'oral'),

  -- Thyroid
  ('Levothyroxine',               ARRAY['Eltroxin','Thyronorm','Thyrox'],            '50mcg',      'tablet',     'oral'),

  -- Anxiolytics / antidepressants
  ('Alprazolam',                  ARRAY['Restyl','Alprax','Anxit'],                  '0.5mg',      'tablet',     'oral'),
  ('Diazepam',                    ARRAY['Valium','Calmpose'],                        '5mg',        'tablet',     'oral'),
  ('Clonazepam',                  ARRAY['Rivotril','Lonazep'],                       '0.5mg',      'tablet',     'oral'),
  ('Escitalopram',                ARRAY['Nexito','Cipralex','Stalopam'],             '10mg',       'tablet',     'oral'),
  ('Sertraline',                  ARRAY['Daxid','Serlift','Zoloft'],                 '50mg',       'tablet',     'oral'),

  -- Vitamins / supplements
  ('Vitamin D3 (Cholecalciferol)',ARRAY['Calcirol','Uprise-D3','D3 Bon'],            '60000IU',    'sachet',     'oral'),
  ('Vitamin B12 (Methylcobalamin)',ARRAY['Nervijen','Methycobal','Mecobal'],         '1500mcg',    'tablet',     'oral'),
  ('Folic Acid',                  ARRAY['Folvite','Fol-123','Folicit'],              '5mg',        'tablet',     'oral'),
  ('Iron (Ferrous Sulphate)',     ARRAY['Fefol','Livogen','Autrin'],                 '150mg',      'tablet',     'oral'),
  ('Calcium Carbonate + Vit D3',  ARRAY['Shelcal','Calcimax','Gemcal'],              '500mg',      'tablet',     'oral'),

  -- Topicals
  ('Mupirocin',                   ARRAY['T-Bact','Bactroban','Supirocin'],           '2%',         'ointment',   'topical'),
  ('Clotrimazole',                ARRAY['Candid','Canesten','Surfaz'],               '1%',         'cream',      'topical'),
  ('Betamethasone + Clotrimazole',ARRAY['Quadriderm','Lobate-GM'],                   '0.05%',      'cream',      'topical'),
  ('Diclofenac (topical)',        ARRAY['Voveran','Volini','Dynapar gel'],           '1%',         'gel',        'topical'),

  -- Eye / ENT
  ('Ciprofloxacin (eye)',         ARRAY['Ciplox-D','Cifran eye drops'],              '0.3%',       'drops',      'other'),
  ('Tobramycin (eye)',            ARRAY['Tobastar','Tobacin'],                       '0.3%',       'drops',      'other'),
  ('Xylometazoline (nasal)',      ARRAY['Otrivin','Nasivion'],                       '0.1%',       'drops',      'nasal')
) AS seed(generic_name, brand_names, strength, form, route_default)
WHERE NOT EXISTS (
  SELECT 1 FROM drug_master dm
  WHERE lower(dm.generic_name) = lower(seed.generic_name)
);
