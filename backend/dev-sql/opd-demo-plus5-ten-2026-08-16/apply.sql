-- APPLY: 10 dummy video patients, staggered 10-min slots from now() + 5 minutes.
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
-- Phone: 8264602737  Email: as.sahilabhi2937@gmail.com
--
-- Pair: backend/dev-sql/opd-demo-plus5-ten-2026-08-16/{apply,delete}.sql
-- Prefer the TS apply (computes wall-clock +5m at run time):
--   npx ts-node -r dotenv/config scripts/apply-plus5-ten-2026-08-16.ts

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
  ('c1600001-0000-4000-8000-000000000001', 'Meera Joshi',    '8264602737', 'as.sahilabhi2937@gmail.com', 34, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-000000000002', 'Rohan Sethi',    '8264602737', 'as.sahilabhi2937@gmail.com', 41, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-000000000003', 'Ananya Ghosh',   '8264602737', 'as.sahilabhi2937@gmail.com', 27, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-000000000004', 'Vikram Nair',    '8264602737', 'as.sahilabhi2937@gmail.com', 36, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-000000000005', 'Ishita Kapoor',  '8264602737', 'as.sahilabhi2937@gmail.com', 30, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-000000000006', 'Kabir Singh',    '8264602737', 'as.sahilabhi2937@gmail.com', 45, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-000000000007', 'Nisha Reddy',    '8264602737', 'as.sahilabhi2937@gmail.com', 22, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-000000000008', 'Farhan Ali',     '8264602737', 'as.sahilabhi2937@gmail.com', 39, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-000000000009', 'Pooja Shah',     '8264602737', 'as.sahilabhi2937@gmail.com', 48, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1600001-0000-4000-8000-00000000000a', 'Dev Patel',      '8264602737', 'as.sahilabhi2937@gmail.com', 25, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (
  id,
  doctor_id,
  patient_id,
  patient_name,
  patient_phone,
  appointment_date,
  status,
  reason_for_visit,
  consultation_type,
  opd_event_type,
  booking_origin,
  notes
) VALUES
  ('d1600001-0000-4000-8000-000000000001', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000001', 'Meera Joshi',    '8264602737', now() + interval '5 minutes',  'confirmed', 'Acne review — +5m ten',      'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-000000000002', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000002', 'Rohan Sethi',    '8264602737', now() + interval '15 minutes', 'confirmed', 'Dandruff — +5m ten',         'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-000000000003', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000003', 'Ananya Ghosh',   '8264602737', now() + interval '25 minutes', 'confirmed', 'Rash on arm — +5m ten',      'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-000000000004', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000004', 'Vikram Nair',    '8264602737', now() + interval '35 minutes', 'confirmed', 'Wart removal — +5m ten',     'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-000000000005', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000005', 'Ishita Kapoor',  '8264602737', now() + interval '45 minutes', 'confirmed', 'Melasma — +5m ten',          'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-000000000006', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000006', 'Kabir Singh',    '8264602737', now() + interval '55 minutes', 'confirmed', 'Fungal infection — +5m ten', 'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-000000000007', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000007', 'Nisha Reddy',    '8264602737', now() + interval '65 minutes', 'confirmed', 'Allergy patch — +5m ten',    'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-000000000008', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000008', 'Farhan Ali',     '8264602737', now() + interval '75 minutes', 'confirmed', 'Skin tag — +5m ten',         'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-000000000009', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-000000000009', 'Pooja Shah',     '8264602737', now() + interval '85 minutes', 'confirmed', 'Dry skin — +5m ten',         'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16'),
  ('d1600001-0000-4000-8000-00000000000a', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1600001-0000-4000-8000-00000000000a', 'Dev Patel',      '8264602737', now() + interval '95 minutes', 'confirmed', 'Ingrown nail — +5m ten',     'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-16')
ON CONFLICT (id) DO UPDATE SET
  appointment_date = EXCLUDED.appointment_date,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes;

COMMIT;
