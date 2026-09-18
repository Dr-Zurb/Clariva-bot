/**
 * Overlap patients for desk search / dedup.
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-kivshop-desk-dupes-2026-08-23.ts
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
  { id: 'e2300003-0000-4000-8000-000000000001', name: 'Sunita Devi', phone: '9000010101', email: 'desk.dupe.01@example.test', age: 62, gender: 'female' },
  { id: 'e2300003-0000-4000-8000-000000000002', name: 'Sunita Devi', phone: '9000010201', email: 'desk.dupe.02@example.test', age: 62, gender: 'female' },
  { id: 'e2300003-0000-4000-8000-000000000003', name: 'Sunita Devi', phone: '9000010101', email: 'desk.dupe.03@example.test', age: 58, gender: 'female' },
  { id: 'e2300003-0000-4000-8000-000000000004', name: 'Sunita Devi', phone: '9000010202', email: 'desk.dupe.04@example.test', age: 45, gender: 'female' },
  { id: 'e2300003-0000-4000-8000-000000000005', name: 'Arjun Malhotra', phone: '9000010002', email: 'desk.dupe.05@example.test', age: 37, gender: 'male' },
  { id: 'e2300003-0000-4000-8000-000000000006', name: 'Arjun Malhotra', phone: '9000010203', email: 'desk.dupe.06@example.test', age: 37, gender: 'male' },
  { id: 'e2300003-0000-4000-8000-000000000007', name: 'Arjun Malhotra', phone: '9000010002', email: 'desk.dupe.07@example.test', age: 41, gender: 'male' },
  { id: 'e2300003-0000-4000-8000-000000000008', name: 'Karan Malhotra', phone: '9000010002', email: 'desk.dupe.08@example.test', age: 37, gender: 'male' },
  { id: 'e2300003-0000-4000-8000-000000000009', name: 'Pooja Yadav', phone: '9000010103', email: 'desk.dupe.09@example.test', age: 28, gender: 'female' },
  { id: 'e2300003-0000-4000-8000-00000000000a', name: 'Pooja Yadav', phone: '9000010204', email: 'desk.dupe.10@example.test', age: 28, gender: 'female' },
  { id: 'e2300003-0000-4000-8000-00000000000b', name: 'Pooja Sharma', phone: '9000010103', email: 'desk.dupe.11@example.test', age: 28, gender: 'female' },
  { id: 'e2300003-0000-4000-8000-00000000000c', name: 'Ravi Kumar', phone: '9000010300', email: 'desk.dupe.12@example.test', age: 40, gender: 'male' },
  { id: 'e2300003-0000-4000-8000-00000000000d', name: 'Neha Kumar', phone: '9000010300', email: 'desk.dupe.13@example.test', age: 38, gender: 'female' },
  { id: 'e2300003-0000-4000-8000-00000000000e', name: 'Ankit Kumar', phone: '9000010300', email: 'desk.dupe.14@example.test', age: 12, gender: 'male' },
  { id: 'e2300003-0000-4000-8000-00000000000f', name: 'Amit Sharma', phone: '9000010205', email: 'desk.dupe.15@example.test', age: 50, gender: 'male' },
  { id: 'e2300003-0000-4000-8000-000000000010', name: 'Amit Sharma', phone: '9000010206', email: 'desk.dupe.16@example.test', age: 50, gender: 'male' },
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

  console.log(`Seeded ${PEOPLE.length} overlap patients; MRN assigned ${mrnAssigned}`);
}

void main();
