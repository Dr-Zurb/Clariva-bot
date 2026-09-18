-- APPLY: 10 demo patients for full previsit ladder (T−30 / T−15 / T−5 / T=0).
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
-- Phone: 8264602737  Email: as.sahilabhi2937@gmail.com
--
-- Pair: backend/dev-sql/opd-demo-previsit-notify-2026-08-13/{apply,delete}.sql
-- How to run: Supabase Dashboard → SQL Editor → paste → Run
-- Worker: PREVISIT_NOTIFY_WORKER_ENABLED=true (or npm run job:previsit)
--
-- 15-minute serial starting at now() + 60 minutes.
-- Each slot is outside the 30m check-in window at seed time, so the first
-- emails are T−30 check-in as each patient enters the window:
--   #1  +60m  → checkin_30 in ~30m, then T−15 / T−5 / T=0
--   #2  +75m  → same ladder, 15m later
--   … through #10 +195m
--
-- Requires migration 195 (patient_start_notified_at).

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
  ('c1300001-0000-4000-8000-000000000001', 'Riya Sharma',   '8264602737', 'as.sahilabhi2937@gmail.com', 28, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-000000000002', 'Aarav Mehta',   '8264602737', 'as.sahilabhi2937@gmail.com', 34, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-000000000003', 'Neha Kapoor',   '8264602737', 'as.sahilabhi2937@gmail.com', 41, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-000000000004', 'Kabir Singh',   '8264602737', 'as.sahilabhi2937@gmail.com', 22, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-000000000005', 'Ananya Verma',  '8264602737', 'as.sahilabhi2937@gmail.com', 36, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-000000000006', 'Vivaan Joshi',  '8264602737', 'as.sahilabhi2937@gmail.com', 31, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-000000000007', 'Isha Reddy',    '8264602737', 'as.sahilabhi2937@gmail.com', 27, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-000000000008', 'Rohan Gupta',   '8264602737', 'as.sahilabhi2937@gmail.com', 45, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-000000000009', 'Meera Nair',    '8264602737', 'as.sahilabhi2937@gmail.com', 39, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1300001-0000-4000-8000-00000000000a', 'Dev Patel',     '8264602737', 'as.sahilabhi2937@gmail.com', 29, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL)
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
  (
    'd1300001-0000-4000-8000-000000000001',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000001',
    'Riya Sharma',
    '8264602737',
    now() + interval '60 minutes',
    'confirmed',
    'Fever — ladder 1',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-000000000002',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000002',
    'Aarav Mehta',
    '8264602737',
    now() + interval '75 minutes',
    'confirmed',
    'Cough — ladder 2',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-000000000003',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000003',
    'Neha Kapoor',
    '8264602737',
    now() + interval '90 minutes',
    'confirmed',
    'Rash — ladder 3',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-000000000004',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000004',
    'Kabir Singh',
    '8264602737',
    now() + interval '105 minutes',
    'confirmed',
    'Stomach pain — ladder 4',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-000000000005',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000005',
    'Ananya Verma',
    '8264602737',
    now() + interval '120 minutes',
    'confirmed',
    'Headache — ladder 5',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-000000000006',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000006',
    'Vivaan Joshi',
    '8264602737',
    now() + interval '135 minutes',
    'confirmed',
    'Follow-up — ladder 6',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-000000000007',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000007',
    'Isha Reddy',
    '8264602737',
    now() + interval '150 minutes',
    'confirmed',
    'Allergy — ladder 7',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-000000000008',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000008',
    'Rohan Gupta',
    '8264602737',
    now() + interval '165 minutes',
    'confirmed',
    'BP check — ladder 8',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-000000000009',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-000000000009',
    'Meera Nair',
    '8264602737',
    now() + interval '180 minutes',
    'confirmed',
    'Diabetes review — ladder 9',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  ),
  (
    'd1300001-0000-4000-8000-00000000000a',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1300001-0000-4000-8000-00000000000a',
    'Dev Patel',
    '8264602737',
    now() + interval '195 minutes',
    'confirmed',
    'Knee pain — ladder 10',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-13'
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify
SELECT
  to_char(a.appointment_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS ist_slot,
  round(extract(epoch from (a.appointment_date - now())) / 60.0)::int AS mins_from_now,
  a.patient_name,
  a.reason_for_visit
FROM appointments a
WHERE a.notes = 'demo seed previsit-notify 2026-08-13'
ORDER BY a.appointment_date, a.patient_name;
