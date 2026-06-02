/**
 * Unit tests for `services/text-session-supabase.ts` (Plan 04 · Task 18).
 *
 * Covers:
 *   - Adapter shape: `modality` + `provider` constants
 *   - `createSession`: returns deterministic `providerSessionId` (no provider call)
 *   - `endSession`: no-op (no provider call), doesn't throw
 *   - `getJoinToken` (doctor): mints JWT keyed on doctorId, NO url returned
 *   - `getJoinToken` (patient): mints JWT, returns url with HMAC consultation-token
 *   - `getJoinToken` rejects ended/cancelled sessions
 *   - `getJoinToken` rejects doctor identity mismatch
 *   - `getJoinToken` requires `sessionId` in input
 *   - `sendMessage` happy path (mocked admin insert; includes `kind: 'text'`)
 *   - `sendMessage` rejects ended sessions without override
 *   - `sendMessage` happy path for `senderRole='system'` with `systemEvent`
 *     (Plan 06 · Task 39 lit this up; inverted from the pre-Task-39 throw)
 *   - `sendMessage` rejects `senderRole='system'` WITHOUT `systemEvent`
 *     (application-layer guard mirrors Migration 062's row-shape CHECK)
 *   - `sendMessage` rejects `systemEvent` when `senderRole !== 'system'`
 *
 * The Supabase admin client is mocked at the module boundary; the JWT
 * mint helper is real (so tests verify integration end-to-end through to
 * a verifiable token).
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-thirty-two-bytes-long-please';
const TEST_HMAC_SECRET = 'hmac-secret-thirty-two-bytes-yes-please';

jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_JWT_SECRET:                       TEST_JWT_SECRET,
    CONSULTATION_TOKEN_SECRET:                 TEST_HMAC_SECRET,
    APP_BASE_URL:                              'https://app.example.com',
    TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END:    30,
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

// Plan 06 · Task 37: mock the system-emitter surface consumed by
// `getJoinToken`. The re-export of `SYSTEM_SENDER_ID` still flows
// through this mock so pre-Task-37 import sites keep working.
const mockEmitPartyJoined = jest.fn<(sessionId: string, role: 'doctor' | 'patient') => Promise<void>>();

jest.mock('../../../src/services/consultation-message-service', () => ({
  SYSTEM_SENDER_ID: '00000000-0000-0000-0000-000000000000',
  emitPartyJoined: (...args: [string, 'doctor' | 'patient']) => mockEmitPartyJoined(...args),
}));

import * as database from '../../../src/config/database';
import {
  sendMessage,
  SYSTEM_SENDER_ID,
  textSessionSupabaseAdapter,
} from '../../../src/services/text-session-supabase';
import {
  InternalError,
  NotFoundError,
  ValidationError,
} from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const correlationId = 'corr-text-001';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Adapter shape
// ---------------------------------------------------------------------------

describe('textSessionSupabaseAdapter', () => {
  it('declares modality=text and provider=supabase_realtime', () => {
    expect(textSessionSupabaseAdapter.modality).toBe('text');
    expect(textSessionSupabaseAdapter.provider).toBe('supabase_realtime');
  });
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('createSession', () => {
  it('returns providerSessionId = `text:{appointmentId}` and makes no provider call', async () => {
    const result = await textSessionSupabaseAdapter.createSession(
      {
        appointmentId:    'appt-1',
        doctorId:         'doctor-1',
        patientId:        null,
        modality:         'text',
        scheduledStartAt: new Date(Date.now() + 60_000),
        expectedEndAt:    new Date(Date.now() + 30 * 60_000),
      },
      correlationId,
    );
    expect(result.providerSessionId).toBe('text:appt-1');
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// endSession
// ---------------------------------------------------------------------------

describe('endSession', () => {
  it('no-ops without throwing or touching the admin client', async () => {
    await expect(
      textSessionSupabaseAdapter.endSession('text:appt-1', correlationId),
    ).resolves.toBeUndefined();
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getJoinToken — Supabase mock helper
// ---------------------------------------------------------------------------

interface SessionRowFixture {
  id: string;
  doctor_id: string;
  appointment_id: string;
  patient_id: string | null;
  expected_end_at: string;
  status: string;
}

function mockSessionLookup(row: SessionRowFixture | null) {
  const maybeSingle = jest.fn().mockResolvedValue(
    { data: row, error: null } as never,
  );
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  mockedDb.getSupabaseAdminClient.mockReturnValue(
    { from: jest.fn().mockReturnValue({ select }) } as unknown as ReturnType<
      typeof mockedDb.getSupabaseAdminClient
    >,
  );
}

const futureEndIso = (): string =>
  new Date(Date.now() + 30 * 60_000).toISOString();

// ---------------------------------------------------------------------------
// getJoinToken
// ---------------------------------------------------------------------------

describe('getJoinToken', () => {
  it('throws when sessionId is missing in input', async () => {
    await expect(
      textSessionSupabaseAdapter.getJoinToken(
        {
          appointmentId: 'appt-1',
          doctorId:      'd-1',
          role:          'doctor',
        },
        correlationId,
      ),
    ).rejects.toThrow(InternalError);
  });

  it('throws NotFoundError when the session row is missing', async () => {
    mockSessionLookup(null);
    await expect(
      textSessionSupabaseAdapter.getJoinToken(
        {
          appointmentId: 'appt-1',
          doctorId:      'd-1',
          role:          'doctor',
          sessionId:     'sess-x',
        },
        correlationId,
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it.each(['ended', 'cancelled'] as const)(
    'rejects %s sessions with ValidationError',
    async (status) => {
      mockSessionLookup({
        id:              'sess-x',
        doctor_id:       'd-1',
        appointment_id:  'appt-1',
        patient_id:      null,
        expected_end_at: futureEndIso(),
        status,
      });
      await expect(
        textSessionSupabaseAdapter.getJoinToken(
          {
            appointmentId: 'appt-1',
            doctorId:      'd-1',
            role:          'doctor',
            sessionId:     'sess-x',
          },
          correlationId,
        ),
      ).rejects.toThrow(ValidationError);
    },
  );

  it('rejects when role=doctor but doctorId mismatches the session row', async () => {
    mockSessionLookup({
      id:              'sess-x',
      doctor_id:       'd-original',
      appointment_id:  'appt-1',
      patient_id:      null,
      expected_end_at: futureEndIso(),
      status:          'scheduled',
    });
    await expect(
      textSessionSupabaseAdapter.getJoinToken(
        {
          appointmentId: 'appt-1',
          doctorId:      'd-attacker',
          role:          'doctor',
          sessionId:     'sess-x',
        },
        correlationId,
      ),
    ).rejects.toThrow(/Doctor identity mismatch/);
  });

  it('mints a doctor JWT with sub=doctorId and NO url', async () => {
    mockSessionLookup({
      id:              'sess-x',
      doctor_id:       'd-1',
      appointment_id:  'appt-1',
      patient_id:      null,
      expected_end_at: futureEndIso(),
      status:          'scheduled',
    });
    const out = await textSessionSupabaseAdapter.getJoinToken(
      {
        appointmentId: 'appt-1',
        doctorId:      'd-1',
        role:          'doctor',
        sessionId:     'sess-x',
      },
      correlationId,
    );
    expect(out.url).toBeUndefined();
    const decoded = jwt.verify(out.token, TEST_JWT_SECRET) as Record<string, unknown>;
    expect(decoded.sub).toBe('d-1');
    expect(decoded.consult_role).toBe('doctor');
    expect(decoded.session_id).toBe('sess-x');
    expect(out.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('mints a patient JWT with sub=patient:{appointmentId} and url with HMAC token', async () => {
    mockSessionLookup({
      id:              'sess-x',
      doctor_id:       'd-1',
      appointment_id:  'appt-1',
      patient_id:      null,
      expected_end_at: futureEndIso(),
      status:          'scheduled',
    });
    const out = await textSessionSupabaseAdapter.getJoinToken(
      {
        appointmentId: 'appt-1',
        doctorId:      'd-1',
        role:          'patient',
        sessionId:     'sess-x',
      },
      correlationId,
    );
    expect(out.url).toBeDefined();
    expect(out.url).toMatch(
      /^https:\/\/app\.example\.com\/c\/text\/sess-x\?t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    // The URL token is the HMAC `appointmentId.signature`, NOT the
    // Supabase JWT — that's the whole security point of Task 18.
    const urlToken = new URL(out.url!).searchParams.get('t')!;
    const decodedSupabase = jwt.verify(out.token, TEST_JWT_SECRET) as Record<string, unknown>;
    expect(decodedSupabase.sub).toBe('patient:appt-1');
    expect(decodedSupabase.consult_role).toBe('patient');
    // Confirm the URL token is NOT the Supabase JWT.
    expect(urlToken).not.toBe(out.token);
  });

  // Plan 06 · Task 37 — emitPartyJoined wire-up.
  it('fires emitPartyJoined(doctor) after token-mint succeeds', async () => {
    mockSessionLookup({
      id:              'sess-x',
      doctor_id:       'd-1',
      appointment_id:  'appt-1',
      patient_id:      null,
      expected_end_at: futureEndIso(),
      status:          'scheduled',
    });
    await textSessionSupabaseAdapter.getJoinToken(
      {
        appointmentId: 'appt-1',
        doctorId:      'd-1',
        role:          'doctor',
        sessionId:     'sess-x',
      },
      correlationId,
    );
    expect(mockEmitPartyJoined).toHaveBeenCalledTimes(1);
    expect(mockEmitPartyJoined).toHaveBeenCalledWith('sess-x', 'doctor');
  });

  it('fires emitPartyJoined(patient) after token-mint succeeds', async () => {
    mockSessionLookup({
      id:              'sess-x',
      doctor_id:       'd-1',
      appointment_id:  'appt-1',
      patient_id:      null,
      expected_end_at: futureEndIso(),
      status:          'scheduled',
    });
    await textSessionSupabaseAdapter.getJoinToken(
      {
        appointmentId: 'appt-1',
        doctorId:      'd-1',
        role:          'patient',
        sessionId:     'sess-x',
      },
      correlationId,
    );
    expect(mockEmitPartyJoined).toHaveBeenCalledTimes(1);
    expect(mockEmitPartyJoined).toHaveBeenCalledWith('sess-x', 'patient');
  });
});

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

describe('sendMessage', () => {
  function mockAdminForSendMessage(opts: {
    sessionRow: { id: string; status: string } | null;
    insertResult?: { data: { id: string; created_at: string } | null; error: { message: string } | null };
  }) {
    const sessionMaybeSingle = jest.fn().mockResolvedValue(
      { data: opts.sessionRow, error: null } as never,
    );
    const sessionEq = jest.fn().mockReturnValue({ maybeSingle: sessionMaybeSingle });
    const sessionSelect = jest.fn().mockReturnValue({ eq: sessionEq });

    const insertSingle = jest.fn().mockResolvedValue(
      (opts.insertResult ?? {
        data:  { id: 'm-1', created_at: '2026-04-19T10:00:00Z' },
        error: null,
      }) as never,
    );
    const insertSelect = jest.fn().mockReturnValue({ single: insertSingle });
    const insert = jest.fn().mockReturnValue({ select: insertSelect });

    mockedDb.getSupabaseAdminClient.mockReturnValue(
      {
        from: jest.fn<(table: string) => unknown>().mockImplementation((table) => {
          if (table === 'consultation_sessions') {
            return { select: sessionSelect };
          }
          if (table === 'consultation_messages') {
            return { insert };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );

    return { insert, insertSingle };
  }

  it('inserts on a live session and returns the new id', async () => {
    const { insert } = mockAdminForSendMessage({
      sessionRow: { id: 'sess-x', status: 'live' },
    });
    const out = await sendMessage({
      sessionId:     'sess-x',
      senderId:      'd-1',
      senderRole:    'doctor',
      body:          'hello',
      correlationId,
    });
    expect(out).toEqual({ id: 'm-1', createdAt: '2026-04-19T10:00:00Z' });
    expect(insert).toHaveBeenCalledWith({
      session_id:  'sess-x',
      sender_id:   'd-1',
      sender_role: 'doctor',
      kind:        'text',
      body:        'hello',
    });
  });

  it('rejects on ended session without allowEnded', async () => {
    mockAdminForSendMessage({
      sessionRow: { id: 'sess-x', status: 'ended' },
    });
    await expect(
      sendMessage({
        sessionId:     'sess-x',
        senderId:      'd-1',
        senderRole:    'doctor',
        body:          'late message',
        correlationId,
      }),
    ).rejects.toThrow(/status='ended'/);
  });

  it('accepts on ended session WITH allowEnded (Plan 04 chat-end race window)', async () => {
    mockAdminForSendMessage({
      sessionRow: { id: 'sess-x', status: 'ended' },
    });
    await expect(
      sendMessage({
        sessionId:     'sess-x',
        senderId:      'd-1',
        senderRole:    'doctor',
        body:          'final note',
        correlationId,
        allowEnded:    true,
      }),
    ).resolves.toMatchObject({ id: 'm-1' });
  });

  it('throws NotFoundError when session does not exist', async () => {
    mockAdminForSendMessage({ sessionRow: null });
    await expect(
      sendMessage({
        sessionId:     'sess-missing',
        senderId:      'd-1',
        senderRole:    'doctor',
        body:          'hi',
        correlationId,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  // --- senderRole='system' (Plan 06 · Task 39 lit this up) -----------------

  it("inserts a system row with kind='system' + system_event when senderRole='system' (Task 39)", async () => {
    const { insert } = mockAdminForSendMessage({
      sessionRow: { id: 'sess-x', status: 'live' },
    });
    const out = await sendMessage({
      sessionId:     'sess-x',
      senderId:      SYSTEM_SENDER_ID,
      senderRole:    'system',
      body:          'Consult started.',
      systemEvent:   'consult_started',
      correlationId,
    });
    expect(out).toEqual({ id: 'm-1', createdAt: '2026-04-19T10:00:00Z' });
    expect(insert).toHaveBeenCalledWith({
      session_id:   'sess-x',
      sender_id:    SYSTEM_SENDER_ID,
      sender_role:  'system',
      kind:         'system',
      body:         'Consult started.',
      system_event: 'consult_started',
    });
  });

  it("rejects senderRole='system' WITHOUT systemEvent (app-layer mirror of migration 062 row-shape CHECK)", async () => {
    await expect(
      sendMessage({
        sessionId:     'sess-x',
        senderId:      SYSTEM_SENDER_ID,
        senderRole:    'system',
        body:          'missing tag',
        correlationId,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMessage({
        sessionId:     'sess-x',
        senderId:      SYSTEM_SENDER_ID,
        senderRole:    'system',
        body:          'missing tag',
        correlationId,
      }),
    ).rejects.toThrow(/systemEvent is required/);
  });

  it("rejects systemEvent set when senderRole !== 'system' (cross-field contract)", async () => {
    mockAdminForSendMessage({ sessionRow: { id: 'sess-x', status: 'live' } });
    await expect(
      sendMessage({
        sessionId:     'sess-x',
        senderId:      'd-1',
        senderRole:    'doctor',
        body:          'hi',
        systemEvent:   'consult_started',
        correlationId,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('pins SYSTEM_SENDER_ID to the all-zeros UUID (must not drift — filters rely on sender_role, but sender_id stays stable for audits)', () => {
    expect(SYSTEM_SENDER_ID).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('throws ValidationError on missing fields', async () => {
    await expect(
      sendMessage({
        sessionId:     '',
        senderId:      'd',
        senderRole:    'doctor',
        body:          'x',
        correlationId,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMessage({
        sessionId:     'sess',
        senderId:      '',
        senderRole:    'doctor',
        body:          'x',
        correlationId,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      sendMessage({
        sessionId:     'sess',
        senderId:      'd',
        senderRole:    'doctor',
        body:          '',
        correlationId,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws InternalError when admin client unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    await expect(
      sendMessage({
        sessionId:     'sess',
        senderId:      'd',
        senderRole:    'doctor',
        body:          'hi',
        correlationId,
      }),
    ).rejects.toThrow(/admin client unavailable/);
  });
});
