/**
 * Apply 10 dummy video patients, all 5 minutes from now.
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-plus5-ten-2026-08-14.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const PHONE = '8264602737';
const EMAIL = 'as.sahilabhi2937@gmail.com';
const NOTES = 'demo seed +5m ten 2026-08-14';

const PEOPLE: Array<{
  pid: string;
  aid: string;
  name: string;
  age: number;
  gender: 'female' | 'male';
  reason: string;
}> = [
  { pid: 'c1400001-0000-4000-8000-000000000001', aid: 'd1400001-0000-4000-8000-000000000001', name: 'Tara Iyer', age: 29, gender: 'female', reason: 'Acne flare — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-000000000002', aid: 'd1400001-0000-4000-8000-000000000002', name: 'Arjun Khanna', age: 38, gender: 'male', reason: 'Itchy scalp — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-000000000003', aid: 'd1400001-0000-4000-8000-000000000003', name: 'Sana Qureshi', age: 33, gender: 'female', reason: 'Mole check — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-000000000004', aid: 'd1400001-0000-4000-8000-000000000004', name: 'Nikhil Rao', age: 26, gender: 'male', reason: 'Eczema — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-000000000005', aid: 'd1400001-0000-4000-8000-000000000005', name: 'Priya Menon', age: 42, gender: 'female', reason: 'Hair fall — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-000000000006', aid: 'd1400001-0000-4000-8000-000000000006', name: 'Aditya Bansal', age: 35, gender: 'male', reason: 'Psoriasis review — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-000000000007', aid: 'd1400001-0000-4000-8000-000000000007', name: 'Kavya Pillai', age: 24, gender: 'female', reason: 'Pigmentation — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-000000000008', aid: 'd1400001-0000-4000-8000-000000000008', name: 'Harsh Malhotra', age: 47, gender: 'male', reason: 'Nail infection — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-000000000009', aid: 'd1400001-0000-4000-8000-000000000009', name: 'Rhea Kulkarni', age: 31, gender: 'female', reason: 'Hives — +5m ten' },
  { pid: 'c1400001-0000-4000-8000-00000000000a', aid: 'd1400001-0000-4000-8000-00000000000a', name: 'Yash Desai', age: 28, gender: 'male', reason: 'Sunburn — +5m ten' },
];

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = Date.now();
  const slot = new Date(now + 5 * 60_000).toISOString();

  const { error: pErr } = await admin.from('patients').upsert(
    PEOPLE.map((p) => ({
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
    })),
    { onConflict: 'id' }
  );
  if (pErr) {
    console.error('patients upsert failed:', pErr.message);
    process.exit(1);
  }

  const { error: aErr } = await admin.from('appointments').upsert(
    PEOPLE.map((p) => ({
      id: p.aid,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      patient_name: p.name,
      patient_phone: PHONE,
      appointment_date: slot,
      status: 'confirmed',
      reason_for_visit: p.reason,
      consultation_type: 'video',
      opd_event_type: 'standard',
      booking_origin: 'booked',
      notes: NOTES,
    })),
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
  console.log(`Seeded ${PEOPLE.length} patients  +5m  ${ist} IST  (${slot})`);
  for (const p of PEOPLE) {
    console.log(`  ${p.name}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
