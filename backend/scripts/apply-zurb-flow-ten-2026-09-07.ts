/**
 * Seed 10 more in-clinic walk-ins on Dr Zurb for today (flow testing).
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-flow-ten-2026-09-07.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'flow seed ten 2026-09-07';

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
  { pid: 'c7090001-0000-4000-8000-000000000001', aid: 'd7090001-0000-4000-8000-000000000001', name: 'Ananya Shah', phone: '9000070901', email: 'flow.zurb.11@example.test', age: 27, gender: 'female', reason: 'Allergy review' },
  { pid: 'c7090001-0000-4000-8000-000000000002', aid: 'd7090001-0000-4000-8000-000000000002', name: 'Rohit Malhotra', phone: '9000070902', email: 'flow.zurb.12@example.test', age: 49, gender: 'male', reason: 'Hypertension follow-up' },
  { pid: 'c7090001-0000-4000-8000-000000000003', aid: 'd7090001-0000-4000-8000-000000000003', name: 'Meera Kapoor', phone: '9000070903', email: 'flow.zurb.13@example.test', age: 34, gender: 'female', reason: 'Migraine' },
  { pid: 'c7090001-0000-4000-8000-000000000004', aid: 'd7090001-0000-4000-8000-000000000004', name: 'Farhan Siddiqui', phone: '9000070904', email: 'flow.zurb.14@example.test', age: 56, gender: 'male', reason: 'Diabetes + meds' },
  { pid: 'c7090001-0000-4000-8000-000000000005', aid: 'd7090001-0000-4000-8000-000000000005', name: 'Ishita Roy', phone: '9000070905', email: 'flow.zurb.15@example.test', age: 22, gender: 'female', reason: 'Sore throat' },
  { pid: 'c7090001-0000-4000-8000-000000000006', aid: 'd7090001-0000-4000-8000-000000000006', name: 'Karthik Pillai', phone: '9000070906', email: 'flow.zurb.16@example.test', age: 41, gender: 'male', reason: 'Back pain' },
  { pid: 'c7090001-0000-4000-8000-000000000007', aid: 'd7090001-0000-4000-8000-000000000007', name: 'Sneha Desai', phone: '9000070907', email: 'flow.zurb.17@example.test', age: 30, gender: 'female', reason: 'Acne review' },
  { pid: 'c7090001-0000-4000-8000-000000000008', aid: 'd7090001-0000-4000-8000-000000000008', name: 'Baldev Singh', phone: '9000070908', email: 'flow.zurb.18@example.test', age: 68, gender: 'male', reason: 'COPD review' },
  { pid: 'c7090001-0000-4000-8000-000000000009', aid: 'd7090001-0000-4000-8000-000000000009', name: 'Pooja Bhatt', phone: '9000070909', email: 'flow.zurb.19@example.test', age: 25, gender: 'female', reason: 'Fever 3 days' },
  { pid: 'c7090001-0000-4000-8000-00000000000a', aid: 'd7090001-0000-4000-8000-00000000000a', name: 'Nikhil Joshi', phone: '9000070910', email: 'flow.zurb.20@example.test', age: 37, gender: 'male', reason: 'Gastritis' },
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

  const { data: lastTokenRow, error: tokenErr } = await admin
    .from('opd_queue_entries')
    .select('token_number')
    .eq('doctor_id', DOCTOR_ID)
    .eq('session_date', sessionDate)
    .order('token_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tokenErr) {
    console.error('token lookup failed:', tokenErr.message);
    process.exit(1);
  }
  const tokenBase = (lastTokenRow?.token_number ?? 0) + 1;

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
    { onConflict: 'id' },
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
      console.error('assign_patient_mrn failed:', mrnErr.message);
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
    { onConflict: 'id' },
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
      token_number: tokenBase + i,
      position: tokenBase + i,
      status: 'waiting',
    })),
  );
  if (qErr) {
    console.error('queue insert failed:', qErr.message);
    process.exit(1);
  }

  console.log(
    `Seeded ${PEOPLE.length} walk-ins on Dr Zurb for ${sessionDate} (tokens ${tokenBase}–${tokenBase + 9})`,
  );
  PEOPLE.forEach((p, i) => {
    const t = new Date(slots[i]!).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    console.log(`  #${tokenBase + i}  ${t}  ${p.name}`);
  });
}

void main();
