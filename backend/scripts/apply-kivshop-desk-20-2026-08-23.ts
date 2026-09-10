/**
 * Seed 20 dummy desk patients for KivShop so intake search can be tested.
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-kivshop-desk-20-2026-08-23.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = '22419ea8-67cf-4872-b06a-a256273accb5';

const PEOPLE: Array<{
  id: string;
  name: string;
  phone: string;
  email: string;
  age: number;
  gender: 'female' | 'male';
}> = [
  { id: 'e2300001-0000-4000-8000-000000000001', name: 'Kavya Iyer', phone: '9000010001', email: 'desk.seed.01@example.test', age: 29, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000002', name: 'Arjun Malhotra', phone: '9000010002', email: 'desk.seed.02@example.test', age: 37, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-000000000003', name: 'Sneha Banerjee', phone: '9000010003', email: 'desk.seed.03@example.test', age: 24, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000004', name: 'Rahul Deshmukh', phone: '9000010004', email: 'desk.seed.04@example.test', age: 52, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-000000000005', name: 'Diya Menon', phone: '9000010005', email: 'desk.seed.05@example.test', age: 31, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000006', name: 'Harsh Vardhan', phone: '9000010006', email: 'desk.seed.06@example.test', age: 44, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-000000000007', name: 'Tanvi Kulkarni', phone: '9000010007', email: 'desk.seed.07@example.test', age: 26, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000008', name: 'Imran Qureshi', phone: '9000010008', email: 'desk.seed.08@example.test', age: 39, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-000000000009', name: 'Aditi Rao', phone: '9000010009', email: 'desk.seed.09@example.test', age: 33, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-00000000000a', name: 'Yash Bansal', phone: '9000010010', email: 'desk.seed.10@example.test', age: 21, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-00000000000b', name: 'Leela Nambiar', phone: '9000010011', email: 'desk.seed.11@example.test', age: 58, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-00000000000c', name: 'Sourav Das', phone: '9000010012', email: 'desk.seed.12@example.test', age: 35, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-00000000000d', name: 'Megha Pillai', phone: '9000010013', email: 'desk.seed.13@example.test', age: 42, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-00000000000e', name: 'Nikhil Jain', phone: '9000010014', email: 'desk.seed.14@example.test', age: 28, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-00000000000f', name: 'Zara Khan', phone: '9000010015', email: 'desk.seed.15@example.test', age: 19, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000010', name: 'Pranav Iyer', phone: '9000010016', email: 'desk.seed.16@example.test', age: 47, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-000000000011', name: 'Rhea Chawla', phone: '9000010017', email: 'desk.seed.17@example.test', age: 36, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000012', name: 'Amit Kulkarni', phone: '9000010018', email: 'desk.seed.18@example.test', age: 61, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-000000000013', name: 'Sana Sheikh', phone: '9000010019', email: 'desk.seed.19@example.test', age: 23, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000014', name: 'Kunal Bhatt', phone: '9000010020', email: 'desk.seed.20@example.test', age: 40, gender: 'male' },
  // Same phone as Rhea Chawla — multi-match UI
  { id: 'e2300001-0000-4000-8000-000000000015', name: 'Meera Joshi', phone: '9000010017', email: 'desk.seed.21@example.test', age: 41, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000016', name: 'Vikram Sethi', phone: '9000010017', email: 'desk.seed.22@example.test', age: 55, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-000000000017', name: 'Ananya Grover', phone: '9000010017', email: 'desk.seed.23@example.test', age: 22, gender: 'female' },
  { id: 'e2300001-0000-4000-8000-000000000018', name: 'Rohan Kapoor', phone: '9000010017', email: 'desk.seed.24@example.test', age: 34, gender: 'male' },
  { id: 'e2300001-0000-4000-8000-000000000019', name: 'Fatima Noor', phone: '9000010017', email: 'desk.seed.25@example.test', age: 48, gender: 'female' },
];

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const { error: pErr } = await admin.from('patients').upsert(
    PEOPLE.map((p) => ({
      id: p.id,
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
      medical_record_number: null,
    })),
    { onConflict: 'id' }
  );
  if (pErr) {
    console.error('patients upsert failed:', pErr.message);
    process.exit(1);
  }

  let mrnAssigned = 0;
  for (const person of PEOPLE) {
    const { error: mrnErr } = await admin.rpc('assign_patient_mrn', {
      p_patient_id: person.id,
    });
    if (mrnErr) {
      console.error('assign_patient_mrn failed');
      process.exit(1);
    }
    mrnAssigned += 1;
  }

  console.log(`Seeded ${PEOPLE.length} patients; MRN assigned ${mrnAssigned}`);
}

void main();
