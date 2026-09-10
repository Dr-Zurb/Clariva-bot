/**
 * Apply the 2026-08-13 previsit ladder seed (10 patients, +60m serial).
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-previsit-ladder-seed-2026-08-13.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const PHONE = '8264602737';
const EMAIL = 'as.sahilabhi2937@gmail.com';
const NOTES = 'demo seed previsit-notify 2026-08-13';

const PEOPLE: Array<{
  pid: string;
  aid: string;
  name: string;
  age: number;
  gender: 'female' | 'male';
  reason: string;
  offsetMin: number;
}> = [
  { pid: 'c1300001-0000-4000-8000-000000000001', aid: 'd1300001-0000-4000-8000-000000000001', name: 'Riya Sharma', age: 28, gender: 'female', reason: 'Fever — ladder 1', offsetMin: 60 },
  { pid: 'c1300001-0000-4000-8000-000000000002', aid: 'd1300001-0000-4000-8000-000000000002', name: 'Aarav Mehta', age: 34, gender: 'male', reason: 'Cough — ladder 2', offsetMin: 75 },
  { pid: 'c1300001-0000-4000-8000-000000000003', aid: 'd1300001-0000-4000-8000-000000000003', name: 'Neha Kapoor', age: 41, gender: 'female', reason: 'Rash — ladder 3', offsetMin: 90 },
  { pid: 'c1300001-0000-4000-8000-000000000004', aid: 'd1300001-0000-4000-8000-000000000004', name: 'Kabir Singh', age: 22, gender: 'male', reason: 'Stomach pain — ladder 4', offsetMin: 105 },
  { pid: 'c1300001-0000-4000-8000-000000000005', aid: 'd1300001-0000-4000-8000-000000000005', name: 'Ananya Verma', age: 36, gender: 'female', reason: 'Headache — ladder 5', offsetMin: 120 },
  { pid: 'c1300001-0000-4000-8000-000000000006', aid: 'd1300001-0000-4000-8000-000000000006', name: 'Vivaan Joshi', age: 31, gender: 'male', reason: 'Follow-up — ladder 6', offsetMin: 135 },
  { pid: 'c1300001-0000-4000-8000-000000000007', aid: 'd1300001-0000-4000-8000-000000000007', name: 'Isha Reddy', age: 27, gender: 'female', reason: 'Allergy — ladder 7', offsetMin: 150 },
  { pid: 'c1300001-0000-4000-8000-000000000008', aid: 'd1300001-0000-4000-8000-000000000008', name: 'Rohan Gupta', age: 45, gender: 'male', reason: 'BP check — ladder 8', offsetMin: 165 },
  { pid: 'c1300001-0000-4000-8000-000000000009', aid: 'd1300001-0000-4000-8000-000000000009', name: 'Meera Nair', age: 39, gender: 'female', reason: 'Diabetes review — ladder 9', offsetMin: 180 },
  { pid: 'c1300001-0000-4000-8000-00000000000a', aid: 'd1300001-0000-4000-8000-00000000000a', name: 'Dev Patel', age: 29, gender: 'male', reason: 'Knee pain — ladder 10', offsetMin: 195 },
];

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = Date.now();
  const patients = PEOPLE.map((p) => ({
    id: p.pid,
    name: p.name,
    phone: PHONE,
    email: EMAIL,
    age: p.age,
    gender: p.gender,
    doctor_id: DOCTOR_ID,
    platform: null,
    platform_external_id: null,
    consent_status: 'granted',
    consent_granted_at: new Date(now).toISOString(),
    consent_method: 'manual_sql_seed',
    medical_record_number: null,
  }));

  const { error: pErr } = await admin.from('patients').upsert(patients, { onConflict: 'id' });
  if (pErr) {
    console.error('patients upsert failed:', pErr.message);
    process.exit(1);
  }

  const appointments = PEOPLE.map((p) => ({
    id: p.aid,
    doctor_id: DOCTOR_ID,
    patient_id: p.pid,
    patient_name: p.name,
    patient_phone: PHONE,
    appointment_date: new Date(now + p.offsetMin * 60_000).toISOString(),
    status: 'confirmed',
    reason_for_visit: p.reason,
    consultation_type: 'video',
    opd_event_type: 'standard',
    booking_origin: 'booked',
    notes: NOTES,
  }));

  const { error: aErr } = await admin.from('appointments').upsert(appointments, { onConflict: 'id' });
  if (aErr) {
    console.error('appointments upsert failed:', aErr.message);
    process.exit(1);
  }

  const { data, error: vErr } = await admin
    .from('appointments')
    .select('patient_name, appointment_date, reason_for_visit')
    .eq('notes', NOTES)
    .order('appointment_date');

  if (vErr) {
    console.error('verify failed:', vErr.message);
    process.exit(1);
  }

  console.log(`Seeded ${data?.length ?? 0} appointments:`);
  for (const row of data ?? []) {
    const mins = Math.round((new Date(row.appointment_date).getTime() - now) / 60_000);
    const ist = new Date(row.appointment_date).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      day: '2-digit',
      month: 'short',
    });
    console.log(`  +${mins}m  ${ist}  ${row.patient_name}  ${row.reason_for_visit}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
