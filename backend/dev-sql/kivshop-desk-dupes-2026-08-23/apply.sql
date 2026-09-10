-- APPLY: overlap patients for desk search / dedup (same name, phone, age mixes).
-- Doctor: 22419ea8-67cf-4872-b06a-a256273accb5
-- Prefer: npx ts-node -r dotenv/config scripts/apply-kivshop-desk-dupes-2026-08-23.ts

BEGIN;

INSERT INTO patients (
  id, name, phone, email, age, gender, doctor_id,
  platform, platform_external_id, consent_status, consent_granted_at, consent_method,
  medical_record_number
) VALUES
  -- Sunita Devi (existing 62 / 9000010101)
  ('e2300003-0000-4000-8000-000000000001', 'Sunita Devi',     '9000010101', 'desk.dupe.01@example.test', 62, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-000000000002', 'Sunita Devi',     '9000010201', 'desk.dupe.02@example.test', 62, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-000000000003', 'Sunita Devi',     '9000010101', 'desk.dupe.03@example.test', 58, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-000000000004', 'Sunita Devi',     '9000010202', 'desk.dupe.04@example.test', 45, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  -- Arjun Malhotra (existing 37 / 9000010002)
  ('e2300003-0000-4000-8000-000000000005', 'Arjun Malhotra',  '9000010002', 'desk.dupe.05@example.test', 37, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-000000000006', 'Arjun Malhotra',  '9000010203', 'desk.dupe.06@example.test', 37, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-000000000007', 'Arjun Malhotra',  '9000010002', 'desk.dupe.07@example.test', 41, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-000000000008', 'Karan Malhotra',  '9000010002', 'desk.dupe.08@example.test', 37, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  -- Pooja Yadav (existing 28 / 9000010103)
  ('e2300003-0000-4000-8000-000000000009', 'Pooja Yadav',     '9000010103', 'desk.dupe.09@example.test', 28, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-00000000000a', 'Pooja Yadav',     '9000010204', 'desk.dupe.10@example.test', 28, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-00000000000b', 'Pooja Sharma',    '9000010103', 'desk.dupe.11@example.test', 28, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  -- One household number
  ('e2300003-0000-4000-8000-00000000000c', 'Ravi Kumar',      '9000010300', 'desk.dupe.12@example.test', 40, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-00000000000d', 'Neha Kumar',      '9000010300', 'desk.dupe.13@example.test', 38, 'female', '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-00000000000e', 'Ankit Kumar',     '9000010300', 'desk.dupe.14@example.test', 12, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  -- Same name + age, different phones
  ('e2300003-0000-4000-8000-00000000000f', 'Amit Sharma',     '9000010205', 'desk.dupe.15@example.test', 50, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('e2300003-0000-4000-8000-000000000010', 'Amit Sharma',     '9000010206', 'desk.dupe.16@example.test', 50, 'male',   '22419ea8-67cf-4872-b06a-a256273accb5', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT assign_patient_mrn(id)
FROM patients
WHERE id IN (
  'e2300003-0000-4000-8000-000000000001',
  'e2300003-0000-4000-8000-000000000002',
  'e2300003-0000-4000-8000-000000000003',
  'e2300003-0000-4000-8000-000000000004',
  'e2300003-0000-4000-8000-000000000005',
  'e2300003-0000-4000-8000-000000000006',
  'e2300003-0000-4000-8000-000000000007',
  'e2300003-0000-4000-8000-000000000008',
  'e2300003-0000-4000-8000-000000000009',
  'e2300003-0000-4000-8000-00000000000a',
  'e2300003-0000-4000-8000-00000000000b',
  'e2300003-0000-4000-8000-00000000000c',
  'e2300003-0000-4000-8000-00000000000d',
  'e2300003-0000-4000-8000-00000000000e',
  'e2300003-0000-4000-8000-00000000000f',
  'e2300003-0000-4000-8000-000000000010'
);

COMMIT;
