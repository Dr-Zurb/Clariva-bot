/**
 * Seed 3 revisit patients on Dr Zurb whose chart is already filled
 * (allergies, known conditions, standing meds) from prior care.
 * Today is an empty checked-in walk-in — ribbon should show the chart.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-last-visit-chart-2026-09-08.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'last-visit chart seed 2026-09-08';
const PRIOR_DAYS_AGO = 14;

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
  reasonPrior: string;
  reasonToday: string;
  complaint: { id: string; name: string; duration: string; onset: string };
  diagnosis: string;
  diagnosisId: string;
  investigations: string;
  advice: string;
  followUpValue: number;
  followUpUnit: 'days' | 'weeks' | 'months';
  rxMed: { id: string; name: string; dosage: string };
  allergies: Array<{
    id: string;
    allergen: string;
    severity: 'mild' | 'moderate' | 'severe' | 'unknown';
    reaction: string | null;
  }>;
  conditions: Array<{
    id: string;
    condition: string;
    status: 'active' | 'resolved';
    acuity: 'stable' | 'improving' | 'worsening' | null;
    onTreatment: boolean | null;
    diagnosedAgoValue: number | null;
    diagnosedAgoUnit: 'years' | 'months' | null;
  }>;
  chartMeds: Array<{
    id: string;
    drugName: string;
    dose: string;
    frequency: string;
    frequencyCode: 'OD' | 'BID' | 'TID' | 'PRN';
    status: 'active' | 'past';
  }>;
}

const PEOPLE: SeedPerson[] = [
  {
    pid: 'c8090048-0000-4000-8000-000000000001',
    todayAid: 'd8090048-0000-4000-8000-000000000001',
    priorAid: 'd8090049-0000-4000-8000-000000000001',
    rid: 'e8090048-0000-4000-8000-000000000001',
    name: 'Harish Mehta',
    phone: '9000085801',
    email: 'lvc.chart.zurb.01@example.test',
    age: 58,
    gender: 'male',
    reasonPrior: 'BP and sugar check',
    reasonToday: 'HTN + diabetes review — chart already filled',
    complaint: {
      id: 'a8090048-0000-4000-8000-000000000001',
      name: 'Fatigue',
      duration: '2 weeks',
      onset: '2 weeks ago',
    },
    diagnosis: 'Type 2 diabetes mellitus',
    diagnosisId: 'b8090048-0000-4000-8000-000000000001',
    investigations: 'FBS; HbA1c; BP check',
    advice: 'Walk 30 minutes. Keep the salt down.',
    followUpValue: 1,
    followUpUnit: 'months',
    rxMed: { id: 'f8090048-0000-4000-8000-000000000001', name: 'Metformin', dosage: '500 mg' },
    allergies: [
      {
        id: 'aa809048-0000-4000-8000-000000000001',
        allergen: 'Penicillin',
        severity: 'severe',
        reaction: 'Rash and swelling',
      },
    ],
    conditions: [
      {
        id: 'cc809048-0000-4000-8000-000000000001',
        condition: 'Hypertension',
        status: 'active',
        acuity: 'stable',
        onTreatment: true,
        diagnosedAgoValue: 8,
        diagnosedAgoUnit: 'years',
      },
      {
        id: 'cc809048-0000-4000-8000-000000000011',
        condition: 'Type 2 diabetes mellitus',
        status: 'active',
        acuity: 'stable',
        onTreatment: true,
        diagnosedAgoValue: 4,
        diagnosedAgoUnit: 'years',
      },
    ],
    chartMeds: [
      {
        id: 'cd809048-0000-4000-8000-000000000001',
        drugName: 'Amlodipine',
        dose: '5 mg',
        frequency: 'OD',
        frequencyCode: 'OD',
        status: 'active',
      },
      {
        id: 'cd809048-0000-4000-8000-000000000011',
        drugName: 'Metformin',
        dose: '500 mg',
        frequency: 'BID',
        frequencyCode: 'BID',
        status: 'active',
      },
    ],
  },
  {
    pid: 'c8090048-0000-4000-8000-000000000002',
    todayAid: 'd8090048-0000-4000-8000-000000000002',
    priorAid: 'd8090049-0000-4000-8000-000000000002',
    rid: 'e8090048-0000-4000-8000-000000000002',
    name: 'Sneha Kapoor',
    phone: '9000085802',
    email: 'lvc.chart.zurb.02@example.test',
    age: 26,
    gender: 'female',
    reasonPrior: 'Itchy rash after snacks',
    reasonToday: 'Allergy review — ribbon should show allergens',
    complaint: {
      id: 'a8090048-0000-4000-8000-000000000002',
      name: 'Rash',
      duration: '3 days',
      onset: '3 days ago',
    },
    diagnosis: 'Allergic rash',
    diagnosisId: 'b8090048-0000-4000-8000-000000000002',
    investigations: '',
    advice: 'Avoid peanuts and ibuprofen. Carry cetirizine.',
    followUpValue: 2,
    followUpUnit: 'weeks',
    rxMed: { id: 'f8090048-0000-4000-8000-000000000002', name: 'Cetirizine', dosage: '10 mg' },
    allergies: [
      {
        id: 'aa809048-0000-4000-8000-000000000002',
        allergen: 'Peanuts',
        severity: 'severe',
        reaction: 'Hives, lip swelling',
      },
      {
        id: 'aa809048-0000-4000-8000-000000000012',
        allergen: 'Ibuprofen',
        severity: 'moderate',
        reaction: 'Facial rash',
      },
    ],
    conditions: [],
    chartMeds: [],
  },
  {
    pid: 'c8090048-0000-4000-8000-000000000003',
    todayAid: 'd8090048-0000-4000-8000-000000000003',
    priorAid: 'd8090049-0000-4000-8000-000000000003',
    rid: 'e8090048-0000-4000-8000-000000000003',
    name: 'Rajan Pillai',
    phone: '9000085803',
    email: 'lvc.chart.zurb.03@example.test',
    age: 67,
    gender: 'male',
    reasonPrior: 'Breathlessness on walking',
    reasonToday: 'COPD review — conditions + standing inhaler',
    complaint: {
      id: 'a8090048-0000-4000-8000-000000000003',
      name: 'Breathlessness',
      duration: '3 months',
      onset: '3 months ago',
    },
    diagnosis: 'COPD',
    diagnosisId: 'b8090048-0000-4000-8000-000000000003',
    investigations: 'Chest X-ray; Spirometry',
    advice: 'Use the inhaler before walking. Stop smoking.',
    followUpValue: 1,
    followUpUnit: 'months',
    rxMed: { id: 'f8090048-0000-4000-8000-000000000003', name: 'Salbutamol', dosage: '2 puffs' },
    allergies: [],
    conditions: [
      {
        id: 'cc809048-0000-4000-8000-000000000003',
        condition: 'COPD',
        status: 'active',
        acuity: 'stable',
        onTreatment: true,
        diagnosedAgoValue: 6,
        diagnosedAgoUnit: 'years',
      },
      {
        id: 'cc809048-0000-4000-8000-000000000013',
        condition: 'Old pulmonary TB',
        status: 'resolved',
        acuity: null,
        onTreatment: false,
        diagnosedAgoValue: 20,
        diagnosedAgoUnit: 'years',
      },
    ],
    chartMeds: [
      {
        id: 'cd809048-0000-4000-8000-000000000003',
        drugName: 'Salbutamol inhaler',
        dose: '2 puffs',
        frequency: 'PRN',
        frequencyCode: 'PRN',
        status: 'active',
      },
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
  const priorSlots = PEOPLE.map((_, i) => istIso(priorYmd, 10, i * 15));
  const pids = PEOPLE.map((p) => p.pid);
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
      cc: p.complaint.name,
      hopi: `${p.reasonPrior} — chart already on file.`,
      provisional_diagnosis: p.diagnosis,
      diagnoses_json: [
        {
          id: p.diagnosisId,
          label: p.diagnosis,
          kind: 'primary',
          certainty: 'provisional',
          status: 'ongoing',
        },
      ],
      complaints: [p.complaint],
      investigations_orders: p.investigations || null,
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

  const { error: medErr } = await admin.from('prescription_medicines').insert(
    PEOPLE.map((p) => ({
      id: p.rxMed.id,
      prescription_id: p.rid,
      medicine_name: p.rxMed.name,
      dosage: p.rxMed.dosage,
      route: 'Oral',
      frequency: 'OD',
      duration: '7 days',
      sort_order: 0,
      frequency_code: 'OD',
      duration_value: 7,
      duration_unit: 'days',
      route_code: 'oral',
      dose_qty: 1,
      dose_unit: 'tab',
      form: 'tab',
      food_timing: 'after_food',
    }))
  );
  if (medErr) {
    console.error('medicines insert failed:', medErr.message);
    process.exit(1);
  }

  const { error: delAllergies } = await admin.from('patient_allergies').delete().in('patient_id', pids);
  if (delAllergies) {
    console.error('clear allergies failed:', delAllergies.message);
    process.exit(1);
  }
  const allergyRows = PEOPLE.flatMap((p) =>
    p.allergies.map((a) => ({
      id: a.id,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      allergen: a.allergen,
      severity: a.severity,
      reaction: a.reaction,
      note: null,
      archived_at: null,
    }))
  );
  if (allergyRows.length > 0) {
    const { error } = await admin.from('patient_allergies').insert(allergyRows);
    if (error) {
      console.error('allergies insert failed:', error.message);
      process.exit(1);
    }
  }

  const { error: delCond } = await admin
    .from('patient_chronic_conditions')
    .delete()
    .in('patient_id', pids);
  if (delCond) {
    console.error('clear conditions failed:', delCond.message);
    process.exit(1);
  }
  const conditionRows = PEOPLE.flatMap((p) =>
    p.conditions.map((c) => ({
      id: c.id,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      condition: c.condition,
      status: c.status,
      acuity: c.acuity,
      on_treatment: c.onTreatment,
      diagnosed_ago_value: c.diagnosedAgoValue,
      diagnosed_ago_unit: c.diagnosedAgoUnit,
      note: null,
      archived_at: null,
    }))
  );
  if (conditionRows.length > 0) {
    const { error } = await admin.from('patient_chronic_conditions').insert(conditionRows);
    if (error) {
      console.error('conditions insert failed:', error.message);
      process.exit(1);
    }
  }

  const { error: delChartMeds } = await admin
    .from('patient_medications')
    .delete()
    .in('patient_id', pids);
  if (delChartMeds) {
    console.error('clear chart meds failed:', delChartMeds.message);
    process.exit(1);
  }
  const chartMedRows = PEOPLE.flatMap((p) =>
    p.chartMeds.map((m) => ({
      id: m.id,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      drug_name: m.drugName,
      dose: m.dose,
      strength: m.dose,
      frequency: m.frequency,
      frequency_code: m.frequencyCode,
      status: m.status,
      source: 'prescribed',
      intake_pattern: m.frequencyCode === 'PRN' ? 'prn' : 'regular',
      archived_at: null,
    }))
  );
  if (chartMedRows.length > 0) {
    const { error } = await admin.from('patient_medications').insert(chartMedRows);
    if (error) {
      console.error('chart meds insert failed:', error.message);
      process.exit(1);
    }
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
    `Seeded ${PEOPLE.length} chart-filled revisits on Dr Zurb — prior ${priorYmd}, today ${todayYmd} (tokens ${tokenBase}–${tokenBase + PEOPLE.length - 1})`
  );
  PEOPLE.forEach((p, i) => {
    const allergy = p.allergies.map((a) => a.allergen).join(', ') || 'none';
    const cond = p.conditions.map((c) => c.condition).join(', ') || 'none';
    const meds = p.chartMeds.map((m) => m.drugName).join(', ') || 'none';
    console.log(
      `  #${tokenBase + i}  ${p.name}  allergies: ${allergy}  ·  conditions: ${cond}  ·  chart meds: ${meds}`
    );
  });
}

void main();
