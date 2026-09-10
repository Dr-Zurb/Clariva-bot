-- APPLY: 10 demo patients for previsit notify ladder email test.
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
--
-- Pair: backend/dev-sql/opd-demo-previsit-notify-2026-08-12/{apply,delete}.sql
-- How to run: Supabase Dashboard → SQL Editor → paste → Run
-- Then hit cron: POST /cron/consultation-checkin (with CRON_SECRET)
--
-- Shared phone + email on all rows (founder inbox).
-- Slots: 15-minute serial starting at now() + 5 minutes
--   #1  +5m   → in T−5 window (check-in pre-stamped → nudge_5 on first cron)
--   #2  +20m  → in T−30 window → checkin_30
--   #3  +35m  → outside lead until later
--   … through #10 +140m

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
  ('c1200001-0000-4000-8000-000000000001', 'Riya Sharma',   '8264602737', 'as.sahilabhi2937@gmail.com', 28, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-000000000002', 'Aarav Mehta',   '8264602737', 'as.sahilabhi2937@gmail.com', 34, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-000000000003', 'Neha Kapoor',   '8264602737', 'as.sahilabhi2937@gmail.com', 41, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-000000000004', 'Kabir Singh',   '8264602737', 'as.sahilabhi2937@gmail.com', 22, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-000000000005', 'Ananya Verma',  '8264602737', 'as.sahilabhi2937@gmail.com', 36, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-000000000006', 'Vivaan Joshi',  '8264602737', 'as.sahilabhi2937@gmail.com', 31, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-000000000007', 'Isha Reddy',    '8264602737', 'as.sahilabhi2937@gmail.com', 27, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-000000000008', 'Rohan Gupta',   '8264602737', 'as.sahilabhi2937@gmail.com', 45, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-000000000009', 'Meera Nair',    '8264602737', 'as.sahilabhi2937@gmail.com', 39, 'female', 'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL),
  ('c1200001-0000-4000-8000-00000000000a', 'Dev Patel',     '8264602737', 'as.sahilabhi2937@gmail.com', 29, 'male',   'cb33af77-0878-4f7a-a728-fe8cdd8701ed', NULL, NULL, 'granted', now(), 'manual_sql_seed', NULL)
ON CONFLICT (id) DO NOTHING;

-- 15-minute serial: start +5m, then +20, +35, … +140m
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
  notes,
  patient_checkin_notified_at
) VALUES
  (
    'd1200001-0000-4000-8000-000000000001',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000001',
    'Riya Sharma',
    '8264602737',
    now() + interval '5 minutes',
    'confirmed',
    'Fever — previsit 1',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    -- Pre-stamp so first slot can fire T−5 nudge on next cron tick
    now() - interval '10 minutes'
  ),
  (
    'd1200001-0000-4000-8000-000000000002',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000002',
    'Aarav Mehta',
    '8264602737',
    now() + interval '20 minutes',
    'confirmed',
    'Cough — previsit 2',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  ),
  (
    'd1200001-0000-4000-8000-000000000003',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000003',
    'Neha Kapoor',
    '8264602737',
    now() + interval '35 minutes',
    'confirmed',
    'Rash — previsit 3',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  ),
  (
    'd1200001-0000-4000-8000-000000000004',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000004',
    'Kabir Singh',
    '8264602737',
    now() + interval '50 minutes',
    'confirmed',
    'Stomach pain — previsit 4',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  ),
  (
    'd1200001-0000-4000-8000-000000000005',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000005',
    'Ananya Verma',
    '8264602737',
    now() + interval '65 minutes',
    'confirmed',
    'Headache — previsit 5',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  ),
  (
    'd1200001-0000-4000-8000-000000000006',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000006',
    'Vivaan Joshi',
    '8264602737',
    now() + interval '80 minutes',
    'confirmed',
    'Follow-up — previsit 6',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  ),
  (
    'd1200001-0000-4000-8000-000000000007',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000007',
    'Isha Reddy',
    '8264602737',
    now() + interval '95 minutes',
    'confirmed',
    'Allergy — previsit 7',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  ),
  (
    'd1200001-0000-4000-8000-000000000008',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000008',
    'Rohan Gupta',
    '8264602737',
    now() + interval '110 minutes',
    'confirmed',
    'BP check — previsit 8',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  ),
  (
    'd1200001-0000-4000-8000-000000000009',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-000000000009',
    'Meera Nair',
    '8264602737',
    now() + interval '125 minutes',
    'confirmed',
    'Diabetes review — previsit 9',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  ),
  (
    'd1200001-0000-4000-8000-00000000000a',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'c1200001-0000-4000-8000-00000000000a',
    'Dev Patel',
    '8264602737',
    now() + interval '140 minutes',
    'confirmed',
    'Knee pain — previsit 10',
    'video',
    'standard',
    'booked',
    'demo seed previsit-notify 2026-08-12',
    NULL
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify
SELECT
  to_char(a.appointment_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS ist_slot,
  round(extract(epoch from (a.appointment_date - now())) / 60.0)::int AS mins_from_now,
  a.patient_name,
  a.patient_checkin_notified_at IS NOT NULL AS checkin_stamped,
  a.reason_for_visit
FROM appointments a
WHERE a.notes = 'demo seed previsit-notify 2026-08-12'
ORDER BY a.appointment_date, a.patient_name;
