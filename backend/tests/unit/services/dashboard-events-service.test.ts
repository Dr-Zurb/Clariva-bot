/**
 * Unit tests for `services/dashboard-events-service.ts`
 * (Plan 07 · Task 30 + Alerts v2 · alr2-02).
 *
 * Pins:
 *   - `insertDashboardEvent` is idempotent on a caller `dedupeKey`
 *     (written to `dedupe_key`) via unique-violation recovery (ALR2-D5).
 *   - Legacy `recordingAccessAuditId` still dedupes (JSONB pre-check +
 *     maps onto `dedupeKey`).
 *   - New payload kinds (`booking_review_sla_breach`,
 *     `appointment_no_show`) round-trip through `toEvent` via the list
 *     path.
 *   - `getDashboardEventsForDoctor` honors `unreadOnly`, applies the
 *     `(created_at, id)` cursor, and returns `nextCursor` only when a
 *     next page exists (we fetch limit+1 internally).
 *   - `markDashboardEventAcknowledged` enforces doctor ownership at the
 *     SQL filter layer; missing rows surface as `NotFoundError`,
 *     already-ack'd rows are a silent success.
 *   - Empty `doctorId` / `eventId` raise `ValidationError` (caller-bug
 *     surface — these are derived from `req.user`, never from request
 *     bodies).
 *
 * Out of scope here:
 *   - RLS policy semantics (covered by the migration sanity test).
 *   - Cursor format stability (covered implicitly via the round-trip
 *     test below — explicit base64 contents are an internal detail).
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import * as database from '../../../src/config/database';
import {
  insertDashboardEvent,
  getDashboardEventsForDoctor,
  markDashboardEventAcknowledged,
  type AppointmentNoShowPayload,
  type BookingReviewSlaBreachPayload,
  type PatientReplayedRecordingPayload,
} from '../../../src/services/dashboard-events-service';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;

// ---------------------------------------------------------------------------
// Mock builder for the supabase admin client. The dashboard-events service
// touches a single table (`doctor_dashboard_events`) but uses three different
// chains: insert pre-check, insert, paginated select, ack update, ack
// post-update lookup. We capture each call explicitly so tests can assert
// the WHERE filters that enforce auth + idempotency.
// ---------------------------------------------------------------------------

interface CapturedCall {
  kind:    'select' | 'insert' | 'update';
  filters: Record<string, unknown>;
  payload?: Record<string, unknown>;
  isFilters?: Array<{ column: string; value: unknown }>;
  orderBy?:   Array<{ column: string; ascending: boolean }>;
  orFilter?:  string;
  limit?:     number;
}

interface DashboardEventsMockInit {
  /** Rows returned by the legacy audit-id JSONB pre-check. */
  preCheckRows?: Array<{ id: string }>;
  /** Rows returned by the post-unique-violation dedupe_key lookup. */
  dedupeLookupRows?: Array<{ id: string }>;
  /** Row returned by the insert .select('id').single() chain. */
  insertReturn?: { id: string } | null;
  insertError?:  { message: string; code?: string } | null;
  /** Rows returned by the paginated select (limit+1 already applied by caller). */
  selectRows?:   unknown[];
  selectError?:  { message: string } | null;
  /** Row returned by the ack update .select('id').maybeSingle(). */
  ackUpdateReturn?: { id: string } | null;
  ackUpdateError?:  { message: string } | null;
  /** Row returned by the post-update fallback lookup. */
  postLookupReturn?: { id: string; acknowledged_at: string | null } | null;
  postLookupError?:  { message: string } | null;
}

function buildMock(opts: DashboardEventsMockInit = {}): {
  client: unknown;
  calls:  CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  let preCheckUsed = false;

  const buildSelectChain = (call: CapturedCall): unknown => {
    const chain: Record<string, unknown> = {};

    chain.eq = (col: string, val: unknown): unknown => {
      call.filters[col] = val;
      return chain;
    };
    chain.is = (col: string, val: unknown): unknown => {
      call.isFilters = call.isFilters ?? [];
      call.isFilters.push({ column: col, value: val });
      return chain;
    };
    chain.order = (col: string, opts2?: { ascending?: boolean }): unknown => {
      call.orderBy = call.orderBy ?? [];
      call.orderBy.push({ column: col, ascending: opts2?.ascending ?? true });
      return chain;
    };
    chain.or = (filter: string): unknown => {
      call.orFilter = filter;
      return chain;
    };
    chain.limit = (n: number): unknown => {
      call.limit = n;
      // Legacy audit-id JSONB pre-check OR post-23505 dedupe_key lookup —
      // both use `.limit(1)` and await the chain directly.
      if (n === 1 && 'payload->>recording_access_audit_id' in call.filters) {
        if (!preCheckUsed) {
          preCheckUsed = true;
          return Promise.resolve({
            data:  opts.preCheckRows ?? [],
            error: null,
          });
        }
      }
      if (n === 1 && 'dedupe_key' in call.filters) {
        return Promise.resolve({
          data:  opts.dedupeLookupRows ?? [],
          error: null,
        });
      }
      // The paginated select awaits .limit(N) directly and returns rows.
      return Promise.resolve({
        data:  opts.selectRows ?? [],
        error: opts.selectError ?? null,
      });
    };
    chain.maybeSingle = async (): Promise<{
      data: { id: string; acknowledged_at: string | null } | null;
      error: { message: string } | null;
    }> => ({
      data:  opts.postLookupReturn ?? null,
      error: opts.postLookupError ?? null,
    });
    return chain;
  };

  const client = {
    from: (table: string): unknown => {
      if (table !== 'doctor_dashboard_events') {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: (_cols: string): unknown => {
          const call: CapturedCall = { kind: 'select', filters: {} };
          calls.push(call);
          return buildSelectChain(call);
        },
        insert: (row: Record<string, unknown>): unknown => {
          const call: CapturedCall = {
            kind:    'insert',
            filters: {},
            payload: row,
          };
          calls.push(call);
          return {
            select: () => ({
              single: async (): Promise<{
                data: { id: string } | null;
                error: { message: string } | null;
              }> => ({
                data:  opts.insertError ? null : (opts.insertReturn ?? { id: 'evt-new' }),
                error: opts.insertError ?? null,
              }),
            }),
          };
        },
        update: (payload: Record<string, unknown>): unknown => {
          const call: CapturedCall = { kind: 'update', filters: {}, payload };
          calls.push(call);
          const updateChain: Record<string, unknown> = {};
          updateChain.eq = (col: string, val: unknown): unknown => {
            call.filters[col] = val;
            return updateChain;
          };
          updateChain.is = (col: string, val: unknown): unknown => {
            call.isFilters = call.isFilters ?? [];
            call.isFilters.push({ column: col, value: val });
            return updateChain;
          };
          updateChain.select = () => ({
            maybeSingle: async (): Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }> => ({
              data:  opts.ackUpdateReturn ?? null,
              error: opts.ackUpdateError ?? null,
            }),
          });
          return updateChain;
        },
      };
    },
  };

  return { client, calls };
}

const VALID_PAYLOAD: PatientReplayedRecordingPayload = {
  artifact_type:             'audio',
  recording_access_audit_id: 'audit-1',
  patient_display_name:      'Patient One',
  replayed_at:               '2026-04-19T10:00:00Z',
  consult_date:              '2026-04-15T12:00:00Z',
  accessed_by_role:          'patient',
  accessed_by_user_id:       'pat-1',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// insertDashboardEvent
// ===========================================================================

describe('insertDashboardEvent — input validation', () => {
  it('rejects empty doctorId', async () => {
    await expect(
      insertDashboardEvent({
        doctorId:  '   ',
        eventKind: 'patient_replayed_recording',
        sessionId: 'sess-1',
        payload:   VALID_PAYLOAD,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('insertDashboardEvent — happy path', () => {
  it('inserts a fresh row with dedupe_key mapped from recordingAccessAuditId', async () => {
    const { client, calls } = buildMock({
      insertReturn: { id: 'evt-1' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await insertDashboardEvent({
      doctorId:  'doc-1',
      eventKind: 'patient_replayed_recording',
      sessionId: 'sess-1',
      payload:   VALID_PAYLOAD,
      recordingAccessAuditId: 'audit-1',
    });

    expect(result).toEqual({ inserted: true, eventId: 'evt-1' });

    // Two calls: the legacy JSONB pre-check (select), then the actual insert.
    expect(calls).toHaveLength(2);
    expect(calls[0]?.kind).toBe('select');
    expect(calls[0]?.filters).toMatchObject({
      doctor_id: 'doc-1',
      'payload->>recording_access_audit_id': 'audit-1',
    });
    expect(calls[1]?.kind).toBe('insert');
    expect(calls[1]?.payload).toEqual({
      doctor_id:   'doc-1',
      event_kind:  'patient_replayed_recording',
      session_id:  'sess-1',
      payload:     VALID_PAYLOAD,
      dedupe_key:  'audit-1',
    });
  });

  it('writes an explicit dedupeKey without the legacy JSONB pre-check', async () => {
    const { client, calls } = buildMock({
      insertReturn: { id: 'evt-2' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await insertDashboardEvent({
      doctorId:  'doc-1',
      eventKind: 'appointment_no_show',
      sessionId: null,
      payload:   {
        severity:             'info',
        appointment_id:       'appt-1',
        patient_display_name: 'Ravi',
        appointment_date:     '2026-07-20T10:00:00Z',
      } satisfies AppointmentNoShowPayload,
      dedupeKey: 'appt-1',
    });

    expect(result).toEqual({ inserted: true, eventId: 'evt-2' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('insert');
    expect(calls[0]?.payload).toMatchObject({
      dedupe_key: 'appt-1',
      event_kind: 'appointment_no_show',
    });
  });

  it('skips dedupe when neither dedupeKey nor recordingAccessAuditId is supplied', async () => {
    const { client, calls } = buildMock({
      insertReturn: { id: 'evt-3' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await insertDashboardEvent({
      doctorId:  'doc-1',
      eventKind: 'patient_replayed_recording',
      sessionId: null,
      payload:   VALID_PAYLOAD,
    });

    expect(result).toEqual({ inserted: true, eventId: 'evt-3' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('insert');
    expect(calls[0]?.payload).not.toHaveProperty('dedupe_key');
  });
});

describe('insertDashboardEvent — idempotency', () => {
  it('returns the existing event when a legacy (doctor, audit_id) pair is found', async () => {
    const { client, calls } = buildMock({
      preCheckRows: [{ id: 'evt-existing' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await insertDashboardEvent({
      doctorId:  'doc-1',
      eventKind: 'patient_replayed_recording',
      sessionId: 'sess-1',
      payload:   VALID_PAYLOAD,
      recordingAccessAuditId: 'audit-1',
    });

    expect(result).toEqual({ inserted: false, eventId: 'evt-existing' });
    // Only the pre-check ran — no insert.
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(0);
  });

  it('returns the existing event when a concurrent insert hits the unique index (23505)', async () => {
    const { client, calls } = buildMock({
      insertError:       { message: 'duplicate key', code: '23505' },
      dedupeLookupRows:  [{ id: 'evt-winner' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await insertDashboardEvent({
      doctorId:  'doc-1',
      eventKind: 'booking_review_sla_breach',
      sessionId: null,
      payload:   {
        severity:             'action_needed',
        review_request_id:    'rev-1',
        patient_display_name: 'Meera',
        requested_at:         '2026-07-19T08:00:00Z',
        sla_deadline_at:      '2026-07-20T08:00:00Z',
      } satisfies BookingReviewSlaBreachPayload,
      dedupeKey: 'rev-1',
    });

    expect(result).toEqual({ inserted: false, eventId: 'evt-winner' });
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(1);
    const lookup = calls.find(
      (c) => c.kind === 'select' && 'dedupe_key' in c.filters,
    );
    expect(lookup?.filters).toMatchObject({
      doctor_id:  'doc-1',
      dedupe_key: 'rev-1',
    });
  });
});

describe('insertDashboardEvent — failure paths', () => {
  it('throws InternalError when the insert returns a non-unique error', async () => {
    const { client } = buildMock({
      insertError: { message: 'connection lost' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await expect(
      insertDashboardEvent({
        doctorId:  'doc-1',
        eventKind: 'patient_replayed_recording',
        sessionId: 'sess-1',
        payload:   VALID_PAYLOAD,
      }),
    ).rejects.toThrow(/insert failed/);
  });
});

// ===========================================================================
// getDashboardEventsForDoctor
// ===========================================================================

function makeRow(overrides: Partial<{
  id: string;
  doctor_id: string;
  event_kind: string;
  session_id: string | null;
  payload: unknown;
  acknowledged_at: string | null;
  created_at: string;
}> = {}): Record<string, unknown> {
  return {
    id:              overrides.id              ?? 'evt-1',
    doctor_id:       overrides.doctor_id       ?? 'doc-1',
    event_kind:      overrides.event_kind      ?? 'patient_replayed_recording',
    session_id:      overrides.session_id      ?? 'sess-1',
    payload:         overrides.payload         ?? VALID_PAYLOAD,
    acknowledged_at: overrides.acknowledged_at ?? null,
    created_at:      overrides.created_at      ?? '2026-04-19T10:00:00Z',
  };
}

describe('insertDashboardEvent — new payload kinds round-trip via list', () => {
  it('maps booking_review_sla_breach + appointment_no_show through toEvent', async () => {
    const slaPayload: BookingReviewSlaBreachPayload = {
      severity:             'action_needed',
      review_request_id:    'rev-9',
      patient_display_name: 'Meera',
      requested_at:         '2026-07-19T08:00:00Z',
      sla_deadline_at:      '2026-07-20T08:00:00Z',
    };
    const noShowPayload: AppointmentNoShowPayload = {
      severity:             'info',
      appointment_id:       'appt-9',
      patient_display_name: 'Ravi',
      appointment_date:     '2026-07-20T10:00:00Z',
    };

    const { client } = buildMock({
      selectRows: [
        makeRow({
          id:         'evt-sla',
          event_kind: 'booking_review_sla_breach',
          session_id: null,
          payload:    slaPayload,
        }),
        makeRow({
          id:         'evt-ns',
          event_kind: 'appointment_no_show',
          session_id: null,
          payload:    noShowPayload,
        }),
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await getDashboardEventsForDoctor({
      doctorId: 'doc-1',
      limit:    20,
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      id:        'evt-sla',
      eventKind: 'booking_review_sla_breach',
      payload:   slaPayload,
    });
    expect(result.events[1]).toMatchObject({
      id:        'evt-ns',
      eventKind: 'appointment_no_show',
      payload:   noShowPayload,
    });
  });
});

describe('getDashboardEventsForDoctor', () => {
  it('returns events with no nextCursor when fewer than limit+1 rows are returned', async () => {
    const { client, calls } = buildMock({
      selectRows: [makeRow({ id: 'evt-1' }), makeRow({ id: 'evt-2' })],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await getDashboardEventsForDoctor({
      doctorId: 'doc-1',
      limit:    20,
    });

    expect(result.nextCursor).toBeUndefined();
    expect(result.events).toHaveLength(2);
    expect(result.events[0]?.id).toBe('evt-1');
    // Must filter on doctor_id (the auth check at the service layer).
    expect(calls[0]?.filters).toMatchObject({ doctor_id: 'doc-1' });
    // Must order by created_at DESC then id DESC for cursor stability.
    expect(calls[0]?.orderBy).toEqual([
      { column: 'created_at', ascending: false },
      { column: 'id',         ascending: false },
    ]);
    // Must fetch limit+1 to detect "has next" without count(*).
    expect(calls[0]?.limit).toBe(21);
  });

  it('emits a nextCursor when limit+1 rows come back', async () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      makeRow({ id: `evt-${i}`, created_at: `2026-04-19T10:0${i}:00Z` }),
    );
    const { client } = buildMock({ selectRows: rows });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await getDashboardEventsForDoctor({
      doctorId: 'doc-1',
      limit:    5,
    });

    expect(result.events).toHaveLength(5);
    expect(result.nextCursor).toBeDefined();
    // Cursor must be opaque to clients but round-trippable.
    expect(typeof result.nextCursor).toBe('string');
  });

  it('applies unreadOnly filter when requested', async () => {
    const { client, calls } = buildMock({ selectRows: [] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await getDashboardEventsForDoctor({
      doctorId:   'doc-1',
      unreadOnly: true,
    });

    expect(calls[0]?.isFilters).toContainEqual({
      column: 'acknowledged_at',
      value:  null,
    });
  });

  it('decodes a cursor and emits a tuple-comparison or-filter', async () => {
    const { client: warmupClient } = buildMock({
      selectRows: [makeRow({ id: 'evt-1', created_at: '2026-04-19T10:00:00Z' })],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(warmupClient as never);
    // First call to derive a real cursor.
    const seed = await getDashboardEventsForDoctor({ doctorId: 'doc-1', limit: 1 });
    // Wait — we only get a cursor when there's a next page; force it with limit+1 rows.
    const { client: warmupClient2 } = buildMock({
      selectRows: [
        makeRow({ id: 'evt-1', created_at: '2026-04-19T10:00:00Z' }),
        makeRow({ id: 'evt-2', created_at: '2026-04-19T09:00:00Z' }),
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(warmupClient2 as never);
    const seed2 = await getDashboardEventsForDoctor({ doctorId: 'doc-1', limit: 1 });
    expect(seed.nextCursor).toBeUndefined();
    expect(seed2.nextCursor).toBeDefined();

    // Second call — feed the cursor back in and assert the or-filter shape.
    const { client, calls } = buildMock({ selectRows: [] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    await getDashboardEventsForDoctor({
      doctorId: 'doc-1',
      limit:    20,
      cursor:   seed2.nextCursor!,
    });
    expect(calls[0]?.orFilter).toMatch(/created_at\.lt\./);
    expect(calls[0]?.orFilter).toMatch(/and\(created_at\.eq\.[^,]+,id\.lt\./);
  });

  it('clamps limit to MAX_LIMIT (100)', async () => {
    const { client, calls } = buildMock({ selectRows: [] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await getDashboardEventsForDoctor({ doctorId: 'doc-1', limit: 9999 });
    // limit+1 = 101 cap.
    expect(calls[0]?.limit).toBe(101);
  });

  it('rejects empty doctorId', async () => {
    await expect(
      getDashboardEventsForDoctor({ doctorId: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ===========================================================================
// markDashboardEventAcknowledged
// ===========================================================================

describe('markDashboardEventAcknowledged', () => {
  it('updates the row and returns silently on success', async () => {
    const { client, calls } = buildMock({
      ackUpdateReturn: { id: 'evt-1' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await expect(
      markDashboardEventAcknowledged({ doctorId: 'doc-1', eventId: 'evt-1' }),
    ).resolves.toBeUndefined();

    expect(calls[0]?.kind).toBe('update');
    // Auth gate is the doctor_id filter at the SQL layer.
    expect(calls[0]?.filters).toMatchObject({
      doctor_id: 'doc-1',
      id:        'evt-1',
    });
    // Must filter on `acknowledged_at IS NULL` so re-acks are no-ops.
    expect(calls[0]?.isFilters).toContainEqual({
      column: 'acknowledged_at',
      value:  null,
    });
    // Payload must set acknowledged_at to a serialized ISO timestamp.
    expect(typeof (calls[0]?.payload as Record<string, unknown>)?.acknowledged_at).toBe('string');
  });

  it('treats already-acknowledged rows as silent success (idempotent ack)', async () => {
    const { client } = buildMock({
      ackUpdateReturn:  null,
      postLookupReturn: { id: 'evt-1', acknowledged_at: '2026-04-19T10:00:00Z' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await expect(
      markDashboardEventAcknowledged({ doctorId: 'doc-1', eventId: 'evt-1' }),
    ).resolves.toBeUndefined();
  });

  it('throws NotFoundError when the row does not exist (or belongs to another doctor)', async () => {
    const { client } = buildMock({
      ackUpdateReturn:  null,
      postLookupReturn: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await expect(
      markDashboardEventAcknowledged({ doctorId: 'doc-1', eventId: 'evt-missing' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects empty doctorId / eventId', async () => {
    await expect(
      markDashboardEventAcknowledged({ doctorId: '', eventId: 'evt-1' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      markDashboardEventAcknowledged({ doctorId: 'doc-1', eventId: '' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
