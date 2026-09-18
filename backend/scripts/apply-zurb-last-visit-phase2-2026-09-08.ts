/**
 * Seed 5 revisit patients on Dr Zurb for last-visit Phase 2 dogfood
 * (diagnoses Ongoing/Resolved, investigations/advice Add, follow-up Use).
 * Prior visit is filled + attested; today is an empty checked-in walk-in.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-last-visit-phase2-2026-09-08.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'last-visit phase2 seed 2026-09-08';
const PRIOR_DAYS_AGO = 7;

interface SeedMed {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  frequencyCode: 'OD' | 'BID' | 'TID' | 'PRN';
  durationValue: number;
  durationUnit: 'days';
  doseQty: number;
  doseUnit: 'tab' | 'spoon' | 'ml';
  form: string;
  foodTiming: 'after_food' | 'before_food' | null;
}

interface SeedPerson {
  pid: string;
  todayAid: string;
  priorAid: string;
  rid: string;
  name: string;
  phone: string;
  email: string;
  age: number;
  gender: 'female' | 'male';
  reasonToday: string;
  reasonPrior: string;
  complaints: Array<{
    id: string;
    name: string;
    duration: string;
    onset: string;
    category?: string;
  }>;
  diagnosis: string;
  diagnosesJson: Array<Record<string, unknown>>;
  investigations: string;
  advice: string;
  followUpValue: number;
  followUpUnit: 'days' | 'weeks' | 'months';
  medicines: SeedMed[];
}

function med(
  id: string,
  name: string,
  dosage: string,
  frequency: string,
  frequencyCode: SeedMed['frequencyCode'],
  durationValue: number,
  extra: Partial<Pick<SeedMed, 'doseQty' | 'doseUnit' | 'form' | 'foodTiming'>> = {}
): SeedMed {
  return {
    id,
    name,
    dosage,
    frequency,
    frequencyCode,
    durationValue,
    durationUnit: 'days',
    doseQty: extra.doseQty ?? 1,
    doseUnit: extra.doseUnit ?? 'tab',
    form: extra.form ?? 'tab',
    foodTiming: extra.foodTiming ?? 'after_food',
  };
}

const PEOPLE: SeedPerson[] = [
  {
    pid: 'c8090018-0000-4000-8000-000000000001',
    todayAid: 'd8090018-0000-4000-8000-000000000001',
    priorAid: 'd8090019-0000-4000-8000-000000000001',
    rid: 'e8090018-0000-4000-8000-000000000001',
    name: 'Meera Joshi',
    phone: '9000082801',
    email: 'lvc.p2.zurb.01@example.test',
    age: 31,
    gender: 'female',
    reasonPrior: 'Burning while passing urine',
    reasonToday: 'UTI review',
    complaints: [
      {
        id: 'a8090018-0000-4000-8000-000000000001',
        name: 'Dysuria',
        duration: '4 days',
        onset: '4 days ago',
      },
    ],
    diagnosis: 'Acute cystitis',
    diagnosesJson: [
      {
        id: 'b8090018-0000-4000-8000-000000000001',
        label: 'Acute cystitis',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    investigations: 'Urine RE; Urine culture',
    advice: 'Plenty of fluids. Complete the antibiotic course.',
    followUpValue: 5,
    followUpUnit: 'days',
    medicines: [
      med('f8090018-0000-4000-8000-000000000001', 'Nitrofurantoin', '100 mg', 'BID', 'BID', 5),
    ],
  },
  {
    pid: 'c8090018-0000-4000-8000-000000000002',
    todayAid: 'd8090018-0000-4000-8000-000000000002',
    priorAid: 'd8090019-0000-4000-8000-000000000002',
    rid: 'e8090018-0000-4000-8000-000000000002',
    name: 'Rohan Nair',
    phone: '9000082802',
    email: 'lvc.p2.zurb.02@example.test',
    age: 49,
    gender: 'male',
    reasonPrior: 'Diabetes check',
    reasonToday: 'Diabetes follow-up',
    complaints: [
      {
        id: 'a8090018-0000-4000-8000-000000000002',
        name: 'Fatigue',
        duration: '3 weeks',
        onset: '3 weeks ago',
      },
    ],
    diagnosis: 'Type 2 diabetes mellitus',
    diagnosesJson: [
      {
        id: 'b8090018-0000-4000-8000-000000000002',
        label: 'Type 2 diabetes mellitus',
        kind: 'primary',
        certainty: 'confirmed',
        status: 'ongoing',
      },
      {
        id: 'b8090018-0000-4000-8000-000000000012',
        label: 'Dyslipidaemia',
        kind: 'secondary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    investigations: 'FBS; HbA1c; Lipid profile',
    advice: 'Walk 30 minutes daily. Cut evening sweets.',
    followUpValue: 1,
    followUpUnit: 'months',
    medicines: [
      med('f8090018-0000-4000-8000-000000000002', 'Metformin', '500 mg', 'BID', 'BID', 30),
      med('f8090018-0000-4000-8000-000000000012', 'Atorvastatin', '10 mg', 'OD', 'OD', 30),
    ],
  },
  {
    pid: 'c8090018-0000-4000-8000-000000000003',
    todayAid: 'd8090018-0000-4000-8000-000000000003',
    priorAid: 'd8090019-0000-4000-8000-000000000003',
    rid: 'e8090018-0000-4000-8000-000000000003',
    name: 'Priya Bansal',
    phone: '9000082803',
    email: 'lvc.p2.zurb.03@example.test',
    age: 27,
    gender: 'female',
    reasonPrior: 'One-sided headache',
    reasonToday: 'Migraine review',
    complaints: [
      {
        id: 'a8090018-0000-4000-8000-000000000003',
        name: 'Headache',
        category: 'pain',
        duration: '2 days',
        onset: '2 days ago',
      },
    ],
    diagnosis: 'Migraine without aura',
    diagnosesJson: [
      {
        id: 'b8090018-0000-4000-8000-000000000003',
        label: 'Migraine without aura',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    investigations: 'CBC',
    advice: 'Rest in a dark room. Avoid skipped meals.',
    followUpValue: 2,
    followUpUnit: 'weeks',
    medicines: [
      med('f8090018-0000-4000-8000-000000000003', 'Sumatriptan', '50 mg', 'PRN', 'PRN', 5),
      med('f8090018-0000-4000-8000-000000000013', 'Naproxen', '250 mg', 'BID', 'BID', 3),
    ],
  },
  {
    pid: 'c8090018-0000-4000-8000-000000000004',
    todayAid: 'd8090018-0000-4000-8000-000000000004',
    priorAid: 'd8090019-0000-4000-8000-000000000004',
    rid: 'e8090018-0000-4000-8000-000000000004',
    name: 'Farhan Ali',
    phone: '9000082804',
    email: 'lvc.p2.zurb.04@example.test',
    age: 62,
    gender: 'male',
    reasonPrior: 'Right knee pain',
    reasonToday: 'Knee pain review',
    complaints: [
      {
        id: 'a8090018-0000-4000-8000-000000000004',
        name: 'Knee pain',
        category: 'pain',
        duration: '6 weeks',
        onset: '6 weeks ago',
      },
    ],
    diagnosis: 'Osteoarthritis of knee',
    diagnosesJson: [
      {
        id: 'b8090018-0000-4000-8000-000000000004',
        label: 'Osteoarthritis of knee',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    investigations: 'X-ray right knee',
    advice: 'Quadriceps strengthening. Avoid sitting on the floor.',
    followUpValue: 14,
    followUpUnit: 'days',
    medicines: [
      med('f8090018-0000-4000-8000-000000000004', 'Paracetamol', '650 mg', 'TID', 'TID', 7),
    ],
  },
  {
    pid: 'c8090018-0000-4000-8000-000000000005',
    todayAid: 'd8090018-0000-4000-8000-000000000005',
    priorAid: 'd8090019-0000-4000-8000-000000000005',
    rid: 'e8090018-0000-4000-8000-000000000005',
    name: 'Ananya Reddy',
    phone: '9000082805',
    email: 'lvc.p2.zurb.05@example.test',
    age: 38,
    gender: 'female',
    reasonPrior: 'Thyroid review',
    reasonToday: 'Hypothyroid follow-up',
    complaints: [
      {
        id: 'a8090018-0000-4000-8000-000000000005',
        name: 'Fatigue',
        duration: '2 months',
        onset: '2 months ago',
      },
    ],
    diagnosis: 'Hypothyroidism',
    diagnosesJson: [
      {
        id: 'b8090018-0000-4000-8000-000000000005',
        label: 'Hypothyroidism',
        kind: 'primary',
        certainty: 'confirmed',
        status: 'ongoing',
      },
    ],
    investigations: 'TSH; Free T4',
    advice: 'Take thyroxine empty stomach. Repeat TSH before next visit.',
    followUpValue: 6,
    followUpUnit: 'weeks',
    medicines: [
      med('f8090018-0000-4000-8000-000000000005', 'Levothyroxine', '50 mcg', 'OD', 'OD', 42, {
        foodTiming: 'before_food',
      }),
    ],
  },
];

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

function todaySlotIso(index: number): string {
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
  const todayYmd = kolkataYmd();
  const priorYmd = addKolkataDays(todayYmd, -PRIOR_DAYS_AGO);
  const todaySlots = PEOPLE.map((_, i) => todaySlotIso(i));
  const priorSlots = PEOPLE.map((_, i) => istIso(priorYmd, 11, i * 15));
  const rxIds = PEOPLE.map((p) => p.rid);

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
      console.error('assign_patient_mrn failed:', mrnErr.message);
      process.exit(1);
    }
  }

  const { error: priorApptErr } = await admin.from('appointments').upsert(
    PEOPLE.map((p, i) => ({
      id: p.priorAid,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      patient_name: p.name,
      patient_phone: p.phone,
      appointment_date: priorSlots[i],
      status: 'completed',
      reason_for_visit: p.reasonPrior,
      consultation_type: 'in_clinic',
      opd_event_type: 'standard',
      booking_origin: 'walk_in',
      notes: NOTES,
      patient_checked_in_at: priorSlots[i],
    })),
    { onConflict: 'id' }
  );
  if (priorApptErr) {
    console.error('prior appointments upsert failed:', priorApptErr.message);
    process.exit(1);
  }

  const { error: todayApptErr } = await admin.from('appointments').upsert(
    PEOPLE.map((p, i) => ({
      id: p.todayAid,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      patient_name: p.name,
      patient_phone: p.phone,
      appointment_date: todaySlots[i],
      status: 'confirmed',
      reason_for_visit: p.reasonToday,
      consultation_type: 'in_clinic',
      opd_event_type: 'standard',
      booking_origin: 'walk_in',
      notes: NOTES,
      patient_checked_in_at: now,
    })),
    { onConflict: 'id' }
  );
  if (todayApptErr) {
    console.error('today appointments upsert failed:', todayApptErr.message);
    process.exit(1);
  }

  const { error: delMedErr } = await admin
    .from('prescription_medicines')
    .delete()
    .in('prescription_id', rxIds);
  if (delMedErr) {
    console.error('clear medicines failed:', delMedErr.message);
    process.exit(1);
  }

  const { error: rxErr } = await admin.from('prescriptions').upsert(
    PEOPLE.map((p, i) => ({
      id: p.rid,
      appointment_id: p.priorAid,
      patient_id: p.pid,
      doctor_id: DOCTOR_ID,
      type: 'structured',
      cc: p.complaints.map((c) => c.name).join(', '),
      hopi: `${p.reasonPrior} — seeded prior visit for last-visit Phase 2.`,
      provisional_diagnosis: p.diagnosis,
      diagnoses_json: p.diagnosesJson,
      complaints: p.complaints,
      investigations_orders: p.investigations,
      advice: p.advice,
      follow_up: null,
      follow_up_value: p.followUpValue,
      follow_up_unit: p.followUpUnit,
      created_at: priorSlots[i],
      attested_at: priorSlots[i],
    })),
    { onConflict: 'id' }
  );
  if (rxErr) {
    console.error('prescriptions upsert failed:', rxErr.message);
    process.exit(1);
  }

  const medicineRows = PEOPLE.flatMap((p) =>
    p.medicines.map((m, i) => ({
      id: m.id,
      prescription_id: p.rid,
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
  const { error: medErr } = await admin.from('prescription_medicines').insert(medicineRows);
  if (medErr) {
    console.error('medicines insert failed:', medErr.message);
    process.exit(1);
  }

  const todayIds = PEOPLE.map((p) => p.todayAid);
  const { error: delQErr } = await admin
    .from('opd_queue_entries')
    .delete()
    .in('appointment_id', todayIds);
  if (delQErr) {
    console.error('queue cleanup failed:', delQErr.message);
    process.exit(1);
  }

  const { error: qErr } = await admin.from('opd_queue_entries').insert(
    PEOPLE.map((p, i) => ({
      doctor_id: DOCTOR_ID,
      appointment_id: p.todayAid,
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

  console.log(
    `Seeded ${PEOPLE.length} Phase 2 revisit patients on Dr Zurb — prior ${priorYmd}, today ${todayYmd} (tokens ${tokenBase}–${tokenBase + PEOPLE.length - 1})`
  );
  PEOPLE.forEach((p, i) => {
    const t = new Date(todaySlots[i]!).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    console.log(
      `  #${tokenBase + i}  ${t}  ${p.name}  today empty · ${p.diagnosis} · ${p.investigations}`
    );
  });
}

void main();
