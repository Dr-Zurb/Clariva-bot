/**
 * Apply the +5m dummy video patient (Diya Malhotra).
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-plus5-dummy-2026-08-13.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const PHONE = '8264602737';
const EMAIL = 'as.sahilabhi2937@gmail.com';
const NOTES = 'demo seed +5m 2026-08-13';
const PATIENT_ID = 'c1350001-0000-4000-8000-000000000001';
const APPOINTMENT_ID = 'd1350001-0000-4000-8000-000000000001';
const NAME = 'Diya Malhotra';

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = Date.now();
  const { error: pErr } = await admin.from('patients').upsert(
    {
      id: PATIENT_ID,
      name: NAME,
      phone: PHONE,
      email: EMAIL,
      age: 32,
      gender: 'female',
      doctor_id: DOCTOR_ID,
      platform: null,
      platform_external_id: null,
      consent_status: 'granted',
      consent_granted_at: new Date(now).toISOString(),
      consent_method: 'manual_sql_seed',
      medical_record_number: null,
    },
    { onConflict: 'id' }
  );
  if (pErr) {
    console.error('patients upsert failed:', pErr.message);
    process.exit(1);
  }

  const slot = new Date(now + 5 * 60_000).toISOString();
  const { error: aErr } = await admin.from('appointments').upsert(
    {
      id: APPOINTMENT_ID,
      doctor_id: DOCTOR_ID,
      patient_id: PATIENT_ID,
      patient_name: NAME,
      patient_phone: PHONE,
      appointment_date: slot,
      status: 'confirmed',
      reason_for_visit: 'Sore throat — +5m dummy',
      consultation_type: 'video',
      opd_event_type: 'standard',
      booking_origin: 'booked',
      notes: NOTES,
    },
    { onConflict: 'id' }
  );
  if (aErr) {
    console.error('appointments upsert failed:', aErr.message);
    process.exit(1);
  }

  const ist = new Date(slot).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    day: '2-digit',
    month: 'short',
  });
  console.log(`Seeded ${NAME}  +5m  ${ist} IST  (${slot})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
