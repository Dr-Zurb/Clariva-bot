-- APPLY: 20 dummy desk patients for KivShop, plus 5 extra names on 9000010017.
-- Doctor: 22419ea8-67cf-4872-b06a-a256273accb5
--
-- Pair: backend/dev-sql/kivshop-desk-20-2026-08-23/{apply,delete}.sql
-- Prefer the TS apply (assigns MRN via assign_patient_mrn):
--   npx ts-node -r dotenv/config scripts/apply-kivshop-desk-20-2026-08-23.ts

BEGIN;

INSERT INTO patients (
  id,
  name,
  phone,
  email,
  age,
  gender,
  doctor_id,
  platform,
  platform_external_id,
  consent_status,
  consent_granted_at,
  consent_method,
  medical_record_number
) VALUES
  ('e2300001-0000-4000-8000-000000000001', 'Kavya Iyer',      '9000010001', 'desk.seed.01@example.test', 29, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000002', 'Arjun Malhotra',  '9000010002', 'desk.seed.02@example.test', 37, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000003', 'Sneha Banerjee',  '9000010003', 'desk.seed.03@example.test', 24, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000004', 'Rahul Deshmukh',  '9000010004', 'desk.seed.04@example.test', 52, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000005', 'Diya Menon',      '9000010005', 'desk.seed.05@example.test', 31, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000006', 'Harsh Vardhan',   '9000010006', 'desk.seed.06@example.test', 44, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000007', 'Tanvi Kulkarni',  '9000010007', 'desk.seed.07@example.test', 26, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000008', 'Imran Qureshi',   '9000010008', 'desk.seed.08@example.test', 39, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000009', 'Aditi Rao',       '9000010009', 'desk.seed.09@example.test', 33, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-00000000000a', 'Yash Bansal',     '9000010010', 'desk.seed.10@example.test', 21, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-00000000000b', 'Leela Nambiar',   '9000010011', 'desk.seed.11@example.test', 58, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-00000000000c', 'Sourav Das',      '9000010012', 'desk.seed.12@example.test', 35, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-00000000000d', 'Megha Pillai',    '9000010013', 'desk.seed.13@example.test', 42, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-00000000000e', 'Nikhil Jain',     '9000010014', 'desk.seed.14@example.test', 28, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-00000000000f', 'Zara Khan',       '9000010015', 'desk.seed.15@example.test', 19, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000010', 'Pranav Iyer',     '9000010016', 'desk.seed.16@example.test', 47, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000011', 'Rhea Chawla',     '9000010017', 'desk.seed.17@example.test', 36, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000012', 'Amit Kulkarni',   '9000010018', 'desk.seed.18@example.test', 61, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000013', 'Sana Sheikh',     '9000010019', 'desk.seed.19@example.test', 23, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000014', 'Kunal Bhatt',     '9000010020', 'desk.seed.20@example.test', 40, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000015', 'Meera Joshi',     '9000010017', 'desk.seed.21@example.test', 41, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000016', 'Vikram Sethi',    '9000010017', 'desk.seed.22@example.test', 55, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000017', 'Ananya Grover',   '9000010017', 'desk.seed.23@example.test', 22, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000018', 'Rohan Kapoor',    '9000010017', 'desk.seed.24@example.test', 34, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300001-0000-4000-8000-000000000019', 'Fatima Noor',     '9000010017', 'desk.seed.25@example.test', 48, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT assign_patient_mrn(id)
FROM patients
WHERE id IN (
  'e2300001-0000-4000-8000-000000000001',
  'e2300001-0000-4000-8000-000000000002',
  'e2300001-0000-4000-8000-000000000003',
  'e2300001-0000-4000-8000-000000000004',
  'e2300001-0000-4000-8000-000000000005',
  'e2300001-0000-4000-8000-000000000006',
  'e2300001-0000-4000-8000-000000000007',
  'e2300001-0000-4000-8000-000000000008',
  'e2300001-0000-4000-8000-000000000009',
  'e2300001-0000-4000-8000-00000000000a',
  'e2300001-0000-4000-8000-00000000000b',
  'e2300001-0000-4000-8000-00000000000c',
  'e2300001-0000-4000-8000-00000000000d',
  'e2300001-0000-4000-8000-00000000000e',
  'e2300001-0000-4000-8000-00000000000f',
  'e2300001-0000-4000-8000-000000000010',
  'e2300001-0000-4000-8000-000000000011',
  'e2300001-0000-4000-8000-000000000012',
  'e2300001-0000-4000-8000-000000000013',
  'e2300001-0000-4000-8000-000000000014',
  'e2300001-0000-4000-8000-000000000015',
  'e2300001-0000-4000-8000-000000000016',
  'e2300001-0000-4000-8000-000000000017',
  'e2300001-0000-4000-8000-000000000018',
  'e2300001-0000-4000-8000-000000000019'
);

COMMIT;
