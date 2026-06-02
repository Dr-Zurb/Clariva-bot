/**
 * Unit tests for the Plan 06 / Task 37 system-message emitter surface
 * added to `services/consultation-message-service.ts`:
 *
 *   - `emitSystemMessage` (central writer + in-process LRU dedup +
 *     Postgres 23514 swallow)
 *   - `emitConsultStarted`, `emitConsultEnded`, `emitPartyJoined` (per-
 *     event helpers — Promise<void>, swallow errors)
 *   - `formatTimeInDoctorTz` (small `Intl.DateTimeFormat` wrapper)
 *   - `SYSTEM_SENDER_ID` constant (pinned against drift)
 *
 * The emitter uses the service-role admin client directly (system rows
 * bypass RLS via service-role — Task 39 Notes #1), so these tests mock
 * `getSupabaseAdminClient` and assert the row-payload shape. The
 * per-event helpers' canonical body strings are pinned verbatim so
 * Plans 07/08/09 can't silently drift the narrative copy.
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (registered before the unit-under-test import)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/env', () => ({
  env: {
    CONSULTATION_MESSAGE_RATE_LIMIT_MAX: 3,
    CONSULTATION_MESSAGE_RATE_LIMIT_WINDOW_SECONDS: 60,
  },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import {
  SYSTEM_SENDER_ID,
  __resetSystemEmitterDedupForTests,
  emitConsultEnded,
  emitConsultStarted,
  emitFollowUpScheduled,
  emitMuteChanged,
  emitHoldChanged,
  emitPartyJoined,
  emitRxSent,
  emitSystemMessage,
  formatFollowUpDateInDoctorTz,
  formatTimeInDoctorTz,
} from '../../../src/services/consultation-message-service';
import * as database from '../../../src/config/database';
import { logger } from '../../../src/config/logger';

const mockedDb = database as jest.Mocked<typeof database>;

// ---------------------------------------------------------------------------
// Admin-client mock builder.
//
// The emitter touches three chains:
//   1. `from('consultation_sessions').select(...).eq(...).maybeSingle()`
//      → returns `{ data: { doctor_id }, error: null }`
//   2. `from('doctor_settings').select(...).eq(...).maybeSingle()`
//      → returns `{ data: { timezone }, error: null }`
//   3. `from('consultation_messages').insert(...).select(...).single()`
//      → returns `{ data: { id, created_at }, error }`
//
// The builder is parameterized by outcome so each test declares exactly
// what it wants.
// ---------------------------------------------------------------------------

interface AdminMockOptions {
  doctorId?: string | null;
  timezone?: string | null;
  insertResult?: { data: { id: string; created_at: string } | null; error: { code?: string; message: string } | null };
}

function buildAdminMock(opts: AdminMockOptions = {}) {
  const doctorId  = opts.doctorId === undefined ? 'doc-1' : opts.doctorId;
  const timezone  = opts.timezone === undefined ? 'Asia/Kolkata' : opts.timezone;
  const insertRes = opts.insertResult ?? {
    data: { id: 'msg-sys-1', created_at: '2026-04-19T14:30:00.000Z' },
    error: null,
  };

  const insert = jest.fn<(row: unknown) => {
    select: (cols: string) => { single: () => Promise<typeof insertRes> };
  }>().mockImplementation(() => ({
    select: () => ({
      single: async () => insertRes,
    }),
  }));

  const from = jest.fn<(table: string) => unknown>().mockImplementation((table: string) => {
    if (table === 'consultation_sessions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: doctorId === null ? null : { doctor_id: doctorId },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'doctor_settings') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: timezone === null ? null : { timezone },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'consultation_messages') {
      return { insert };
    }
    throw new Error(`buildAdminMock: unexpected table ${table}`);
  });

  return { client: { from }, insert };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  __resetSystemEmitterDedupForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// SYSTEM_SENDER_ID constant pin — Task 39 Notes #5 / Task 37 Acceptance
// ---------------------------------------------------------------------------

describe('SYSTEM_SENDER_ID', () => {
  it('is the canonical all-zeros UUID (drift guard)', () => {
    expect(SYSTEM_SENDER_ID).toBe('00000000-0000-0000-0000-000000000000');
  });
});

// ---------------------------------------------------------------------------
// formatTimeInDoctorTz
// ---------------------------------------------------------------------------

describe('formatTimeInDoctorTz', () => {
  it('formats in the given IANA timezone as zero-padded HH:MM (24h)', () => {
    // 2026-04-19 09:00:00 UTC → 14:30 Asia/Kolkata (UTC+5:30).
    const d = new Date('2026-04-19T09:00:00.000Z');
    expect(formatTimeInDoctorTz(d, 'Asia/Kolkata')).toBe('14:30');
  });

  it('respects non-India timezones (UTC fixture)', () => {
    const d = new Date('2026-04-19T09:00:00.000Z');
    expect(formatTimeInDoctorTz(d, 'UTC')).toBe('09:00');
  });

  it('falls back to Asia/Kolkata when timezone is empty/undefined/invalid', () => {
    const d = new Date('2026-04-19T09:00:00.000Z');
    expect(formatTimeInDoctorTz(d, undefined)).toBe('14:30');
    expect(formatTimeInDoctorTz(d, '')).toBe('14:30');
    expect(formatTimeInDoctorTz(d, '   ')).toBe('14:30');
    expect(formatTimeInDoctorTz(d, 'NotARealTz/Nowhere')).toBe('14:30');
  });
});

// ---------------------------------------------------------------------------
// emitSystemMessage — central writer
// ---------------------------------------------------------------------------

describe('emitSystemMessage', () => {
  it('happy path — inserts the canonical system row shape + returns id/createdAt', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const result = await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'Consultation started at 14:30.',
    });

    expect(result).toEqual({
      id: 'msg-sys-1',
      createdAt: '2026-04-19T14:30:00.000Z',
    });
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.insert).toHaveBeenCalledWith({
      session_id:   'sess-1',
      sender_id:    SYSTEM_SENDER_ID,
      sender_role:  'system',
      kind:         'system',
      system_event: 'consult_started',
      body:         'Consultation started at 14:30.',
    });
  });

  it('dedup — second call within 60 s with same (sessionId, event, correlationId) is skipped', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const first = await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'Consultation started at 14:30.',
      correlationId: 'consult_started',
    });
    const second = await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'Consultation started at 14:30.',
      correlationId: 'consult_started',
    });

    expect(first).toEqual({ id: 'msg-sys-1', createdAt: '2026-04-19T14:30:00.000Z' });
    expect(second).toEqual({ skipped: true, reason: 'duplicate_correlation_id' });
    expect(mock.insert).toHaveBeenCalledTimes(1);
  });

  it('dedup expires after 60 s — third call writes again', async () => {
    jest.useFakeTimers({ now: new Date('2026-04-19T10:00:00.000Z') });
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'b1',
      correlationId: 'consult_started',
    });
    jest.advanceTimersByTime(30_000); // still inside the 60s window
    const mid = await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'b1',
      correlationId: 'consult_started',
    });
    expect(mid).toEqual({ skipped: true, reason: 'duplicate_correlation_id' });

    jest.advanceTimersByTime(31_000); // total 61s → window expired
    const after = await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'b1',
      correlationId: 'consult_started',
    });
    expect(after).toEqual({ id: 'msg-sys-1', createdAt: '2026-04-19T14:30:00.000Z' });
    expect(mock.insert).toHaveBeenCalledTimes(2);
  });

  it('dedup keys are role-aware — emitPartyJoined(doctor) and (patient) do not collapse', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'party_joined',
      body: 'Doctor joined the consult.',
      correlationId: 'party_joined:doctor',
    });
    await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'party_joined',
      body: 'Patient joined the consult.',
      correlationId: 'party_joined:patient',
    });

    expect(mock.insert).toHaveBeenCalledTimes(2);
  });

  it('swallows Postgres 23514 row-shape CHECK violation (never throws)', async () => {
    const mock = buildAdminMock({
      insertResult: {
        data: null,
        error: { code: '23514', message: 'row violates check constraint "consultation_messages_kind_shape_check"' },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const result = await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'Consultation started at 14:30.',
    });

    expect(result).toEqual({ skipped: true, reason: 'row_shape_check_failed' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns skipped on admin-unavailable; does not throw', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);
    const result = await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'Consultation started at 14:30.',
    });
    expect(result).toEqual({ skipped: true, reason: 'admin_unavailable' });
  });

  it('returns skipped on generic DB error (never throws)', async () => {
    const mock = buildAdminMock({
      insertResult: {
        data: null,
        error: { code: '57014', message: 'statement timeout' },
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const result = await emitSystemMessage({
      sessionId: 'sess-1',
      event: 'consult_started',
      body: 'Consultation started at 14:30.',
    });
    expect(result).toEqual({ skipped: true, reason: 'row_shape_check_failed' });
  });

  it('guards against missing required inputs (sessionId/event/body)', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const r1 = await emitSystemMessage({ sessionId: '', event: 'consult_started', body: 'x' });
    const r2 = await emitSystemMessage({ sessionId: 's-1', event: 'consult_started', body: '' });

    expect(r1).toEqual({ skipped: true, reason: 'row_shape_check_failed' });
    expect(r2).toEqual({ skipped: true, reason: 'row_shape_check_failed' });
    expect(mock.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// emitConsultStarted / emitConsultEnded / emitPartyJoined — per-event helpers
// ---------------------------------------------------------------------------

describe('emitConsultStarted', () => {
  it('writes the canonical "Consultation started at HH:MM." body in the doctor\'s TZ', async () => {
    // Pin "now" to 09:00Z → 14:30 Asia/Kolkata.
    jest.useFakeTimers({ now: new Date('2026-04-19T09:00:00.000Z') });
    const mock = buildAdminMock({ timezone: 'Asia/Kolkata' });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitConsultStarted('sess-1');

    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id:   'sess-1',
        system_event: 'consult_started',
        body:         'Consultation started at 14:30.',
        sender_id:    SYSTEM_SENDER_ID,
        sender_role:  'system',
        kind:         'system',
      }),
    );
  });

  it('resolves (does not throw) when the underlying writer fails', async () => {
    mockedDb.getSupabaseAdminClient.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(emitConsultStarted('sess-1')).resolves.toBeUndefined();
  });
});

describe('emitConsultEnded', () => {
  it('writes the canonical "Consultation ended at HH:MM." body when no summary is supplied', async () => {
    jest.useFakeTimers({ now: new Date('2026-04-19T09:00:00.000Z') });
    const mock = buildAdminMock({ timezone: 'Asia/Kolkata' });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitConsultEnded('sess-1');

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        system_event: 'consult_ended',
        body:         'Consultation ended at 14:30.',
      }),
    );
  });

  it('renders the caller-supplied summary override verbatim', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitConsultEnded('sess-1', 'Recording is now available.');

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        system_event: 'consult_ended',
        body:         'Recording is now available.',
      }),
    );
  });

  it('resolves (does not throw) when the underlying writer fails', async () => {
    mockedDb.getSupabaseAdminClient.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(emitConsultEnded('sess-1')).resolves.toBeUndefined();
  });
});

describe('emitPartyJoined', () => {
  it('writes "Doctor joined the consult." for role=doctor', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitPartyJoined('sess-1', 'doctor');

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        system_event: 'party_joined',
        body:         'Doctor joined the consult.',
      }),
    );
  });

  it('writes "Patient joined the consult." for role=patient', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitPartyJoined('sess-1', 'patient');

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        system_event: 'party_joined',
        body:         'Patient joined the consult.',
      }),
    );
  });

  it('dedups per (sessionId, role) within 60 s — rapid re-calls collapse to one banner', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitPartyJoined('sess-1', 'doctor');
    await emitPartyJoined('sess-1', 'doctor');
    await emitPartyJoined('sess-1', 'doctor');

    expect(mock.insert).toHaveBeenCalledTimes(1);
  });

  it('does NOT dedup across roles — doctor then patient writes both', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitPartyJoined('sess-1', 'doctor');
    await emitPartyJoined('sess-1', 'patient');

    expect(mock.insert).toHaveBeenCalledTimes(2);
  });

  it('resolves (does not throw) when the underlying writer fails', async () => {
    mockedDb.getSupabaseAdminClient.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(emitPartyJoined('sess-1', 'doctor')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sub-batch C · task-video-C6 — In-call quick-action emitter tests
// ---------------------------------------------------------------------------

describe('formatFollowUpDateInDoctorTz (Sub-batch C · task-video-C6)', () => {
  it('formats a date in the given IANA timezone with weekday, day, month, time + ampm', () => {
    // 2026-06-01 04:00:00 UTC → 09:30 Asia/Kolkata (UTC+5:30) on Mon 1 Jun.
    const d = new Date('2026-06-01T04:00:00.000Z');
    const out = formatFollowUpDateInDoctorTz(d, 'Asia/Kolkata');
    // Locale-stable assertions: contain weekday short, "Jun", and "am" / "pm".
    expect(out).toMatch(/Mon/);
    expect(out).toMatch(/Jun/);
    expect(out).toMatch(/am|pm/i);
  });

  it('falls back to Asia/Kolkata for empty / invalid timezones', () => {
    const d = new Date('2026-06-01T04:00:00.000Z');
    const fallback = formatFollowUpDateInDoctorTz(d, undefined);
    const explicit = formatFollowUpDateInDoctorTz(d, 'Asia/Kolkata');
    expect(fallback).toBe(explicit);

    const fromBlank = formatFollowUpDateInDoctorTz(d, '');
    expect(fromBlank).toBe(explicit);

    const fromGarbage = formatFollowUpDateInDoctorTz(d, 'NotARealTz/Nowhere');
    expect(fromGarbage).toBe(explicit);
  });
});

describe('emitRxSent (Sub-batch C · task-video-C6)', () => {
  it('inserts the canonical "Doctor sent you a prescription" banner', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitRxSent('sess-1', '00000000-0000-0000-0000-000000000bbb', 'corr-1');

    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        system_event: 'rx_sent',
        body: 'Doctor sent you a prescription. Check your messages or email.',
      }),
    );
  });

  it('dedups per (sessionId, prescriptionId) — re-sending the same Rx does not double-banner', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const rxId = '00000000-0000-0000-0000-000000000bbb';
    await emitRxSent('sess-1', rxId, 'corr-1');
    await emitRxSent('sess-1', rxId, 'corr-2');
    await emitRxSent('sess-1', rxId, 'corr-3');

    expect(mock.insert).toHaveBeenCalledTimes(1);
  });

  it('does NOT dedup across different prescriptions in the same session', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitRxSent('sess-1', '00000000-0000-0000-0000-00000000bbb1', 'corr-1');
    await emitRxSent('sess-1', '00000000-0000-0000-0000-00000000bbb2', 'corr-2');

    expect(mock.insert).toHaveBeenCalledTimes(2);
  });

  it('resolves (does not throw) when the underlying writer fails', async () => {
    mockedDb.getSupabaseAdminClient.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(
      emitRxSent('sess-1', '00000000-0000-0000-0000-000000000bbb', 'corr-1'),
    ).resolves.toBeUndefined();
  });
});

describe('emitMuteChanged (voice T1.8 / task-voice-A7)', () => {
  it('inserts a mute_changed row with metadata and third-person body', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitMuteChanged({
      sessionId: 'sess-1',
      actorId: '00000000-0000-0000-0000-0000000000aa',
      actorRole: 'doctor',
      actorName: 'Dr. Sharma',
      muted: true,
      correlationId: 'mute_changed:test:muted:1',
    });

    expect(mock.insert).toHaveBeenCalledTimes(1);
    const insertCallArg = mock.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertCallArg.system_event).toBe('mute_changed');
    expect(insertCallArg.body).toBe('Dr. Sharma muted their microphone');
    expect(insertCallArg.metadata).toEqual({
      actor_id: '00000000-0000-0000-0000-0000000000aa',
      actor_role: 'doctor',
      actor_name: 'Dr. Sharma',
      muted: true,
    });
  });

  it('dedups within the same correlation window', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const input = {
      sessionId: 'sess-1',
      actorId: '00000000-0000-0000-0000-0000000000aa',
      actorRole: 'patient' as const,
      actorName: 'Patient',
      muted: false,
      correlationId: 'mute_changed:patient:unmuted:99',
    };
    await emitMuteChanged(input);
    await emitMuteChanged(input);

    expect(mock.insert).toHaveBeenCalledTimes(1);
  });
});

describe('emitHoldChanged (voice T2.11 / task-voice-B3)', () => {
  it('inserts a hold_changed row with metadata and third-person body', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitHoldChanged({
      sessionId: 'sess-1',
      actorId: '00000000-0000-0000-0000-0000000000aa',
      actorRole: 'doctor',
      actorName: 'Dr. Sharma',
      onHold: true,
      correlationId: 'hold_changed:test:hold:1',
    });

    expect(mock.insert).toHaveBeenCalledTimes(1);
    const insertCallArg = mock.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertCallArg.system_event).toBe('hold_changed');
    expect(insertCallArg.body).toBe('Dr. Sharma put the call on hold');
    expect(insertCallArg.metadata).toEqual({
      actor_id: '00000000-0000-0000-0000-0000000000aa',
      actor_role: 'doctor',
      actor_name: 'Dr. Sharma',
      on_hold: true,
    });
  });

  it('dedups within the same correlation window', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const input = {
      sessionId: 'sess-1',
      actorId: '00000000-0000-0000-0000-0000000000aa',
      actorRole: 'patient' as const,
      actorName: 'Patient',
      onHold: false,
      correlationId: 'hold_changed:patient:resume:99',
    };
    await emitHoldChanged(input);
    await emitHoldChanged(input);

    expect(mock.insert).toHaveBeenCalledTimes(1);
  });
});

describe('emitFollowUpScheduled (Sub-batch C · task-video-C6)', () => {
  it('inserts a "Doctor scheduled a follow-up for ..." banner with the formatted date', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitFollowUpScheduled(
      'sess-1',
      '00000000-0000-0000-0000-000000000ccc',
      new Date('2026-06-01T04:00:00.000Z'),
      'corr-1',
    );

    expect(mock.insert).toHaveBeenCalledTimes(1);
    const insertCallArg = (mock.insert.mock.calls[0]?.[0] as Record<string, unknown>);
    expect(insertCallArg.system_event).toBe('follow_up_scheduled');
    expect(typeof insertCallArg.body).toBe('string');
    expect((insertCallArg.body as string).startsWith('Doctor scheduled a follow-up for ')).toBe(true);
    expect((insertCallArg.body as string)).toMatch(/Mon|Sun|Tue|Wed|Thu|Fri|Sat/);
  });

  it('dedups per (sessionId, appointmentId) — re-booking the same appointment does not double-banner', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    const apptId = '00000000-0000-0000-0000-000000000ccc';
    await emitFollowUpScheduled('sess-1', apptId, new Date(), 'corr-1');
    await emitFollowUpScheduled('sess-1', apptId, new Date(), 'corr-2');

    expect(mock.insert).toHaveBeenCalledTimes(1);
  });

  it('does NOT dedup across different appointments in the same session', async () => {
    const mock = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(mock.client as never);

    await emitFollowUpScheduled(
      'sess-1',
      '00000000-0000-0000-0000-00000000ccc1',
      new Date(),
      'corr-1',
    );
    await emitFollowUpScheduled(
      'sess-1',
      '00000000-0000-0000-0000-00000000ccc2',
      new Date(),
      'corr-2',
    );

    expect(mock.insert).toHaveBeenCalledTimes(2);
  });

  it('resolves (does not throw) when the underlying writer fails', async () => {
    mockedDb.getSupabaseAdminClient.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(
      emitFollowUpScheduled(
        'sess-1',
        '00000000-0000-0000-0000-000000000ccc',
        new Date(),
        'corr-1',
      ),
    ).resolves.toBeUndefined();
  });
});
