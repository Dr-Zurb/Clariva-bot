/**
 * Seed 10 in-clinic desk visits on Dr Zurb for today (Asia/Kolkata).
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-zurb-desk-today-2026-08-24.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'desk seed today 2026-08-24';

const PEOPLE: Array<{
  pid: string;
  aid: string;
  name: string;
  phone: string;
  email: string;
  age: number;
  gender: 'female' | 'male';
  reason: string;
  origin: 'walk_in' | 'booked';
  arrived: boolean;
  hour: number;
  minute: number;
}> = [
  { pid: 'c2400001-0000-4000-8000-000000000001', aid: 'd2400001-0000-4000-8000-000000000001', name: 'Rekha Bansal', phone: '9000024001', email: 'desk.zurb.t01@example.test', age: 46, gender: 'female', reason: 'Follow-up rash', origin: 'walk_in', arrived: true, hour: 8, minute: 0 },
  { pid: 'c2400001-0000-4000-8000-000000000002', aid: 'd2400001-0000-4000-8000-000000000002', name: 'Suresh Yadav', phone: '9000024002', email: 'desk.zurb.t02@example.test', age: 53, gender: 'male', reason: 'Knee pain', origin: 'walk_in', arrived: true, hour: 8, minute: 15 },
  { pid: 'c2400001-0000-4000-8000-000000000003', aid: 'd2400001-0000-4000-8000-000000000003', name: 'Mitali Sen', phone: '9000024003', email: 'desk.zurb.t03@example.test', age: 29, gender: 'female', reason: 'Fever 2 days', origin: 'walk_in', arrived: false, hour: 8, minute: 30 },
  { pid: 'c2400001-0000-4000-8000-000000000004', aid: 'd2400001-0000-4000-8000-000000000004', name: 'Harpreet Gill', phone: '9000024004', email: 'desk.zurb.t04@example.test', age: 38, gender: 'male', reason: 'Cough and cold', origin: 'booked', arrived: false, hour: 8, minute: 45 },
  { pid: 'c2400001-0000-4000-8000-000000000005', aid: 'd2400001-0000-4000-8000-000000000005', name: 'Lavanya Iyer', phone: '9000024005', email: 'desk.zurb.t05@example.test', age: 33, gender: 'female', reason: 'Acne review', origin: 'booked', arrived: false, hour: 9, minute: 0 },
  { pid: 'c2400001-0000-4000-8000-000000000006', aid: 'd2400001-0000-4000-8000-000000000006', name: 'Imtiaz Khan', phone: '9000024006', email: 'desk.zurb.t06@example.test', age: 41, gender: 'male', reason: 'BP check', origin: 'walk_in', arrived: false, hour: 9, minute: 15 },
  { pid: 'c2400001-0000-4000-8000-000000000007', aid: 'd2400001-0000-4000-8000-000000000007', name: 'Bhavna Joshi', phone: '9000024007', email: 'desk.zurb.t07@example.test', age: 24, gender: 'female', reason: 'Headache', origin: 'walk_in', arrived: false, hour: 9, minute: 30 },
  { pid: 'c2400001-0000-4000-8000-000000000008', aid: 'd2400001-0000-4000-8000-000000000008', name: 'Gopal Krishan', phone: '9000024008', email: 'desk.zurb.t08@example.test', age: 67, gender: 'male', reason: 'Diabetes follow-up', origin: 'booked', arrived: false, hour: 9, minute: 45 },
  { pid: 'c2400001-0000-4000-8000-000000000009', aid: 'd2400001-0000-4000-8000-000000000009', name: 'Tanya Dsouza', phone: '9000024009', email: 'desk.zurb.t09@example.test', age: 19, gender: 'female', reason: 'Allergy', origin: 'walk_in', arrived: false, hour: 10, minute: 0 },
  { pid: 'c2400001-0000-4000-8000-00000000000a', aid: 'd2400001-0000-4000-8000-00000000000a', name: 'Naveen Reddy', phone: '9000024010', email: 'desk.zurb.t10@example.test', age: 36, gender: 'male', reason: 'Back pain', origin: 'booked', arrived: false, hour: 10, minute: 15 },
];

function todaySlotIso(hour: number, minute: number): string {
  const now = new Date();
  const kolkata = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const ymd = kolkata.replace(/\//g, '-');
  return new Date(`${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`).toISOString();
}

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const { error: pErr } = await admin.from('patients').upsert(
    PEOPLE.map((p) => ({
      id: p.pid,
      name: p.name,
      phone: p.phone,
      email: p.email,
      age: p.age,
      gender: p.gender,
      doctor_id: DOCTOR_ID,
      platform: null,
      platform_external_id: null,
      consent_status: 'granted',
      consent_granted_at: now,
      consent_method: 'manual_sql_seed',
      registered_via: 'front_desk',
    })),
    { onConflict: 'id' }
  );
  if (pErr) {
    console.error('patients upsert failed:', pErr.message);
    process.exit(1);
  }

  for (const person of PEOPLE) {
    const { error: mrnErr } = await admin.rpc('assign_patient_mrn', {
      p_patient_id: person.pid,
    });
    if (mrnErr) {
      console.error('assign_patient_mrn failed');
      process.exit(1);
    }
  }

  const { error: aErr } = await admin.from('appointments').upsert(
    PEOPLE.map((p) => ({
      id: p.aid,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      patient_name: p.name,
      patient_phone: p.phone,
      appointment_date: todaySlotIso(p.hour, p.minute),
      status: 'confirmed',
      reason_for_visit: p.reason,
      consultation_type: 'in_clinic',
      opd_event_type: 'standard',
      booking_origin: p.origin,
      notes: NOTES,
      patient_checked_in_at: p.arrived ? now : null,
    })),
    { onConflict: 'id' }
  );
  if (aErr) {
    console.error('appointments upsert failed:', aErr.message);
    process.exit(1);
  }

  console.log(`Seeded ${PEOPLE.length} in-clinic visits on Dr Zurb for today`);
  PEOPLE.forEach((p) => {
    const label = p.arrived ? 'arrived' : 'waiting';
    console.log(
      `  ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}  ${p.name}  ${label}`
    );
  });
}

void main();
