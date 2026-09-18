/**
 * Put 3 existing SIM Pack dummy patients on today's OPD so the
 * medicines-template nudge can be opened from the cockpit.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-pack-suggestions-today-check-2026-09-17.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'sim pack suggestions today check 2026-09-17';

const PEOPLE = [
  {
    n: 1,
    pid: 'c1700917-0000-4000-8001-000000000001',
    aid: 'c1700917-0000-4000-8005-000000000001',
    name: 'SIM Pack 01',
    phone: '9000170101',
    reason: 'SIM — check pack templates',
  },
  {
    n: 2,
    pid: 'c1700917-0000-4000-8001-000000000002',
    aid: 'c1700917-0000-4000-8005-000000000002',
    name: 'SIM Pack 02',
    phone: '9000170102',
    reason: 'SIM — check pack templates',
  },
  {
    n: 3,
    pid: 'c1700917-0000-4000-8001-000000000003',
    aid: 'c1700917-0000-4000-8005-000000000003',
    name: 'SIM Pack 03',
    phone: '9000170103',
    reason: 'SIM — check pack templates',
  },
];

function kolkataYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-');
}

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const todayYmd = kolkataYmd();

  const { data: lastTokenRow, error: tokenErr } = await admin
    .from('opd_queue_entries')
    .select('token_number')
    .eq('doctor_id', DOCTOR_ID)
    .eq('session_date', todayYmd)
    .order('token_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tokenErr) {
    console.error('token lookup failed:', tokenErr.message);
    process.exit(1);
  }
  const tokenBase = (lastTokenRow?.token_number ?? 0) + 1;

  const appointments = PEOPLE.map((p, i) => ({
    id: p.aid,
    doctor_id: DOCTOR_ID,
    patient_id: p.pid,
    patient_name: p.name,
    patient_phone: p.phone,
    appointment_date: new Date(Date.now() + (10 + i * 10) * 60_000).toISOString(),
    status: 'confirmed',
    reason_for_visit: p.reason,
    consultation_type: 'in_clinic',
    opd_event_type: 'standard',
    booking_origin: 'walk_in',
    notes: NOTES,
    patient_checked_in_at: now,
  }));

  const { error: aErr } = await admin
    .from('appointments')
    .upsert(appointments, { onConflict: 'id' });
  if (aErr) {
    console.error('appointments upsert failed:', aErr.message);
    process.exit(1);
  }

  const { error: delQErr } = await admin
    .from('opd_queue_entries')
    .delete()
    .in(
      'appointment_id',
      PEOPLE.map((p) => p.aid)
    );
  if (delQErr) {
    console.error('queue cleanup failed:', delQErr.message);
    process.exit(1);
  }

  const { error: qErr } = await admin.from('opd_queue_entries').insert(
    PEOPLE.map((p, i) => ({
      doctor_id: DOCTOR_ID,
      appointment_id: p.aid,
      session_date: todayYmd,
      token_number: tokenBase + i,
      position: tokenBase + i,
      status: 'waiting',
    }))
  );
  if (qErr) {
    console.error('queue insert failed:', qErr.message);
    process.exit(1);
  }

  console.log(`Added ${PEOPLE.length} dummy patients to today's OPD from token #${tokenBase}.`);
  PEOPLE.forEach((p, i) => {
    console.log(`  #${tokenBase + i}  ${p.name}`);
  });
}

void main();
