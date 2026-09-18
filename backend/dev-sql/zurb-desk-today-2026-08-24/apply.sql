-- APPLY: 10 in-clinic desk visits on Dr Zurb for 2026-08-24 (Asia/Kolkata).
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
-- Prefer: npx ts-node -r dotenv/config scripts/apply-zurb-desk-today-2026-08-24.ts

BEGIN;

INSERT INTO patients (
  id, name, phone, email, age, gender, doctor_id,
  platform, platform_external_id, consent_status, consent_granted_at, consent_method,
  registered_via, medical_record_number
) VALUES
  ('c2400001-0000-4000-8000-000000000001', 'Rekha Bansal',   '9000024001', 'desk.zurb.t01@example.test', 46, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-000000000002', 'Suresh Yadav',   '9000024002', 'desk.zurb.t02@example.test', 53, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-000000000003', 'Mitali Sen',     '9000024003', 'desk.zurb.t03@example.test', 29, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-000000000004', 'Harpreet Gill',  '9000024004', 'desk.zurb.t04@example.test', 38, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-000000000005', 'Lavanya Iyer',   '9000024005', 'desk.zurb.t05@example.test', 33, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-000000000006', 'Imtiaz Khan',    '9000024006', 'desk.zurb.t06@example.test', 41, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-000000000007', 'Bhavna Joshi',   '9000024007', 'desk.zurb.t07@example.test', 24, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-000000000008', 'Gopal Krishan',  '9000024008', 'desk.zurb.t08@example.test', 67, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-000000000009', 'Tanya Dsouza',   '9000024009', 'desk.zurb.t09@example.test', 19, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL),
  ('c2400001-0000-4000-8000-00000000000a', 'Naveen Reddy',   '9000024010', 'desk.zurb.t10@example.test', 36, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', 'front_desk', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT assign_patient_mrn(id)
FROM patients
WHERE id IN (
  'c2400001-0000-4000-8000-000000000001',
  'c2400001-0000-4000-8000-000000000002',
  'c2400001-0000-4000-8000-000000000003',
  'c2400001-0000-4000-8000-000000000004',
  'c2400001-0000-4000-8000-000000000005',
  'c2400001-0000-4000-8000-000000000006',
  'c2400001-0000-4000-8000-000000000007',
  'c2400001-0000-4000-8000-000000000008',
  'c2400001-0000-4000-8000-000000000009',
  'c2400001-0000-4000-8000-00000000000a'
);

INSERT INTO appointments (
  id, doctor_id, patient_id, patient_name, patient_phone,
  appointment_date, status, reason_for_visit, consultation_type,
  opd_event_type, booking_origin, notes, patient_checked_in_at
) VALUES
  ('d2400001-0000-4000-8000-000000000001', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000001', 'Rekha Bansal',  '9000024001', timestamptz '2026-08-24 08:00:00+05:30', 'confirmed', 'Follow-up rash',     'in_clinic', 'standard', 'walk_in', 'desk seed today 2026-08-24', now()),
  ('d2400001-0000-4000-8000-000000000002', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000002', 'Suresh Yadav',  '9000024002', timestamptz '2026-08-24 08:15:00+05:30', 'confirmed', 'Knee pain',          'in_clinic', 'standard', 'walk_in', 'desk seed today 2026-08-24', now()),
  ('d2400001-0000-4000-8000-000000000003', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000003', 'Mitali Sen',    '9000024003', timestamptz '2026-08-24 08:30:00+05:30', 'confirmed', 'Fever 2 days',       'in_clinic', 'standard', 'walk_in', 'desk seed today 2026-08-24', NULL),
  ('d2400001-0000-4000-8000-000000000004', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000004', 'Harpreet Gill', '9000024004', timestamptz '2026-08-24 08:45:00+05:30', 'confirmed', 'Cough and cold',     'in_clinic', 'standard', 'booked',  'desk seed today 2026-08-24', NULL),
  ('d2400001-0000-4000-8000-000000000005', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000005', 'Lavanya Iyer',  '9000024005', timestamptz '2026-08-24 09:00:00+05:30', 'confirmed', 'Acne review',        'in_clinic', 'standard', 'booked',  'desk seed today 2026-08-24', NULL),
  ('d2400001-0000-4000-8000-000000000006', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000006', 'Imtiaz Khan',   '9000024006', timestamptz '2026-08-24 09:15:00+05:30', 'confirmed', 'BP check',           'in_clinic', 'standard', 'walk_in', 'desk seed today 2026-08-24', NULL),
  ('d2400001-0000-4000-8000-000000000007', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000007', 'Bhavna Joshi',  '9000024007', timestamptz '2026-08-24 09:30:00+05:30', 'confirmed', 'Headache',           'in_clinic', 'standard', 'walk_in', 'desk seed today 2026-08-24', NULL),
  ('d2400001-0000-4000-8000-000000000008', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000008', 'Gopal Krishan', '9000024008', timestamptz '2026-08-24 09:45:00+05:30', 'confirmed', 'Diabetes follow-up', 'in_clinic', 'standard', 'booked',  'desk seed today 2026-08-24', NULL),
  ('d2400001-0000-4000-8000-000000000009', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-000000000009', 'Tanya Dsouza',  '9000024009', timestamptz '2026-08-24 10:00:00+05:30', 'confirmed', 'Allergy',            'in_clinic', 'standard', 'walk_in', 'desk seed today 2026-08-24', NULL),
  ('d2400001-0000-4000-8000-00000000000a', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c2400001-0000-4000-8000-00000000000a', 'Naveen Reddy',  '9000024010', timestamptz '2026-08-24 10:15:00+05:30', 'confirmed', 'Back pain',          'in_clinic', 'standard', 'booked',  'desk seed today 2026-08-24', NULL)
ON CONFLICT (id) DO UPDATE SET
  appointment_date = EXCLUDED.appointment_date,
  status = EXCLUDED.status,
  consultation_type = EXCLUDED.consultation_type,
  booking_origin = EXCLUDED.booking_origin,
  notes = EXCLUDED.notes,
  patient_checked_in_at = EXCLUDED.patient_checked_in_at;

COMMIT;
