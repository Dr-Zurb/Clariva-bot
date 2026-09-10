-- APPLY: 10 dummy video patients, all now() + 5 minutes.
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
-- Phone: 8264602737  Email: as.sahilabhi2937@gmail.com
--
-- Pair: backend/dev-sql/opd-demo-plus5-ten-2026-08-14/{apply,delete}.sql
-- Prefer the TS apply (computes wall-clock +5m at run time):
--   npx ts-node -r dotenv/config scripts/apply-plus5-ten-2026-08-14.ts

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
  ('c1400001-0000-4000-8000-000000000001', 'Tara Iyer',      '8264602737', 'as.sahilabhi2937@gmail.com', 29, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-000000000002', 'Arjun Khanna',   '8264602737', 'as.sahilabhi2937@gmail.com', 38, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-000000000003', 'Sana Qureshi',   '8264602737', 'as.sahilabhi2937@gmail.com', 33, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-000000000004', 'Nikhil Rao',     '8264602737', 'as.sahilabhi2937@gmail.com', 26, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-000000000005', 'Priya Menon',    '8264602737', 'as.sahilabhi2937@gmail.com', 42, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-000000000006', 'Aditya Bansal',  '8264602737', 'as.sahilabhi2937@gmail.com', 35, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-000000000007', 'Kavya Pillai',   '8264602737', 'as.sahilabhi2937@gmail.com', 24, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-000000000008', 'Harsh Malhotra', '8264602737', 'as.sahilabhi2937@gmail.com', 47, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-000000000009', 'Rhea Kulkarni',  '8264602737', 'as.sahilabhi2937@gmail.com', 31, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1400001-0000-4000-8000-00000000000a', 'Yash Desai',     '8264602737', 'as.sahilabhi2937@gmail.com', 28, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL)
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
  ('d1400001-0000-4000-8000-000000000001', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000001', 'Tara Iyer',      '8264602737', now() + interval '5 minutes', 'confirmed', 'Acne flare — +5m ten',       'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-000000000002', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000002', 'Arjun Khanna',   '8264602737', now() + interval '5 minutes', 'confirmed', 'Itchy scalp — +5m ten',      'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-000000000003', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000003', 'Sana Qureshi',   '8264602737', now() + interval '5 minutes', 'confirmed', 'Mole check — +5m ten',       'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-000000000004', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000004', 'Nikhil Rao',     '8264602737', now() + interval '5 minutes', 'confirmed', 'Eczema — +5m ten',           'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-000000000005', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000005', 'Priya Menon',    '8264602737', now() + interval '5 minutes', 'confirmed', 'Hair fall — +5m ten',        'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-000000000006', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000006', 'Aditya Bansal',  '8264602737', now() + interval '5 minutes', 'confirmed', 'Psoriasis review — +5m ten', 'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-000000000007', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000007', 'Kavya Pillai',   '8264602737', now() + interval '5 minutes', 'confirmed', 'Pigmentation — +5m ten',     'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-000000000008', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000008', 'Harsh Malhotra', '8264602737', now() + interval '5 minutes', 'confirmed', 'Nail infection — +5m ten',   'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-000000000009', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-000000000009', 'Rhea Kulkarni',  '8264602737', now() + interval '5 minutes', 'confirmed', 'Hives — +5m ten',            'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14'),
  ('d1400001-0000-4000-8000-00000000000a', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', 'c1400001-0000-4000-8000-00000000000a', 'Yash Desai',     '8264602737', now() + interval '5 minutes', 'confirmed', 'Sunburn — +5m ten',          'video', 'standard', 'booked', 'demo seed +5m ten 2026-08-14')
ON CONFLICT (id) DO UPDATE SET
  appointment_date = EXCLUDED.appointment_date,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes;

COMMIT;
