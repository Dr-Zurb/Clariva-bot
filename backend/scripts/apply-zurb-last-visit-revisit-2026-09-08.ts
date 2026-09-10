/**
 * Seed 5 revisit patients on Dr Zurb for last-visit-context dogfood.
 * Each has a filled, attested prescription on a prior day, and an empty
 * walk-in today (no Rx yet) so the grey strip can show CST.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-last-visit-revisit-2026-09-08.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'last-visit revisit seed 2026-09-08';
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
    pid: 'c8090008-0000-4000-8000-000000000001',
    todayAid: 'd8090008-0000-4000-8000-000000000001',
    priorAid: 'd8090009-0000-4000-8000-000000000001',
    rid: 'e8090008-0000-4000-8000-000000000001',
    name: 'Leela Menon',
    phone: '9000081901',
    email: 'lvc.zurb.01@example.test',
    age: 28,
    gender: 'female',
    reasonPrior: 'Dry cough',
    reasonToday: 'Cough still there',
    complaints: [
      {
        id: 'a8090008-0000-4000-8000-000000000001',
        name: 'Cough',
        category: 'cough',
        duration: '5 days',
        onset: '5 days ago',
      },
    ],
    diagnosis: 'Acute bronchitis',
    diagnosesJson: [
      {
        id: 'b8090008-0000-4000-8000-000000000001',
        label: 'Acute bronchitis',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    medicines: [
      med('f8090008-0000-4000-8000-000000000001', 'Dextromethorphan', '1 tsp', 'TID', 'TID', 5, {
        doseQty: 1,
        doseUnit: 'spoon',
        form: 'syrup',
      }),
      med('f8090008-0000-4000-8000-000000000002', 'Paracetamol', '650 mg', 'PRN', 'PRN', 3, {
        doseQty: 1,
        doseUnit: 'tab',
        form: 'tab',
      }),
    ],
  },
  {
    pid: 'c8090008-0000-4000-8000-000000000002',
    todayAid: 'd8090008-0000-4000-8000-000000000002',
    priorAid: 'd8090009-0000-4000-8000-000000000002',
    rid: 'e8090008-0000-4000-8000-000000000002',
    name: 'Arjun Sethi',
    phone: '9000081902',
    email: 'lvc.zurb.02@example.test',
    age: 41,
    gender: 'male',
    reasonPrior: 'Fever and body ache',
    reasonToday: 'Fever review',
    complaints: [
      {
        id: 'a8090008-0000-4000-8000-000000000003',
        name: 'Fever',
        category: 'fever',
        duration: '3 days',
        onset: '3 days ago',
      },
      {
        id: 'a8090008-0000-4000-8000-000000000004',
        name: 'Body ache',
        duration: '3 days',
        onset: '3 days ago',
      },
    ],
    diagnosis: 'Viral fever',
    diagnosesJson: [
      {
        id: 'b8090008-0000-4000-8000-000000000002',
        label: 'Viral fever',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    medicines: [
      med('f8090008-0000-4000-8000-000000000003', 'Paracetamol', '650 mg', 'TID', 'TID', 3),
      med('f8090008-0000-4000-8000-000000000004', 'Multivitamin', '1 tab', 'OD', 'OD', 10),
    ],
  },
  {
    pid: 'c8090008-0000-4000-8000-000000000003',
    todayAid: 'd8090008-0000-4000-8000-000000000003',
    priorAid: 'd8090009-0000-4000-8000-000000000003',
    rid: 'e8090008-0000-4000-8000-000000000003',
    name: 'Kavita Deshpande',
    phone: '9000081903',
    email: 'lvc.zurb.03@example.test',
    age: 36,
    gender: 'female',
    reasonPrior: 'Acidity',
    reasonToday: 'Acidity still there',
    complaints: [
      {
        id: 'a8090008-0000-4000-8000-000000000005',
        name: 'Acidity',
        duration: '10 days',
        onset: '10 days ago',
      },
    ],
    diagnosis: 'Gastritis',
    diagnosesJson: [
      {
        id: 'b8090008-0000-4000-8000-000000000003',
        label: 'Gastritis',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    medicines: [
      med('f8090008-0000-4000-8000-000000000005', 'Pantoprazole', '40 mg', 'OD', 'OD', 14, {
        foodTiming: 'before_food',
      }),
    ],
  },
  {
    pid: 'c8090008-0000-4000-8000-000000000004',
    todayAid: 'd8090008-0000-4000-8000-000000000004',
    priorAid: 'd8090009-0000-4000-8000-000000000004',
    rid: 'e8090008-0000-4000-8000-000000000004',
    name: 'Imran Qureshi',
    phone: '9000081904',
    email: 'lvc.zurb.04@example.test',
    age: 54,
    gender: 'male',
    reasonPrior: 'BP check',
    reasonToday: 'Hypertension follow-up',
    complaints: [
      {
        id: 'a8090008-0000-4000-8000-000000000006',
        name: 'Headache',
        duration: '2 weeks',
        onset: '2 weeks ago',
      },
    ],
    diagnosis: 'Essential hypertension',
    diagnosesJson: [
      {
        id: 'b8090008-0000-4000-8000-000000000004',
        label: 'Essential hypertension',
        kind: 'primary',
        certainty: 'confirmed',
        status: 'ongoing',
      },
    ],
    medicines: [med('f8090008-0000-4000-8000-000000000006', 'Amlodipine', '5 mg', 'OD', 'OD', 30)],
  },
  {
    pid: 'c8090008-0000-4000-8000-000000000005',
    todayAid: 'd8090008-0000-4000-8000-000000000005',
    priorAid: 'd8090009-0000-4000-8000-000000000005',
    rid: 'e8090008-0000-4000-8000-000000000005',
    name: 'Sana Kapoor',
    phone: '9000081905',
    email: 'lvc.zurb.05@example.test',
    age: 22,
    gender: 'female',
    reasonPrior: 'Sneezing and itchy eyes',
    reasonToday: 'Allergy flare-up',
    complaints: [
      {
        id: 'a8090008-0000-4000-8000-000000000007',
        name: 'Sneezing',
        duration: '7 days',
        onset: '7 days ago',
      },
      {
        id: 'a8090008-0000-4000-8000-000000000008',
        name: 'Itchy eyes',
        duration: '7 days',
        onset: '7 days ago',
      },
    ],
    diagnosis: 'Allergic rhinitis',
    diagnosesJson: [
      {
        id: 'b8090008-0000-4000-8000-000000000005',
        label: 'Allergic rhinitis',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    medicines: [
      med('f8090008-0000-4000-8000-000000000007', 'Cetirizine', '10 mg', 'OD', 'OD', 10),
      med('f8090008-0000-4000-8000-000000000008', 'Montelukast', '10 mg', 'OD', 'OD', 10),
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
  // IST is UTC+5:30 — build UTC millis so we never depend on Date string parsing.
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
  const priorSlots = PEOPLE.map((_, i) => istIso(priorYmd, 10, i * 15));
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
      hopi: `${p.reasonPrior} — seeded prior visit for last-visit strip.`,
      provisional_diagnosis: p.diagnosis,
      diagnoses_json: p.diagnosesJson,
      complaints: p.complaints,
      investigations_orders: ['CBC', 'RBS', 'LFT', 'ECG', 'Serum IgE'][i] ?? null,
      advice: 'Continue same treatment if improving.',
      follow_up: '7 days',
      follow_up_value: 7,
      follow_up_unit: 'days',
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
    `Seeded ${PEOPLE.length} revisit patients on Dr Zurb — prior ${priorYmd}, today ${todayYmd} (tokens ${tokenBase}–${tokenBase + PEOPLE.length - 1})`
  );
  PEOPLE.forEach((p, i) => {
    const t = new Date(todaySlots[i]!).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    console.log(
      `  #${tokenBase + i}  ${t}  ${p.name}  today empty · last visit ${p.complaints.map((c) => c.name).join(', ')}`
    );
  });
}

void main();
