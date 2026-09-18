/**
 * Seed 5 revisit patients on Dr Zurb for last-visit Phase 4 dogfood
 * (previous parchi: histories, exam, notes, referral, custom sections).
 * Prior visit is filled + attested; today is an empty checked-in walk-in.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-last-visit-parchi-2026-09-08.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'last-visit parchi seed 2026-09-08';
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
  hopi: string;
  diagnosis: string;
  diagnosesJson: Array<Record<string, unknown>>;
  investigations: string;
  advice: string;
  followUpValue: number;
  followUpUnit: 'days' | 'weeks' | 'months';
  familyHistory: string;
  familyHistoryStructured: Record<string, unknown> | null;
  socialHistory: string;
  socialHistoryStructured: Record<string, unknown> | null;
  pastSurgicalHistory: string;
  pastSurgicalHistoryStructured: Record<string, unknown> | null;
  examinationFindings: string;
  examinationJson: Array<Record<string, unknown>>;
  assessmentNote: string;
  clinicalNotes: string;
  referral: string;
  customSubsections: Array<Record<string, unknown>>;
  assessmentCustomSections: Array<Record<string, unknown>>;
  planCustomSections: Array<Record<string, unknown>>;
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

function neverSocial(): Record<string, unknown> {
  return {
    smoking: { status: 'never', products: [] },
    smokeless: { status: 'never', products: [] },
    alcohol: { status: 'never', drinks: [] },
  };
}

const PEOPLE: SeedPerson[] = [
  {
    pid: 'c8090038-0000-4000-8000-000000000001',
    todayAid: 'd8090038-0000-4000-8000-000000000001',
    priorAid: 'd8090039-0000-4000-8000-000000000001',
    rid: 'e8090038-0000-4000-8000-000000000001',
    name: 'Nisha Menon',
    phone: '9000084801',
    email: 'lvc.p4.zurb.01@example.test',
    age: 36,
    gender: 'female',
    reasonPrior: 'Sore throat and blocked nose',
    reasonToday: 'Review — full previous parchi',
    hopi: 'Started after a late-night flight. Throat worse in the morning. No breathlessness.',
    complaints: [
      {
        id: 'a8090038-0000-4000-8000-000000000001',
        name: 'Sore throat',
        category: 'pain',
        duration: '5 days',
        onset: '5 days ago',
      },
      {
        id: 'a8090038-0000-4000-8000-000000000011',
        name: 'Nasal congestion',
        duration: '5 days',
        onset: '5 days ago',
      },
    ],
    diagnosis: 'Acute pharyngitis',
    diagnosesJson: [
      {
        id: 'b8090038-0000-4000-8000-000000000001',
        label: 'Acute pharyngitis',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    investigations: 'CBC; Throat swab',
    advice: 'Warm saline gargles. Avoid cold drinks.',
    followUpValue: 5,
    followUpUnit: 'days',
    familyHistory: 'Father — hypertension',
    familyHistoryStructured: {
      relatives: {
        father: [{ id: 'fh8090038-0000-4000-8000-000000000001', condition: 'htn' }],
      },
    },
    socialHistory: 'Never smoked. Desk job.',
    socialHistoryStructured: neverSocial(),
    pastSurgicalHistory: 'No prior surgeries',
    pastSurgicalHistoryStructured: { none: true },
    examinationFindings: 'Throat congested. Tonsils not enlarged. Chest clear.',
    examinationJson: [
      { systemId: 'general', status: 'abnormal', findings: [], notes: 'Mildly febrile, well appearing.' },
      { systemId: 'resp', status: 'normal', findings: [], notes: 'Air entry equal, no added sounds.' },
      { systemId: 'objective_notes', status: 'abnormal', findings: [], notes: 'Prefers to speak softly; no stridor.' },
    ],
    assessmentNote: 'Viral pharyngitis more likely. No red-flag dysphagia.',
    clinicalNotes: 'If fever lasts past day 5, consider swab before antibiotic.',
    referral: 'ENT — Further evaluation',
    customSubsections: [
      {
        id: '12900038-0000-4000-8000-000000000001',
        title: 'Travel',
        body: 'Returned from Kochi 6 days ago. No sick contacts named.',
        children: [],
      },
    ],
    assessmentCustomSections: [
      {
        id: '22900038-0000-4000-8000-000000000001',
        title: 'Risk notes',
        body: 'Works in an open office. Asked to mask for 3 days.',
        children: [],
      },
    ],
    planCustomSections: [
      {
        id: '32900038-0000-4000-8000-000000000001',
        title: 'Diet',
        body: 'Warm fluids. No ice cream this week.',
        children: [],
      },
    ],
    medicines: [
      med('f8090038-0000-4000-8000-000000000001', 'Paracetamol', '650 mg', 'TID', 'TID', 5),
      med('f8090038-0000-4000-8000-000000000011', 'Cetirizine', '10 mg', 'OD', 'OD', 5),
    ],
  },
  {
    pid: 'c8090038-0000-4000-8000-000000000002',
    todayAid: 'd8090038-0000-4000-8000-000000000002',
    priorAid: 'd8090039-0000-4000-8000-000000000002',
    rid: 'e8090038-0000-4000-8000-000000000002',
    name: 'Tariq Hussain',
    phone: '9000084802',
    email: 'lvc.p4.zurb.02@example.test',
    age: 54,
    gender: 'male',
    reasonPrior: 'Morning cough for weeks',
    reasonToday: 'Cough review — histories on last visit',
    hopi: 'Smoker’s cough, worse after the first cigarette. No haemoptysis.',
    complaints: [
      {
        id: 'a8090038-0000-4000-8000-000000000002',
        name: 'Cough',
        category: 'cough',
        duration: '6 weeks',
        onset: '6 weeks ago',
      },
    ],
    diagnosis: 'Chronic bronchitis',
    diagnosesJson: [
      {
        id: 'b8090038-0000-4000-8000-000000000002',
        label: 'Chronic bronchitis',
        kind: 'primary',
        certainty: 'provisional',
        status: 'ongoing',
      },
    ],
    investigations: 'Chest X-ray; Spirometry',
    advice: 'Cut smoking to half. Steam at night.',
    followUpValue: 2,
    followUpUnit: 'weeks',
    familyHistory: 'Father — CAD. Mother — diabetes',
    familyHistoryStructured: {
      relatives: {
        father: [{ id: 'fh8090038-0000-4000-8000-000000000002', condition: 'cad' }],
        mother: [{ id: 'fh8090038-0000-4000-8000-000000000012', condition: 'dm' }],
      },
    },
    socialHistory: 'Current smoker. Occasional whisky on weekends.',
    socialHistoryStructured: {
      smoking: { status: 'current', products: [{ type: 'cigarette', amount: '10/day' }] },
      smokeless: { status: 'never', products: [] },
      alcohol: { status: 'current', drinks: [{ type: 'whisky', frequency: 'weekends' }] },
    },
    pastSurgicalHistory: 'Appendectomy 12 years ago',
    pastSurgicalHistoryStructured: {
      procedures: [
        {
          id: 'p8090038-0000-4000-8000-000000000002',
          procedure: 'appendectomy',
          agoValue: 12,
          agoUnit: 'years',
        },
      ],
    },
    examinationFindings: 'Barrel chest. Scattered rhonchi.',
    examinationJson: [
      { systemId: 'resp', status: 'abnormal', findings: [], notes: 'Scattered rhonchi, no crackles.' },
    ],
    assessmentNote: 'Likely chronic bronchitis. Needs quit support.',
    clinicalNotes: 'Offered nicotine gum; he declined this visit.',
    referral: '',
    customSubsections: [],
    assessmentCustomSections: [],
    planCustomSections: [],
    medicines: [
      med('f8090038-0000-4000-8000-000000000002', 'Dextromethorphan', '1 tsp', 'TID', 'TID', 7, {
        doseUnit: 'spoon',
        form: 'syrup',
      }),
    ],
  },
  {
    pid: 'c8090038-0000-4000-8000-000000000003',
    todayAid: 'd8090038-0000-4000-8000-000000000003',
    priorAid: 'd8090039-0000-4000-8000-000000000003',
    rid: 'e8090038-0000-4000-8000-000000000003',
    name: 'Kavya Iyer',
    phone: '9000084803',
    email: 'lvc.p4.zurb.03@example.test',
    age: 29,
    gender: 'female',
    reasonPrior: 'One-sided headache',
    reasonToday: 'Migraine review — custom sections last time',
    hopi: 'Left-sided throb after skipped lunch. Photophobia. Sleeps it off.',
    complaints: [
      {
        id: 'a8090038-0000-4000-8000-000000000003',
        name: 'Headache',
        category: 'pain',
        duration: '2 days',
        onset: '2 days ago',
      },
    ],
    diagnosis: 'Migraine without aura',
    diagnosesJson: [
      {
        id: 'b8090038-0000-4000-8000-000000000003',
        label: 'Migraine without aura',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    investigations: 'CBC',
    advice: 'Rest in a dark room. Do not skip lunch.',
    followUpValue: 3,
    followUpUnit: 'weeks',
    familyHistory: 'Mother — migraine',
    familyHistoryStructured: {
      relatives: {
        mother: [{ id: 'fh8090038-0000-4000-8000-000000000003', condition: 'other', conditionOther: 'migraine' }],
      },
    },
    socialHistory: 'Never smoked.',
    socialHistoryStructured: neverSocial(),
    pastSurgicalHistory: 'No prior surgeries',
    pastSurgicalHistoryStructured: { none: true },
    examinationFindings: 'Neuro exam normal. No neck stiffness.',
    examinationJson: [
      { systemId: 'cns', status: 'normal', findings: [], notes: 'No focal deficit.' },
    ],
    assessmentNote: 'Classic migraine. Triggers: skipped meals, late nights.',
    clinicalNotes: '',
    referral: '',
    customSubsections: [
      {
        id: '12900038-0000-4000-8000-000000000003',
        title: 'Triggers',
        body: 'Skipped lunch twice last week. Screens after 11 pm.',
        children: [{ id: '12900038-0000-4000-8000-000000000013', title: 'Sleep', body: '5–6 hours on weeknights.' }],
      },
    ],
    assessmentCustomSections: [
      {
        id: '22900038-0000-4000-8000-000000000003',
        title: 'Work impact',
        body: 'Missed two design reviews last month.',
        children: [],
      },
    ],
    planCustomSections: [
      {
        id: '32900038-0000-4000-8000-000000000003',
        title: 'Physio',
        body: 'Neck stretches twice daily. No inversion yoga this week.',
        children: [],
      },
    ],
    medicines: [
      med('f8090038-0000-4000-8000-000000000003', 'Naproxen', '250 mg', 'BID', 'BID', 3),
      med('f8090038-0000-4000-8000-000000000013', 'Sumatriptan', '50 mg', 'PRN', 'PRN', 5),
    ],
  },
  {
    pid: 'c8090038-0000-4000-8000-000000000004',
    todayAid: 'd8090038-0000-4000-8000-000000000004',
    priorAid: 'd8090039-0000-4000-8000-000000000004',
    rid: 'e8090038-0000-4000-8000-000000000004',
    name: 'Dev Sharma',
    phone: '9000084804',
    email: 'lvc.p4.zurb.04@example.test',
    age: 61,
    gender: 'male',
    reasonPrior: 'Right knee pain after walking',
    reasonToday: 'Knee review — exam and referral last time',
    hopi: 'Pain after 20 minutes of walking. Better sitting. No locking.',
    complaints: [
      {
        id: 'a8090038-0000-4000-8000-000000000004',
        name: 'Knee pain',
        category: 'pain',
        duration: '8 weeks',
        onset: '8 weeks ago',
      },
    ],
    diagnosis: 'Osteoarthritis of knee',
    diagnosesJson: [
      {
        id: 'b8090038-0000-4000-8000-000000000004',
        label: 'Osteoarthritis of knee',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    investigations: 'X-ray right knee',
    advice: 'Quadriceps strengthening. Avoid floor sitting.',
    followUpValue: 14,
    followUpUnit: 'days',
    familyHistory: '',
    familyHistoryStructured: null,
    socialHistory: 'Walks in the park every morning.',
    socialHistoryStructured: neverSocial(),
    pastSurgicalHistory: 'Right inguinal hernia repair 6 years ago',
    pastSurgicalHistoryStructured: {
      procedures: [
        {
          id: 'p8090038-0000-4000-8000-000000000004',
          procedure: 'other',
          procedureOther: 'Inguinal hernia repair',
          agoValue: 6,
          agoUnit: 'years',
        },
      ],
    },
    examinationFindings: 'Crepitus right knee. No effusion. Walking with a slight limp.',
    examinationJson: [
      { systemId: 'general', status: 'normal', findings: [], notes: 'Walks with a slight limp.' },
      {
        systemId: 'objective_notes',
        status: 'abnormal',
        findings: [],
        notes: 'Needs a walking stick only on slopes.',
      },
    ],
    assessmentNote: 'Mechanical OA. Trial conservative care before ortho.',
    clinicalNotes: 'Patient wants a second opinion if pain stays after 2 weeks.',
    referral: 'Urgent referral · Orthopaedics · Further evaluation',
    customSubsections: [],
    assessmentCustomSections: [],
    planCustomSections: [],
    medicines: [
      med('f8090038-0000-4000-8000-000000000004', 'Paracetamol', '650 mg', 'TID', 'TID', 10),
    ],
  },
  {
    pid: 'c8090038-0000-4000-8000-000000000005',
    todayAid: 'd8090038-0000-4000-8000-000000000005',
    priorAid: 'd8090039-0000-4000-8000-000000000005',
    rid: 'e8090038-0000-4000-8000-000000000005',
    name: 'Lata Ghosh',
    phone: '9000084805',
    email: 'lvc.p4.zurb.05@example.test',
    age: 47,
    gender: 'female',
    reasonPrior: 'Gastric burning after meals',
    reasonToday: 'GERD review — notes and advice last time',
    hopi: 'Burning 30 minutes after dinner. Worse when she lies down early. No weight loss.',
    complaints: [
      {
        id: 'a8090038-0000-4000-8000-000000000005',
        name: 'Heartburn',
        duration: '3 weeks',
        onset: '3 weeks ago',
      },
    ],
    diagnosis: 'GERD',
    diagnosesJson: [
      {
        id: 'b8090038-0000-4000-8000-000000000005',
        label: 'GERD',
        kind: 'primary',
        certainty: 'provisional',
        status: 'new',
      },
    ],
    investigations: 'CBC',
    advice: 'Early dinner. Raise the head of the bed. No pickle at night.',
    followUpValue: 3,
    followUpUnit: 'weeks',
    familyHistory: '',
    familyHistoryStructured: null,
    socialHistory: 'Two cups of chai after dinner.',
    socialHistoryStructured: neverSocial(),
    pastSurgicalHistory: 'LSCS 11 years ago',
    pastSurgicalHistoryStructured: {
      procedures: [
        {
          id: 'p8090038-0000-4000-8000-000000000005',
          procedure: 'lscs',
          agoValue: 11,
          agoUnit: 'years',
        },
      ],
    },
    examinationFindings: 'Abdomen soft. Epigastric tenderness mild.',
    examinationJson: [
      { systemId: 'abd', status: 'abnormal', findings: [], notes: 'Mild epigastric tenderness. No guarding.' },
    ],
    assessmentNote: 'Typical GERD. No alarm features. Trial PPI first.',
    clinicalNotes: 'If pain radiates to the back or she vomits blood, come the same day.',
    referral: '',
    customSubsections: [
      {
        id: '12900038-0000-4000-8000-000000000005',
        title: 'Diet',
        body: 'Late dinner most weeknights. Fried snacks with evening tea.',
        children: [],
      },
    ],
    assessmentCustomSections: [],
    planCustomSections: [
      {
        id: '32900038-0000-4000-8000-000000000005',
        title: 'Counselling',
        body: 'Explained reflux mechanics. She will try 3-hour gap before bed.',
        children: [],
      },
    ],
    medicines: [
      med('f8090038-0000-4000-8000-000000000005', 'Pantoprazole', '40 mg', 'OD', 'OD', 14, {
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
      hopi: p.hopi,
      provisional_diagnosis: p.diagnosis,
      diagnoses_json: p.diagnosesJson,
      complaints: p.complaints,
      investigations_orders: p.investigations,
      advice: p.advice,
      follow_up: null,
      follow_up_value: p.followUpValue,
      follow_up_unit: p.followUpUnit,
      family_history: p.familyHistory || null,
      family_history_structured: p.familyHistoryStructured,
      social_history: p.socialHistory || null,
      social_history_structured: p.socialHistoryStructured,
      past_surgical_history: p.pastSurgicalHistory || null,
      past_surgical_history_structured: p.pastSurgicalHistoryStructured,
      examination_findings: p.examinationFindings || null,
      examination_json: p.examinationJson,
      assessment_note: p.assessmentNote || null,
      clinical_notes: p.clinicalNotes || null,
      referral: p.referral || null,
      custom_subsections: p.customSubsections,
      assessment_custom_sections: p.assessmentCustomSections,
      plan_custom_sections: p.planCustomSections,
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
    `Seeded ${PEOPLE.length} Phase 4 parchi revisit patients on Dr Zurb — prior ${priorYmd}, today ${todayYmd} (tokens ${tokenBase}–${tokenBase + PEOPLE.length - 1})`
  );
  PEOPLE.forEach((p, i) => {
    const t = new Date(todaySlots[i]!).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    console.log(`  #${tokenBase + i}  ${t}  ${p.name}  today empty · ${p.reasonToday}`);
  });
}

void main();
