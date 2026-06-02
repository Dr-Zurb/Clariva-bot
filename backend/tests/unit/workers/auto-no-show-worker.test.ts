/**
 * Unit tests for `workers/auto-no-show-worker.ts` (Patient seeing flow · pf-17).
 *
 * Pins the locked predicate's behaviour against a hand-rolled in-memory
 * fake of the supabase admin client. The fake interprets the same chain
 * shapes the worker emits (`.from(table).select(...).eq(...)…`) and
 * mutates an in-memory record set so `flipped`-vs-`raced` outcomes are
 * actually observable.
 *
 * Coverage matrix (acceptance-criteria-driven):
 *
 *   1. Doctor with `auto_no_show_after_min = 30`, 3 stale appointments → all 3 flipped.
 *   2. Doctor with `auto_no_show_after_min = NULL` → 0 flips (P-D7 default).
 *   3. Appointment with a `consultation_sessions` row → 0 flips (consult started).
 *   4. Already-cancelled / already-no_show / already-completed → 0 flips (idempotency).
 *   5. Wrap-up sweep: appointment with session ended >24h → flipped to `completed`
 *      (only when `wrapUpSweepEnabled = true`).
 *   6. Wrap-up sweep stays inert when feature flag is off.
 *   7. `startAutoNoShowWorker` honours the env disable path (no-op handle).
 *   8. Audit log row written per flipped appointment with `source: 'worker'`.
 *
 * Mock strategy mirrors the existing worker tests
 * (e.g. `voice-transcription-worker.test.ts`) — `getSupabaseAdminClient`
 * is jest.mock-ed at module scope, the logger is silenced, and the
 * audit-logger is intercepted so we can assert the row shape without a
 * real DB.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (BEFORE importing the SUT)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

const mockLogAuditEvent = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: (...a: unknown[]) => mockLogAuditEvent(...a),
}));

import * as database from '../../../src/config/database';
import {
  runAutoNoShowTick,
  startAutoNoShowWorker,
  __testInternals,
} from '../../../src/workers/auto-no-show-worker';

const mockedDb = database as jest.Mocked<typeof database>;

// ---------------------------------------------------------------------------
// In-memory fake supabase admin client
// ---------------------------------------------------------------------------

type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

interface DoctorSettingsRow {
  doctor_id:               string;
  auto_no_show_after_min:  number | null;
}

interface AppointmentRow {
  id:               string;
  doctor_id:        string;
  appointment_date: string; // ISO
  status:           AppointmentStatus;
  updated_at?:      string;
}

interface ConsultationSessionRow {
  appointment_id:    string;
  status:            'scheduled' | 'live' | 'ended' | 'no_show' | 'cancelled';
  actual_ended_at:   string | null;
}

interface FakeDb {
  doctor_settings:        DoctorSettingsRow[];
  appointments:           AppointmentRow[];
  consultation_sessions:  ConsultationSessionRow[];
}

interface FilterState {
  table: keyof FakeDb;
  // Predicates accumulated during the chain. We compose them at terminal time.
  predicates: Array<(row: Record<string, unknown>) => boolean>;
  // Optional ordering / limit captured by the chain.
  orderBy?:   { column: string; ascending: boolean };
  limit?:     number;
}

interface UpdateState {
  table:       keyof FakeDb;
  patch:       Record<string, unknown>;
  predicates:  Array<(row: Record<string, unknown>) => boolean>;
  selectCols?: string;
}

function buildFakeAdmin(db: FakeDb, opts: { failOn?: Partial<Record<string, string>> } = {}) {
  const fail = (op: string): { data: null; error: { message: string } } | null => {
    const message = opts.failOn?.[op];
    if (!message) return null;
    return { data: null, error: { message } };
  };

  // ── Select chain ──────────────────────────────────────────────────────
  const buildSelectChain = (state: FilterState): unknown => {
    const terminal = async (): Promise<{ data: unknown; error: unknown }> => {
      const op = `select:${state.table}`;
      const failure = fail(op);
      if (failure) return failure;

      let rows = (db[state.table] as unknown as Array<Record<string, unknown>>).slice();
      for (const pred of state.predicates) {
        rows = rows.filter((r) => pred(r));
      }
      if (state.orderBy) {
        const { column, ascending } = state.orderBy;
        rows = rows.sort((a, b) => {
          const av = a[column];
          const bv = b[column];
          if (av == null && bv == null) return 0;
          if (av == null) return ascending ? -1 : 1;
          if (bv == null) return ascending ? 1 : -1;
          if (av < bv) return ascending ? -1 : 1;
          if (av > bv) return ascending ? 1 : -1;
          return 0;
        });
      }
      if (state.limit !== undefined) {
        rows = rows.slice(0, state.limit);
      }
      return { data: rows, error: null };
    };

    const chain: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        state.predicates.push((row) => row[column] === value);
        return buildSelectChain(state);
      },
      in: (column: string, values: unknown[]) => {
        state.predicates.push((row) => values.includes(row[column]));
        return buildSelectChain(state);
      },
      lt: (column: string, value: unknown) => {
        state.predicates.push((row) => {
          const cell = row[column];
          if (cell == null) return false;
          return (cell as string | number) < (value as string | number);
        });
        return buildSelectChain(state);
      },
      not: (column: string, op: string, value: unknown) => {
        if (op === 'is' && value === null) {
          state.predicates.push((row) => row[column] != null);
        } else {
          state.predicates.push((row) => row[column] !== value);
        }
        return buildSelectChain(state);
      },
      is: (column: string, value: unknown) => {
        if (value === null) {
          state.predicates.push((row) => row[column] == null);
        } else {
          state.predicates.push((row) => row[column] === value);
        }
        return buildSelectChain(state);
      },
      order: (column: string, args: { ascending?: boolean } = {}) => {
        state.orderBy = { column, ascending: args.ascending !== false };
        return buildSelectChain(state);
      },
      limit: (n: number) => {
        state.limit = n;
        return buildSelectChain(state);
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        terminal().then(resolve, reject),
    };

    return chain;
  };

  // ── Update chain ──────────────────────────────────────────────────────
  const buildUpdateChain = (state: UpdateState): unknown => {
    const runUpdate = (): { data: unknown; error: unknown } => {
      const op = `update:${state.table}`;
      const failure = fail(op);
      if (failure) return failure;

      const rows = db[state.table] as unknown as Array<Record<string, unknown>>;
      const matching = rows.filter((r) =>
        state.predicates.every((p) => p(r)),
      );
      if (matching.length === 0) return { data: null, error: null };

      // For maybeSingle() we apply the patch to the first match (and only one
      // ever matches in our tests since `id` is the lead predicate).
      const target = matching[0];
      Object.assign(target, state.patch);
      // Project the requested columns.
      const cols = (state.selectCols ?? 'id').split(',').map((c) => c.trim());
      const projected: Record<string, unknown> = {};
      for (const c of cols) projected[c] = target[c];
      return { data: projected, error: null };
    };

    const chain: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        state.predicates.push((row) => row[column] === value);
        return buildUpdateChain(state);
      },
      in: (column: string, values: unknown[]) => {
        state.predicates.push((row) => values.includes(row[column]));
        return buildUpdateChain(state);
      },
      select: (cols: string) => {
        state.selectCols = cols;
        return {
          maybeSingle: async () => runUpdate(),
        };
      },
    };
    return chain;
  };

  return {
    from: (table: string) => ({
      select: (_cols: string) =>
        buildSelectChain({
          table:      table as keyof FakeDb,
          predicates: [],
        }),
      update: (patch: Record<string, unknown>) =>
        buildUpdateChain({
          table:      table as keyof FakeDb,
          patch,
          predicates: [],
        }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DOCTOR_A = '00000000-0000-0000-0000-0000000000a1';
const DOCTOR_B = '00000000-0000-0000-0000-0000000000b2';

const isoMinutesAgo = (m: number): string =>
  new Date(Date.now() - m * 60 * 1000).toISOString();

const isoHoursAgo = (h: number): string =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

function emptyDb(): FakeDb {
  return {
    doctor_settings:       [],
    appointments:          [],
    consultation_sessions: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAutoNoShowTick', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogAuditEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockedDb.getSupabaseAdminClient.mockReset();
  });

  it('flips all stale appointments for a doctor with auto_no_show_after_min = 30', async () => {
    const db = emptyDb();
    db.doctor_settings.push({ doctor_id: DOCTOR_A, auto_no_show_after_min: 30 });
    // 3 stale (45 min ago > 30 min cutoff), all pending/confirmed, no sessions.
    db.appointments.push(
      { id: 'apt-1', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(45), status: 'pending'   },
      { id: 'apt-2', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(60), status: 'confirmed' },
      { id: 'apt-3', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(90), status: 'pending'   },
    );

    const fake = buildFakeAdmin(db);
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-1',
      wrapUpSweep:   false,
    });

    expect(result.doctorsScanned).toBe(1);
    expect(result.noShowFlipped).toBe(3);
    expect(result.wrapUpFlipped).toBe(0);
    expect(result.raced).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.noShowIds.sort()).toEqual(['apt-1', 'apt-2', 'apt-3']);
    // Every appointment now has status === 'no_show'.
    expect(db.appointments.every((a) => a.status === 'no_show')).toBe(true);
    // Audit log: one row per flip, each carrying `source: 'worker'` + minutes.
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(3);
    for (const call of mockLogAuditEvent.mock.calls) {
      const arg = call[0] as {
        action:        string;
        resourceType:  string;
        metadata:      { source?: string; thresholdMinutes?: number };
      };
      expect(arg.action).toBe('appointment.auto_no_show');
      expect(arg.resourceType).toBe('appointment');
      expect(arg.metadata.source).toBe('worker');
      expect(arg.metadata.thresholdMinutes).toBe(30);
    }
  });

  it('makes zero flips when every doctor has auto_no_show_after_min = NULL (P-D7 default)', async () => {
    const db = emptyDb();
    // No row in doctor_settings for opted-in doctors. The worker scans
    // `.not('auto_no_show_after_min', 'is', null)` — so a doctor whose
    // settings row has NULL (or no row at all) is invisible.
    db.doctor_settings.push({ doctor_id: DOCTOR_A, auto_no_show_after_min: null });
    db.appointments.push(
      { id: 'apt-stale', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(120), status: 'pending' },
    );

    const fake = buildFakeAdmin(db);
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-2',
      wrapUpSweep:   false,
    });

    expect(result.doctorsScanned).toBe(0);
    expect(result.noShowFlipped).toBe(0);
    expect(db.appointments[0].status).toBe('pending');
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it('skips appointments that already have a consultation_sessions row (consult started)', async () => {
    const db = emptyDb();
    db.doctor_settings.push({ doctor_id: DOCTOR_A, auto_no_show_after_min: 30 });
    db.appointments.push(
      { id: 'apt-no-sess', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(45), status: 'pending' },
      { id: 'apt-with-sess', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(50), status: 'pending' },
    );
    db.consultation_sessions.push({
      appointment_id:  'apt-with-sess',
      status:          'live',
      actual_ended_at: null,
    });

    const fake = buildFakeAdmin(db);
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-3',
      wrapUpSweep:   false,
    });

    expect(result.noShowFlipped).toBe(1);
    expect(result.noShowIds).toEqual(['apt-no-sess']);
    const flipped = db.appointments.find((a) => a.id === 'apt-no-sess');
    const skipped = db.appointments.find((a) => a.id === 'apt-with-sess');
    expect(flipped?.status).toBe('no_show');
    expect(skipped?.status).toBe('pending');
  });

  it('is idempotent across already-cancelled / already-no_show / already-completed rows', async () => {
    const db = emptyDb();
    db.doctor_settings.push({ doctor_id: DOCTOR_A, auto_no_show_after_min: 30 });
    db.appointments.push(
      { id: 'apt-cancelled', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(45), status: 'cancelled' },
      { id: 'apt-already-noshow', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(60), status: 'no_show' },
      { id: 'apt-completed', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(90), status: 'completed' },
    );

    const fake = buildFakeAdmin(db);
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-4',
      wrapUpSweep:   false,
    });

    expect(result.noShowFlipped).toBe(0);
    expect(result.errors).toEqual([]);
    // Statuses unchanged.
    expect(db.appointments.find((a) => a.id === 'apt-cancelled')?.status).toBe('cancelled');
    expect(db.appointments.find((a) => a.id === 'apt-already-noshow')?.status).toBe('no_show');
    expect(db.appointments.find((a) => a.id === 'apt-completed')?.status).toBe('completed');
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it('does NOT flip appointments whose appointment_date is still in the future or inside the threshold window', async () => {
    const db = emptyDb();
    db.doctor_settings.push({ doctor_id: DOCTOR_A, auto_no_show_after_min: 30 });
    db.appointments.push(
      { id: 'apt-future',   doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(-15), status: 'confirmed' }, // 15 min from now
      { id: 'apt-inside',   doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(20),  status: 'pending'   }, // 20 min ago, < 30
      { id: 'apt-outside',  doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(45),  status: 'pending'   }, // 45 min ago, > 30
    );

    const fake = buildFakeAdmin(db);
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-5',
      wrapUpSweep:   false,
    });

    expect(result.noShowFlipped).toBe(1);
    expect(result.noShowIds).toEqual(['apt-outside']);
  });

  it('isolates per-doctor across the scan (doctor B opted-out, doctor A sees flips)', async () => {
    const db = emptyDb();
    db.doctor_settings.push(
      { doctor_id: DOCTOR_A, auto_no_show_after_min: 30   },
      { doctor_id: DOCTOR_B, auto_no_show_after_min: null },
    );
    db.appointments.push(
      { id: 'apt-A', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(45), status: 'pending' },
      { id: 'apt-B', doctor_id: DOCTOR_B, appointment_date: isoMinutesAgo(45), status: 'pending' },
    );

    const fake = buildFakeAdmin(db);
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-6',
      wrapUpSweep:   false,
    });

    expect(result.doctorsScanned).toBe(1);
    expect(result.noShowFlipped).toBe(1);
    expect(result.noShowIds).toEqual(['apt-A']);
    expect(db.appointments.find((a) => a.id === 'apt-A')?.status).toBe('no_show');
    expect(db.appointments.find((a) => a.id === 'apt-B')?.status).toBe('pending');
  });

  it('wrap-up sweep flips appointments whose session ended >24h ago to completed (when enabled)', async () => {
    const db = emptyDb();
    // Doctor opted-in, but no stale appointments — only the wrap-up bucket fires.
    db.doctor_settings.push({ doctor_id: DOCTOR_A, auto_no_show_after_min: 30 });
    db.appointments.push(
      { id: 'apt-stuck',  doctor_id: DOCTOR_A, appointment_date: isoHoursAgo(48), status: 'confirmed' },
      // Session ended only 1h ago — NOT stale yet.
      { id: 'apt-fresh',  doctor_id: DOCTOR_A, appointment_date: isoHoursAgo(2),  status: 'confirmed' },
    );
    db.consultation_sessions.push(
      // apt-stuck: session ended 26h ago — past the 24h cutoff. Worker should auto-complete.
      { appointment_id: 'apt-stuck', status: 'ended', actual_ended_at: isoHoursAgo(26) },
      // apt-fresh: session ended 1h ago. Worker should leave alone.
      { appointment_id: 'apt-fresh', status: 'ended', actual_ended_at: isoHoursAgo(1)  },
    );

    const fake = buildFakeAdmin(db);
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-wrap-up',
      wrapUpSweep:   true,
    });

    // No-show pass: both appointments are excluded by the consultation_sessions
    // exclusion (they each have a session row), so no_show count stays 0.
    expect(result.noShowFlipped).toBe(0);
    // Wrap-up sweep: only apt-stuck flips.
    expect(result.wrapUpFlipped).toBe(1);
    expect(result.wrapUpIds).toEqual(['apt-stuck']);
    expect(db.appointments.find((a) => a.id === 'apt-stuck')?.status).toBe('completed');
    expect(db.appointments.find((a) => a.id === 'apt-fresh')?.status).toBe('confirmed');
    // Audit row should be the wrap-up variant, not the no-show variant.
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    const auditCall = mockLogAuditEvent.mock.calls[0][0] as {
      action:    string;
      metadata:  { source?: string; stuckHours?: number };
    };
    expect(auditCall.action).toBe('appointment.auto_completed_wrap_up_stuck');
    expect(auditCall.metadata.source).toBe('worker');
    expect(auditCall.metadata.stuckHours).toBe(__testInternals.WRAP_UP_STUCK_HOURS);
  });

  it('wrap-up sweep stays inert when wrapUpSweepEnabled is false', async () => {
    const db = emptyDb();
    db.appointments.push(
      { id: 'apt-stuck', doctor_id: DOCTOR_A, appointment_date: isoHoursAgo(48), status: 'confirmed' },
    );
    db.consultation_sessions.push(
      { appointment_id: 'apt-stuck', status: 'ended', actual_ended_at: isoHoursAgo(26) },
    );

    const fake = buildFakeAdmin(db);
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-wrap-up-off',
      wrapUpSweep:   false,
    });

    expect(result.wrapUpFlipped).toBe(0);
    expect(db.appointments[0].status).toBe('confirmed');
  });

  it('returns an empty result and surfaces no errors when the admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-noadmin',
      wrapUpSweep:   true,
    });

    expect(result.doctorsScanned).toBe(0);
    expect(result.noShowFlipped).toBe(0);
    expect(result.wrapUpFlipped).toBe(0);
    expect(result.raced).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('skips a doctor whose consultation_sessions exclusion-scan errors (does not blanket-flip)', async () => {
    const db = emptyDb();
    db.doctor_settings.push({ doctor_id: DOCTOR_A, auto_no_show_after_min: 30 });
    db.appointments.push(
      { id: 'apt-1', doctor_id: DOCTOR_A, appointment_date: isoMinutesAgo(45), status: 'pending' },
    );

    const fake = buildFakeAdmin(db, {
      failOn: { 'select:consultation_sessions': 'pg connection lost' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(fake as never);

    const result = await runAutoNoShowTick({
      correlationId: 'test-sess-fail',
      wrapUpSweep:   false,
    });

    expect(result.noShowFlipped).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('consultation_sessions_scan');
    expect(db.appointments[0].status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// startAutoNoShowWorker — disable + lifecycle
// ---------------------------------------------------------------------------

describe('startAutoNoShowWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);
  });

  it('returns a no-op handle when the worker is disabled (NODE_ENV=test, env flag unset)', async () => {
    const handle = startAutoNoShowWorker();
    // No tick should ever fire — runOnce is the only way to drive it.
    const result = await handle.runOnce('runonce-disabled');
    expect(result.doctorsScanned).toBe(0);
    expect(result.noShowFlipped).toBe(0);
    handle.stop(); // must not throw.
  });
});
