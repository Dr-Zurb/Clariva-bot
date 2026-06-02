/**
 * Unit tests for consultation-extra-participant-service.ts (Sub-batch
 * C · task-video-C8 — three-way calls).
 *
 * Three categories:
 *
 *   1. `validateCreateInviteInput` — pure validation matrix.
 *      Mirrors the C6 validateQuickAction tests; runs in isolation
 *      so the route handler doesn't have to duplicate contract
 *      knowledge.
 *
 *   2. Doctor-only auth gates on `createInvite`, `revokeInvite`,
 *      `listInvitesForSession`. Mirrors the C6 gate-ordering
 *      doctrine: validation BEFORE auth, patient + extra-participant
 *      JWTs hard-rejected, doctor identity must match the session row.
 *
 *   3. `exchangeInviteToken` — public path. Lifecycle gates
 *      (revoked / single-shot), Twilio token mint + Supabase JWT
 *      mint, joined banner emit, fail-soft Twilio fallback.
 *
 * Storage / DB writes are NOT exercised end-to-end (the message
 * emitters are mocked); their own tests live in
 * `consultation-message-service-system-emitter.test.ts`.
 *
 * Same doctrine as `consultation-quick-actions-service.test.ts`:
 * mock the admin client + the emitters, exercise the service-layer
 * logic, assert on observable behaviour (thrown error types,
 * emitter call args, returned shape).
 */

import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
} from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (registered before the unit-under-test import)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_JWT_SECRET: 'test-secret-at-least-16-chars-long',
    APP_BASE_URL: 'https://example.test',
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'test_auth_token',
    TWILIO_API_KEY_SID: 'SK_test',
    TWILIO_API_KEY_SECRET: 'test_api_key_secret',
  },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitParticipantJoined: jest.fn(),
  emitParticipantLeft: jest.fn(),
}));

jest.mock('../../../src/services/video-session-twilio', () => ({
  generateVideoAccessToken: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import {
  createInvite,
  exchangeInviteToken,
  listInvitesForSession,
  recordParticipantLeft,
  revokeInvite,
  validateCreateInviteInput,
} from '../../../src/services/consultation-extra-participant-service';
import * as database from '../../../src/config/database';
import * as messageService from '../../../src/services/consultation-message-service';
import * as twilioService from '../../../src/services/video-session-twilio';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/utils/errors';
import {
  buildExtraParticipantSub,
  verifyScopedConsultationJwt,
} from '../../../src/services/supabase-jwt-mint';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedMessages = messageService as jest.Mocked<typeof messageService>;
const mockedTwilio = twilioService as jest.Mocked<typeof twilioService>;

const VALID_SESSION_ID = '00000000-0000-0000-0000-000000000123';
const VALID_DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const VALID_PARTICIPANT_ID = '00000000-0000-0000-0000-000000000bbb';
const VALID_OTHER_DOCTOR_ID = '00000000-0000-0000-0000-0000000000ff';
const VALID_TWILIO_ROOM = 'RM_test_room_sid_1234567890';
const SECRET = 'test-secret-at-least-16-chars-long';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function buildDoctorJwt(sub: string = VALID_DOCTOR_ID): string {
  return jwt.sign(
    {
      sub,
      role: 'authenticated',
      aud: 'authenticated',
    },
    SECRET,
    { algorithm: 'HS256' },
  );
}

function buildPatientJwt(): string {
  return jwt.sign(
    {
      sub: 'patient:appt-1',
      consult_role: 'patient',
      session_id: VALID_SESSION_ID,
      aud: 'authenticated',
    },
    SECRET,
    { algorithm: 'HS256' },
  );
}

function buildExtraJwt(): string {
  return jwt.sign(
    {
      sub: buildExtraParticipantSub(VALID_PARTICIPANT_ID),
      consult_role: 'extra_participant',
      session_id: VALID_SESSION_ID,
      extra_participant_id: VALID_PARTICIPANT_ID,
      aud: 'authenticated',
    },
    SECRET,
    { algorithm: 'HS256' },
  );
}

/**
 * Mount an admin-client mock that resolves the doctor lookup + the
 * session-ownership check the way `resolveDoctorCallerForSession`
 * expects. Unique extension over the C6 mock: the doctor branch
 * also issues `from('consultation_extra_participants').insert(...)`
 * (createInvite) / `.update(...)` (revokeInvite) / `.select(...)
 * .order(...)` (list). We return per-table mocks keyed by table
 * name so each test can override only what it needs.
 */
interface AdminMockOpts {
  returnedDoctorId?: string;
  sessionRowDoctorId?: string | null;
  sessionRowMissing?: boolean;
  sessionRow?: {
    id: string;
    status: string;
    provider: string | null;
    provider_session_id: string | null;
  };
  /** Override the insert response for `consultation_extra_participants`. */
  insertResponse?: {
    data: { id: string; invited_at: string } | null;
    error: { code?: string; message: string } | null;
  };
  /** Override the update response (used by revoke + recordLeft). */
  updateResponse?: {
    data:
      | { id: string; left_at?: string; display_name?: string; joined_at?: string }
      | null;
    error: { message: string } | null;
  };
  /** Override list query response. */
  listResponse?: {
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
  };
  /** Override exchange-path lookup (`from(extra).select(...).eq(invite_token=...).maybeSingle()`). */
  exchangeLookupResponse?: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  };
}

function mountAdminMock(opts: AdminMockOpts = {}) {
  const {
    returnedDoctorId = VALID_DOCTOR_ID,
    sessionRowDoctorId = VALID_DOCTOR_ID,
    sessionRowMissing = false,
    sessionRow = {
      id: VALID_SESSION_ID,
      status: 'live',
      provider: 'twilio_video',
      provider_session_id: VALID_TWILIO_ROOM,
    },
    insertResponse = {
      data: { id: VALID_PARTICIPANT_ID, invited_at: '2026-05-01T10:00:00Z' },
      error: null,
    },
    updateResponse = {
      data: {
        id: VALID_PARTICIPANT_ID,
        left_at: '2026-05-01T10:30:00Z',
        display_name: 'Maria',
        joined_at: '2026-05-01T10:00:00Z',
      },
      error: null,
    },
    listResponse = { data: [], error: null },
    exchangeLookupResponse = {
      data: {
        id: VALID_PARTICIPANT_ID,
        session_id: VALID_SESSION_ID,
        invite_token: 'tok-abc',
        display_name: 'Maria',
        role_label: 'interpreter',
        invited_by: VALID_DOCTOR_ID,
        invited_at: '2026-05-01T10:00:00Z',
        joined_at: null,
        left_at: null,
        revoked_at: null,
      },
      error: null,
    },
  } = opts;

  const getUserMock = jest.fn();
  if (returnedDoctorId === '__INVALID__') {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    } as never);
  } else {
    getUserMock.mockResolvedValue({
      data: { user: { id: returnedDoctorId } },
      error: null,
    } as never);
  }

  // Per-table from() router so different tables can have different
  // chain shapes simultaneously within the same test.
  const fromMock = jest.fn((table: string) => {
    if (table === 'consultation_sessions') {
      const sessionMaybeSingle = jest.fn().mockResolvedValue({
        data: sessionRowMissing
          ? null
          : { ...sessionRow, doctor_id: sessionRowDoctorId },
        error: null,
      } as never);
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: sessionMaybeSingle,
          }),
        }),
      };
    }
    if (table === 'consultation_extra_participants') {
      const insertSingle = jest.fn().mockResolvedValue(insertResponse as never);

      const updateMaybeSingle = jest
        .fn()
        .mockResolvedValue(updateResponse as never);

      const exchangeMaybeSingle = jest
        .fn()
        .mockResolvedValue(exchangeLookupResponse as never);

      const listOrder = jest.fn().mockResolvedValue(listResponse as never);

      const lookupForRevokeMaybeSingle = jest.fn().mockResolvedValue({
        data: {
          id: VALID_PARTICIPANT_ID,
          session_id: VALID_SESSION_ID,
          display_name: 'Maria',
          joined_at: '2026-05-01T10:00:00Z',
          left_at: null,
          revoked_at: null,
        },
        error: null,
      } as never);

      return {
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: insertSingle,
          }),
        }),
        // We model two distinct read chains: (a) the createInvite
        // / revokeInvite / recordLeft reads; (b) the
        // exchangeInviteToken read. They differ by the eq() call
        // shape: exchange uses `.eq('invite_token', ...)` while
        // revoke uses `.eq('id', ...).eq('session_id', ...)`. The
        // chain stub below tolerates either by returning a single
        // builder that supports any combination of the chained
        // methods we care about.
        select: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockReturnValue({
            // exchange path
            maybeSingle: exchangeMaybeSingle,
            // revoke path: .eq().eq().maybeSingle()
            eq: jest.fn().mockReturnValue({
              maybeSingle: lookupForRevokeMaybeSingle,
            }),
            // list path: .eq().order()
            order: listOrder,
          }),
        })),
        // The update() builder must support THREE shapes simultaneously:
        //   (a) revokeInvite              : update().eq()  -> thenable {error}
        //   (b) createInvite stamp-joined : update().eq().is().is().select().maybeSingle()
        //   (c) recordParticipantLeft     : update().eq().eq().is().select().maybeSingle()
        //
        // We expose .eq() that returns a hybrid object which is itself a
        // thenable (for revoke) AND carries .eq()/.is() for the other two
        // chains.
        update: jest.fn().mockImplementation(() => {
          const isLeafSelect = {
            select: jest.fn().mockReturnValue({
              maybeSingle: updateMaybeSingle,
            }),
          };
          // Stage after .eq().eq() for recordParticipantLeft
          const recordLeftAfterTwoEqs = {
            is: jest.fn().mockReturnValue(isLeafSelect),
          };
          // Stage after the FIRST .eq() — must be:
          //   - thenable (revoke) → resolves to { error: null }
          //   - .eq() (recordLeft) → recordLeftAfterTwoEqs
          //   - .is() (createInvite stamp-joined) → .is().select().maybeSingle()
          const afterFirstEq: Record<string, unknown> = {
            eq: jest.fn().mockReturnValue(recordLeftAfterTwoEqs),
            is: jest.fn().mockReturnValue({
              is: jest.fn().mockReturnValue(isLeafSelect),
            }),
            then: (resolve: (v: { error: null }) => unknown) =>
              resolve({ error: null }),
          };
          return {
            eq: jest.fn().mockReturnValue(afterFirstEq),
          };
        }),
      };
    }
    throw new Error(`Unexpected table mocked: ${table}`);
  });

  mockedDb.getSupabaseAdminClient.mockReturnValue({
    auth: { getUser: getUserMock },
    from: fromMock,
  } as never);

  return { getUserMock, fromMock };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: Twilio mint succeeds.
  mockedTwilio.generateVideoAccessToken.mockReturnValue('twilio.access.token.fake');
});

// ---------------------------------------------------------------------------
// 1. validateCreateInviteInput — pure validation matrix
// ---------------------------------------------------------------------------

describe('validateCreateInviteInput (Sub-batch C · task-video-C8)', () => {
  it('rejects a missing body', () => {
    expect(() => validateCreateInviteInput(undefined)).toThrow(ValidationError);
    expect(() => validateCreateInviteInput(null)).toThrow(ValidationError);
  });

  it('rejects a non-object body', () => {
    expect(() => validateCreateInviteInput('Maria')).toThrow(ValidationError);
    expect(() => validateCreateInviteInput(42)).toThrow(ValidationError);
  });

  it('rejects a missing displayName', () => {
    expect(() => validateCreateInviteInput({})).toThrow(/displayName/);
  });

  it('rejects a non-string displayName', () => {
    expect(() => validateCreateInviteInput({ displayName: 123 })).toThrow(
      /displayName/,
    );
  });

  it('rejects an empty displayName after trim', () => {
    expect(() =>
      validateCreateInviteInput({ displayName: '   ' }),
    ).toThrow(/empty/);
  });

  it('rejects an over-long displayName', () => {
    expect(() =>
      validateCreateInviteInput({ displayName: 'x'.repeat(81) }),
    ).toThrow(/80/);
  });

  it('accepts a well-formed displayName + null roleLabel', () => {
    const result = validateCreateInviteInput({ displayName: 'Maria' });
    expect(result).toEqual({ displayName: 'Maria', roleLabel: null });
  });

  it('trims whitespace from displayName', () => {
    const result = validateCreateInviteInput({ displayName: '  Maria  ' });
    expect(result.displayName).toBe('Maria');
  });

  it('accepts a roleLabel and trims it', () => {
    const result = validateCreateInviteInput({
      displayName: 'Maria',
      roleLabel: '  interpreter  ',
    });
    expect(result.roleLabel).toBe('interpreter');
  });

  it('coalesces an empty/whitespace roleLabel to null', () => {
    const result = validateCreateInviteInput({
      displayName: 'Maria',
      roleLabel: '   ',
    });
    expect(result.roleLabel).toBeNull();
  });

  it('rejects an over-long roleLabel', () => {
    expect(() =>
      validateCreateInviteInput({
        displayName: 'Maria',
        roleLabel: 'x'.repeat(65),
      }),
    ).toThrow(/64/);
  });

  it('rejects a non-string roleLabel', () => {
    expect(() =>
      validateCreateInviteInput({ displayName: 'Maria', roleLabel: 42 }),
    ).toThrow(/roleLabel/);
  });
});

// ---------------------------------------------------------------------------
// 2. createInvite — auth + dispatch + side-effect
// ---------------------------------------------------------------------------

describe('createInvite (Sub-batch C · task-video-C8)', () => {
  it('rejects a non-UUID sessionId BEFORE any auth round-trip', async () => {
    mountAdminMock();
    await expect(
      createInvite({
        sessionId: 'not-a-uuid',
        bearerJwt: buildDoctorJwt(),
        displayName: 'Maria',
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a missing correlationId', async () => {
    await expect(
      createInvite({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        displayName: 'Maria',
        correlationId: '',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('runs body validation BEFORE auth (gate-ordering)', async () => {
    mountAdminMock();
    await expect(
      createInvite({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        displayName: '',
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a patient JWT with ForbiddenError', async () => {
    mountAdminMock();
    await expect(
      createInvite({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(),
        displayName: 'Maria',
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects an extra-participant JWT with ForbiddenError', async () => {
    mountAdminMock();
    await expect(
      createInvite({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildExtraJwt(),
        displayName: 'Maria',
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects a doctor JWT for the wrong session (doctor_id mismatch)', async () => {
    mountAdminMock({ sessionRowDoctorId: VALID_OTHER_DOCTOR_ID });
    await expect(
      createInvite({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        displayName: 'Maria',
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects when the session row is missing (NotFound)', async () => {
    mountAdminMock({ sessionRowMissing: true });
    await expect(
      createInvite({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        displayName: 'Maria',
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('returns participantId + inviteToken + inviteUrl on success', async () => {
    mountAdminMock();
    const result = await createInvite({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      displayName: 'Maria',
      roleLabel: 'interpreter',
      correlationId: 'corr-1',
    });
    expect(result.participantId).toBe(VALID_PARTICIPANT_ID);
    expect(result.inviteToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.inviteToken.length).toBeGreaterThanOrEqual(32);
    expect(result.inviteUrl).toBe(
      `https://example.test/c/video-invite/${result.inviteToken}`,
    );
    expect(result.invitedAt).toBe('2026-05-01T10:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// 3. exchangeInviteToken — public path
// ---------------------------------------------------------------------------

describe('exchangeInviteToken (Sub-batch C · task-video-C8)', () => {
  it('rejects a missing inviteToken', async () => {
    await expect(
      exchangeInviteToken({ inviteToken: '', correlationId: 'c' }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects an inviteToken with invalid characters', async () => {
    await expect(
      exchangeInviteToken({
        inviteToken: 'has spaces and !!! chars',
        correlationId: 'c',
      }),
    ).rejects.toThrow(/invalid characters/);
  });

  it('rejects when the row is not found', async () => {
    mountAdminMock({
      exchangeLookupResponse: { data: null, error: null },
    });
    await expect(
      exchangeInviteToken({ inviteToken: 'tok-missing', correlationId: 'c' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a revoked invite', async () => {
    mountAdminMock({
      exchangeLookupResponse: {
        data: {
          id: VALID_PARTICIPANT_ID,
          session_id: VALID_SESSION_ID,
          invite_token: 'tok',
          display_name: 'Maria',
          role_label: 'interpreter',
          invited_by: VALID_DOCTOR_ID,
          invited_at: '2026-05-01T10:00:00Z',
          joined_at: null,
          left_at: null,
          revoked_at: '2026-05-01T11:00:00Z',
        },
        error: null,
      },
    });
    await expect(
      exchangeInviteToken({ inviteToken: 'tok', correlationId: 'c' }),
    ).rejects.toThrow(/revoked/);
  });

  it('rejects an already-used invite (single-shot)', async () => {
    mountAdminMock({
      exchangeLookupResponse: {
        data: {
          id: VALID_PARTICIPANT_ID,
          session_id: VALID_SESSION_ID,
          invite_token: 'tok',
          display_name: 'Maria',
          role_label: 'interpreter',
          invited_by: VALID_DOCTOR_ID,
          invited_at: '2026-05-01T10:00:00Z',
          joined_at: '2026-05-01T10:30:00Z',
          left_at: null,
          revoked_at: null,
        },
        error: null,
      },
    });
    await expect(
      exchangeInviteToken({ inviteToken: 'tok', correlationId: 'c' }),
    ).rejects.toThrow(/already been used/);
  });

  it('mints a Supabase JWT and a Twilio token on success', async () => {
    mountAdminMock();
    const result = await exchangeInviteToken({
      inviteToken: 'tok-fresh',
      correlationId: 'c',
    });
    expect(result.participantId).toBe(VALID_PARTICIPANT_ID);
    expect(result.sessionId).toBe(VALID_SESSION_ID);
    expect(result.displayName).toBe('Maria');
    expect(result.roleLabel).toBe('interpreter');
    expect(result.twilioToken).toBe('twilio.access.token.fake');
    expect(result.roomName).toBe(VALID_TWILIO_ROOM);
    // JWT verifies + carries the right claims.
    const decoded = verifyScopedConsultationJwt(result.jwt);
    expect(decoded.consult_role).toBe('extra_participant');
    expect(decoded.session_id).toBe(VALID_SESSION_ID);
    expect(decoded.extra_participant_id).toBe(VALID_PARTICIPANT_ID);
    expect(decoded.sub).toBe(`extra:${VALID_PARTICIPANT_ID}`);
  });

  it('emits participant_joined banner with displayName + roleLabel', async () => {
    mountAdminMock();
    await exchangeInviteToken({
      inviteToken: 'tok-fresh',
      correlationId: 'c',
    });
    expect(mockedMessages.emitParticipantJoined).toHaveBeenCalledWith(
      VALID_SESSION_ID,
      VALID_PARTICIPANT_ID,
      'Maria',
      'interpreter',
      'c',
    );
  });

  it('falls back to chat-only when Twilio is not configured (no provider_session_id)', async () => {
    mountAdminMock({
      sessionRow: {
        id: VALID_SESSION_ID,
        status: 'live',
        provider: null,
        provider_session_id: null,
      },
    });
    const result = await exchangeInviteToken({
      inviteToken: 'tok-fresh',
      correlationId: 'c',
    });
    expect(result.twilioToken).toBeNull();
    expect(result.roomName).toBeNull();
    // JWT still minted — chat surface still works.
    expect(result.jwt.length).toBeGreaterThan(20);
  });

  it('falls back gracefully when Twilio mint throws', async () => {
    mountAdminMock();
    mockedTwilio.generateVideoAccessToken.mockImplementationOnce(() => {
      throw new Error('Twilio is sad');
    });
    const result = await exchangeInviteToken({
      inviteToken: 'tok-fresh',
      correlationId: 'c',
    });
    expect(result.twilioToken).toBeNull();
    expect(result.roomName).toBe(VALID_TWILIO_ROOM);
    // Banner still emitted.
    expect(mockedMessages.emitParticipantJoined).toHaveBeenCalled();
  });

  it('rejects when session is in a non-joinable status', async () => {
    mountAdminMock({
      sessionRow: {
        id: VALID_SESSION_ID,
        status: 'ended',
        provider: 'twilio_video',
        provider_session_id: VALID_TWILIO_ROOM,
      },
    });
    await expect(
      exchangeInviteToken({ inviteToken: 'tok-fresh', correlationId: 'c' }),
    ).rejects.toThrow(/ended/);
  });
});

// ---------------------------------------------------------------------------
// 4. revokeInvite — auth + dispatch
// ---------------------------------------------------------------------------

describe('revokeInvite (Sub-batch C · task-video-C8)', () => {
  it('rejects a non-UUID sessionId BEFORE auth', async () => {
    await expect(
      revokeInvite({
        sessionId: 'not-a-uuid',
        bearerJwt: buildDoctorJwt(),
        participantId: VALID_PARTICIPANT_ID,
        correlationId: 'c',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a non-UUID participantId BEFORE auth', async () => {
    await expect(
      revokeInvite({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        participantId: 'not-a-uuid',
        correlationId: 'c',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a patient JWT with ForbiddenError', async () => {
    mountAdminMock();
    await expect(
      revokeInvite({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(),
        participantId: VALID_PARTICIPANT_ID,
        correlationId: 'c',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('emits participant_left only when the participant had joined', async () => {
    mountAdminMock();
    await revokeInvite({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      participantId: VALID_PARTICIPANT_ID,
      correlationId: 'c',
    });
    expect(mockedMessages.emitParticipantLeft).toHaveBeenCalledWith(
      VALID_SESSION_ID,
      VALID_PARTICIPANT_ID,
      'Maria',
      'c',
    );
  });
});

// ---------------------------------------------------------------------------
// 5. recordParticipantLeft — extra-participant JWT path
// ---------------------------------------------------------------------------

describe('recordParticipantLeft (Sub-batch C · task-video-C8)', () => {
  it('rejects a missing bearerJwt', async () => {
    await expect(
      recordParticipantLeft({ bearerJwt: '', correlationId: 'c' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a doctor JWT (wrong consult_role)', async () => {
    await expect(
      recordParticipantLeft({
        bearerJwt: buildDoctorJwt(),
        correlationId: 'c',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('stamps left_at and emits participant_left on success', async () => {
    mountAdminMock();
    const result = await recordParticipantLeft({
      bearerJwt: buildExtraJwt(),
      correlationId: 'c',
    });
    expect(result.participantId).toBe(VALID_PARTICIPANT_ID);
    expect(result.newlyStamped).toBe(true);
    expect(mockedMessages.emitParticipantLeft).toHaveBeenCalledWith(
      VALID_SESSION_ID,
      VALID_PARTICIPANT_ID,
      'Maria',
      'c',
    );
  });
});

// ---------------------------------------------------------------------------
// 6. listInvitesForSession — auth + shape
// ---------------------------------------------------------------------------

describe('listInvitesForSession (Sub-batch C · task-video-C8)', () => {
  it('rejects a patient JWT', async () => {
    mountAdminMock();
    await expect(
      listInvitesForSession({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(),
        correlationId: 'c',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('returns mapped rows with active boolean computed correctly', async () => {
    mountAdminMock({
      listResponse: {
        data: [
          {
            id: VALID_PARTICIPANT_ID,
            session_id: VALID_SESSION_ID,
            invite_token: 'tok-1',
            display_name: 'Maria',
            role_label: 'interpreter',
            invited_by: VALID_DOCTOR_ID,
            invited_at: '2026-05-01T10:00:00Z',
            joined_at: '2026-05-01T10:05:00Z',
            left_at: null,
            revoked_at: null,
          },
          {
            id: '00000000-0000-0000-0000-000000000ddd',
            session_id: VALID_SESSION_ID,
            invite_token: 'tok-2',
            display_name: 'Pending',
            role_label: null,
            invited_by: VALID_DOCTOR_ID,
            invited_at: '2026-05-01T10:01:00Z',
            joined_at: null,
            left_at: null,
            revoked_at: null,
          },
        ],
        error: null,
      },
    });
    const rows = await listInvitesForSession({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'c',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].active).toBe(true); // joined, not left, not revoked
    expect(rows[1].active).toBe(false); // not yet joined
    // invite_token is NOT echoed back (sensitive).
    expect(rows[0]).not.toHaveProperty('invite_token');
  });
});
