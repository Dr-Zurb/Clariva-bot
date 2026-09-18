/**
 * Seed 9 in-clinic visits on Dr Zurb with prescriptions already filled.
 * Visit 5 has every letterhead field populated for preview / final Rx.
 * Visit 6 is deliberately long so the Rx overflows onto a second page.
 * Visit 7 has ~30 investigations to stress the two-column tick list.
 * Visits 8–9 are packed so preview covers at least two A4 pages.
 *
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-rx-filled-2026-08-25.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const NOTES = 'zurb rx filled seed 2026-08-25';

type GuardianRelation = 'father' | 'spouse' | 'mother' | 'son' | 'daughter';
type FoodTiming =
  | 'before_food'
  | 'after_food'
  | 'with_food'
  | 'empty_stomach'
  | 'bedtime';

interface SeedMed {
  id: string;
  name: string;
  dosage: string;
  route: string;
  routeCode: 'oral' | 'topical' | 'inhaled' | 'SC' | 'sublingual';
  frequency: string;
  frequencyCode: 'OD' | 'BID' | 'TID' | 'QHS' | 'PRN' | 'CUSTOM';
  duration: string;
  durationValue: number;
  durationUnit: 'days' | 'weeks';
  instructions: string | null;
  doseQty: number;
  doseUnit: 'tab' | 'cap' | 'ml' | 'puff' | 'application' | 'unit' | 'drops';
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
  guardianName: string | null;
  guardianRelation: GuardianRelation | null;
  address: string | null;
  altPhone: string | null;
  reason: string;
  hour: number;
  minute: number;
  rx: {
    cc: string | null;
    hopi: string | null;
    diagnosis: string | null;
    investigations: string | null;
    advice: string | null;
    followUp: string | null;
    followUpValue: number | null;
    followUpUnit: 'days' | 'weeks' | 'months' | null;
    referral: string | null;
    patientEducation: string | null;
    medicines: SeedMed[];
  };
}

function tabMed(
  idSuffix: string,
  name: string,
  dosage: string,
  frequency: string,
  frequencyCode: SeedMed['frequencyCode'],
  durationValue: number,
  durationUnit: SeedMed['durationUnit'],
  extra: Partial<
    Pick<
      SeedMed,
      | 'instructions'
      | 'foodTiming'
      | 'route'
      | 'routeCode'
      | 'doseQty'
      | 'doseUnit'
      | 'form'
    >
  > = {},
): SeedMed {
  return {
    id: `f2500001-0000-4000-8000-000000000${idSuffix}`,
    name,
    dosage,
    route: extra.route ?? 'Oral',
    routeCode: extra.routeCode ?? 'oral',
    frequency,
    frequencyCode,
    duration: durationUnit === 'weeks' ? `${durationValue} weeks` : `${durationValue} days`,
    durationValue,
    durationUnit,
    instructions: extra.instructions ?? null,
    doseQty: extra.doseQty ?? 1,
    doseUnit: extra.doseUnit ?? 'tab',
    form: extra.form ?? 'tab',
    foodTiming: extra.foodTiming ?? null,
  };
}

const VISITS: SeedVisit[] = [
  {
    pid: 'c2500001-0000-4000-8000-000000000001',
    aid: 'd2500001-0000-4000-8000-000000000001',
    rid: 'e2500001-0000-4000-8000-000000000001',
    name: 'Anil Verma',
    phone: '9000025001',
    email: 'desk.zurb.rx01@example.test',
    age: 41,
    gender: 'male',
    dob: '1985-02-10',
    guardianName: null,
    guardianRelation: null,
    address: null,
    altPhone: null,
    reason: 'Dry cough',
    hour: 11,
    minute: 0,
    rx: {
      cc: 'Dry cough for 4 days.',
      hopi: null,
      diagnosis: null,
      investigations: null,
      advice: null,
      followUp: null,
      followUpValue: null,
      followUpUnit: null,
      referral: null,
      patientEducation: null,
      medicines: [
        {
          id: 'f2500001-0000-4000-8000-000000000001',
          name: 'Cough syrup (dextromethorphan)',
          dosage: '10 ml',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Thrice daily',
          frequencyCode: 'TID',
          duration: '5 days',
          durationValue: 5,
          durationUnit: 'days',
          instructions: null,
          doseQty: 10,
          doseUnit: 'ml',
          form: 'syrup',
          foodTiming: null,
        },
      ],
    },
  },
  {
    pid: 'c2500001-0000-4000-8000-000000000002',
    aid: 'd2500001-0000-4000-8000-000000000002',
    rid: 'e2500001-0000-4000-8000-000000000002',
    name: 'Kavita Nair',
    phone: '9000025002',
    email: 'desk.zurb.rx02@example.test',
    age: 36,
    gender: 'female',
    dob: '1990-06-18',
    guardianName: null,
    guardianRelation: null,
    address: null,
    altPhone: null,
    reason: 'Burning micturition',
    hour: 11,
    minute: 15,
    rx: {
      cc: 'Burning micturition for 2 days.',
      hopi: null,
      diagnosis: 'Uncomplicated UTI',
      investigations: null,
      advice: 'Drink plenty of fluids.',
      followUp: null,
      followUpValue: null,
      followUpUnit: null,
      referral: null,
      patientEducation: null,
      medicines: [
        {
          id: 'f2500001-0000-4000-8000-000000000002',
          name: 'Nitrofurantoin 100 mg',
          dosage: '100 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Twice daily',
          frequencyCode: 'BID',
          duration: '5 days',
          durationValue: 5,
          durationUnit: 'days',
          instructions: null,
          doseQty: 1,
          doseUnit: 'cap',
          form: 'cap',
          foodTiming: 'with_food',
        },
      ],
    },
  },
  {
    pid: 'c2500001-0000-4000-8000-000000000003',
    aid: 'd2500001-0000-4000-8000-000000000003',
    rid: 'e2500001-0000-4000-8000-000000000003',
    name: 'Rohit Malhotra',
    phone: '9000025003',
    email: 'desk.zurb.rx03@example.test',
    age: 48,
    gender: 'male',
    dob: '1978-09-04',
    guardianName: null,
    guardianRelation: null,
    address: null,
    altPhone: null,
    reason: 'Acidity',
    hour: 11,
    minute: 30,
    rx: {
      cc: 'Heartburn after meals for 2 weeks.',
      hopi: 'Worse at night. No vomiting or black stools. Occasional sour burps.',
      diagnosis: 'Gastro-oesophageal reflux',
      investigations: null,
      advice: 'Smaller meals. Avoid late dinner.',
      followUp: null,
      followUpValue: null,
      followUpUnit: null,
      referral: null,
      patientEducation: null,
      medicines: [
        {
          id: 'f2500001-0000-4000-8000-000000000003',
          name: 'Pantoprazole 40 mg',
          dosage: '40 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '14 days',
          durationValue: 14,
          durationUnit: 'days',
          instructions: null,
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'empty_stomach',
        },
        {
          id: 'f2500001-0000-4000-8000-000000000004',
          name: 'Domperidone 10 mg',
          dosage: '10 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Twice daily',
          frequencyCode: 'BID',
          duration: '7 days',
          durationValue: 7,
          durationUnit: 'days',
          instructions: null,
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'before_food',
        },
      ],
    },
  },
  {
    pid: 'c2500001-0000-4000-8000-000000000004',
    aid: 'd2500001-0000-4000-8000-000000000004',
    rid: 'e2500001-0000-4000-8000-000000000004',
    name: 'Sneha Kulkarni',
    phone: '9000025004',
    email: 'desk.zurb.rx04@example.test',
    age: 31,
    gender: 'female',
    dob: '1995-01-22',
    guardianName: null,
    guardianRelation: null,
    address: null,
    altPhone: null,
    reason: 'Migraine',
    hour: 11,
    minute: 45,
    rx: {
      cc: 'Right-sided headache with nausea, 3 episodes this week.',
      hopi: 'Photophobia. Sleeps it off. No fever or neck stiffness.',
      diagnosis: 'Migraine without aura',
      investigations: 'CBC if headache persists beyond 2 weeks.',
      advice: 'Dark quiet room during an attack. Regular sleep.',
      followUp: 'After 2 weeks if not improving.',
      followUpValue: 2,
      followUpUnit: 'weeks',
      referral: null,
      patientEducation: null,
      medicines: [
        {
          id: 'f2500001-0000-4000-8000-000000000005',
          name: 'Naproxen 250 mg',
          dosage: '250 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Twice daily',
          frequencyCode: 'BID',
          duration: '3 days',
          durationValue: 3,
          durationUnit: 'days',
          instructions: 'Take at onset of headache.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'after_food',
        },
        {
          id: 'f2500001-0000-4000-8000-000000000006',
          name: 'Ondansetron 4 mg',
          dosage: '4 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'As needed',
          frequencyCode: 'BID',
          duration: '3 days',
          durationValue: 3,
          durationUnit: 'days',
          instructions: 'For nausea.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: null,
        },
      ],
    },
  },
  {
    pid: 'c2500001-0000-4000-8000-000000000005',
    aid: 'd2500001-0000-4000-8000-000000000005',
    rid: 'e2500001-0000-4000-8000-000000000005',
    name: 'Meera Kapoor',
    phone: '9000025005',
    email: 'desk.zurb.rx05@example.test',
    age: 52,
    gender: 'female',
    dob: '1974-03-12',
    guardianName: 'Arjun Kapoor',
    guardianRelation: 'spouse',
    address: '12 Green Avenue, Buter Kalan, Amritsar',
    altPhone: '9000025099',
    reason: 'Asthma review — full Rx preview',
    hour: 12,
    minute: 0,
    rx: {
      cc: 'Breathlessness and wheeze for 5 days, worse at night.',
      hopi:
        'Known asthma. Used rescue inhaler 4 times yesterday. No chest pain. Mild fever on day 1, now settled. Sleep interrupted. Walks to the market without stopping today.',
      diagnosis: 'Acute asthma exacerbation on known bronchial asthma',
      investigations: 'CBC, chest X-ray PA, spirometry after recovery.',
      advice:
        'Sit upright during an attack. Continue inhaler technique as shown. Avoid smoke and cold drinks. Return the same day if lips turn blue or speech is in single words.',
      followUp: 'Review after 5 days, or sooner if worsening.',
      followUpValue: 5,
      followUpUnit: 'days',
      referral:
        'Chest clinic, Civil Hospital Amritsar — if not better after 5 days or if peak flow stays low.',
      patientEducation:
        'Rinse mouth after steroid inhaler. Keep the rescue inhaler in the bag, not in a locked drawer.',
      medicines: [
        {
          id: 'f2500001-0000-4000-8000-000000000007',
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
          id: 'f2500001-0000-4000-8000-000000000008',
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
        {
          id: 'f2500001-0000-4000-8000-000000000009',
          name: 'Prednisolone 10 mg',
          dosage: '30 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '5 days',
          durationValue: 5,
          durationUnit: 'days',
          instructions: 'Morning dose. Do not stop early.',
          doseQty: 3,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'after_food',
        },
        {
          id: 'f2500001-0000-4000-8000-00000000000a',
          name: 'Montelukast 10 mg',
          dosage: '10 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'At bedtime',
          frequencyCode: 'QHS',
          duration: '14 days',
          durationValue: 14,
          durationUnit: 'days',
          instructions: null,
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'bedtime',
        },
      ],
    },
  },
  {
    pid: 'c2500001-0000-4000-8000-000000000006',
    aid: 'd2500001-0000-4000-8000-000000000006',
    rid: 'e2500001-0000-4000-8000-000000000006',
    name: 'Jaspreet Sandhu',
    phone: '9000025006',
    email: 'desk.zurb.rx06@example.test',
    age: 64,
    gender: 'male',
    dob: '1962-07-19',
    guardianName: 'Simran Sandhu',
    guardianRelation: 'spouse',
    address: '44 Mall Road, Buter Kalan, Amritsar',
    altPhone: '9000025098',
    reason: 'Two-page Rx — DM / HTN / COPD review',
    hour: 12,
    minute: 15,
    rx: {
      cc:
        'Increasing breathlessness on walking to the gurdwara, ankle swelling in the evenings, and burning in both feet for 3 weeks. Also a productive cough most mornings.',
      hopi:
        'Known type 2 diabetes for 12 years, hypertension for 8 years, and COPD for 5 years after long beedi use. Stopped smoking 2 years ago. Metformin 500 mg twice daily; often skips the night dose when dinner is late. Blood pressure at home 150–170 systolic. Uses a salbutamol inhaler most mornings. Last 3 weeks: walks slower, needs one rest on the gurdwara road, two-pillow orthopnoea twice, and ankle swelling by evening that goes down overnight. Burning and numbness in both feet worse at night. Morning cough with a little white sputum; no blood. No chest pain at rest. No fever. Reduced urine in the last week. Eats late, salty sabzi, and two cups of chai with sugar. Walks the village most days but not since the breathlessness increased. Wife notices he is more tired after lunch.',
      diagnosis:
        'Acute-on-chronic COPD; symptomatic heart-failure overlap; type 2 diabetes with neuropathy; hypertension — not at target',
      investigations:
        'CBC, HbA1c, fasting glucose, creatinine and eGFR, electrolytes, fasting lipid profile, TSH, urine ACR, ECG, chest X-ray PA, spirometry when infection-free. Bring home BP diary and glucometer log to the next visit.',
      advice:
        'Salt to less than one teaspoon a day. No extra salt on the table. Weigh every morning after passing urine; come the same day if weight rises by 2 kg in 3 days or if breathlessness comes on at rest. Continue inhalers even on good days. Sit upright for the steroid inhaler and rinse the mouth after. Do not stop the water tablet because the swelling has gone. Check sugars before breakfast and before dinner for 7 days. No barefoot walking. Soft shoes. One extra pillow at night if breathless. Return the same day if lips look blue, speech is in single words, or he cannot lie flat.',
      followUp: 'Review after 7 days with labs and the home BP / sugar diary.',
      followUpValue: 7,
      followUpUnit: 'days',
      referral:
        'Medicine / chest clinic, Civil Hospital Amritsar — if breathlessness stays NYHA III after 7 days, if creatinine rises, or if he needs oxygen. Cardiology if oedema persists after diuretic.',
      patientEducation:
        'Keep the rescue inhaler in the waistcoat, not in a locked drawer. Show the spacer technique to Simran. If he misses a metformin dose, take it with the next meal; do not double. Call if sugars stay above 300 or if he becomes very sleepy.',
      medicines: [
        {
          id: 'f2500001-0000-4000-8000-00000000000b',
          name: 'Metformin 500 mg',
          dosage: '500 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Twice daily',
          frequencyCode: 'BID',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'With breakfast and dinner. Do not skip the night dose.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'with_food',
        },
        {
          id: 'f2500001-0000-4000-8000-00000000000c',
          name: 'Glimepiride 1 mg',
          dosage: '1 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'Before breakfast. Keep sugar nearby if sweaty or shaky.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'before_food',
        },
        {
          id: 'f2500001-0000-4000-8000-00000000000d',
          name: 'Telmisartan 40 mg',
          dosage: '40 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'Same time each morning.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: null,
        },
        {
          id: 'f2500001-0000-4000-8000-00000000000e',
          name: 'Amlodipine 5 mg',
          dosage: '5 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'May cause ankle swelling; tell us if it increases.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: null,
        },
        {
          id: 'f2500001-0000-4000-8000-00000000000f',
          name: 'Torsemide 10 mg',
          dosage: '10 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '7 days',
          durationValue: 7,
          durationUnit: 'days',
          instructions: 'Morning dose. Expect more urine for 4 hours.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: null,
        },
        {
          id: 'f2500001-0000-4000-8000-000000000010',
          name: 'Atorvastatin 10 mg',
          dosage: '10 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'At bedtime',
          frequencyCode: 'QHS',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: null,
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'bedtime',
        },
        {
          id: 'f2500001-0000-4000-8000-000000000011',
          name: 'Aspirin 75 mg',
          dosage: '75 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'After dinner. Stop and call if black stools.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'after_food',
        },
        {
          id: 'f2500001-0000-4000-8000-000000000012',
          name: 'Tiotropium inhaler 18 mcg',
          dosage: '18 mcg',
          route: 'Inhaled',
          routeCode: 'inhaled',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'One puff every morning. Do not swallow the capsule.',
          doseQty: 1,
          doseUnit: 'puff',
          form: 'inhaler',
          foodTiming: null,
        },
        {
          id: 'f2500001-0000-4000-8000-000000000013',
          name: 'Budesonide-formoterol inhaler',
          dosage: '200/6 mcg',
          route: 'Inhaled',
          routeCode: 'inhaled',
          frequency: 'Twice daily',
          frequencyCode: 'BID',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'Two puffs morning and night. Rinse mouth after.',
          doseQty: 2,
          doseUnit: 'puff',
          form: 'inhaler',
          foodTiming: null,
        },
        {
          id: 'f2500001-0000-4000-8000-000000000014',
          name: 'Salbutamol inhaler 100 mcg',
          dosage: '100 mcg',
          route: 'Inhaled',
          routeCode: 'inhaled',
          frequency: 'As needed',
          frequencyCode: 'PRN',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: '2 puffs when wheezy. Come in if more than 8 puffs in a day.',
          doseQty: 2,
          doseUnit: 'puff',
          form: 'inhaler',
          foodTiming: null,
        },
        {
          id: 'f2500001-0000-4000-8000-000000000015',
          name: 'Pantoprazole 40 mg',
          dosage: '40 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '14 days',
          durationValue: 14,
          durationUnit: 'days',
          instructions: null,
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'empty_stomach',
        },
        {
          id: 'f2500001-0000-4000-8000-000000000016',
          name: 'Pregabalin 75 mg',
          dosage: '75 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'At bedtime',
          frequencyCode: 'QHS',
          duration: '14 days',
          durationValue: 14,
          durationUnit: 'days',
          instructions: 'For foot burning. May cause morning drowsiness.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'bedtime',
        },
      ],
    },
  },
  {
    pid: 'c2500001-0000-4000-8000-000000000007',
    aid: 'd2500001-0000-4000-8000-000000000007',
    rid: 'e2500001-0000-4000-8000-000000000007',
    name: 'Harinder Singh',
    phone: '9000025007',
    email: 'desk.zurb.rx07@example.test',
    age: 58,
    gender: 'male',
    dob: '1968-04-03',
    guardianName: 'Manjeet Kaur',
    guardianRelation: 'spouse',
    address: '8 Court Road, Buter Kalan, Amritsar',
    altPhone: '9000025097',
    reason: 'Pre-op panel — 30 investigations',
    hour: 12,
    minute: 30,
    rx: {
      cc:
        'Left inguinal swelling for 8 months, larger on standing and coughing. Surgeon has booked open mesh repair in 3 weeks and asked for a full pre-op panel.',
      hopi:
        'Known hypertension for 6 years on telmisartan. Ultrasound last year showed fatty liver. No chest pain, no known diabetes. Walks the grain market most days. Occasional heartburn after late dinner. No blood in stool. No jaundice. Smoked beedis for 15 years, quit 8 years ago. Drinks 2–3 pegs on weekends. Wife notices snoring. Last BP at the chemist 148/92. Needs fitness for elective hernia surgery at Civil Hospital.',
      diagnosis:
        'Left inguinal hernia for elective mesh repair; hypertension — not at target; suspected NAFLD; pre-op master checkup',
      investigations:
        'CBC, ESR, peripheral smear, HbA1c, fasting glucose, postprandial glucose, fasting insulin, creatinine and eGFR, urea, electrolytes, uric acid, LFT, fasting lipid profile, TSH, free T4, vitamin D, vitamin B12, iron studies, urine routine, urine ACR, ECG, chest X-ray PA, USG abdomen, 2D echo, TMT, spirometry, PSA, HBsAg, anti-HCV, HIV. Come fasting 10 hours and bring old reports plus the insurance pre-auth form.',
      advice:
        'Continue the blood-pressure tablet every morning. No beedi, no alcohol until after surgery. Light walk only; do not lift sacks. Soft scrotal support if the swelling aches. Come fasting 10 hours on the lab morning. Bring the old ultrasound and any previous ECG.',
      followUp: 'Review after 5 days with the full report bundle, before the surgical date.',
      followUpValue: 5,
      followUpUnit: 'days',
      referral:
        'General surgery, Civil Hospital Amritsar — as booked. Cardiology if the TMT is positive or echo shows reduced EF.',
      patientEducation:
        'Keep the insurance pre-auth form with the lab reports in one file. Do not stop the BP tablet on the morning of blood tests. Call if the swelling becomes red, painful, or will not reduce.',
      medicines: [
        {
          id: 'f2500001-0000-4000-8000-000000000017',
          name: 'Telmisartan 40 mg',
          dosage: '40 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'Same time each morning. Do not skip on the lab day.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: null,
        },
        {
          id: 'f2500001-0000-4000-8000-000000000018',
          name: 'Atorvastatin 10 mg',
          dosage: '10 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'At bedtime',
          frequencyCode: 'QHS',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'Continue unless the surgeon asks to hold it.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'bedtime',
        },
        {
          id: 'f2500001-0000-4000-8000-000000000019',
          name: 'Pantoprazole 40 mg',
          dosage: '40 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '14 days',
          durationValue: 14,
          durationUnit: 'days',
          instructions: 'Before breakfast.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'empty_stomach',
        },
        {
          id: 'f2500001-0000-4000-8000-00000000001a',
          name: 'Paracetamol 500 mg',
          dosage: '500 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'As needed',
          frequencyCode: 'PRN',
          duration: '7 days',
          durationValue: 7,
          durationUnit: 'days',
          instructions: 'For ache at the hernia site. Max 3 tablets in a day.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'after_food',
        },
        {
          id: 'f2500001-0000-4000-8000-00000000001b',
          name: 'Ferrous ascorbate 100 mg',
          dosage: '100 mg',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '30 days',
          durationValue: 30,
          durationUnit: 'days',
          instructions: 'After lunch. Stools may turn dark.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'after_food',
        },
        {
          id: 'f2500001-0000-4000-8000-00000000001c',
          name: 'Vitamin D3 60k IU',
          dosage: '60k IU',
          route: 'Oral',
          routeCode: 'oral',
          frequency: 'Once daily',
          frequencyCode: 'OD',
          duration: '4 weeks',
          durationValue: 4,
          durationUnit: 'weeks',
          instructions: 'One sachet weekly after dinner, not daily. Mix in milk.',
          doseQty: 1,
          doseUnit: 'tab',
          form: 'tab',
          foodTiming: 'after_food',
        },
      ],
    },
  },
  {
    pid: 'c2500001-0000-4000-8000-000000000008',
    aid: 'd2500001-0000-4000-8000-000000000008',
    rid: 'e2500001-0000-4000-8000-000000000008',
    name: 'Gurleen Kaur',
    phone: '9000025008',
    email: 'desk.zurb.rx08@example.test',
    age: 67,
    gender: 'female',
    dob: '1959-11-08',
    guardianName: 'Balwinder Singh',
    guardianRelation: 'spouse',
    address: '19 Lawrence Road, Buter Kalan, Amritsar',
    altPhone: '9000025096',
    reason: 'Two-page Rx — RA / bone / thyroid review',
    hour: 12,
    minute: 45,
    rx: {
      cc:
        'Pain and swelling in both wrists and the small joints of the hands for 4 months, morning stiffness lasting more than an hour, and a recent fall with back pain. Also tiredness and hair thinning.',
      hopi:
        'Known rheumatoid arthritis for 9 years, originally diagnosed at Civil Hospital after six months of knuckle pain. Was on methotrexate 10 mg weekly and hydroxychloroquine; stopped methotrexate on her own 8 weeks ago because of mouth ulcers and nausea. Stiffness is worst from 5 to 7 am; takes an hour to open a jar or button a kameez. Both wrists swollen; right MCP joints tender. Right knee clicks on stairs. Fell in the courtyard 12 days ago, landed on the left hip; walks with a stick since. Bone density last year was osteoporotic at the spine. Known hypothyroidism on thyroxine 75 mcg; last TSH was 8.2. Heartburn most nights if she skips the antacid. Sleeps poorly because of joint pain and a racing mind. Appetite reduced. No fever, no new rash, no dry mouth that is new. Weight down 3 kg in 2 months. Daughter notices she is slower getting out of the chair. Uses diclofenac gel twice a day and paracetamol at night. No known drug allergy. Lives with her husband; he will supervise the weekly methotrexate. Has not had an eye check for hydroxychloroquine in 18 months. Occasional dizziness on standing. Constipation for 2 weeks after the painkillers. No chest pain at rest. Walks only to the courtyard now.',
      diagnosis:
        'Active rheumatoid arthritis after self-stopping methotrexate; osteoporosis with recent fall; hypothyroidism — not at target; GERD; neuropathic pain; iron deficiency symptoms',
      investigations:
        'CBC; ESR; CRP; RF; anti-CCP; LFT; creatinine and eGFR; electrolytes; TSH; free T4; fasting glucose; HbA1c; vitamin D; vitamin B12; iron studies; DEXA scan; X-ray both hands PA; X-ray lumbosacral spine; ECG; urine routine. Bring the last bone-density report and the hydroxychloroquine eye-check card if she has one.',
      advice:
        'Restart methotrexate only on the day written on the strip — Saturday after food — and take folic acid the next day, not the same morning. Do not take two painkillers together. Sit up for 30 minutes after the weekly bone tablet; do not lie down and do not take it with milk or tea. Thyroxine on an empty stomach, then wait 45 minutes before chai. Use the stick on the courtyard tiles. Soft shoes. No floor sitting. Weigh once a week. Return the same day if she has black stools, yellow eyes, unexplained fever, or breathlessness at rest. Keep a written list of every tablet in the steel box so the chemist does not swap brands.',
      followUp: 'Review after 14 days with labs, before increasing methotrexate.',
      followUpValue: 14,
      followUpUnit: 'days',
      referral:
        'Rheumatology, Civil Hospital Amritsar — if joints stay swollen after 4 weeks or if methotrexate is not tolerated. Ophthalmology for hydroxychloroquine baseline. Orthopaedics if hip pain persists after the fall films.',
      patientEducation:
        'Mouth ulcers after methotrexate: skip the next weekly dose and call. Folic acid is not optional. Eye drops four times a day while on hydroxychloroquine. Do not start an over-the-counter pain oil that smells of menthol on broken skin. Show Balwinder the Saturday methotrexate ritual once this week.',
      medicines: [
        tabMed('01d', 'Methotrexate 15 mg', '15 mg', 'Once weekly', 'CUSTOM', 4, 'weeks', {
          instructions: 'Saturday after food. Never on the folic-acid day.',
          foodTiming: 'after_food',
        }),
        tabMed('01e', 'Folic acid 5 mg', '5 mg', 'Once weekly', 'CUSTOM', 4, 'weeks', {
          instructions: 'Sunday morning. Skip if she already took it with a multivitamin.',
          foodTiming: 'after_food',
        }),
        tabMed('01f', 'Hydroxychloroquine 200 mg', '200 mg', 'Twice daily', 'BID', 30, 'days', {
          instructions: 'With meals. Book the eye check before the next refill.',
          foodTiming: 'with_food',
        }),
        tabMed('020', 'Prednisolone 5 mg', '5 mg', 'Once daily', 'OD', 14, 'days', {
          instructions: 'Morning dose. Do not stop suddenly.',
          foodTiming: 'after_food',
        }),
        tabMed('021', 'Sulfasalazine 500 mg', '500 mg', 'Twice daily', 'BID', 30, 'days', {
          instructions: 'Start one tablet for 7 days, then two. Stools may turn orange.',
          foodTiming: 'after_food',
        }),
        tabMed('022', 'Leflunomide 10 mg', '10 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Same time each morning. Tell us if hair thinning increases.',
          foodTiming: 'after_food',
        }),
        tabMed('023', 'Calcium carbonate 500 mg', '500 mg', 'Twice daily', 'BID', 30, 'days', {
          instructions: 'Away from the thyroid tablet by at least 4 hours.',
          foodTiming: 'after_food',
        }),
        tabMed('024', 'Vitamin D3 60k IU', '60k IU', 'Once weekly', 'CUSTOM', 8, 'weeks', {
          instructions: 'One sachet weekly after dinner. Mix in milk, not tea.',
          foodTiming: 'after_food',
          form: 'sachet',
        }),
        tabMed('025', 'Alendronate 70 mg', '70 mg', 'Once weekly', 'CUSTOM', 12, 'weeks', {
          instructions: 'Monday on empty stomach with a full glass of water. Stay upright 30 min.',
          foodTiming: 'empty_stomach',
        }),
        tabMed('026', 'Thyroxine 75 mcg', '75 mcg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Empty stomach. Wait 45 minutes before tea or calcium.',
          foodTiming: 'empty_stomach',
        }),
        tabMed('027', 'Pantoprazole 40 mg', '40 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Before breakfast.',
          foodTiming: 'empty_stomach',
        }),
        tabMed('028', 'Paracetamol 650 mg', '650 mg', 'Thrice daily', 'TID', 14, 'days', {
          instructions: 'Maximum 3 tablets in a day. Do not add another cold tablet that has paracetamol.',
          foodTiming: 'after_food',
        }),
        tabMed('029', 'Tramadol 50 mg', '50 mg', 'As needed', 'PRN', 7, 'days', {
          instructions: 'Only if pain stops her sleeping. May cause constipation and dizziness.',
          foodTiming: 'after_food',
        }),
        tabMed('02a', 'Gabapentin 100 mg', '100 mg', 'At bedtime', 'QHS', 14, 'days', {
          instructions: 'For night burning in the feet. May cause morning unsteadiness.',
          foodTiming: 'bedtime',
        }),
        tabMed('02b', 'Ferrous ascorbate 100 mg', '100 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'After lunch. Stools may turn dark. Away from thyroxine.',
          foodTiming: 'after_food',
        }),
        tabMed('02c', 'Methylcobalamin 1500 mcg', '1500 mcg', 'Once daily', 'OD', 30, 'days', {
          foodTiming: 'after_food',
        }),
        tabMed('02d', 'Pregabalin 75 mg', '75 mg', 'At bedtime', 'QHS', 14, 'days', {
          instructions: 'Do not combine with tramadol on the same night unless pain is severe.',
          foodTiming: 'bedtime',
        }),
        tabMed('02e', 'Melatonin 3 mg', '3 mg', 'At bedtime', 'QHS', 14, 'days', {
          instructions: 'Thirty minutes before lights out. Stop if morning hangover lasts past 10 am.',
          foodTiming: 'bedtime',
        }),
        tabMed('02f', 'Diclofenac gel 1%', '1%', 'Thrice daily', 'TID', 14, 'days', {
          route: 'Topical',
          routeCode: 'topical',
          doseUnit: 'application',
          form: 'gel',
          instructions: 'Thin layer on wrists and the right knee. Not on broken skin.',
        }),
        tabMed('030', 'Carboxymethylcellulose 0.5%', '1 drop', 'Four times daily', 'TID', 30, 'days', {
          route: 'Topical',
          routeCode: 'topical',
          doseQty: 1,
          doseUnit: 'drops',
          form: 'drops',
          instructions: 'Both eyes. Wait 5 minutes before any other drop.',
        }),
      ],
    },
  },
  {
    pid: 'c2500001-0000-4000-8000-000000000009',
    aid: 'd2500001-0000-4000-8000-000000000009',
    rid: 'e2500001-0000-4000-8000-000000000009',
    name: 'Vikram Bedi',
    phone: '9000025009',
    email: 'desk.zurb.rx09@example.test',
    age: 71,
    gender: 'male',
    dob: '1955-05-21',
    guardianName: 'Neelam Bedi',
    guardianRelation: 'spouse',
    address: '3 Kennedy Avenue, Buter Kalan, Amritsar',
    altPhone: '9000025095',
    reason: 'Two-page Rx — post-CABG / HF / DM review',
    hour: 13,
    minute: 0,
    rx: {
      cc:
        'Breathlessness on one flight of stairs, ankle swelling by evening, and fasting sugars 180–220 for 3 weeks. Also a pulling pain in the left calf after walking to the gate.',
      hopi:
        'Triple-vessel CABG 11 months ago at a private hospital in Ludhiana. Was walking to the gurdwara without a stop until 6 weeks ago. Now needs one rest on the stairs and sleeps on two pillows twice a week. Ankle swelling by 6 pm that goes down overnight. Home BP 140–160 systolic; he skips the evening water tablet when he has to travel. Type 2 diabetes for 18 years; on metformin and a night insulin that he sometimes forgets if dinner is late. Fasting sugars 180–220, post-meal 240 last week. Known reduced EF 38% on the last echo. Creatinine 1.6 two months ago. Gout in the right first toe last winter; he still keeps a painkiller at home. Atrial fibrillation on the discharge ECG; not sure if he is still meant to take the blood thinner with aspirin. Occasional palpitations after chai. No chest pain at rest. No black stools. Smoked for 30 years, quit the day of surgery. Drinks one peg on Sunday. Wife says he is more tired after lunch and naps in the chair. Reduced urine in the last 4 days after extra salt at a wedding. Walks the colony most mornings but stopped the last 10 days because of the calf pull. Uses the GTN spray once last month for a tight feeling that settled in 3 minutes.',
      diagnosis:
        'HFrEF after CABG; type 2 diabetes — not at target; CKD stage 3; possible claudication; gout history; hypertension — not at target; query residual angina',
      investigations:
        'CBC; HbA1c; fasting glucose; creatinine and eGFR; electrolytes; fasting lipid profile; TSH; urine ACR; BNP or NT-proBNP; ECG; chest X-ray PA; 2D echo; TMT if echo is stable; arterial Doppler both legs; uric acid; LFT. Bring the CABG discharge summary, the last echo, and the home BP / sugar diary.',
      advice:
        'Salt to less than one teaspoon a day. Weigh every morning after urine; come the same day if weight rises by 2 kg in 3 days or if he cannot lie flat. Do not skip the water tablet because the swelling has gone. Check sugars fasting and before dinner for 7 days. Continue both blood thinners unless a surgeon writes a hold date. Sit upright for the inhaler-style GTN spray — one puff, sit, second puff after 5 minutes if pain stays, then come to casualty. Soft shoes. No barefoot walking. One extra pillow if breathless at night. No extra painkiller for the gout toe without calling — it fights the blood thinner. Return the same day if lips look blue, speech is in single words, or calf pain comes on at rest.',
      followUp: 'Review after 7 days with labs, echo date, and the home BP / sugar diary.',
      followUpValue: 7,
      followUpUnit: 'days',
      referral:
        'Cardiology, Civil Hospital Amritsar — if breathlessness stays NYHA III, if BNP is high, or if Doppler shows flow-limiting disease. Endocrinology if HbA1c stays above 8 after insulin is regular. Vascular surgery if rest pain or a cold foot appears.',
      patientEducation:
        'Keep the GTN spray in the waistcoat, not in a locked drawer. Show Neelam the morning weigh and the insulin pen clicks. If he misses the night insulin, take it with a small snack; do not double the next morning. Call if sugars stay above 300 or if he becomes very sleepy. Do not stop the statin because of leg cramps until we see the CK.',
      medicines: [
        tabMed('031', 'Aspirin 75 mg', '75 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'After dinner. Stop and call if black stools.',
          foodTiming: 'after_food',
        }),
        tabMed('032', 'Clopidogrel 75 mg', '75 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'With aspirin until cardiology writes a stop date.',
          foodTiming: 'after_food',
        }),
        tabMed('033', 'Atorvastatin 40 mg', '40 mg', 'At bedtime', 'QHS', 30, 'days', {
          instructions: 'Tell us if new muscle pain, then we will check CK.',
          foodTiming: 'bedtime',
        }),
        tabMed('034', 'Metoprolol XL 50 mg', '50 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Same time each morning. Do not stop suddenly.',
        }),
        tabMed('035', 'Ramipril 5 mg', '5 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Morning dose. Sit on the bed edge for a minute before standing.',
        }),
        tabMed('036', 'Spironolactone 25 mg', '25 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'After breakfast. Hold if diarrhoea or if we hold it for high potassium.',
          foodTiming: 'after_food',
        }),
        tabMed('037', 'Torsemide 10 mg', '10 mg', 'Once daily', 'OD', 14, 'days', {
          instructions: 'Morning dose. Expect more urine for 4 hours. Do not skip on travel days.',
        }),
        tabMed('038', 'Dapagliflozin 10 mg', '10 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Morning. Extra genital hygiene. Hold if vomiting or not eating.',
          foodTiming: 'before_food',
        }),
        tabMed('039', 'Metformin 500 mg', '500 mg', 'Twice daily', 'BID', 30, 'days', {
          instructions: 'With breakfast and dinner. Do not skip the night dose.',
          foodTiming: 'with_food',
        }),
        tabMed('03a', 'Insulin glargine', '10 units', 'At bedtime', 'QHS', 30, 'days', {
          route: 'Subcutaneous',
          routeCode: 'SC',
          doseQty: 10,
          doseUnit: 'unit',
          form: 'inj',
          instructions: 'Night pen. Rotate the site. Do not omit if dinner is late — take with a snack.',
          foodTiming: 'bedtime',
        }),
        tabMed('03b', 'Isosorbide mononitrate 30 mg', '30 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Morning. Headache for 2–3 days is common; take paracetamol, do not stop.',
        }),
        tabMed('03c', 'Ivabradine 5 mg', '5 mg', 'Twice daily', 'BID', 30, 'days', {
          instructions: 'If pulse at home stays above 80 on the beta blocker.',
          foodTiming: 'with_food',
        }),
        tabMed('03d', 'Pantoprazole 40 mg', '40 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Before breakfast while on dual blood thinners.',
          foodTiming: 'empty_stomach',
        }),
        tabMed('03e', 'Allopurinol 100 mg', '100 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'After food. Not for an acute gout attack — call first.',
          foodTiming: 'after_food',
        }),
        tabMed('03f', 'Thyroxine 50 mcg', '50 mcg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'Empty stomach. Wait 45 minutes before tea.',
          foodTiming: 'empty_stomach',
        }),
        tabMed('040', 'Amlodipine 2.5 mg', '2.5 mg', 'Once daily', 'OD', 30, 'days', {
          instructions: 'If home systolic stays above 150 after a week. May add ankle swelling.',
        }),
        tabMed('041', 'Potassium chloride 600 mg', '600 mg', 'Once daily', 'OD', 7, 'days', {
          instructions: 'After lunch for 7 days only. Stop if loose stools.',
          foodTiming: 'after_food',
        }),
        tabMed('042', 'Glyceryl trinitrate spray', '400 mcg', 'As needed', 'PRN', 30, 'days', {
          route: 'Sublingual',
          routeCode: 'sublingual',
          doseQty: 1,
          doseUnit: 'puff',
          form: 'spray',
          instructions: 'Sit. One spray under the tongue. Second after 5 min if pain stays, then casualty.',
        }),
        tabMed('043', 'Paracetamol 650 mg', '650 mg', 'As needed', 'PRN', 14, 'days', {
          instructions: 'For nitrate headache or calf ache. Max 3 tablets a day. No other painkiller.',
          foodTiming: 'after_food',
        }),
        tabMed('044', 'Multivitamin', '1 tab', 'Once daily', 'OD', 30, 'days', {
          foodTiming: 'after_food',
        }),
        tabMed('045', 'Pregabalin 75 mg', '75 mg', 'At bedtime', 'QHS', 14, 'days', {
          instructions: 'For burning in the feet. May cause morning drowsiness.',
          foodTiming: 'bedtime',
        }),
        tabMed('046', 'Salbutamol inhaler 100 mcg', '100 mcg', 'As needed', 'PRN', 30, 'days', {
          route: 'Inhaled',
          routeCode: 'inhaled',
          doseQty: 2,
          doseUnit: 'puff',
          form: 'inhaler',
          instructions: '2 puffs if breathless after a walk. Come in if more than 8 puffs in a day.',
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
      guardian_name: v.guardianName,
      guardian_relation: v.guardianRelation,
      address: v.address,
      alt_phone: v.altPhone,
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
      cc: v.rx.cc,
      hopi: v.rx.hopi,
      provisional_diagnosis: v.rx.diagnosis,
      investigations_orders: v.rx.investigations,
      advice: v.rx.advice,
      follow_up: v.rx.followUp,
      follow_up_value: v.rx.followUpValue,
      follow_up_unit: v.rx.followUpUnit,
      referral: v.rx.referral,
      patient_education: v.rx.patientEducation,
      sent_to_patient_at: null,
    })),
    { onConflict: 'id' },
  );
  if (rxErr) {
    console.error('prescriptions upsert failed:', rxErr.message);
    process.exit(1);
  }

  const medicineRows = VISITS.flatMap((v) =>
    v.rx.medicines.map((m, i) => ({
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

  console.log(`Seeded ${VISITS.length} filled Rx visits on Dr Zurb for today`);
  VISITS.forEach((v, i) => {
    const tag =
      i === 8 || i === 7 || i === 5
        ? 'TWO-PAGE PREVIEW'
        : i === 6
          ? '30-TEST PREVIEW'
          : i === 4
            ? 'FULL PREVIEW'
            : `${v.rx.medicines.length} med`;
    console.log(
      `  ${String(v.hour).padStart(2, '0')}:${String(v.minute).padStart(2, '0')}  ${v.name}  ${tag}`,
    );
  });
}

void main();
