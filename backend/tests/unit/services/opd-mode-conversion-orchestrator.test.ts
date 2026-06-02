/**
 * Orchestrator integration tests for `convertSessionDayMode` (pdm-04).
 * Runs against an **in-memory stateful Supabase mock** — no live DB. Covers
 * the five scenarios called out in the task spec (Step 8 acceptance):
 *
 *   1. Happy path slot → queue (3 appointments → 3 queue entries; audit row).
 *   2. Flip back queue → slot (change_count = 1; 2 audit rows total).
 *   3. Same-target concurrency (`Promise.all([convert, convert])` → idempotent
 *      second call; ONE audit row).
 *   4. Cross-mode concurrency (`Promise.all([→queue, →slot])` → serial outcome,
 *      consistent fact row).
 *   5. Dry-run preview (NO rows persisted in any of the three tables).
 *
 * The mock is intentionally minimal: it implements only the chain shapes
 * the orchestrator + `loadOpdSessionPayload` actually use, so a behavioural
 * regression in the orchestrator surfaces as a real test failure rather
 * than a mock-coverage gap.
 *
 * @see backend/src/services/opd/opd-mode-conversion-service.ts
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ----------------------------------------------------------------------------
// 1. Mock heavy downstream imports BEFORE the orchestrator imports them.
//    `loadOpdSessionPayload` lives in `opd-session-service.ts` which
//    transitively pulls in `@react-pdf/renderer` (ESM, Jest can't parse it
//    out-of-the-box). We replace it with a stub that reads the in-memory
//    fact-table state and returns a thin payload.
// ----------------------------------------------------------------------------

jest.mock('../../../src/services/opd-session-service', () => ({
  loadOpdSessionPayload: jest.fn(),
  loadOpdSessionPayloadForDoctor: jest.fn(),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  __resetConversionServiceCaches,
  convertSessionDayMode,
} from '../../../src/services/opd/opd-mode-conversion-service';
import * as sessionService from '../../../src/services/opd-session-service';
import * as doctorSettingsService from '../../../src/services/doctor-settings-service';

const mockedSession = sessionService as jest.Mocked<typeof sessionService>;
const mockedSettings = doctorSettingsService as jest.Mocked<typeof doctorSettingsService>;

// ----------------------------------------------------------------------------
// 2. Minimal in-memory Supabase mock with PostgREST-shaped chain.
// ----------------------------------------------------------------------------

interface FactRow {
  doctor_id: string;
  session_date: string;
  mode: 'slot' | 'queue';
  change_count: number;
  source: string;
  changed_at: string;
  updated_at: string;
}

interface AuditRow {
  doctor_id: string;
  session_date: string;
  from_mode: 'slot' | 'queue' | null;
  to_mode: 'slot' | 'queue';
  affected_apt_count: number;
  overflow_count: number;
  notification_dispatched: boolean;
  triggered_by: string;
  correlation_id: string;
  notes: string | null;
  created_at: string;
}

interface QueueRow {
  doctor_id: string;
  appointment_id: string;
  session_date: string;
  token_number: number;
  position: number;
  status: string;
}

interface AppointmentRow {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  appointment_date: string;
  status: string;
  consultation_type: string | null;
  opd_event_type: 'standard' | 'return_after_completed' | null;
  opd_session_delay_minutes: number | null;
  opd_early_invite_expires_at: string | null;
  opd_early_invite_response: string | null;
  created_at: string;
}

interface AvailabilityRow {
  doctor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

interface PendingNotificationRow {
  doctor_id: string;
  session_date: string;
  first_flip_at: string;
  latest_flip_at: string;
  scheduled_for: string;
  first_flip_mode: 'slot' | 'queue';
  latest_flip_mode: 'slot' | 'queue';
  payload_json: Record<string, unknown>;
}

interface Store {
  fact: FactRow[];
  audit: AuditRow[];
  queue: QueueRow[];
  appointments: AppointmentRow[];
  availability: AvailabilityRow[];
  pendingNotifications: PendingNotificationRow[];
}

function freshStore(): Store {
  return {
    fact: [],
    audit: [],
    queue: [],
    appointments: [],
    availability: [],
    pendingNotifications: [],
  };
}

type Filter = { type: 'eq' | 'gte' | 'lt' | 'in' | 'is'; col: string; value: unknown };

class Chain {
  private filters: Filter[] = [];
  private orderCol: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private updates: Record<string, unknown> | null = null;
  private insertRows: Record<string, unknown>[] | null = null;
  private upsertRows: Record<string, unknown>[] | null = null;
  private upsertOnConflict: string | null = null;
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';

  constructor(private readonly store: Store, private readonly table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }): Chain {
    if (opts?.head) {
      // `select(_, { head: true })` used by the notification probe — treat
      // as a select with limit 0.
      this.limitN = 0;
    }
    this.mode = this.mode === 'select' ? 'select' : this.mode;
    return this;
  }
  eq(col: string, value: unknown): Chain {
    this.filters.push({ type: 'eq', col, value });
    return this;
  }
  gte(col: string, value: unknown): Chain {
    this.filters.push({ type: 'gte', col, value });
    return this;
  }
  lt(col: string, value: unknown): Chain {
    this.filters.push({ type: 'lt', col, value });
    return this;
  }
  in(col: string, values: unknown[]): Chain {
    this.filters.push({ type: 'in', col, value: values });
    return this;
  }
  is(col: string, value: unknown): Chain {
    this.filters.push({ type: 'is', col, value });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): Chain {
    this.orderCol = { col, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number): Chain {
    this.limitN = n;
    return this;
  }
  update(values: Record<string, unknown>): Chain {
    this.updates = values;
    this.mode = 'update';
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): Chain {
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.mode = 'insert';
    return this;
  }
  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string }
  ): Chain {
    this.upsertRows = Array.isArray(rows) ? rows : [rows];
    this.upsertOnConflict = opts?.onConflict ?? null;
    this.mode = 'upsert';
    return this;
  }
  delete(): Chain {
    this.mode = 'delete';
    return this;
  }

  async maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    const rows = this.executeSelect();
    return { data: rows[0] ?? null, error: null };
  }
  async single(): Promise<{ data: unknown; error: unknown }> {
    const rows = this.executeSelect();
    return { data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116', message: 'No rows' } };
  }

  // Terminal — thenable so `await chain` works (matches PostgREST builder).
  then(
    resolve: (v: { data: unknown; error: unknown }) => unknown,
    reject?: (err: unknown) => unknown
  ): void {
    try {
      let result: { data: unknown; error: unknown };
      if (this.mode === 'select') {
        result = { data: this.executeSelect(), error: null };
      } else if (this.mode === 'insert') {
        result = this.executeInsert();
      } else if (this.mode === 'upsert') {
        result = this.executeUpsert();
      } else if (this.mode === 'update') {
        result = this.executeUpdate();
      } else if (this.mode === 'delete') {
        result = this.executeDelete();
      } else {
        result = { data: null, error: null };
      }
      resolve(result);
    } catch (err) {
      if (reject) reject(err);
      else throw err;
    }
  }

  private getRows(): Record<string, unknown>[] {
    if (this.table === 'doctor_opd_session_modes') {
      return this.store.fact as unknown as Record<string, unknown>[];
    }
    if (this.table === 'doctor_opd_session_mode_changes') {
      return this.store.audit as unknown as Record<string, unknown>[];
    }
    if (this.table === 'opd_queue_entries') {
      return this.store.queue as unknown as Record<string, unknown>[];
    }
    if (this.table === 'appointments') {
      return this.store.appointments as unknown as Record<string, unknown>[];
    }
    if (this.table === 'availability') {
      return this.store.availability as unknown as Record<string, unknown>[];
    }
    if (this.table === 'doctor_opd_pending_mode_notifications') {
      return this.store.pendingNotifications as unknown as Record<string, unknown>[];
    }
    return [];
  }

  private executeSelect(): Record<string, unknown>[] {
    let rows = this.matching();
    if (this.orderCol) {
      const { col, ascending } = this.orderCol;
      rows = [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        if (av == null) return ascending ? -1 : 1;
        if (bv == null) return ascending ? 1 : -1;
        return ascending ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  private matching(): Record<string, unknown>[] {
    return this.getRows().filter((row) => {
      for (const f of this.filters) {
        const v = row[f.col];
        if (f.type === 'eq' && v !== f.value) return false;
        if (f.type === 'gte') {
          if (typeof v === 'string' && typeof f.value === 'string') {
            if (v < f.value) return false;
          } else if ((v as number) < (f.value as number)) {
            return false;
          }
        }
        if (f.type === 'lt') {
          if (typeof v === 'string' && typeof f.value === 'string') {
            if (v >= f.value) return false;
          } else if ((v as number) >= (f.value as number)) {
            return false;
          }
        }
        if (f.type === 'in' && !(f.value as unknown[]).includes(v)) return false;
        if (f.type === 'is' && v !== f.value) return false;
      }
      return true;
    });
  }

  private executeInsert(): { data: unknown; error: unknown } {
    const target = this.getRows();
    for (const r of this.insertRows ?? []) target.push(r as Record<string, unknown>);
    return { data: this.insertRows, error: null };
  }

  private executeUpsert(): { data: unknown; error: unknown } {
    const rows = this.getRows();
    const keyCols = (this.upsertOnConflict ?? '').split(',').map((c) => c.trim());
    for (const newRow of this.upsertRows ?? []) {
      const existingIdx = rows.findIndex((r) =>
        keyCols.every((k) => r[k] === newRow[k])
      );
      if (existingIdx >= 0) {
        rows[existingIdx] = { ...rows[existingIdx], ...newRow };
      } else {
        rows.push(newRow as Record<string, unknown>);
      }
    }
    return { data: this.upsertRows, error: null };
  }

  private executeUpdate(): { data: unknown; error: unknown } {
    // `this.matching()` walks `this.getRows()` already and returns live
    // references; mutating each touches the underlying store.
    const matched = this.matching();
    for (const r of matched) {
      Object.assign(r, this.updates ?? {});
    }
    return { data: matched, error: null };
  }

  private executeDelete(): { data: unknown; error: unknown } {
    const rows = this.getRows();
    const matched = this.matching();
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (matched.includes(rows[i]!)) {
        rows.splice(i, 1);
      }
    }
    return { data: matched, error: null };
  }
}

function mockSupabase(store: Store) {
  return {
    from: (table: string) => new Chain(store, table),
  };
}

// ----------------------------------------------------------------------------
// 3. Fixture helpers
// ----------------------------------------------------------------------------

const doctorId = 'doctor-aaa';
const sessionDate = '2026-05-18';
const timezone = 'Asia/Kolkata';

function seedSlotAppointments(
  store: Store,
  rows: Array<Partial<AppointmentRow> & { id: string; appointment_date: string }>
): void {
  for (const r of rows) {
    store.appointments.push({
      doctor_id: doctorId,
      patient_id: null,
      status: 'pending',
      consultation_type: 'in_clinic',
      opd_event_type: 'standard',
      opd_session_delay_minutes: null,
      opd_early_invite_expires_at: null,
      opd_early_invite_response: null,
      created_at: '2026-05-17T00:00:00.000Z',
      ...r,
    });
  }
}

function seedAvailability(store: Store): void {
  // Mon-Sun 09:00–13:00 local, 30-min interval. Mostly used for queue→slot tests.
  for (let dow = 0; dow < 7; dow += 1) {
    store.availability.push({
      doctor_id: doctorId,
      day_of_week: dow,
      start_time: '09:00:00',
      end_time: '13:00:00',
      is_available: true,
    });
  }
}

// ----------------------------------------------------------------------------
// 4. Tests
// ----------------------------------------------------------------------------

describe('convertSessionDayMode (pdm-04 orchestrator)', () => {
  let store: Store;
  let supabase: ReturnType<typeof mockSupabase>;

  beforeEach(() => {
    __resetConversionServiceCaches();
    store = freshStore();
    supabase = mockSupabase(store);
    mockedSettings.getDoctorSettings.mockResolvedValue({
      doctor_id: doctorId,
      timezone,
      slot_interval_minutes: 30,
      opd_mode: 'slot',
      opd_policies: null,
    } as never);
    mockedSession.loadOpdSessionPayload.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (_supabase: unknown, _doctorId: unknown, date: unknown, _correlationId: unknown) => {
        const fact = store.fact[0];
        return {
          mode: fact?.mode ?? 'slot',
          date: date as string,
          snapshotAt: '2026-05-17T00:00:00.000Z',
          modeSource: fact ? 'fact' : 'default',
          modeChangeCount: fact?.change_count ?? 0,
          entries: [],
          counts: {
            all: 0,
            upcoming: 0,
            running_late: 0,
            in_consultation: 0,
            completed: 0,
            missed: 0,
            cancelled: 0,
            overflow: 0,
          },
        } as never;
      }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('scenario 1 — happy path slot → queue (3 appointments → 3 queue entries; audit row)', async () => {
    seedSlotAppointments(store, [
      { id: 'a', appointment_date: '2026-05-18T04:00:00.000Z', created_at: '2026-05-17T08:00:00.000Z' },
      { id: 'b', appointment_date: '2026-05-18T04:30:00.000Z', created_at: '2026-05-17T08:30:00.000Z' },
      { id: 'c', appointment_date: '2026-05-18T05:00:00.000Z', created_at: '2026-05-17T09:00:00.000Z' },
    ]);

    const result = await convertSessionDayMode(supabase as never, doctorId, sessionDate, 'queue', {
      correlationId: 'corr-1',
      triggeredBy: 'doctor',
    });

    expect(result.fromMode).toBeNull();
    expect(result.toMode).toBe('queue');
    expect(result.affected).toBe(3);
    expect(result.overflowCount).toBe(0);
    expect(result.notificationCount).toBe(3);
    expect(result.changeCount).toBe(0);

    expect(store.fact).toHaveLength(1);
    expect(store.fact[0]).toMatchObject({
      doctor_id: doctorId,
      session_date: sessionDate,
      mode: 'queue',
      change_count: 0,
      source: 'doctor',
    });

    expect(store.queue).toHaveLength(3);
    expect(store.queue.map((q) => q.token_number).sort()).toEqual([1, 2, 3]);
    expect(new Set(store.queue.map((q) => q.appointment_id))).toEqual(
      new Set(['a', 'b', 'c'])
    );

    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]).toMatchObject({
      from_mode: null,
      to_mode: 'queue',
      affected_apt_count: 3,
      overflow_count: 0,
      triggered_by: 'doctor',
      correlation_id: 'corr-1',
    });

    // Slot-only state is cleared on appointment rows.
    expect(store.appointments.every((a) => a.opd_session_delay_minutes === null)).toBe(true);
    expect(store.appointments.every((a) => a.opd_early_invite_expires_at === null)).toBe(true);
  });

  it('scenario 2 — flip back queue → slot (change_count = 1; two audit rows)', async () => {
    seedAvailability(store);
    seedSlotAppointments(store, [
      { id: 'a', appointment_date: '2026-05-18T04:00:00.000Z', created_at: '2026-05-17T08:00:00.000Z' },
      { id: 'b', appointment_date: '2026-05-18T04:30:00.000Z', created_at: '2026-05-17T08:30:00.000Z' },
    ]);

    await convertSessionDayMode(supabase as never, doctorId, sessionDate, 'queue', {
      correlationId: 'corr-flip-1',
      triggeredBy: 'doctor',
    });
    const result = await convertSessionDayMode(supabase as never, doctorId, sessionDate, 'slot', {
      correlationId: 'corr-flip-2',
      triggeredBy: 'doctor',
    });

    expect(result.fromMode).toBe('queue');
    expect(result.toMode).toBe('slot');
    expect(result.changeCount).toBe(1);

    expect(store.queue).toHaveLength(0);
    expect(store.fact).toHaveLength(1);
    expect(store.fact[0]!.mode).toBe('slot');
    expect(store.fact[0]!.change_count).toBe(1);
    expect(store.audit).toHaveLength(2);
    expect(store.audit.map((a) => a.to_mode)).toEqual(['queue', 'slot']);
    expect(store.audit[1]!.from_mode).toBe('queue');
  });

  it('scenario 3 — same-target concurrency: Promise.all([→queue, →queue]) writes only one audit row', async () => {
    seedSlotAppointments(store, [
      { id: 'a', appointment_date: '2026-05-18T04:00:00.000Z', created_at: '2026-05-17T08:00:00.000Z' },
    ]);

    const [r1, r2] = await Promise.all([
      convertSessionDayMode(supabase as never, doctorId, sessionDate, 'queue', {
        correlationId: 'corr-c1',
        triggeredBy: 'doctor',
      }),
      convertSessionDayMode(supabase as never, doctorId, sessionDate, 'queue', {
        correlationId: 'corr-c2',
        triggeredBy: 'doctor',
      }),
    ]);

    // The first writer made the flip; the second observed `from_mode === toMode`
    // and short-circuited (affected: 0, no audit row).
    const flips = [r1, r2].filter((r) => r.affected > 0);
    const noops = [r1, r2].filter((r) => r.affected === 0);
    expect(flips).toHaveLength(1);
    expect(noops).toHaveLength(1);
    expect(noops[0]!.fromMode).toBe('queue');

    expect(store.fact).toHaveLength(1);
    expect(store.fact[0]!.mode).toBe('queue');
    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]!.correlation_id).toBe(flips[0]!.fromMode === null ? 'corr-c1' : 'corr-c2');
  });

  it('scenario 4 — cross-mode concurrency: Promise.all([→queue, →slot]) yields consistent fact + 2 audit rows', async () => {
    seedAvailability(store);
    seedSlotAppointments(store, [
      { id: 'a', appointment_date: '2026-05-18T04:00:00.000Z', created_at: '2026-05-17T08:00:00.000Z' },
    ]);

    await Promise.all([
      convertSessionDayMode(supabase as never, doctorId, sessionDate, 'queue', {
        correlationId: 'corr-x1',
        triggeredBy: 'doctor',
      }),
      convertSessionDayMode(supabase as never, doctorId, sessionDate, 'slot', {
        correlationId: 'corr-x2',
        triggeredBy: 'doctor',
      }),
    ]);

    // First call materialised 'queue' (change_count=0, no prior fact);
    // second call flipped to 'slot' inside the lock (change_count=1).
    expect(store.fact).toHaveLength(1);
    expect(store.fact[0]!.mode).toBe('slot');
    expect(store.fact[0]!.change_count).toBe(1);

    expect(store.audit).toHaveLength(2);
    expect(store.audit.map((a) => a.to_mode)).toEqual(['queue', 'slot']);
    expect(store.audit[0]!.from_mode).toBeNull();
    expect(store.audit[1]!.from_mode).toBe('queue');

    expect(store.queue).toHaveLength(0);
  });

  it('scenario 5 — dry run: NO rows persisted to fact, audit, or queue tables', async () => {
    seedSlotAppointments(store, [
      { id: 'a', appointment_date: '2026-05-18T04:00:00.000Z', created_at: '2026-05-17T08:00:00.000Z' },
    ]);

    const result = await convertSessionDayMode(supabase as never, doctorId, sessionDate, 'queue', {
      correlationId: 'corr-dry',
      triggeredBy: 'doctor',
      dryRun: true,
    });

    expect(result.affected).toBe(1);
    expect(result.toMode).toBe('queue');

    expect(store.fact).toHaveLength(0);
    expect(store.audit).toHaveLength(0);
    expect(store.queue).toHaveLength(0);
    expect(store.appointments[0]!.opd_event_type).toBe('standard');
  });

  it('scenario 6 — net-zero flip deletes pending notification row (slot→queue→slot)', async () => {
    store.fact.push({
      doctor_id: doctorId,
      session_date: sessionDate,
      mode: 'slot',
      change_count: 0,
      source: 'doctor',
      changed_at: '2026-05-17T10:00:00.000Z',
      updated_at: '2026-05-17T10:00:00.000Z',
    });
    seedSlotAppointments(store, [
      { id: 'a', appointment_date: '2026-05-18T04:00:00.000Z', created_at: '2026-05-17T08:00:00.000Z' },
    ]);

    await convertSessionDayMode(supabase as never, doctorId, sessionDate, 'queue', {
      correlationId: 'corr-nz-1',
      triggeredBy: 'doctor',
    });
    expect(store.pendingNotifications).toHaveLength(1);
    expect(store.pendingNotifications[0]!.first_flip_mode).toBe('slot');
    expect(store.pendingNotifications[0]!.latest_flip_mode).toBe('queue');

    seedAvailability(store);
    await convertSessionDayMode(supabase as never, doctorId, sessionDate, 'slot', {
      correlationId: 'corr-nz-2',
      triggeredBy: 'doctor',
    });

    expect(store.pendingNotifications).toHaveLength(0);
  });
});
