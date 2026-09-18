/**
 * Seed 5 in-clinic visits on Dr Zurb with every SOAP tab filled.
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-soap-filled-2026-08-29.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'zurb soap filled seed 2026-08-29';

type FoodTiming = 'before_food' | 'after_food' | 'with_food' | 'empty_stomach' | 'bedtime';

interface SeedMed {
  id: string;
  name: string;
  dosage: string;
  route: string;
  routeCode: 'oral' | 'topical' | 'inhaled';
  frequency: string;
  frequencyCode: 'OD' | 'BID' | 'TID' | 'QHS' | 'PRN';
  duration: string;
  durationValue: number;
  durationUnit: 'days' | 'weeks';
  instructions: string | null;
  doseQty: number;
  doseUnit: 'tab' | 'cap' | 'ml' | 'puff' | 'application';
  form: string;
  foodTiming: FoodTiming | null;
}

interface SeedVisit {
  pid: string;
  aid: string;
  rid: string;
  name: string;
  phone: string;
  email: string;
  age: number;
  gender: 'female' | 'male';
  dob: string;
  reason: string;
  hour: number;
  minute: number;
  soap: {
    cc: string;
    hopi: string;
    complaints: Array<Record<string, unknown>>;
    familyHistory: string;
    familyHistoryStructured: Record<string, unknown>;
    socialHistory: string;
    socialHistoryStructured: Record<string, unknown>;
    pastSurgicalHistory: string;
    pastSurgicalHistoryStructured: Record<string, unknown>;
    customSubsections: Array<Record<string, unknown>>;
    clinicalNotes: string;
    vitals: {
      bpSys: number;
      bpDia: number;
      hr: number;
      tempC: number;
      spo2: number;
      wtKg: number;
      htCm: number;
      rr: number;
      pain: number;
      glucose: number;
      gcs: number;
      posture: 'sitting';
      limb: 'left_arm';
    };
    examinationFindings: string;
    examinationJson: Array<Record<string, unknown>>;
    testResults: string;
    testResultsJson: Array<Record<string, unknown>>;
    diagnosis: string;
    differential: string[];
    assessmentNote: string;
    assessmentAcuity: 'improving' | 'stable' | 'worsening';
    diagnosesJson: Array<Record<string, unknown>>;
    investigations: string;
    investigationsJson: Array<Record<string, unknown>>;
    advice: string;
    followUp: string;
    followUpValue: number;
    followUpUnit: 'days' | 'weeks';
    referral: string;
    patientEducation: string;
    medicines: SeedMed[];
  };
}

function tab(
  id: string,
  name: string,
  dosage: string,
  frequency: string,
  frequencyCode: SeedMed['frequencyCode'],
  durationValue: number,
  extra: Partial<SeedMed> = {},
): SeedMed {
  const durationUnit = extra.durationUnit ?? 'days';
  return {
    id,
    name,
    dosage,
    route: extra.route ?? 'Oral',
    routeCode: extra.routeCode ?? 'oral',
    frequency,
    frequencyCode,
    duration: `${durationValue} ${durationUnit}`,
    durationValue,
    durationUnit,
    instructions: extra.instructions ?? null,
    doseQty: extra.doseQty ?? 1,
    doseUnit: extra.doseUnit ?? 'tab',
    form: extra.form ?? 'tab',
    foodTiming: extra.foodTiming ?? null,
  };
}

function neverSocial(): Record<string, unknown> {
  return {
    smoking: { status: 'never', products: [] },
    smokeless: { status: 'never', products: [] },
    alcohol: { status: 'never', drinks: [] },
  };
}

const VISITS: SeedVisit[] = [
  {
    pid: 'c2900001-0000-4000-8000-000000000001',
    aid: 'd2900001-0000-4000-8000-000000000001',
    rid: 'e2900001-0000-4000-8000-000000000001',
    name: 'Aditi Rao',
    phone: '9000029001',
    email: 'desk.zurb.soap01@example.test',
    age: 32,
    gender: 'female',
    dob: '1994-03-14',
    reason: 'Fever and cough',
    hour: 18,
    minute: 0,
    soap: {
      cc: 'Fever and dry cough for 3 days.',
      hopi: 'Started after a long bus ride. Fever highest in the evenings. No breathlessness. No chest pain. Appetite slightly reduced. Sleep interrupted by cough.',
      complaints: [
        {
          id: 'a2900001-0000-4000-8000-000000000001',
          name: 'Fever',
          category: 'fever',
          onset: '3 days ago',
          duration: '3 days',
          timing: 'Worse in the evening',
          temperature: 38.4,
          temperatureUnit: 'C',
          feverGrade: 'moderate',
          measuredBy: 'Home thermometer',
          associated: ['Dry cough', 'Body ache'],
          notes: 'Paracetamol brings it down for 4 hours.',
        },
        {
          id: 'a2900001-0000-4000-8000-000000000002',
          name: 'Cough',
          category: 'cough',
          onset: '3 days ago',
          duration: '3 days',
          character: 'Dry',
          timing: 'Night more than day',
          aggravating: 'Cold air, talking',
          relieving: 'Warm water',
          notes: 'No blood, no wheeze.',
        },
      ],
      familyHistory: 'Father has hypertension. Mother well.',
      familyHistoryStructured: {
        relatives: { father: [{ condition: 'htn' }] },
        notes: 'Father on two BP tablets.',
      },
      socialHistory: 'Never smoked. Occasional chai. Desk job.',
      socialHistoryStructured: neverSocial(),
      pastSurgicalHistory: 'No surgeries.',
      pastSurgicalHistoryStructured: { none: true },
      customSubsections: [
        {
          id: '12900001-0000-4000-8000-000000000001',
          title: 'Travel',
          body: 'Overnight bus from Chandigarh 4 days ago. No sick contacts named.',
          children: [],
        },
      ],
      clinicalNotes: 'Likely viral URI. Watch for breathlessness or persistent fever beyond 5 days.',
      vitals: {
        bpSys: 118,
        bpDia: 76,
        hr: 92,
        tempC: 38.2,
        spo2: 98,
        wtKg: 58,
        htCm: 162,
        rr: 18,
        pain: 2,
        glucose: 96,
        gcs: 15,
        posture: 'sitting',
        limb: 'left_arm',
      },
      examinationFindings: 'Mildly febrile, not in distress. Throat congested. Chest clear. No neck stiffness.',
      examinationJson: [
        { systemId: 'general', status: 'abnormal', findings: [], notes: 'Febrile, otherwise well appearing.' },
        { systemId: 'resp', status: 'normal', findings: [], notes: 'Bilateral air entry normal, no added sounds.' },
        { systemId: 'cvs', status: 'normal', findings: [], notes: 'S1 S2 normal, no murmur.' },
      ],
      testResults: 'None brought. Rapid antigen not done.',
      testResultsJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000011',
          source: 'in_clinic_poc',
          name: 'SpO2',
          value: '98',
          unit: '%',
          interpretation: 'normal',
        },
      ],
      diagnosis: 'Acute viral upper respiratory infection',
      differential: ['Influenza-like illness', 'Early community-acquired pneumonia'],
      assessmentNote: 'Viral URI. No red flags. Supportive care and review if fever lasts past day 5.',
      assessmentAcuity: 'stable',
      diagnosesJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000001',
          label: 'Acute viral upper respiratory infection',
          kind: 'primary',
          certainty: 'provisional',
          status: 'new',
          acuity: 'stable',
        },
        {
          id: 'b2900001-0000-4000-8000-000000000002',
          label: 'Influenza-like illness',
          kind: 'differential',
          certainty: 'provisional',
          status: 'new',
        },
      ],
      investigations: 'CBC if fever persists beyond 5 days.',
      investigationsJson: [
        { id: 'inv-cbc-soap-01', label: 'CBC', kind: 'panel' },
      ],
      advice: 'Rest. Fluids. Paracetamol for fever. Return the same day if breathlessness or confusion.',
      followUp: 'Review after 5 days if not improving.',
      followUpValue: 5,
      followUpUnit: 'days',
      referral: 'Medicine OPD if fever lasts more than 5 days or if oxygen falls.',
      patientEducation: 'Masks at home if elders live in the same room. Do not start an antibiotic on your own.',
      medicines: [
        tab('f2900001-0000-4000-8000-000000000001', 'Paracetamol 650 mg', '650 mg', 'Thrice daily', 'TID', 5, {
          foodTiming: 'after_food',
          instructions: 'For fever or body ache. Max 3 tablets a day.',
        }),
        tab('f2900001-0000-4000-8000-000000000002', 'Cetirizine 10 mg', '10 mg', 'At bedtime', 'QHS', 5, {
          foodTiming: 'bedtime',
          instructions: 'May cause morning drowsiness.',
        }),
      ],
    },
  },
  {
    pid: 'c2900001-0000-4000-8000-000000000002',
    aid: 'd2900001-0000-4000-8000-000000000002',
    rid: 'e2900001-0000-4000-8000-000000000002',
    name: 'Manish Tiwari',
    phone: '9000029002',
    email: 'desk.zurb.soap02@example.test',
    age: 44,
    gender: 'male',
    dob: '1982-07-21',
    reason: 'Burning micturition',
    hour: 18,
    minute: 15,
    soap: {
      cc: 'Burning while passing urine for 2 days.',
      hopi: 'Frequency every hour today. No fever. No flank pain. No blood seen. Holds urine at work. Drinks little water after lunch.',
      complaints: [
        {
          id: 'a2900001-0000-4000-8000-000000000003',
          name: 'Dysuria',
          category: 'urinary',
          onset: '2 days ago',
          duration: '2 days',
          character: 'Burning',
          frequency: 'Hourly today',
          color: 'Dark yellow',
          associated: ['Frequency', 'Urgency'],
          notes: 'No discharge. Last sexual contact 3 weeks ago.',
        },
      ],
      familyHistory: 'Mother has type 2 diabetes.',
      familyHistoryStructured: {
        relatives: { mother: [{ condition: 'dm' }] },
      },
      socialHistory: 'Never smoked. Weekend beer once a month.',
      socialHistoryStructured: {
        smoking: { status: 'never', products: [] },
        smokeless: { status: 'never', products: [] },
        alcohol: {
          status: 'current',
          drinks: [
            {
              id: 's2900001-0000-4000-8000-000000000001',
              type: 'beer',
              amount: 2,
              amountUnit: 'pint',
              frequency: 1,
              frequencyUnit: 'month',
              phase: 'current',
            },
          ],
        },
      },
      pastSurgicalHistory: 'No surgeries.',
      pastSurgicalHistoryStructured: { none: true },
      customSubsections: [
        {
          id: '12900001-0000-4000-8000-000000000002',
          title: 'Fluids',
          body: 'About 4 glasses of water a day. Two cups of chai.',
          children: [],
        },
      ],
      clinicalNotes: 'Uncomplicated cystitis picture. No pyelo signs.',
      vitals: {
        bpSys: 128,
        bpDia: 82,
        hr: 78,
        tempC: 36.8,
        spo2: 99,
        wtKg: 76,
        htCm: 174,
        rr: 16,
        pain: 3,
        glucose: 108,
        gcs: 15,
        posture: 'sitting',
        limb: 'left_arm',
      },
      examinationFindings: 'Afebrile. Suprapubic tenderness mild. No renal angle tenderness. External genitalia normal.',
      examinationJson: [
        { systemId: 'general', status: 'normal', findings: [], notes: 'Well appearing, not in distress.' },
        { systemId: 'abd', status: 'abnormal', findings: [], notes: 'Mild suprapubic tenderness. Soft. No renal angle tenderness.' },
      ],
      testResults: 'Urine dipstick: leucocytes 2+, nitrite positive.',
      testResultsJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000012',
          source: 'in_clinic_poc',
          name: 'Urine nitrite',
          value: 'Positive',
          interpretation: 'abnormal',
        },
        {
          id: 'b2900001-0000-4000-8000-000000000013',
          source: 'in_clinic_poc',
          name: 'Urine leucocytes',
          value: '2+',
          interpretation: 'high',
        },
      ],
      diagnosis: 'Uncomplicated urinary tract infection',
      differential: ['Urethritis', 'Prostatitis'],
      assessmentNote: 'Classic cystitis with a positive dipstick. Treat 5 days and push fluids.',
      assessmentAcuity: 'stable',
      diagnosesJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000003',
          label: 'Uncomplicated urinary tract infection',
          kind: 'primary',
          certainty: 'confirmed',
          status: 'new',
          acuity: 'stable',
        },
      ],
      investigations: 'Urine culture if symptoms persist after 5 days.',
      investigationsJson: [
        { id: 'inv-urine-soap-02', label: 'Urine culture', kind: 'analyte' },
      ],
      advice: 'Drink plenty of water. Do not hold urine. Complete the antibiotic course.',
      followUp: 'Review after 5 days if burning continues.',
      followUpValue: 5,
      followUpUnit: 'days',
      referral: 'Urology if this is the third episode this year.',
      patientEducation: 'Wipe front to back is not the issue here — hydration and not delaying voids matter more.',
      medicines: [
        tab('f2900001-0000-4000-8000-000000000003', 'Nitrofurantoin 100 mg', '100 mg', 'Twice daily', 'BID', 5, {
          doseUnit: 'cap',
          form: 'cap',
          foodTiming: 'with_food',
        }),
        tab('f2900001-0000-4000-8000-000000000004', 'Paracetamol 500 mg', '500 mg', 'As needed', 'PRN', 3, {
          foodTiming: 'after_food',
          instructions: 'For burning or ache. Max 3 tablets a day.',
        }),
      ],
    },
  },
  {
    pid: 'c2900001-0000-4000-8000-000000000003',
    aid: 'd2900001-0000-4000-8000-000000000003',
    rid: 'e2900001-0000-4000-8000-000000000003',
    name: 'Priya Menon',
    phone: '9000029003',
    email: 'desk.zurb.soap03@example.test',
    age: 38,
    gender: 'female',
    dob: '1988-11-02',
    reason: 'Heartburn',
    hour: 18,
    minute: 30,
    soap: {
      cc: 'Heartburn after meals for 3 weeks.',
      hopi: 'Worse at night and after spicy dinner. Sour burps. No vomiting. No black stools. No weight loss. Sleeps soon after dinner.',
      complaints: [
        {
          id: 'a2900001-0000-4000-8000-000000000004',
          name: 'Heartburn',
          category: 'git',
          onset: '3 weeks ago',
          duration: '3 weeks',
          location: 'Epigastrium, rising to chest',
          character: 'Burning',
          timing: 'After dinner and on lying down',
          aggravating: 'Spicy food, late dinner, tea',
          relieving: 'Sitting up, milk',
          severity: 'moderate',
          notes: 'Uses an over-the-counter antacid most nights.',
        },
      ],
      familyHistory: 'Father had a stent at 62. Mother has hypothyroidism.',
      familyHistoryStructured: {
        relatives: {
          father: [{ condition: 'cad', notes: 'Stent at 62' }],
          mother: [{ condition: 'thyroid' }],
        },
      },
      socialHistory: 'Never smoked. No alcohol. Two cups of chai after dinner.',
      socialHistoryStructured: neverSocial(),
      pastSurgicalHistory: 'LSCS 8 years ago.',
      pastSurgicalHistoryStructured: {
        none: false,
        procedures: [
          {
            id: 'p2900001-0000-4000-8000-000000000001',
            procedure: 'lscs',
            agoValue: 8,
            agoUnit: 'years',
          },
        ],
      },
      customSubsections: [
        {
          id: '12900001-0000-4000-8000-000000000003',
          title: 'Diet',
          body: 'Late dinner most weeknights. Pickle and fried snacks with evening tea.',
          children: [],
        },
      ],
      clinicalNotes: 'Typical GERD. No alarm features. Trial PPI and meal timing first.',
      vitals: {
        bpSys: 122,
        bpDia: 78,
        hr: 74,
        tempC: 36.6,
        spo2: 99,
        wtKg: 64,
        htCm: 158,
        rr: 16,
        pain: 4,
        glucose: 102,
        gcs: 15,
        posture: 'sitting',
        limb: 'left_arm',
      },
      examinationFindings: 'Afebrile. Soft abdomen, mild epigastric tenderness. No mass. Bowel sounds normal.',
      examinationJson: [
        { systemId: 'general', status: 'normal', findings: [], notes: 'Well appearing.' },
        { systemId: 'abd', status: 'abnormal', findings: [], notes: 'Mild epigastric tenderness. Soft. No guarding.' },
        { systemId: 'cvs', status: 'normal', findings: [], notes: 'S1 S2 normal. Pain is not exertional.' },
      ],
      testResults: 'No recent labs. Last Hb last year was 12.4.',
      testResultsJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000014',
          source: 'patient_report',
          name: 'Haemoglobin',
          value: '12.4',
          unit: 'g/dL',
          date: '2025-11-02',
          interpretation: 'normal',
        },
      ],
      diagnosis: 'Gastro-oesophageal reflux disease',
      differential: ['Functional dyspepsia', 'Peptic ulcer'],
      assessmentNote: 'GERD without alarm symptoms. Eight-week PPI and earlier dinner. Scope if no response.',
      assessmentAcuity: 'stable',
      diagnosesJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000004',
          label: 'Gastro-oesophageal reflux disease',
          kind: 'primary',
          certainty: 'provisional',
          status: 'new',
          acuity: 'stable',
        },
      ],
      investigations: 'Upper GI endoscopy if no response after 8 weeks, or sooner if alarm symptoms.',
      investigationsJson: [
        { id: 'inv-ugi-soap-03', label: 'Upper GI endoscopy', kind: 'imaging' },
      ],
      advice: 'Smaller meals. No dinner within 3 hours of sleep. Raise the head of the bed. Avoid pickle and late chai.',
      followUp: 'Review after 2 weeks.',
      followUpValue: 2,
      followUpUnit: 'weeks',
      referral: 'Gastroenterology if no response after 8 weeks of PPI or if black stools appear.',
      patientEducation: 'Take the capsule 30 minutes before breakfast. Do not crush it.',
      medicines: [
        tab('f2900001-0000-4000-8000-000000000005', 'Pantoprazole 40 mg', '40 mg', 'Once daily', 'OD', 14, {
          foodTiming: 'empty_stomach',
          instructions: '30 minutes before breakfast.',
        }),
        tab('f2900001-0000-4000-8000-000000000006', 'Domperidone 10 mg', '10 mg', 'Twice daily', 'BID', 7, {
          foodTiming: 'before_food',
        }),
      ],
    },
  },
  {
    pid: 'c2900001-0000-4000-8000-000000000004',
    aid: 'd2900001-0000-4000-8000-000000000004',
    rid: 'e2900001-0000-4000-8000-000000000004',
    name: 'Arjun Khanna',
    phone: '9000029004',
    email: 'desk.zurb.soap04@example.test',
    age: 29,
    gender: 'male',
    dob: '1997-01-18',
    reason: 'Migraine',
    hour: 18,
    minute: 45,
    soap: {
      cc: 'Right-sided headache with nausea, three episodes this week.',
      hopi: 'Photophobia. Sleeps it off in a dark room. No fever. No neck stiffness. No weakness. Screen work 10 hours a day. Skips lunch twice a week.',
      complaints: [
        {
          id: 'a2900001-0000-4000-8000-000000000005',
          name: 'Headache',
          category: 'pain',
          onset: 'This week, 3 episodes',
          duration: '6–8 hours each',
          location: 'Right temple and behind the eye',
          laterality: 'Right',
          character: 'Throbbing',
          severity: 'severe',
          painScore: 8,
          radiation: 'None',
          timing: 'Afternoon after skipped lunch',
          aggravating: 'Screens, missed meals, bright light',
          relieving: 'Dark room, sleep',
          associated: ['Nausea', 'Photophobia'],
          notes: 'No aura. First similar headaches at age 22.',
        },
      ],
      familyHistory: 'Mother has migraine.',
      familyHistoryStructured: {
        relatives: { mother: [{ condition: 'other', conditionOther: 'Migraine' }] },
      },
      socialHistory: 'Never smoked. No alcohol. Coffee twice a day.',
      socialHistoryStructured: neverSocial(),
      pastSurgicalHistory: 'No surgeries.',
      pastSurgicalHistoryStructured: { none: true },
      customSubsections: [
        {
          id: '12900001-0000-4000-8000-000000000004',
          title: 'Triggers',
          body: 'Missed lunch and long laptop sessions. Sleeps 5–6 hours on weeknights.',
          children: [],
        },
      ],
      clinicalNotes: 'Migraine without aura. No red flags. Acute treatment plus meal and sleep advice.',
      vitals: {
        bpSys: 124,
        bpDia: 80,
        hr: 72,
        tempC: 36.7,
        spo2: 99,
        wtKg: 71,
        htCm: 176,
        rr: 14,
        pain: 6,
        glucose: 94,
        gcs: 15,
        posture: 'sitting',
        limb: 'left_arm',
      },
      examinationFindings: 'Alert. Pupils equal. No neck stiffness. Fundi not examined. No focal deficit. ENT normal.',
      examinationJson: [
        { systemId: 'general', status: 'normal', findings: [], notes: 'Not in distress now.' },
        { systemId: 'cns', status: 'normal', findings: [], notes: 'No focal deficit. Neck supple. Speech normal.' },
      ],
      testResults: 'No imaging. No labs today.',
      testResultsJson: [],
      diagnosis: 'Migraine without aura',
      differential: ['Tension-type headache', 'Sinus headache'],
      assessmentNote: 'Recurrent unilateral throbbing headache with photophobia and nausea. No red flags for secondary headache.',
      assessmentAcuity: 'improving',
      diagnosesJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000005',
          label: 'Migraine without aura',
          kind: 'primary',
          certainty: 'confirmed',
          status: 'ongoing',
          acuity: 'improving',
        },
      ],
      investigations: 'CBC if headaches persist beyond 2 weeks or change character.',
      investigationsJson: [
        { id: 'inv-cbc-soap-04', label: 'CBC', kind: 'panel' },
      ],
      advice: 'Dark quiet room during an attack. Do not skip lunch. Regular sleep. Limit extra coffee on headache days.',
      followUp: 'After 2 weeks if not improving.',
      followUpValue: 2,
      followUpUnit: 'weeks',
      referral: 'Neurology if attacks exceed 4 a month or if a new neurological symptom appears.',
      patientEducation: 'Take naproxen at the first throb, not after vomiting has started.',
      medicines: [
        tab('f2900001-0000-4000-8000-000000000007', 'Naproxen 250 mg', '250 mg', 'Twice daily', 'BID', 3, {
          foodTiming: 'after_food',
          instructions: 'Take at onset of headache.',
        }),
        tab('f2900001-0000-4000-8000-000000000008', 'Ondansetron 4 mg', '4 mg', 'As needed', 'PRN', 3, {
          instructions: 'For nausea.',
        }),
      ],
    },
  },
  {
    pid: 'c2900001-0000-4000-8000-000000000005',
    aid: 'd2900001-0000-4000-8000-000000000005',
    rid: 'e2900001-0000-4000-8000-000000000005',
    name: 'Sunita Bhatia',
    phone: '9000029005',
    email: 'desk.zurb.soap05@example.test',
    age: 55,
    gender: 'female',
    dob: '1971-05-09',
    reason: 'Asthma review',
    hour: 19,
    minute: 0,
    soap: {
      cc: 'Breathlessness and wheeze for 5 days, worse at night.',
      hopi: 'Known asthma. Used rescue inhaler 4 times yesterday. No chest pain. Mild fever on day 1, now settled. Sleep interrupted. Walks to the market without stopping today.',
      complaints: [
        {
          id: 'a2900001-0000-4000-8000-000000000006',
          name: 'Breathlessness',
          category: 'respiratory',
          onset: '5 days ago',
          duration: '5 days',
          timing: 'Worse at night',
          aggravating: 'Cold air, dust, lying flat',
          relieving: 'Sitting up, rescue inhaler',
          associated: ['Wheeze', 'Dry cough'],
          notes: 'Four rescue puffs yesterday. Speaks in full sentences today.',
        },
      ],
      familyHistory: 'Sister has asthma. Father had a stroke at 70.',
      familyHistoryStructured: {
        relatives: {
          father: [{ condition: 'stroke', notes: 'Age 70' }],
        },
        siblings: [
          {
            id: 'sib-2900001-0000-4000-8000-0000000001',
            detail: { sex: 'sister', order: 'older' },
            entries: [{ condition: 'asthma' }],
          },
        ],
      },
      socialHistory: 'Quit smoking 6 years ago after 10 years of 4 cigarettes a day. No alcohol.',
      socialHistoryStructured: {
        smoking: {
          status: 'ex',
          products: [
            {
              id: 's2900001-0000-4000-8000-000000000002',
              type: 'cigarette',
              perDay: 4,
              years: 10,
              yearsUnit: 'years',
              phase: 'past',
              quitYearsAgo: 6,
              quitYearsUnit: 'years',
            },
          ],
          quitYearsAgo: 6,
          quitYearsUnit: 'years',
        },
        smokeless: { status: 'never', products: [] },
        alcohol: { status: 'never', drinks: [] },
      },
      pastSurgicalHistory: 'Cholecystectomy 4 years ago.',
      pastSurgicalHistoryStructured: {
        none: false,
        procedures: [
          {
            id: 'p2900001-0000-4000-8000-000000000002',
            procedure: 'cholecystectomy',
            agoValue: 4,
            agoUnit: 'years',
          },
        ],
      },
      customSubsections: [
        {
          id: '12900001-0000-4000-8000-000000000005',
          title: 'Inhaler technique',
          body: 'Shakes the inhaler. Does not rinse after the steroid. Keeps the rescue inhaler in a locked drawer.',
          children: [],
        },
      ],
      clinicalNotes: 'Mild-moderate asthma flare on known asthma. Short steroid burst plus technique fix.',
      vitals: {
        bpSys: 134,
        bpDia: 84,
        hr: 88,
        tempC: 37.1,
        spo2: 96,
        wtKg: 68,
        htCm: 155,
        rr: 20,
        pain: 1,
        glucose: 118,
        gcs: 15,
        posture: 'sitting',
        limb: 'left_arm',
      },
      examinationFindings: 'Speaks full sentences. Mild expiratory wheeze both bases. No cyanosis. No ankle oedema.',
      examinationJson: [
        { systemId: 'general', status: 'abnormal', findings: [], notes: 'Mild respiratory distress at rest, speaks full sentences.' },
        { systemId: 'resp', status: 'abnormal', findings: [], notes: 'Mild expiratory wheeze both bases. No crackles.' },
        { systemId: 'cvs', status: 'normal', findings: [], notes: 'S1 S2 normal. No oedema.' },
      ],
      testResults: 'Peak flow 280 L/min today (usual 360). No chest film.',
      testResultsJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000015',
          source: 'in_clinic_poc',
          name: 'Peak flow',
          value: '280',
          unit: 'L/min',
          interpretation: 'low',
          notes: 'Usual 360.',
        },
      ],
      diagnosis: 'Acute asthma exacerbation on known bronchial asthma',
      differential: ['Viral bronchitis', 'Cardiac wheeze'],
      assessmentNote: 'Known asthma with a 5-day flare. Saturations 96%, speaks full sentences. Short oral steroid and inhaler reset.',
      assessmentAcuity: 'improving',
      diagnosesJson: [
        {
          id: 'b2900001-0000-4000-8000-000000000006',
          label: 'Acute asthma exacerbation on known bronchial asthma',
          kind: 'primary',
          certainty: 'confirmed',
          status: 'ongoing',
          acuity: 'improving',
        },
      ],
      investigations: 'CBC, chest X-ray PA, spirometry after recovery.',
      investigationsJson: [
        { id: 'inv-cbc-soap-05', label: 'CBC', kind: 'panel' },
        { id: 'inv-cxr-soap-05', label: 'Chest X-ray PA', kind: 'imaging' },
        { id: 'inv-spiro-soap-05', label: 'Spirometry', kind: 'custom' },
      ],
      advice: 'Sit upright during an attack. Continue inhaler technique as shown. Avoid smoke and cold drinks. Return the same day if lips turn blue or speech is in single words.',
      followUp: 'Review after 5 days, or sooner if worsening.',
      followUpValue: 5,
      followUpUnit: 'days',
      referral: 'Chest clinic, Civil Hospital Amritsar — if not better after 5 days or if peak flow stays low.',
      patientEducation: 'Rinse mouth after steroid inhaler. Keep the rescue inhaler in the bag, not in a locked drawer.',
      medicines: [
        {
          id: 'f2900001-0000-4000-8000-000000000009',
          name: 'Salbutamol inhaler 100 mcg',
          dosage: '100 mcg',
          route: 'Inhaled',
          routeCode: 'inhaled',
          frequency: 'As needed',
          frequencyCode: 'PRN',
          duration: '14 days',
          durationValue: 14,
          durationUnit: 'days',
          instructions: '2 puffs when wheezy. Shake well.',
          doseQty: 2,
          doseUnit: 'puff',
          form: 'inhaler',
          foodTiming: null,
        },
        {
          id: 'f2900001-0000-4000-8000-00000000000a',
          name: 'Budesonide inhaler 200 mcg',
          dosage: '200 mcg',
          route: 'Inhaled',
          routeCode: 'inhaled',
          frequency: 'Twice daily',
          frequencyCode: 'BID',
          duration: '4 weeks',
          durationValue: 4,
          durationUnit: 'weeks',
          instructions: 'Rinse mouth after each use.',
          doseQty: 2,
          doseUnit: 'puff',
          form: 'inhaler',
          foodTiming: null,
        },
        tab('f2900001-0000-4000-8000-00000000000b', 'Prednisolone 10 mg', '30 mg', 'Once daily', 'OD', 5, {
          doseQty: 3,
          foodTiming: 'after_food',
          instructions: 'Morning dose. Do not stop early.',
        }),
        tab('f2900001-0000-4000-8000-00000000000c', 'Montelukast 10 mg', '10 mg', 'At bedtime', 'QHS', 14, {
          foodTiming: 'bedtime',
        }),
      ],
    },
  },
];

function todaySlotIso(hour: number, minute: number): string {
  const kolkata = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const ymd = kolkata.replace(/\//g, '-');
  return new Date(
    `${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`,
  ).toISOString();
}

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const rxIds = VISITS.map((v) => v.rid);

  const { error: pErr } = await admin.from('patients').upsert(
    VISITS.map((v) => ({
      id: v.pid,
      name: v.name,
      phone: v.phone,
      email: v.email,
      age: v.age,
      gender: v.gender,
      date_of_birth: v.dob,
      doctor_id: DOCTOR_ID,
      platform: null,
      platform_external_id: null,
      consent_status: 'granted',
      consent_granted_at: now,
      consent_method: 'manual_sql_seed',
      registered_via: 'front_desk',
    })),
    { onConflict: 'id' },
  );
  if (pErr) {
    console.error('patients upsert failed:', pErr.message);
    process.exit(1);
  }

  for (const visit of VISITS) {
    const { error: mrnErr } = await admin.rpc('assign_patient_mrn', {
      p_patient_id: visit.pid,
    });
    if (mrnErr) {
      console.error('assign_patient_mrn failed');
      process.exit(1);
    }
  }

  const { error: aErr } = await admin.from('appointments').upsert(
    VISITS.map((v) => ({
      id: v.aid,
      doctor_id: DOCTOR_ID,
      patient_id: v.pid,
      patient_name: v.name,
      patient_phone: v.phone,
      appointment_date: todaySlotIso(v.hour, v.minute),
      status: 'confirmed',
      reason_for_visit: v.reason,
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

  const { error: delMedErr } = await admin
    .from('prescription_medicines')
    .delete()
    .in('prescription_id', rxIds);
  if (delMedErr) {
    console.error('clear medicines failed:', delMedErr.message);
    process.exit(1);
  }

  const { error: rxErr } = await admin.from('prescriptions').upsert(
    VISITS.map((v) => ({
      id: v.rid,
      appointment_id: v.aid,
      patient_id: v.pid,
      doctor_id: DOCTOR_ID,
      type: 'structured',
      cc: v.soap.cc,
      hopi: v.soap.hopi,
      provisional_diagnosis: v.soap.diagnosis,
      investigations_orders: v.soap.investigations,
      investigations_orders_json: v.soap.investigationsJson,
      advice: v.soap.advice,
      follow_up: v.soap.followUp,
      follow_up_value: v.soap.followUpValue,
      follow_up_unit: v.soap.followUpUnit,
      referral: v.soap.referral,
      patient_education: v.soap.patientEducation,
      clinical_notes: v.soap.clinicalNotes,
      sent_to_patient_at: null,
      vitals_bp_systolic: v.soap.vitals.bpSys,
      vitals_bp_diastolic: v.soap.vitals.bpDia,
      vitals_hr: v.soap.vitals.hr,
      vitals_temp_c: v.soap.vitals.tempC,
      vitals_spo2: v.soap.vitals.spo2,
      vitals_wt_kg: v.soap.vitals.wtKg,
      vitals_ht_cm: v.soap.vitals.htCm,
      vitals_rr: v.soap.vitals.rr,
      vitals_pain_score: v.soap.vitals.pain,
      vitals_glucose_mg_dl: v.soap.vitals.glucose,
      vitals_gcs_total: v.soap.vitals.gcs,
      vitals_bp_posture: v.soap.vitals.posture,
      vitals_bp_limb: v.soap.vitals.limb,
      examination_findings: v.soap.examinationFindings,
      examination_json: v.soap.examinationJson,
      differential_diagnosis: v.soap.differential,
      test_results: v.soap.testResults,
      test_results_json: v.soap.testResultsJson,
      assessment_note: v.soap.assessmentNote,
      assessment_acuity: v.soap.assessmentAcuity,
      diagnoses_json: v.soap.diagnosesJson,
      complaints: v.soap.complaints,
      family_history: v.soap.familyHistory,
      family_history_structured: v.soap.familyHistoryStructured,
      social_history: v.soap.socialHistory,
      social_history_structured: v.soap.socialHistoryStructured,
      past_surgical_history: v.soap.pastSurgicalHistory,
      past_surgical_history_structured: v.soap.pastSurgicalHistoryStructured,
      custom_subsections: v.soap.customSubsections,
    })),
    { onConflict: 'id' },
  );
  if (rxErr) {
    console.error('prescriptions upsert failed:', rxErr.message);
    process.exit(1);
  }

  const medicineRows = VISITS.flatMap((v) =>
    v.soap.medicines.map((m, i) => ({
      id: m.id,
      prescription_id: v.rid,
      medicine_name: m.name,
      dosage: m.dosage,
      route: m.route,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
      sort_order: i,
      frequency_code: m.frequencyCode,
      duration_value: m.durationValue,
      duration_unit: m.durationUnit,
      route_code: m.routeCode,
      dose_qty: m.doseQty,
      dose_unit: m.doseUnit,
      form: m.form,
      food_timing: m.foodTiming,
    })),
  );
  const { error: medErr } = await admin.from('prescription_medicines').insert(medicineRows);
  if (medErr) {
    console.error('medicines insert failed:', medErr.message);
    process.exit(1);
  }

  console.log(`Seeded ${VISITS.length} SOAP-filled visits on Dr Zurb for today`);
  VISITS.forEach((v) => {
    console.log(
      `  ${String(v.hour).padStart(2, '0')}:${String(v.minute).padStart(2, '0')}  ${v.name}  ${v.reason}`,
    );
  });
}

void main();
