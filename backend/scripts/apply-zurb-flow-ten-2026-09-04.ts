/**
 * Seed 10 in-clinic walk-ins on Dr Zurb for today so finish → print → next
 * can be walked. All checked in; queue tokens 1–10.
 *
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-zurb-flow-ten-2026-09-04.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'flow seed ten 2026-09-04';
const TOKEN_BASE = 1;

const PEOPLE: Array<{
  pid: string;
  aid: string;
  name: string;
  phone: string;
  email: string;
  age: number;
  gender: 'female' | 'male';
  reason: string;
}> = [
  { pid: 'c4090001-0000-4000-8000-000000000001', aid: 'd4090001-0000-4000-8000-000000000001', name: 'Kiran Mehta', phone: '9000040901', email: 'flow.zurb.01@example.test', age: 42, gender: 'female', reason: 'Follow-up rash' },
  { pid: 'c4090001-0000-4000-8000-000000000002', aid: 'd4090001-0000-4000-8000-000000000002', name: 'Aman Verma', phone: '9000040902', email: 'flow.zurb.02@example.test', age: 35, gender: 'male', reason: 'Knee pain' },
  { pid: 'c4090001-0000-4000-8000-000000000003', aid: 'd4090001-0000-4000-8000-000000000003', name: 'Ritu Bose', phone: '9000040903', email: 'flow.zurb.03@example.test', age: 28, gender: 'female', reason: 'Fever 2 days' },
  { pid: 'c4090001-0000-4000-8000-000000000004', aid: 'd4090001-0000-4000-8000-000000000004', name: 'Sahil Grover', phone: '9000040904', email: 'flow.zurb.04@example.test', age: 51, gender: 'male', reason: 'Cough and cold' },
  { pid: 'c4090001-0000-4000-8000-000000000005', aid: 'd4090001-0000-4000-8000-000000000005', name: 'Neha Kulkarni', phone: '9000040905', email: 'flow.zurb.05@example.test', age: 31, gender: 'female', reason: 'Acne review' },
  { pid: 'c4090001-0000-4000-8000-000000000006', aid: 'd4090001-0000-4000-8000-000000000006', name: 'Vivek Anand', phone: '9000040906', email: 'flow.zurb.06@example.test', age: 47, gender: 'male', reason: 'BP check' },
  { pid: 'c4090001-0000-4000-8000-000000000007', aid: 'd4090001-0000-4000-8000-000000000007', name: 'Pallavi Nair', phone: '9000040907', email: 'flow.zurb.07@example.test', age: 23, gender: 'female', reason: 'Headache' },
  { pid: 'c4090001-0000-4000-8000-000000000008', aid: 'd4090001-0000-4000-8000-000000000008', name: 'Ramesh Iyer', phone: '9000040908', email: 'flow.zurb.08@example.test', age: 64, gender: 'male', reason: 'Diabetes follow-up' },
  { pid: 'c4090001-0000-4000-8000-000000000009', aid: 'd4090001-0000-4000-8000-000000000009', name: 'Simran Kaur', phone: '9000040909', email: 'flow.zurb.09@example.test', age: 19, gender: 'female', reason: 'Allergy' },
  { pid: 'c4090001-0000-4000-8000-00000000000a', aid: 'd4090001-0000-4000-8000-00000000000a', name: 'Deepak Rao', phone: '9000040910', email: 'flow.zurb.10@example.test', age: 38, gender: 'male', reason: 'Back pain' },
];

function kolkataYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function slotIso(index: number): string {
  const start = Date.now() + 2 * 60_000;
  return new Date(start + index * 5 * 60_000).toISOString();
}

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const sessionDate = kolkataYmd();
  const slots = PEOPLE.map((_, i) => slotIso(i));

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
      created_by: DOCTOR_ID,
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
    PEOPLE.map((p, i) => ({
      id: p.aid,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      patient_name: p.name,
      patient_phone: p.phone,
      appointment_date: slots[i],
      status: 'confirmed',
      reason_for_visit: p.reason,
      consultation_type: 'in_clinic',
      opd_event_type: 'standard',
      booking_origin: 'walk_in',
      notes: NOTES,
      patient_checked_in_at: now,
    })),
    { onConflict: 'id' }
  );
  if (aErr) {
    console.error('appointments upsert failed:', aErr.message);
    process.exit(1);
  }

  const appointmentIds = PEOPLE.map((p) => p.aid);
  const { error: delErr } = await admin
    .from('opd_queue_entries')
    .delete()
    .in('appointment_id', appointmentIds);
  if (delErr) {
    console.error('queue cleanup failed:', delErr.message);
    process.exit(1);
  }

  const { error: qErr } = await admin.from('opd_queue_entries').insert(
    PEOPLE.map((p, i) => ({
      doctor_id: DOCTOR_ID,
      appointment_id: p.aid,
      session_date: sessionDate,
      token_number: TOKEN_BASE + i,
      position: TOKEN_BASE + i,
      status: 'waiting',
    }))
  );
  if (qErr) {
    console.error('queue insert failed:', qErr.message);
    process.exit(1);
  }

  console.log(`Seeded ${PEOPLE.length} walk-ins on Dr Zurb for ${sessionDate} (tokens ${TOKEN_BASE}–${TOKEN_BASE + 9})`);
  PEOPLE.forEach((p, i) => {
    const t = new Date(slots[i]!).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    console.log(`  #${TOKEN_BASE + i}  ${t}  ${p.name}`);
  });
}

void main();
