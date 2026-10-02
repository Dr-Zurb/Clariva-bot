/**
 * Remove OPD visits scheduled for today (Asia/Kolkata) and later.
 * Patient chart rows stay. Prints counts only — never names or phones.
 *
 *   npx ts-node -r dotenv/config scripts/clear-future-opd-2026-09-22.ts
 *   npx ts-node -r dotenv/config scripts/clear-future-opd-2026-09-22.ts --apply
 */

import { getSupabaseAdminClient } from '../src/config/database';

const FROM_YMD = '2026-09-22';
const FROM_ISO = '2026-09-21T18:30:00.000Z';

function isSeedNote(notes: string | null): boolean {
  if (!notes) return false;
  return /seed|demo|dummy|manual_sql|flow seed|pack suggestion/i.test(notes);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Admin client unavailable');
    process.exit(1);
  }

  const queueByDate = new Map<string, number>();
  const queueIds: string[] = [];
  const appointmentIds = new Set<string>();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('opd_queue_entries')
      .select('id, appointment_id, session_date, doctor_id')
      .gte('session_date', FROM_YMD)
      .range(from, from + 999);
    if (error) {
      console.error('queue list failed:', error.message);
      process.exit(1);
    }
    const rows = data ?? [];
    for (const row of rows) {
      const day = String(row.session_date);
      queueByDate.set(day, (queueByDate.get(day) ?? 0) + 1);
      queueIds.push(row.id as string);
      if (row.appointment_id) appointmentIds.add(row.appointment_id as string);
    }
    if (rows.length < 1000) break;
  }

  let seedNotes = 0;
  let otherNotes = 0;
  let blankNotes = 0;
  let dummyPhone = 0;
  const originCounts = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('appointments')
      .select('id, booking_origin, notes, appointment_date, patient_phone')
      .gte('appointment_date', FROM_ISO)
      .range(from, from + 999);
    if (error) {
      console.error('appointment list failed:', error.message);
      process.exit(1);
    }
    const rows = data ?? [];
    for (const row of rows) {
      appointmentIds.add(row.id as string);
      const origin = (row.booking_origin as string | null) ?? '(none)';
      originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
      const notes = (row.notes as string | null) ?? null;
      if (!notes?.trim()) blankNotes += 1;
      else if (isSeedNote(notes)) seedNotes += 1;
      else otherNotes += 1;
      const phone = String(row.patient_phone ?? '').replace(/\D/g, '');
      if (phone.startsWith('90000') || phone === '8264602737') dummyPhone += 1;
      const day = new Date(String(row.appointment_date)).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
      });
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    if (rows.length < 1000) break;
  }

  const withPayment = new Set<string>();
  const idList = [...appointmentIds];
  for (let i = 0; i < idList.length; i += 200) {
    const slice = idList.slice(i, i + 200);
    const { data, error } = await admin
      .from('visit_payments')
      .select('appointment_id')
      .in('appointment_id', slice);
    if (error) {
      console.error('payment list failed:', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) withPayment.add(row.appointment_id as string);
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        fromYmd: FROM_YMD,
        queueEntries: queueIds.length,
        queueByDate: Object.fromEntries([...queueByDate.entries()].sort()),
        appointments: appointmentIds.size,
        withVisitPayment: withPayment.size,
        bookingOrigin: Object.fromEntries(originCounts),
        byDay: Object.fromEntries([...byDay.entries()].sort()),
        notes: { seed: seedNotes, other: otherNotes, blank: blankNotes },
        dummyPhonePattern: dummyPhone,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log('Dry run. Re-run with --apply to delete these visits.');
    return;
  }

  const deletable = idList.filter((id) => !withPayment.has(id));
  const parked = idList.filter((id) => withPayment.has(id));

  for (let i = 0; i < deletable.length; i += 200) {
    const slice = deletable.slice(i, i + 200);
    for (const table of ['billing_usage_ledger', 'billable_consults'] as const) {
      const { error: childErr } = await admin.from(table).delete().in('appointment_id', slice);
      if (childErr && !/does not exist|schema cache/i.test(childErr.message)) {
        console.error(`${table} delete failed:`, childErr.message);
        process.exit(1);
      }
    }
    const { error: qErr } = await admin.from('opd_queue_entries').delete().in('appointment_id', slice);
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

  // visit_payments is append-only, so those visits cannot be erased.
  // Pull them off every current and future OPD day instead.
  for (let i = 0; i < parked.length; i += 200) {
    const slice = parked.slice(i, i + 200);
    const { error: qErr } = await admin.from('opd_queue_entries').delete().in('appointment_id', slice);
    if (qErr) {
      console.error('queue delete failed:', qErr.message);
      process.exit(1);
    }
    const { error: aErr } = await admin
      .from('appointments')
      .update({
        status: 'cancelled',
        appointment_date: '2020-01-01T00:00:00.000Z',
      })
      .in('id', slice);
    if (aErr) {
      console.error('appointment park failed:', aErr.message);
      process.exit(1);
    }
  }

  if (queueIds.length > 0) {
    for (let i = 0; i < queueIds.length; i += 200) {
      const { error: qErr } = await admin
        .from('opd_queue_entries')
        .delete()
        .in('id', queueIds.slice(i, i + 200));
      if (qErr) {
        console.error('leftover queue delete failed:', qErr.message);
        process.exit(1);
      }
    }
  }

  console.log(
    `Cleared ${FROM_YMD} onward: deleted ${deletable.length}, moved ${parked.length} off the calendar (payment rows are append-only).`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'failed');
  process.exit(1);
});
