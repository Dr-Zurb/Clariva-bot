-- APPLY: 10 demo patients + today's OPD slot appointments (15-min serial).
-- Doctor: cb33af77-0878-4f7a-a728-fe8cdd8701ed
--
-- Pair: backend/dev-sql/opd-demo-patients-2026-08-09/{apply,delete}.sql
-- How to run: Supabase Dashboard → SQL Editor → paste → Run
-- (Slot-mode OPD hub only needs appointments; queue entries not required.)
--
-- Phone + email shared on all 10 rows. Names/ages/reasons are dummy.
-- Slots: 14:15 → 16:30 Asia/Kolkata on 2026-08-09.

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
    'a1000001-0000-4000-8000-000000000001',
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
    'a1000001-0000-4000-8000-000000000002',
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
    'a1000001-0000-4000-8000-000000000003',
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
    'a1000001-0000-4000-8000-000000000004',
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
    'a1000001-0000-4000-8000-000000000005',
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
  ),
  (
    'a1000001-0000-4000-8000-000000000006',
    'Vikram Joshi',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    45,
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
    'a1000001-0000-4000-8000-000000000007',
    'Ishita Rao',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    31,
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
    'a1000001-0000-4000-8000-000000000008',
    'Rohan Pillai',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    27,
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
    'a1000001-0000-4000-8000-000000000009',
    'Sneha Iyer',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    39,
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
    'a1000001-0000-4000-8000-00000000000a',
    'Dev Malhotra',
    '8264602737',
    'as.sahilabhi2937@gmail.com',
    52,
    'male',
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
    'b1000001-0000-4000-8000-000000000001',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000001',
    'Riya Sharma',
    '8264602737',
    timestamptz '2026-08-09 14:15:00+05:30',
    'confirmed',
    'Fever and body ache',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-000000000002',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000002',
    'Aarav Mehta',
    '8264602737',
    timestamptz '2026-08-09 14:30:00+05:30',
    'confirmed',
    'Follow-up for cough',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-000000000003',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000003',
    'Neha Kapoor',
    '8264602737',
    timestamptz '2026-08-09 14:45:00+05:30',
    'confirmed',
    'Skin rash on arms',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-000000000004',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000004',
    'Kabir Singh',
    '8264602737',
    timestamptz '2026-08-09 15:00:00+05:30',
    'confirmed',
    'Stomach pain since morning',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-000000000005',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000005',
    'Ananya Verma',
    '8264602737',
    timestamptz '2026-08-09 15:15:00+05:30',
    'confirmed',
    'Headache and dizziness',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-000000000006',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000006',
    'Vikram Joshi',
    '8264602737',
    timestamptz '2026-08-09 15:30:00+05:30',
    'confirmed',
    'Blood pressure check',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-000000000007',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000007',
    'Ishita Rao',
    '8264602737',
    timestamptz '2026-08-09 15:45:00+05:30',
    'confirmed',
    'Allergy flare-up',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-000000000008',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000008',
    'Rohan Pillai',
    '8264602737',
    timestamptz '2026-08-09 16:00:00+05:30',
    'confirmed',
    'Sore throat and fever',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-000000000009',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-000000000009',
    'Sneha Iyer',
    '8264602737',
    timestamptz '2026-08-09 16:15:00+05:30',
    'confirmed',
    'Back pain after travel',
    'video',
    'standard',
    'demo seed 2026-08-09'
  ),
  (
    'b1000001-0000-4000-8000-00000000000a',
    'cb33af77-0878-4f7a-a728-fe8cdd8701ed',
    'a1000001-0000-4000-8000-00000000000a',
    'Dev Malhotra',
    '8264602737',
    timestamptz '2026-08-09 16:30:00+05:30',
    'confirmed',
    'Diabetes follow-up',
    'video',
    'standard',
    'demo seed 2026-08-09'
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
  AND a.notes = 'demo seed 2026-08-09'
ORDER BY a.appointment_date;
