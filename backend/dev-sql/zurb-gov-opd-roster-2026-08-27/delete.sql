-- DELETE: undo the gov OPD roster import on Dr Zurb.
-- Prefer: npx ts-node -r dotenv/config scripts/delete-zurb-gov-opd-roster-2026-08-27.ts
--
-- If any of these patients already have consultations / Rx rows, run the TS
-- delete (it clears queue + appointments first). This SQL is the wipe for a
-- roster-only import.

BEGIN;

DELETE FROM opd_queue_entries
WHERE appointment_id IN (
  SELECT a.id
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  WHERE p.doctor_id = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed'
    AND p.consent_method = 'gov_opd_import_2026-08-27'
);

DELETE FROM appointments
WHERE patient_id IN (
  SELECT id
  FROM patients
  WHERE doctor_id = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed'
    AND consent_method = 'gov_opd_import_2026-08-27'
);

DELETE FROM patients
WHERE doctor_id = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed'
  AND consent_method = 'gov_opd_import_2026-08-27';

COMMIT;
