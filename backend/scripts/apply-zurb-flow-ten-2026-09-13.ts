/**
 * Seed 10 in-clinic walk-ins on Dr Zurb for today (flow testing).
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-flow-ten-2026-09-13.ts
 */

import { getSupabaseAdminClient } from "../src/config/database";

const DOCTOR_ID = "cb33af77-0878-4f7a-a728-fe8cdd8701ed";
const NOTES = "flow seed ten 2026-09-13";

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
    pid: "c9130001-0000-4000-8000-000000000001",
    aid: "d9130001-0000-4000-8000-000000000001",
    name: "Neha Kapoor",
    phone: "9000091301",
    email: "flow.zurb.36@example.test",
    age: 32,
    gender: "female",
    reason: "Fever 2 days",
  },
  {
    pid: "c9130001-0000-4000-8000-000000000002",
    aid: "d9130001-0000-4000-8000-000000000002",
    name: "Arjun Sethi",
    phone: "9000091302",
    email: "flow.zurb.37@example.test",
    age: 45,
    gender: "male",
    reason: "Knee pain",
  },
  {
    pid: "c9130001-0000-4000-8000-000000000003",
    aid: "d9130001-0000-4000-8000-000000000003",
    name: "Pooja Nambiar",
    phone: "9000091303",
    email: "flow.zurb.38@example.test",
    age: 28,
    gender: "female",
    reason: "Cough and cold",
  },
  {
    pid: "c9130001-0000-4000-8000-000000000004",
    aid: "d9130001-0000-4000-8000-000000000004",
    name: "Dev Malhotra",
    phone: "9000091304",
    email: "flow.zurb.39@example.test",
    age: 54,
    gender: "male",
    reason: "Diabetes follow-up",
  },
  {
    pid: "c9130001-0000-4000-8000-000000000005",
    aid: "d9130001-0000-4000-8000-000000000005",
    name: "Shreya Bhat",
    phone: "9000091305",
    email: "flow.zurb.40@example.test",
    age: 21,
    gender: "female",
    reason: "Acne review",
  },
  {
    pid: "c9130001-0000-4000-8000-000000000006",
    aid: "d9130001-0000-4000-8000-000000000006",
    name: "Farhan Qureshi",
    phone: "9000091306",
    email: "flow.zurb.41@example.test",
    age: 39,
    gender: "male",
    reason: "BP check",
  },
  {
    pid: "c9130001-0000-4000-8000-000000000007",
    aid: "d9130001-0000-4000-8000-000000000007",
    name: "Kiran Joshi",
    phone: "9000091307",
    email: "flow.zurb.42@example.test",
    age: 36,
    gender: "female",
    reason: "Headache",
  },
  {
    pid: "c9130001-0000-4000-8000-000000000008",
    aid: "d9130001-0000-4000-8000-000000000008",
    name: "Ramesh Iyer",
    phone: "9000091308",
    email: "flow.zurb.43@example.test",
    age: 63,
    gender: "male",
    reason: "Back pain",
  },
  {
    pid: "c9130001-0000-4000-8000-000000000009",
    aid: "d9130001-0000-4000-8000-000000000009",
    name: "Aditi Grover",
    phone: "9000091309",
    email: "flow.zurb.44@example.test",
    age: 25,
    gender: "female",
    reason: "Allergy flare-up",
  },
  {
    pid: "c9130001-0000-4000-8000-00000000000a",
    aid: "d9130001-0000-4000-8000-00000000000a",
    name: "Siddharth Rao",
    phone: "9000091310",
    email: "flow.zurb.45@example.test",
    age: 42,
    gender: "male",
    reason: "Acidity / gastritis",
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

  const dayStart = `${sessionDate}T00:00:00+05:30`;
  const dayEnd = `${sessionDate}T23:59:59.999+05:30`;
  const seededIds = PEOPLE.map((p) => p.aid);

  const { data: dayApts, error: dayErr } = await admin
    .from("appointments")
    .select("id, opd_queue_entry:opd_queue_entries(token_number)")
    .eq("doctor_id", DOCTOR_ID)
    .gte("appointment_date", dayStart)
    .lte("appointment_date", dayEnd)
    .neq("status", "cancelled");
  if (dayErr) {
    console.error("day lookup failed:", dayErr.message);
    process.exit(1);
  }

  const existing = (dayApts ?? []).filter((row) => !seededIds.includes(row.id));
  let tokenBase = existing.length + 1;
  for (const row of existing) {
    const entry = Array.isArray(row.opd_queue_entry)
      ? row.opd_queue_entry[0]
      : row.opd_queue_entry;
    const token = entry?.token_number;
    if (typeof token === "number" && token + 1 > tokenBase) {
      tokenBase = token + 1;
    }
  }

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
    `Seeded ${PEOPLE.length} walk-ins on Dr Zurb for ${sessionDate} (tokens ${tokenBase}–${tokenBase + PEOPLE.length - 1})`,
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
