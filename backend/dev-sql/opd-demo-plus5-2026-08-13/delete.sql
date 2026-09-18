-- DELETE: undo apply.sql for +5m dummy 2026-08-13.
-- Pair: backend/dev-sql/opd-demo-plus5-2026-08-13/{apply,delete}.sql

BEGIN;

DELETE FROM opd_queue_entries
WHERE appointment_id = 'd1350001-0000-4000-8000-000000000001';

DELETE FROM appointments
WHERE id = 'd1350001-0000-4000-8000-000000000001'
   OR notes = 'demo seed +5m 2026-08-13';

DELETE FROM patients
WHERE id = 'c1350001-0000-4000-8000-000000000001';

COMMIT;

SELECT count(*) AS remaining_seed_appointments
FROM appointments
WHERE notes = 'demo seed +5m 2026-08-13';
