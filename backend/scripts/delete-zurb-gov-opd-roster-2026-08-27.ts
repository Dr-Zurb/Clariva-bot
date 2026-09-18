/**
 * Undo apply-zurb-gov-opd-roster-2026-08-27.ts
 * Run from backend:
 *   npx ts-node -r dotenv/config scripts/delete-zurb-gov-opd-roster-2026-08-27.ts
 */

import { getSupabaseAdminClient } from '../src/config/database';

const DOCTOR_ID = 'cb33af77-0878-4f7a-a728-fe8cdd8701ed';
const CONSENT_METHOD = 'gov_opd_import_2026-08-27';

async function main(): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: rows, error: listErr } = await admin
      .from('patients')
      .select('id')
      .eq('doctor_id', DOCTOR_ID)
      .eq('consent_method', CONSENT_METHOD)
      .range(from, from + pageSize - 1);
    if (listErr) {
      console.error('list failed:', listErr.message);
      process.exit(1);
    }
    const batch = (rows ?? []).map((r) => r.id as string);
    ids.push(...batch);
    if (batch.length < pageSize) break;
  }

  if (ids.length === 0) {
    console.log('No imported roster rows to delete');
    return;
  }

  const appointmentIds: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { data: appts, error: aptListErr } = await admin
      .from('appointments')
      .select('id')
      .in('patient_id', slice);
    if (aptListErr) {
      console.error('appointment list failed:', aptListErr.message);
      process.exit(1);
    }
    for (const row of appts ?? []) appointmentIds.push(row.id as string);
  }

  for (let i = 0; i < appointmentIds.length; i += 200) {
    const slice = appointmentIds.slice(i, i + 200);
    const { error: qErr } = await admin
      .from('opd_queue_entries')
      .delete()
      .in('appointment_id', slice);
    if (qErr) {
      console.error('queue delete failed:', qErr.message);
      process.exit(1);
    }
    const { error: aErr } = await admin.from('appointments').delete().in('id', slice);
    if (aErr) {
      console.error('appointment delete failed:', aErr.message);
      process.exit(1);
    }
  }

  for (let i = 0; i < ids.length; i += 200) {
    const { error: pErr } = await admin.from('patients').delete().in('id', ids.slice(i, i + 200));
    if (pErr) {
      console.error('patient delete failed:', pErr.message);
      process.exit(1);
    }
  }

  console.log(`Deleted ${ids.length} imported patients (${appointmentIds.length} appointments)`);
}

void main();
