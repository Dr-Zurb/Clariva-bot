/**
 * Seed 20 more desk patients for KivShop (new names, phones, relatives).
 * Run from backend: npx ts-node -r dotenv/config scripts/apply-kivshop-desk-20b-2026-08-23.ts
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
  guardianName: string;
  guardianRelation: 'father' | 'spouse' | 'mother' | 'son' | 'daughter';
  address: string;
}> = [
  { id: 'e2300002-0000-4000-8000-000000000001', name: 'Sunita Devi', phone: '9000010101', email: 'desk.seed.b01@example.test', age: 62, gender: 'female', guardianName: 'Ram Prakash', guardianRelation: 'spouse', address: 'Model Town' },
  { id: 'e2300002-0000-4000-8000-000000000002', name: 'Balwant Singh', phone: '9000010102', email: 'desk.seed.b02@example.test', age: 71, gender: 'male', guardianName: 'Gurpreet Singh', guardianRelation: 'son', address: 'Jalandhar Cantt' },
  { id: 'e2300002-0000-4000-8000-000000000003', name: 'Pooja Yadav', phone: '9000010103', email: 'desk.seed.b03@example.test', age: 28, gender: 'female', guardianName: 'Ramesh Yadav', guardianRelation: 'father', address: 'Sector 22 Chandigarh' },
  { id: 'e2300002-0000-4000-8000-000000000004', name: 'Manoj Tiwari', phone: '9000010104', email: 'desk.seed.b04@example.test', age: 45, gender: 'male', guardianName: 'Kavita Tiwari', guardianRelation: 'spouse', address: 'Gomti Nagar' },
  { id: 'e2300002-0000-4000-8000-000000000005', name: 'Aisha Rahman', phone: '9000010105', email: 'desk.seed.b05@example.test', age: 8, gender: 'female', guardianName: 'Imtiaz Rahman', guardianRelation: 'father', address: 'Park Circus' },
  { id: 'e2300002-0000-4000-8000-000000000006', name: 'Kabir Mehta', phone: '9000010106', email: 'desk.seed.b06@example.test', age: 1, gender: 'male', guardianName: 'Sameer Mehta', guardianRelation: 'father', address: 'Vastrapur' },
  { id: 'e2300002-0000-4000-8000-000000000007', name: 'Lalita Bai', phone: '9000010107', email: 'desk.seed.b07@example.test', age: 68, gender: 'female', guardianName: 'Deepak Verma', guardianRelation: 'son', address: 'Indore' },
  { id: 'e2300002-0000-4000-8000-000000000008', name: 'Farooq Ahmed', phone: '9000010108', email: 'desk.seed.b08@example.test', age: 54, gender: 'male', guardianName: 'Nasreen Ahmed', guardianRelation: 'spouse', address: 'Hyderabad Old City' },
  { id: 'e2300002-0000-4000-8000-000000000009', name: 'Nandini Reddy', phone: '9000010109', email: 'desk.seed.b09@example.test', age: 32, gender: 'female', guardianName: 'Venkat Reddy', guardianRelation: 'father', address: 'Banjara Hills' },
  { id: 'e2300002-0000-4000-8000-00000000000a', name: 'Tejas Gaikwad', phone: '9000010110', email: 'desk.seed.b10@example.test', age: 17, gender: 'male', guardianName: 'Suresh Gaikwad', guardianRelation: 'father', address: 'Kothrud Pune' },
  { id: 'e2300002-0000-4000-8000-00000000000b', name: 'Usha Rani', phone: '9000010111', email: 'desk.seed.b11@example.test', age: 59, gender: 'female', guardianName: 'Om Prakash', guardianRelation: 'spouse', address: 'Ludhiana' },
  { id: 'e2300002-0000-4000-8000-00000000000c', name: 'Devansh Agarwal', phone: '9000010112', email: 'desk.seed.b12@example.test', age: 11, gender: 'male', guardianName: 'Priya Agarwal', guardianRelation: 'mother', address: 'C-Scheme Jaipur' },
  { id: 'e2300002-0000-4000-8000-00000000000d', name: 'Shabnam Begum', phone: '9000010113', email: 'desk.seed.b13@example.test', age: 43, gender: 'female', guardianName: 'Irfan Khan', guardianRelation: 'spouse', address: 'Srinagar' },
  { id: 'e2300002-0000-4000-8000-00000000000e', name: 'Rakesh Chauhan', phone: '9000010114', email: 'desk.seed.b14@example.test', age: 38, gender: 'male', guardianName: 'Bhupendra Chauhan', guardianRelation: 'father', address: 'Gwalior' },
  { id: 'e2300002-0000-4000-8000-00000000000f', name: 'Kirti Sharma', phone: '9000010115', email: 'desk.seed.b15@example.test', age: 26, gender: 'female', guardianName: 'Anil Sharma', guardianRelation: 'father', address: 'Noida Sec 62' },
  { id: 'e2300002-0000-4000-8000-000000000010', name: 'Omkar Patil', phone: '9000010116', email: 'desk.seed.b16@example.test', age: 50, gender: 'male', guardianName: 'Savita Patil', guardianRelation: 'spouse', address: 'Nashik' },
  { id: 'e2300002-0000-4000-8000-000000000011', name: 'Aarav Saxena', phone: '9000010117', email: 'desk.seed.b17@example.test', age: 0, gender: 'male', guardianName: 'Mohit Saxena', guardianRelation: 'father', address: 'Hazratganj' },
  { id: 'e2300002-0000-4000-8000-000000000012', name: 'Geeta Kumari', phone: '9000010118', email: 'desk.seed.b18@example.test', age: 74, gender: 'female', guardianName: 'Rekha Kumari', guardianRelation: 'daughter', address: 'Patna Boring Road' },
  { id: 'e2300002-0000-4000-8000-000000000013', name: 'Jatin Oberoi', phone: '9000010119', email: 'desk.seed.b19@example.test', age: 29, gender: 'male', guardianName: 'Harish Oberoi', guardianRelation: 'father', address: 'Amritsar' },
  { id: 'e2300002-0000-4000-8000-000000000014', name: 'Noor Fatima', phone: '9000010120', email: 'desk.seed.b20@example.test', age: 35, gender: 'female', guardianName: 'Asif Ali', guardianRelation: 'spouse', address: 'Bhopal' },
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
      guardian_name: p.guardianName,
      guardian_relation: p.guardianRelation,
      address: p.address,
      doctor_id: DOCTOR_ID,
      platform: null,
      platform_external_id: null,
      consent_status: 'granted',
      consent_granted_at: now,
      consent_method: 'manual_sql_seed',
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
