/**
 * Undo apply-zurb-flow-five-2026-09-09.ts
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/delete-zurb-flow-five-2026-09-09.ts
 */

import { getSupabaseAdminClient } from "../src/config/database";

const PATIENT_IDS = [
  "c9090001-0000-4000-8000-000000000001",
  "c9090001-0000-4000-8000-000000000002",
  "c9090001-0000-4000-8000-000000000003",
  "c9090001-0000-4000-8000-000000000004",
  "c9090001-0000-4000-8000-000000000005",
];

const APPOINTMENT_IDS = [
  "d9090001-0000-4000-8000-000000000001",
  "d9090001-0000-4000-8000-000000000002",
  "d9090001-0000-4000-8000-000000000003",
  "d9090001-0000-4000-8000-000000000004",
  "d9090001-0000-4000-8000-000000000005",
];

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error("Admin client unavailable");
    process.exit(1);
  }

  const { error: qErr } = await admin
    .from("opd_queue_entries")
    .delete()
    .in("appointment_id", APPOINTMENT_IDS);
  if (qErr) {
    console.error("queue delete failed:", qErr.message);
    process.exit(1);
  }

  const { error: aErr } = await admin
    .from("appointments")
    .delete()
    .in("id", APPOINTMENT_IDS);
  if (aErr) {
    console.error("appointment delete failed:", aErr.message);
    process.exit(1);
  }

  const { error: pErr } = await admin
    .from("patients")
    .delete()
    .in("id", PATIENT_IDS);
  if (pErr) {
    console.error("patient delete failed:", pErr.message);
    process.exit(1);
  }

  console.log(`Deleted ${PATIENT_IDS.length} seeded walk-ins`);
}

void main();
