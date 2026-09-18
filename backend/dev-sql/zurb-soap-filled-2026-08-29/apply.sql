-- APPLY: 5 in-clinic visits on Dr Zurb with every SOAP tab filled.
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
-- Prefer the TS apply (computes today's wall-clock slots + structured JSON):
--   npx ts-node -r dotenv/config scripts/apply-zurb-soap-filled-2026-08-29.ts
--
-- Pair: backend/dev-sql/zurb-soap-filled-2026-08-29/{apply,delete}.sql
-- This paste path fills the same 5 patients and SOAP text/vitals.
-- Run the TS script for complaint cards, exam JSON, and diagnosis rows.

BEGIN;

INSERT INTO patients (
  id, name, phone, email, age, gender, date_of_birth, doctor_id,
  platform, platform_external_id, consent_status, consent_granted_at, consent_method,
  registered_via, medical_record_number
) VALUES
  ('c2900001-0000-4000-8000-000000000001', 'Aditi Rao',      '9000029001', 'desk.zurb.soap01@example.test', 32, 'female', '1994-03-14', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2900001-0000-4000-8000-000000000002', 'Manish Tiwari',  '9000029002', 'desk.zurb.soap02@example.test', 44, 'male',   '1982-07-21', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2900001-0000-4000-8000-000000000003', 'Priya Menon',    '9000029003', 'desk.zurb.soap03@example.test', 38, 'female', '1988-11-02', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2900001-0000-4000-8000-000000000004', 'Arjun Khanna',   '9000029004', 'desk.zurb.soap04@example.test', 29, 'male',   '1997-01-18', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2900001-0000-4000-8000-000000000005', 'Sunita Bhatia',  '9000029005', 'desk.zurb.soap05@example.test', 55, 'female', '1971-05-09', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  age = EXCLUDED.age,
  gender = EXCLUDED.gender,
  date_of_birth = EXCLUDED.date_of_birth;

SELECT assign_patient_mrn(id)
FROM patients
WHERE id IN (
  'c2900001-0000-4000-8000-000000000001',
  'c2900001-0000-4000-8000-000000000002',
  'c2900001-0000-4000-8000-000000000003',
  'c2900001-0000-4000-8000-000000000004',
  'c2900001-0000-4000-8000-000000000005'
);

INSERT INTO appointments (
  id, doctor_id, patient_id, patient_name, patient_phone,
  appointment_date, status, reason_for_visit, consultation_type,
  opd_event_type, booking_origin, notes, patient_checked_in_at
) VALUES
  ('d2900001-0000-4000-8000-000000000001', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2900001-0000-4000-8000-000000000001', 'Aditi Rao',     '9000029001', date_trunc('day', timezone('Asia/Kolkata', now())) + interval '18 hours',      'confirmed', 'Fever and cough',      'in_clinic', 'standard', 'walk_in', 'zurb soap filled seed 2026-08-29', now()),
  ('d2900001-0000-4000-8000-000000000002', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2900001-0000-4000-8000-000000000002', 'Manish Tiwari', '9000029002', date_trunc('day', timezone('Asia/Kolkata', now())) + interval '18 hours 15 minutes', 'confirmed', 'Burning micturition',  'in_clinic', 'standard', 'walk_in', 'zurb soap filled seed 2026-08-29', now()),
  ('d2900001-0000-4000-8000-000000000003', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2900001-0000-4000-8000-000000000003', 'Priya Menon',   '9000029003', date_trunc('day', timezone('Asia/Kolkata', now())) + interval '18 hours 30 minutes', 'confirmed', 'Heartburn',            'in_clinic', 'standard', 'walk_in', 'zurb soap filled seed 2026-08-29', now()),
  ('d2900001-0000-4000-8000-000000000004', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2900001-0000-4000-8000-000000000004', 'Arjun Khanna',  '9000029004', date_trunc('day', timezone('Asia/Kolkata', now())) + interval '18 hours 45 minutes', 'confirmed', 'Migraine',             'in_clinic', 'standard', 'walk_in', 'zurb soap filled seed 2026-08-29', now()),
  ('d2900001-0000-4000-8000-000000000005', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2900001-0000-4000-8000-000000000005', 'Sunita Bhatia', '9000029005', date_trunc('day', timezone('Asia/Kolkata', now())) + interval '19 hours',      'confirmed', 'Asthma review',        'in_clinic', 'standard', 'walk_in', 'zurb soap filled seed 2026-08-29', now())
ON CONFLICT (id) DO UPDATE SET
  appointment_date = EXCLUDED.appointment_date,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  patient_checked_in_at = EXCLUDED.patient_checked_in_at;

COMMIT;
