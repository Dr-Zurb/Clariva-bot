-- APPLY: 5 demo patients + today's OPD slot appointments (15-min serial).
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
--
-- Pair: backend/dev-sql/opd-demo-patients-2026-08-11/{apply,delete}.sql
-- How to run: Supabase Dashboard → SQL Editor → paste → Run
-- (Slot-mode OPD hub only needs appointments; queue entries not required.)
--
-- Phone + email shared on all 5 rows. Names/ages/reasons are dummy.
-- Slots: 07:21 → 08:21 Asia/Kolkata on 2026-08-11 (~5 min from seed time, then +15m).

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
  (
    'a1100001-0000-4000-8000-000000000001',
    'Riya Sharma',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    28,
    'female',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    NULL,
    NULL,
    'granted',
    now(),
    'manual_sql_seed',
    NULL
  ),
  (
    'a1100001-0000-4000-8000-000000000002',
    'Aarav Mehta',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    34,
    'male',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    NULL,
    NULL,
    'granted',
    now(),
    'manual_sql_seed',
    NULL
  ),
  (
    'a1100001-0000-4000-8000-000000000003',
    'Neha Kapoor',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    41,
    'female',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    NULL,
    NULL,
    'granted',
    now(),
    'manual_sql_seed',
    NULL
  ),
  (
    'a1100001-0000-4000-8000-000000000004',
    'Kabir Singh',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    22,
    'male',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    NULL,
    NULL,
    'granted',
    now(),
    'manual_sql_seed',
    NULL
  ),
  (
    'a1100001-0000-4000-8000-000000000005',
    'Ananya Verma',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    36,
    'female',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    NULL,
    NULL,
    'granted',
    now(),
    'manual_sql_seed',
    NULL
  )
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
  notes
) VALUES
  (
    'b1100001-0000-4000-8000-000000000001',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1100001-0000-4000-8000-000000000001',
    'Riya Sharma',
    '8264602737',
    timestamptz '2026-08-11 07:21:00+05:30',
    'confirmed',
    'Fever and body ache',
    'video',
    'standard',
    'demo seed 2026-08-11'
  ),
  (
    'b1100001-0000-4000-8000-000000000002',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1100001-0000-4000-8000-000000000002',
    'Aarav Mehta',
    '8264602737',
    timestamptz '2026-08-11 07:36:00+05:30',
    'confirmed',
    'Follow-up for cough',
    'video',
    'standard',
    'demo seed 2026-08-11'
  ),
  (
    'b1100001-0000-4000-8000-000000000003',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1100001-0000-4000-8000-000000000003',
    'Neha Kapoor',
    '8264602737',
    timestamptz '2026-08-11 07:51:00+05:30',
    'confirmed',
    'Skin rash on arms',
    'video',
    'standard',
    'demo seed 2026-08-11'
  ),
  (
    'b1100001-0000-4000-8000-000000000004',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1100001-0000-4000-8000-000000000004',
    'Kabir Singh',
    '8264602737',
    timestamptz '2026-08-11 08:06:00+05:30',
    'confirmed',
    'Stomach pain since morning',
    'video',
    'standard',
    'demo seed 2026-08-11'
  ),
  (
    'b1100001-0000-4000-8000-000000000005',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1100001-0000-4000-8000-000000000005',
    'Ananya Verma',
    '8264602737',
    timestamptz '2026-08-11 08:21:00+05:30',
    'confirmed',
    'Headache and dizziness',
    'video',
    'standard',
    'demo seed 2026-08-11'
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify
SELECT
  to_char(a.appointment_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS ist_slot,
  a.patient_name,
  a.status,
  a.reason_for_visit,
  p.email,
  p.phone
FROM appointments a
JOIN patients p ON p.id = a.patient_id
WHERE a.doctor_id = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed'
  AND a.notes = 'demo seed 2026-08-11'
ORDER BY a.appointment_date;
