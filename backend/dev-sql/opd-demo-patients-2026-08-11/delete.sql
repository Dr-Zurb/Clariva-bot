-- DELETE: undo apply.sql for this scenario (safe to re-run).
-- Pair: backend/dev-sql/opd-demo-patients-2026-08-11/{apply,delete}.sql
-- How to run: Supabase Dashboard → SQL Editor → paste → Run
--
-- Deletes appointments first (FK), then patients. Uses fixed UUIDs from apply.sql.

BEGIN;

-- Drop any queue rows that may have been created if the day was in queue mode.
DELETE FROM opd_queue_entries
WHERE appointment_id IN (
  'b1100001-0000-4000-8000-000000000001',
  'b1100001-0000-4000-8000-000000000002',
  'b1100001-0000-4000-8000-000000000003',
  'b1100001-0000-4000-8000-000000000004',
  'b1100001-0000-4000-8000-000000000005'
);

DELETE FROM appointments
WHERE id IN (
  'b1100001-0000-4000-8000-000000000001',
  'b1100001-0000-4000-8000-000000000002',
  'b1100001-0000-4000-8000-000000000003',
  'b1100001-0000-4000-8000-000000000004',
  'b1100001-0000-4000-8000-000000000005'
)
OR notes = 'demo seed 2026-08-11';

DELETE FROM patients
WHERE id IN (
  'a1100001-0000-4000-8000-000000000001',
  'a1100001-0000-4000-8000-000000000002',
  'a1100001-0000-4000-8000-000000000003',
  'a1100001-0000-4000-8000-000000000004',
  'a1100001-0000-4000-8000-000000000005'
);

COMMIT;

-- Verify empty
SELECT count(*) AS remaining_seed_appointments
FROM appointments
WHERE notes = 'demo seed 2026-08-11';

SELECT count(*) AS remaining_seed_patients
FROM patients
WHERE id IN (
  'a1100001-0000-4000-8000-000000000001',
  'a1100001-0000-4000-8000-000000000002',
  'a1100001-0000-4000-8000-000000000003',
  'a1100001-0000-4000-8000-000000000004',
  'a1100001-0000-4000-8000-000000000005'
);
