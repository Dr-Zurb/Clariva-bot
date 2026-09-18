/**
 * One revisit patient on Dr Zurb with every last-visit strip filled
 * (complaints, diagnoses, medicines, investigations, advice, follow-up).
 * Today is an empty checked-in walk-in.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-last-visit-full-one-2026-09-08.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'last-visit full-strip seed 2026-09-08';
const PRIOR_DAYS_AGO = 7;

const PERSON = {
  pid: 'c8090028-0000-4000-8000-000000000001',
  todayAid: 'd8090028-0000-4000-8000-000000000001',
  priorAid: 'd8090029-0000-4000-8000-000000000001',
  rid: 'e8090028-0000-4000-8000-000000000001',
  name: 'Vikram Patel',
  phone: '9000083801',
  email: 'lvc.full.zurb.01@example.test',
  age: 45,
  gender: 'male' as const,
  reasonPrior: 'Cough, fever and wheeze',
  reasonToday: 'Review — all last-visit sections',
  complaints: [
    {
      id: 'a8090028-0000-4000-8000-000000000001',
      name: 'Cough',
      category: 'cough',
      duration: '8 days',
      onset: '8 days ago',
    },
    {
      id: 'a8090028-0000-4000-8000-000000000002',
      name: 'Fever',
      category: 'fever',
      duration: '4 days',
      onset: '4 days ago',
    },
    {
      id: 'a8090028-0000-4000-8000-000000000003',
      name: 'Wheeze',
      duration: '8 days',
      onset: '8 days ago',
    },
  ],
  diagnosis: 'Acute bronchitis',
  diagnosesJson: [
    {
      id: 'b8090028-0000-4000-8000-000000000001',
      label: 'Acute bronchitis',
      kind: 'primary',
      certainty: 'provisional',
      status: 'new',
    },
    {
      id: 'b8090028-0000-4000-8000-000000000002',
      label: 'Allergic rhinitis',
      kind: 'secondary',
      certainty: 'provisional',
      status: 'ongoing',
    },
  ],
  investigations: 'CBC; Chest X-ray; Serum IgE',
  advice: 'Steam inhalation twice daily. Avoid dust and cold drinks.',
  followUpValue: 7,
  followUpUnit: 'days' as const,
  medicines: [
    {
      id: 'f8090028-0000-4000-8000-000000000001',
      name: 'Dextromethorphan',
      dosage: '1 tsp',
      frequency: 'TID',
      frequencyCode: 'TID' as const,
      durationValue: 5,
      durationUnit: 'days' as const,
      doseQty: 1,
      doseUnit: 'spoon' as const,
      form: 'syrup',
      foodTiming: 'after_food' as const,
    },
    {
      id: 'f8090028-0000-4000-8000-000000000002',
      name: 'Amoxicillin',
      dosage: '500 mg',
      frequency: 'TID',
      frequencyCode: 'TID' as const,
      durationValue: 5,
      durationUnit: 'days' as const,
      doseQty: 1,
      doseUnit: 'cap' as const,
      form: 'cap',
      foodTiming: 'after_food' as const,
    },
    {
      id: 'f8090028-0000-4000-8000-000000000003',
      name: 'Cetirizine',
      dosage: '10 mg',
      frequency: 'OD',
      frequencyCode: 'OD' as const,
      durationValue: 7,
      durationUnit: 'days' as const,
      doseQty: 1,
      doseUnit: 'tab' as const,
      form: 'tab',
      foodTiming: 'after_food' as const,
    },
  ],
};

function kolkataYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function addKolkataDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utcNoon = Date.UTC(year!, month! - 1, day, 6, 30, 0);
  return kolkataYmd(new Date(utcNoon + days * 86_400_000));
}

function istIso(ymd: string, hour: number, minute: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day, hour - 5, minute - 30, 0)).toISOString();
}

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const todayYmd = kolkataYmd();
  const priorYmd = addKolkataDays(todayYmd, -PRIOR_DAYS_AGO);
  const todaySlot = new Date(Date.now() + 2 * 60_000).toISOString();
  const priorSlot = istIso(priorYmd, 11, 0);

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
  const token = (lastTokenRow?.token_number ?? 0) + 1;

  const { error: pErr } = await admin.from('patients').upsert(
    {
      id: PERSON.pid,
      name: PERSON.name,
      phone: PERSON.phone,
      email: PERSON.email,
      age: PERSON.age,
      gender: PERSON.gender,
      doctor_id: DOCTOR_ID,
      platform: null,
      platform_external_id: null,
      consent_status: 'granted',
      consent_granted_at: now,
      consent_method: 'manual_sql_seed',
      registered_via: 'front_desk',
      created_by: DOCTOR_ID,
    },
    { onConflict: 'id' }
  );
  if (pErr) {
    console.error('patients upsert failed:', pErr.message);
    process.exit(1);
  }

  const { error: mrnErr } = await admin.rpc('assign_patient_mrn', {
    p_patient_id: PERSON.pid,
  });
  if (mrnErr) {
    console.error('assign_patient_mrn failed:', mrnErr.message);
    process.exit(1);
  }

  const { error: priorApptErr } = await admin.from('appointments').upsert(
    {
      id: PERSON.priorAid,
      doctor_id: DOCTOR_ID,
      patient_id: PERSON.pid,
      patient_name: PERSON.name,
      patient_phone: PERSON.phone,
      appointment_date: priorSlot,
      status: 'completed',
      reason_for_visit: PERSON.reasonPrior,
      consultation_type: 'in_clinic',
      opd_event_type: 'standard',
      booking_origin: 'walk_in',
      notes: NOTES,
      patient_checked_in_at: priorSlot,
    },
    { onConflict: 'id' }
  );
  if (priorApptErr) {
    console.error('prior appointments upsert failed:', priorApptErr.message);
    process.exit(1);
  }

  const { error: todayApptErr } = await admin.from('appointments').upsert(
    {
      id: PERSON.todayAid,
      doctor_id: DOCTOR_ID,
      patient_id: PERSON.pid,
      patient_name: PERSON.name,
      patient_phone: PERSON.phone,
      appointment_date: todaySlot,
      status: 'confirmed',
      reason_for_visit: PERSON.reasonToday,
      consultation_type: 'in_clinic',
      opd_event_type: 'standard',
      booking_origin: 'walk_in',
      notes: NOTES,
      patient_checked_in_at: now,
    },
    { onConflict: 'id' }
  );
  if (todayApptErr) {
    console.error('today appointments upsert failed:', todayApptErr.message);
    process.exit(1);
  }

  const { error: delMedErr } = await admin
    .from('prescription_medicines')
    .delete()
    .eq('prescription_id', PERSON.rid);
  if (delMedErr) {
    console.error('clear medicines failed:', delMedErr.message);
    process.exit(1);
  }

  const { error: rxErr } = await admin.from('prescriptions').upsert(
    {
      id: PERSON.rid,
      appointment_id: PERSON.priorAid,
      patient_id: PERSON.pid,
      doctor_id: DOCTOR_ID,
      type: 'structured',
      cc: PERSON.complaints.map((c) => c.name).join(', '),
      hopi: `${PERSON.reasonPrior} — seeded full last-visit strip.`,
      provisional_diagnosis: PERSON.diagnosis,
      diagnoses_json: PERSON.diagnosesJson,
      complaints: PERSON.complaints,
      investigations_orders: PERSON.investigations,
      advice: PERSON.advice,
      follow_up: null,
      follow_up_value: PERSON.followUpValue,
      follow_up_unit: PERSON.followUpUnit,
      created_at: priorSlot,
      attested_at: priorSlot,
    },
    { onConflict: 'id' }
  );
  if (rxErr) {
    console.error('prescriptions upsert failed:', rxErr.message);
    process.exit(1);
  }

  const { error: medErr } = await admin.from('prescription_medicines').insert(
    PERSON.medicines.map((m, i) => ({
      id: m.id,
      prescription_id: PERSON.rid,
      medicine_name: m.name,
      dosage: m.dosage,
      route: 'Oral',
      frequency: m.frequency,
      duration: `${m.durationValue} days`,
      instructions: null,
      sort_order: i,
      frequency_code: m.frequencyCode,
      duration_value: m.durationValue,
      duration_unit: m.durationUnit,
      route_code: 'oral',
      dose_qty: m.doseQty,
      dose_unit: m.doseUnit,
      form: m.form,
      food_timing: m.foodTiming,
    }))
  );
  if (medErr) {
    console.error('medicines insert failed:', medErr.message);
    process.exit(1);
  }

  const { error: delQErr } = await admin
    .from('opd_queue_entries')
    .delete()
    .eq('appointment_id', PERSON.todayAid);
  if (delQErr) {
    console.error('queue cleanup failed:', delQErr.message);
    process.exit(1);
  }

  const { error: qErr } = await admin.from('opd_queue_entries').insert({
    doctor_id: DOCTOR_ID,
    appointment_id: PERSON.todayAid,
    session_date: todayYmd,
    token_number: token,
    position: token,
    status: 'waiting',
  });
  if (qErr) {
    console.error('queue insert failed:', qErr.message);
    process.exit(1);
  }

  console.log(
    `Seeded ${PERSON.name} — prior ${priorYmd}, today ${todayYmd} token #${token} (empty today)`
  );
  console.log(`  complaints: ${PERSON.complaints.map((c) => c.name).join(', ')}`);
  console.log(`  diagnoses: ${PERSON.diagnosesJson.map((d) => d.label).join(', ')}`);
  console.log(`  medicines: ${PERSON.medicines.map((m) => m.name).join(', ')}`);
  console.log(`  investigations: ${PERSON.investigations}`);
  console.log(`  advice: ${PERSON.advice}`);
  console.log(`  follow-up: ${PERSON.followUpValue} ${PERSON.followUpUnit}`);
}

void main();
