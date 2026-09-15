/**
 * Seed 10 in-clinic walk-ins on Dr Zurb for today (flow testing).
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/apply-zurb-flow-ten-2026-09-14.ts
 */

import { getSupabaseAdminClient } from "../src/config/database";

const DOCTOR_ID = "cb33af77-0878-4f7a-a728-fe8cdd8701ed";
const NOTES = "flow seed ten 2026-09-14";

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
    pid: "c9140001-0000-4000-8000-000000000001",
    aid: "d9140001-0000-4000-8000-000000000001",
    name: "Meera Kulkarni",
    phone: "9000091401",
    email: "flow.zurb.46@example.test",
    age: 29,
    gender: "female",
    reason: "Sore throat",
  },
  {
    pid: "c9140001-0000-4000-8000-000000000002",
    aid: "d9140001-0000-4000-8000-000000000002",
    name: "Vikram Anand",
    phone: "9000091402",
    email: "flow.zurb.47@example.test",
    age: 51,
    gender: "male",
    reason: "Chest tightness",
  },
  {
    pid: "c9140001-0000-4000-8000-000000000003",
    aid: "d9140001-0000-4000-8000-000000000003",
    name: "Ananya Pillai",
    phone: "9000091403",
    email: "flow.zurb.48@example.test",
    age: 34,
    gender: "female",
    reason: "Migraine",
  },
  {
    pid: "c9140001-0000-4000-8000-000000000004",
    aid: "d9140001-0000-4000-8000-000000000004",
    name: "Rohit Deshmukh",
    phone: "9000091404",
    email: "flow.zurb.49@example.test",
    age: 47,
    gender: "male",
    reason: "Thyroid review",
  },
  {
    pid: "c9140001-0000-4000-8000-000000000005",
    aid: "d9140001-0000-4000-8000-000000000005",
    name: "Sana Sheikh",
    phone: "9000091405",
    email: "flow.zurb.50@example.test",
    age: 26,
    gender: "female",
    reason: "Skin rash",
  },
  {
    pid: "c9140001-0000-4000-8000-000000000006",
    aid: "d9140001-0000-4000-8000-000000000006",
    name: "Kabir Menon",
    phone: "9000091406",
    email: "flow.zurb.51@example.test",
    age: 38,
    gender: "male",
    reason: "Insomnia",
  },
  {
    pid: "c9140001-0000-4000-8000-000000000007",
    aid: "d9140001-0000-4000-8000-000000000007",
    name: "Divya Reddy",
    phone: "9000091407",
    email: "flow.zurb.52@example.test",
    age: 41,
    gender: "female",
    reason: "Joint pain",
  },
  {
    pid: "c9140001-0000-4000-8000-000000000008",
    aid: "d9140001-0000-4000-8000-000000000008",
    name: "Harsh Vardhan",
    phone: "9000091408",
    email: "flow.zurb.53@example.test",
    age: 58,
    gender: "male",
    reason: "Cholesterol check",
  },
  {
    pid: "c9140001-0000-4000-8000-000000000009",
    aid: "d9140001-0000-4000-8000-000000000009",
    name: "Nisha Ahuja",
    phone: "9000091409",
    email: "flow.zurb.54@example.test",
    age: 22,
    gender: "female",
    reason: "Hair fall",
  },
  {
    pid: "c9140001-0000-4000-8000-00000000000a",
    aid: "d9140001-0000-4000-8000-00000000000a",
    name: "Tarun Bedi",
    phone: "9000091410",
    email: "flow.zurb.55@example.test",
    age: 44,
    gender: "male",
    reason: "Breathlessness",
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
