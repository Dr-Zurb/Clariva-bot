/**
 * Seed 10 in-clinic walk-ins on Dr Zurb for today (flow + medicine-combo check).
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-flow-ten-2026-09-08.ts
 */

import { getSupabaseAdminClient } from "../src/config/database";

const DOCTOR_ID = "cb33af77-0878-4f7a-a728-fe8cdd8701ed";
const NOTES = "flow seed ten 2026-09-08";

const PEOPLE: Array<{
  pid: string;
  aid: string;
  name: string;
  phone: string;
  email: string;
  age: number;
  gender: "female" | "male";
  reason: string;
}> = [
  {
    pid: "c8090001-0000-4000-8000-000000000001",
    aid: "d8090001-0000-4000-8000-000000000001",
    name: "Kavya Menon",
    phone: "9000080901",
    email: "flow.zurb.21@example.test",
    age: 29,
    gender: "female",
    reason: "Fever and body ache",
  },
  {
    pid: "c8090001-0000-4000-8000-000000000002",
    aid: "d8090001-0000-4000-8000-000000000002",
    name: "Amit Kulkarni",
    phone: "9000080902",
    email: "flow.zurb.22@example.test",
    age: 44,
    gender: "male",
    reason: "Acidity / gastritis",
  },
  {
    pid: "c8090001-0000-4000-8000-000000000003",
    aid: "d8090001-0000-4000-8000-000000000003",
    name: "Riya Banerjee",
    phone: "9000080903",
    email: "flow.zurb.23@example.test",
    age: 33,
    gender: "female",
    reason: "Headache",
  },
  {
    pid: "c8090001-0000-4000-8000-000000000004",
    aid: "d8090001-0000-4000-8000-000000000004",
    name: "Sanjay Rao",
    phone: "9000080904",
    email: "flow.zurb.24@example.test",
    age: 51,
    gender: "male",
    reason: "Diabetes follow-up",
  },
  {
    pid: "c8090001-0000-4000-8000-000000000005",
    aid: "d8090001-0000-4000-8000-000000000005",
    name: "Nandini Iyer",
    phone: "9000080905",
    email: "flow.zurb.25@example.test",
    age: 26,
    gender: "female",
    reason: "Cough and cold",
  },
  {
    pid: "c8090001-0000-4000-8000-000000000006",
    aid: "d8090001-0000-4000-8000-000000000006",
    name: "Vivek Sharma",
    phone: "9000080906",
    email: "flow.zurb.26@example.test",
    age: 38,
    gender: "male",
    reason: "Back pain",
  },
  {
    pid: "c8090001-0000-4000-8000-000000000007",
    aid: "d8090001-0000-4000-8000-000000000007",
    name: "Priya Nair",
    phone: "9000080907",
    email: "flow.zurb.27@example.test",
    age: 31,
    gender: "female",
    reason: "Allergy flare-up",
  },
  {
    pid: "c8090001-0000-4000-8000-000000000008",
    aid: "d8090001-0000-4000-8000-000000000008",
    name: "Harish Gupta",
    phone: "9000080908",
    email: "flow.zurb.28@example.test",
    age: 62,
    gender: "male",
    reason: "BP check",
  },
  {
    pid: "c8090001-0000-4000-8000-000000000009",
    aid: "d8090001-0000-4000-8000-000000000009",
    name: "Tara Fernandes",
    phone: "9000080909",
    email: "flow.zurb.29@example.test",
    age: 23,
    gender: "female",
    reason: "Sore throat",
  },
  {
    pid: "c8090001-0000-4000-8000-00000000000a",
    aid: "d8090001-0000-4000-8000-00000000000a",
    name: "Mohit Verma",
    phone: "9000080910",
    email: "flow.zurb.30@example.test",
    age: 40,
    gender: "male",
    reason: "Vitamin deficiency",
  },
];

function kolkataYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function slotIso(index: number): string {
  const start = Date.now() + 2 * 60_000;
  return new Date(start + index * 5 * 60_000).toISOString();
}

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error("Admin client unavailable");
    process.exit(1);
  }

  const now = new Date().toISOString();
  const sessionDate = kolkataYmd();
  const slots = PEOPLE.map((_, i) => slotIso(i));

  const { data: lastTokenRow, error: tokenErr } = await admin
    .from("opd_queue_entries")
    .select("token_number")
    .eq("doctor_id", DOCTOR_ID)
    .eq("session_date", sessionDate)
    .order("token_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tokenErr) {
    console.error("token lookup failed:", tokenErr.message);
    process.exit(1);
  }
  const tokenBase = (lastTokenRow?.token_number ?? 0) + 1;

  const { error: pErr } = await admin.from("patients").upsert(
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
      consent_status: "granted",
      consent_granted_at: now,
      consent_method: "manual_sql_seed",
      registered_via: "front_desk",
      created_by: DOCTOR_ID,
    })),
    { onConflict: "id" },
  );
  if (pErr) {
    console.error("patients upsert failed:", pErr.message);
    process.exit(1);
  }

  for (const person of PEOPLE) {
    const { error: mrnErr } = await admin.rpc("assign_patient_mrn", {
      p_patient_id: person.pid,
    });
    if (mrnErr) {
      console.error("assign_patient_mrn failed:", mrnErr.message);
      process.exit(1);
    }
  }

  const { error: aErr } = await admin.from("appointments").upsert(
    PEOPLE.map((p, i) => ({
      id: p.aid,
      doctor_id: DOCTOR_ID,
      patient_id: p.pid,
      patient_name: p.name,
      patient_phone: p.phone,
      appointment_date: slots[i],
      status: "confirmed",
      reason_for_visit: p.reason,
      consultation_type: "in_clinic",
      opd_event_type: "standard",
      booking_origin: "walk_in",
      notes: NOTES,
      patient_checked_in_at: now,
    })),
    { onConflict: "id" },
  );
  if (aErr) {
    console.error("appointments upsert failed:", aErr.message);
    process.exit(1);
  }

  const appointmentIds = PEOPLE.map((p) => p.aid);
  const { error: delErr } = await admin
    .from("opd_queue_entries")
    .delete()
    .in("appointment_id", appointmentIds);
  if (delErr) {
    console.error("queue cleanup failed:", delErr.message);
    process.exit(1);
  }

  const { error: qErr } = await admin.from("opd_queue_entries").insert(
    PEOPLE.map((p, i) => ({
      doctor_id: DOCTOR_ID,
      appointment_id: p.aid,
      session_date: sessionDate,
      token_number: tokenBase + i,
      position: tokenBase + i,
      status: "waiting",
    })),
  );
  if (qErr) {
    console.error("queue insert failed:", qErr.message);
    process.exit(1);
  }

  console.log(
    `Seeded ${PEOPLE.length} walk-ins on Dr Zurb for ${sessionDate} (tokens ${tokenBase}–${tokenBase + 9})`,
  );
  PEOPLE.forEach((p, i) => {
    const t = new Date(slots[i]!).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    console.log(`  #${tokenBase + i}  ${t}  ${p.name}`);
  });
}

void main();
