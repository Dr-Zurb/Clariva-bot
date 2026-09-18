-- APPLY: 20 more desk patients for KivShop (new names, phones, relatives).
-- Doctor: 22419ea8-67cf-4872-b06a-a256273accb5
--
-- Pair: backend/dev-sql/kivshop-desk-20b-2026-08-23/{apply,delete}.sql
-- Prefer the TS apply (assigns MRN via assign_patient_mrn):
--   npx ts-node -r dotenv/config scripts/apply-kivshop-desk-20b-2026-08-23.ts

BEGIN;

INSERT INTO patients (
  id,
  name,
  phone,
  email,
  age,
  gender,
  guardian_name,
  guardian_relation,
  address,
  doctor_id,
  platform,
  platform_external_id,
  consent_status,
  consent_granted_at,
  consent_method,
  registered_via,
  medical_record_number
) VALUES
  ('e2300002-0000-4000-8000-000000000001', 'Sunita Devi',      '9000010101', 'desk.seed.b01@example.test', 62, 'female', 'Ram Prakash',     'spouse',   'Model Town',           '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000002', 'Balwant Singh',    '9000010102', 'desk.seed.b02@example.test', 71, 'male',   'Gurpreet Singh',  'son',      'Jalandhar Cantt',      '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000003', 'Pooja Yadav',      '9000010103', 'desk.seed.b03@example.test', 28, 'female', 'Ramesh Yadav',    'father',   'Sector 22 Chandigarh', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000004', 'Manoj Tiwari',     '9000010104', 'desk.seed.b04@example.test', 45, 'male',   'Kavita Tiwari',   'spouse',   'Gomti Nagar',          '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000005', 'Aisha Rahman',     '9000010105', 'desk.seed.b05@example.test',  8, 'female', 'Imtiaz Rahman',   'father',   'Park Circus',          '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000006', 'Kabir Mehta',      '9000010106', 'desk.seed.b06@example.test',  1, 'male',   'Sameer Mehta',    'father',   'Vastrapur',            '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000007', 'Lalita Bai',       '9000010107', 'desk.seed.b07@example.test', 68, 'female', 'Deepak Verma',    'son',      'Indore',               '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000008', 'Farooq Ahmed',     '9000010108', 'desk.seed.b08@example.test', 54, 'male',   'Nasreen Ahmed',   'spouse',   'Hyderabad Old City',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000009', 'Nandini Reddy',    '9000010109', 'desk.seed.b09@example.test', 32, 'female', 'Venkat Reddy',    'father',   'Banjara Hills',        '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-00000000000a', 'Tejas Gaikwad',    '9000010110', 'desk.seed.b10@example.test', 17, 'male',   'Suresh Gaikwad',  'father',   'Kothrud Pune',         '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-00000000000b', 'Usha Rani',        '9000010111', 'desk.seed.b11@example.test', 59, 'female', 'Om Prakash',      'spouse',   'Ludhiana',             '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-00000000000c', 'Devansh Agarwal',  '9000010112', 'desk.seed.b12@example.test', 11, 'male',   'Priya Agarwal',   'mother',   'C-Scheme Jaipur',      '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-00000000000d', 'Shabnam Begum',    '9000010113', 'desk.seed.b13@example.test', 43, 'female', 'Irfan Khan',      'spouse',   'Srinagar',             '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-00000000000e', 'Rakesh Chauhan',   '9000010114', 'desk.seed.b14@example.test', 38, 'male',   'Bhupendra Chauhan','father',  'Gwalior',              '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-00000000000f', 'Kirti Sharma',     '9000010115', 'desk.seed.b15@example.test', 26, 'female', 'Anil Sharma',     'father',   'Noida Sec 62',         '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000010', 'Omkar Patil',      '9000010116', 'desk.seed.b16@example.test', 50, 'male',   'Savita Patil',    'spouse',   'Nashik',               '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000011', 'Aarav Saxena',     '9000010117', 'desk.seed.b17@example.test',  0, 'male',   'Mohit Saxena',    'father',   'Hazratganj',           '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000012', 'Geeta Kumari',     '9000010118', 'desk.seed.b18@example.test', 74, 'female', 'Rekha Kumari',    'daughter', 'Patna Boring Road',    '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000013', 'Jatin Oberoi',     '9000010119', 'desk.seed.b19@example.test', 29, 'male',   'Harish Oberoi',   'father',   'Amritsar',             '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('e2300002-0000-4000-8000-000000000014', 'Noor Fatima',      '9000010120', 'desk.seed.b20@example.test', 35, 'female', 'Asif Ali',        'spouse',   'Bhopal',               '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL)
ON CONFLICT (id) DO UPDATE SET
  guardian_name = EXCLUDED.guardian_name,
  guardian_relation = EXCLUDED.guardian_relation,
  address = EXCLUDED.address,
  age = EXCLUDED.age,
  gender = EXCLUDED.gender,
  phone = EXCLUDED.phone,
  name = EXCLUDED.name;

SELECT assign_patient_mrn(id)
FROM patients
WHERE id IN (
  'e2300002-0000-4000-8000-000000000001',
  'e2300002-0000-4000-8000-000000000002',
  'e2300002-0000-4000-8000-000000000003',
  'e2300002-0000-4000-8000-000000000004',
  'e2300002-0000-4000-8000-000000000005',
  'e2300002-0000-4000-8000-000000000006',
  'e2300002-0000-4000-8000-000000000007',
  'e2300002-0000-4000-8000-000000000008',
  'e2300002-0000-4000-8000-000000000009',
  'e2300002-0000-4000-8000-00000000000a',
  'e2300002-0000-4000-8000-00000000000b',
  'e2300002-0000-4000-8000-00000000000c',
  'e2300002-0000-4000-8000-00000000000d',
  'e2300002-0000-4000-8000-00000000000e',
  'e2300002-0000-4000-8000-00000000000f',
  'e2300002-0000-4000-8000-000000000010',
  'e2300002-0000-4000-8000-000000000011',
  'e2300002-0000-4000-8000-000000000012',
  'e2300002-0000-4000-8000-000000000013',
  'e2300002-0000-4000-8000-000000000014'
);

COMMIT;
