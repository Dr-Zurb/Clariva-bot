/**
 * Apply 10 dummy video patients, staggered on 10-minute slots from now + 5m.
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-plus5-ten-2026-08-16.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const PHONE = '8264602737';
const EMAIL = 'as.sahilabhi2937@gmail.com';
const NOTES = 'demo seed +5m ten 2026-08-16';

const PEOPLE: Array<{
  pid: string;
  aid: string;
  name: string;
  age: number;
  gender: 'female' | 'male';
  reason: string;
}> = [
  { pid: 'c1600001-0000-4000-8000-000000000001', aid: 'd1600001-0000-4000-8000-000000000001', name: 'Meera Joshi', age: 34, gender: 'female', reason: 'Acne review — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-000000000002', aid: 'd1600001-0000-4000-8000-000000000002', name: 'Rohan Sethi', age: 41, gender: 'male', reason: 'Dandruff — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-000000000003', aid: 'd1600001-0000-4000-8000-000000000003', name: 'Ananya Ghosh', age: 27, gender: 'female', reason: 'Rash on arm — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-000000000004', aid: 'd1600001-0000-4000-8000-000000000004', name: 'Vikram Nair', age: 36, gender: 'male', reason: 'Wart removal — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-000000000005', aid: 'd1600001-0000-4000-8000-000000000005', name: 'Ishita Kapoor', age: 30, gender: 'female', reason: 'Melasma — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-000000000006', aid: 'd1600001-0000-4000-8000-000000000006', name: 'Kabir Singh', age: 45, gender: 'male', reason: 'Fungal infection — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-000000000007', aid: 'd1600001-0000-4000-8000-000000000007', name: 'Nisha Reddy', age: 22, gender: 'female', reason: 'Allergy patch — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-000000000008', aid: 'd1600001-0000-4000-8000-000000000008', name: 'Farhan Ali', age: 39, gender: 'male', reason: 'Skin tag — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-000000000009', aid: 'd1600001-0000-4000-8000-000000000009', name: 'Pooja Shah', age: 48, gender: 'female', reason: 'Dry skin — +5m ten' },
  { pid: 'c1600001-0000-4000-8000-00000000000a', aid: 'd1600001-0000-4000-8000-00000000000a', name: 'Dev Patel', age: 25, gender: 'male', reason: 'Ingrown nail — +5m ten' },
];

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = Date.now();
  const firstSlot = now + 5 * 60_000;
  const slotFor = (index: number): string =>
    new Date(firstSlot + index * 10 * 60_000).toISOString();

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
    PEOPLE.map((p, i) => ({
      id: p.aid,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      patient_name: p.name,
      patient_phone: PHONE,
      appointment_date: slotFor(i),
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

  const fmt = (iso: string): string =>
    new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  console.log(`Seeded ${PEOPLE.length} patients  10-min slots from +5m`);
  PEOPLE.forEach((p, i) => {
    console.log(`  ${fmt(slotFor(i))}  ${p.name}`);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
