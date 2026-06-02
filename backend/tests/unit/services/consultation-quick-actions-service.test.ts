/**
 * Unit tests for consultation-quick-actions-service.ts (Sub-batch C ·
 * task-video-C6).
 *
 * Two categories:
 *
 *   1. Pure helper — `validateQuickAction` (exported for this purpose
 *      and used by the route handler indirectly). Exercises the
 *      validation matrix in isolation so the route doesn't have to
 *      duplicate the contract knowledge.
 *
 *   2. `postQuickActionBanner` auth + dispatch — the doctor-only
 *      auth gate, the validation-runs-before-auth gate-ordering
 *      doctrine, and the dispatch into the right emitter
 *      (`emitRxSent` vs `emitFollowUpScheduled`).
 *
 * Storage / DB writes are NOT exercised here (the emitters are
 * mocked); their own tests live in
 * `consultation-message-service-system-emitter.test.ts`.
 *
 * Same doctrine as `snapshot-storage-service.test.ts`: mock the admin
 * client + the emitters, exercise the service-layer logic, assert on
 * observable behaviour (thrown error types + emitter call args).
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
  emitRxSent: jest.fn(),
  emitFollowUpScheduled: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import {
  postQuickActionBanner,
  QUICK_ACTION_KINDS,
  validateQuickAction,
} from '../../../src/services/consultation-quick-actions-service';
import * as database from '../../../src/config/database';
import * as messageService from '../../../src/services/consultation-message-service';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedMessages = messageService as jest.Mocked<typeof messageService>;

const VALID_SESSION_ID = '00000000-0000-0000-0000-000000000123';
const VALID_DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const VALID_PRESCRIPTION_ID = '00000000-0000-0000-0000-000000000bbb';
const VALID_APPOINTMENT_ID = '00000000-0000-0000-0000-000000000ccc';
const SECRET = 'test-secret-at-least-16-chars-long';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function buildPatientJwt(sessionId: string): string {
  return jwt.sign(
    {
      sub: `patient:appt-1`,
      consult_role: 'patient',
      session_id: sessionId,
      aud: 'authenticated',
    },
    SECRET,
    { algorithm: 'HS256' },
  );
}

function buildDoctorJwt(): string {
  // The doctor JWT goes through `admin.auth.getUser` upstream — its
  // signature isn't validated by us directly. Any well-formed JWT
  // will do because we mock `getUser` to return the doctor row.
  return jwt.sign(
    {
      sub: VALID_DOCTOR_ID,
      role: 'authenticated',
      aud: 'authenticated',
    },
    SECRET,
    { algorithm: 'HS256' },
  );
}

/**
 * Mount a Supabase admin-client mock that resolves the doctor lookup
 * + the session ownership check the way `resolveDoctorCallerForSession`
 * expects. Returns the underlying jest mocks so individual tests can
 * override per-call behaviour.
 */
function mountDoctorAdminMock(opts: {
  returnedDoctorId?: string;
  sessionRowDoctorId?: string | null;
  sessionRowMissing?: boolean;
  sessionLookupError?: { message: string } | null;
} = {}) {
  const {
    returnedDoctorId = VALID_DOCTOR_ID,
    sessionRowDoctorId = VALID_DOCTOR_ID,
    sessionRowMissing = false,
    sessionLookupError = null,
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

  const sessionMaybeSingleMock = jest.fn();
  sessionMaybeSingleMock.mockResolvedValue({
    data: sessionLookupError
      ? null
      : sessionRowMissing
        ? null
        : { id: VALID_SESSION_ID, doctor_id: sessionRowDoctorId },
    error: sessionLookupError,
  } as never);

  mockedDb.getSupabaseAdminClient.mockReturnValue({
    auth: { getUser: getUserMock },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: sessionMaybeSingleMock,
        }),
      }),
    }),
  } as never);

  return { getUserMock, sessionMaybeSingleMock };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. validateQuickAction — pure validation matrix
// ---------------------------------------------------------------------------

describe('validateQuickAction (Sub-batch C · task-video-C6)', () => {
  it('exposes the QUICK_ACTION_KINDS whitelist', () => {
    expect(QUICK_ACTION_KINDS).toContain('rx_sent');
    expect(QUICK_ACTION_KINDS).toContain('follow_up_scheduled');
    expect(QUICK_ACTION_KINDS).toHaveLength(2);
  });

  it('rejects a missing body', () => {
    expect(() => validateQuickAction(undefined)).toThrow(ValidationError);
    expect(() => validateQuickAction(null)).toThrow(ValidationError);
  });

  it('rejects a non-object body', () => {
    expect(() => validateQuickAction('rx_sent')).toThrow(ValidationError);
    expect(() => validateQuickAction(42)).toThrow(ValidationError);
  });

  it('rejects a missing kind', () => {
    expect(() => validateQuickAction({})).toThrow(/kind/);
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      validateQuickAction({ kind: 'lab_ordered' }),
    ).toThrow(/kind/);
  });

  it('rejects rx_sent without prescriptionId', () => {
    expect(() => validateQuickAction({ kind: 'rx_sent' })).toThrow(
      /prescriptionId/,
    );
  });

  it('rejects rx_sent with a non-UUID prescriptionId', () => {
    expect(() =>
      validateQuickAction({ kind: 'rx_sent', prescriptionId: 'not-a-uuid' }),
    ).toThrow(/UUID/);
  });

  it('accepts well-formed rx_sent and narrows the type', () => {
    const result = validateQuickAction({
      kind: 'rx_sent',
      prescriptionId: VALID_PRESCRIPTION_ID,
    });
    expect(result.kind).toBe('rx_sent');
    if (result.kind === 'rx_sent') {
      expect(result.prescriptionId).toBe(VALID_PRESCRIPTION_ID);
    }
  });

  it('rejects follow_up_scheduled without appointmentId', () => {
    expect(() =>
      validateQuickAction({
        kind: 'follow_up_scheduled',
        scheduledAt: '2026-06-01T10:00:00.000Z',
      }),
    ).toThrow(/appointmentId/);
  });

  it('rejects follow_up_scheduled with a non-UUID appointmentId', () => {
    expect(() =>
      validateQuickAction({
        kind: 'follow_up_scheduled',
        appointmentId: 'nope',
        scheduledAt: '2026-06-01T10:00:00.000Z',
      }),
    ).toThrow(/UUID/);
  });

  it('rejects follow_up_scheduled without scheduledAt', () => {
    expect(() =>
      validateQuickAction({
        kind: 'follow_up_scheduled',
        appointmentId: VALID_APPOINTMENT_ID,
      }),
    ).toThrow(/scheduledAt/);
  });

  it('rejects follow_up_scheduled with empty scheduledAt', () => {
    expect(() =>
      validateQuickAction({
        kind: 'follow_up_scheduled',
        appointmentId: VALID_APPOINTMENT_ID,
        scheduledAt: '',
      }),
    ).toThrow(/scheduledAt/);
  });

  it('rejects follow_up_scheduled with garbage scheduledAt', () => {
    expect(() =>
      validateQuickAction({
        kind: 'follow_up_scheduled',
        appointmentId: VALID_APPOINTMENT_ID,
        scheduledAt: 'not-a-date',
      }),
    ).toThrow(/parseable/);
  });

  it('accepts well-formed follow_up_scheduled and narrows the type', () => {
    const result = validateQuickAction({
      kind: 'follow_up_scheduled',
      appointmentId: VALID_APPOINTMENT_ID,
      scheduledAt: '2026-06-01T10:00:00.000Z',
    });
    expect(result.kind).toBe('follow_up_scheduled');
    if (result.kind === 'follow_up_scheduled') {
      expect(result.appointmentId).toBe(VALID_APPOINTMENT_ID);
      expect(result.scheduledAt).toBe('2026-06-01T10:00:00.000Z');
    }
  });

  it('tolerates extra fields (forwards-compat)', () => {
    expect(() =>
      validateQuickAction({
        kind: 'rx_sent',
        prescriptionId: VALID_PRESCRIPTION_ID,
        futureField: 'whatever',
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. postQuickActionBanner — auth + dispatch
// ---------------------------------------------------------------------------

describe('postQuickActionBanner (Sub-batch C · task-video-C6)', () => {
  it('rejects a non-UUID sessionId BEFORE any auth round-trip', async () => {
    mountDoctorAdminMock();
    await expect(
      postQuickActionBanner({
        sessionId: 'not-a-uuid',
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'rx_sent', prescriptionId: VALID_PRESCRIPTION_ID },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ValidationError);
    // Auth never invoked.
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a missing correlationId', async () => {
    await expect(
      postQuickActionBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'rx_sent', prescriptionId: VALID_PRESCRIPTION_ID },
        correlationId: '',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('runs validation BEFORE auth (gate-ordering doctrine)', async () => {
    mountDoctorAdminMock();
    await expect(
      postQuickActionBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'unknown_kind' } as never,
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ValidationError);
    // Auth never invoked because validation rejected first.
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a patient JWT with ForbiddenError (doctor-only)', async () => {
    mountDoctorAdminMock();
    await expect(
      postQuickActionBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(VALID_SESSION_ID),
        action: { kind: 'rx_sent', prescriptionId: VALID_PRESCRIPTION_ID },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ForbiddenError);
    // Patient branch hard-rejects without calling getUser.
    expect(mockedMessages.emitRxSent).not.toHaveBeenCalled();
  });

  it('rejects a doctor JWT for the wrong session (doctor_id mismatch)', async () => {
    // Session row exists but is owned by a different doctor.
    mountDoctorAdminMock({
      sessionRowDoctorId: '00000000-0000-0000-0000-0000000000ff',
    });
    await expect(
      postQuickActionBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'rx_sent', prescriptionId: VALID_PRESCRIPTION_ID },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(UnauthorizedError);
    expect(mockedMessages.emitRxSent).not.toHaveBeenCalled();
  });

  it('rejects when the session row is not found', async () => {
    mountDoctorAdminMock({ sessionRowMissing: true });
    await expect(
      postQuickActionBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'rx_sent', prescriptionId: VALID_PRESCRIPTION_ID },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(NotFoundError);
    expect(mockedMessages.emitRxSent).not.toHaveBeenCalled();
  });

  it('rejects when admin.auth.getUser returns no user', async () => {
    mountDoctorAdminMock({ returnedDoctorId: '__INVALID__' });
    await expect(
      postQuickActionBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'rx_sent', prescriptionId: VALID_PRESCRIPTION_ID },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(UnauthorizedError);
    expect(mockedMessages.emitRxSent).not.toHaveBeenCalled();
  });

  it('dispatches rx_sent to emitRxSent on success', async () => {
    mountDoctorAdminMock();
    mockedMessages.emitRxSent.mockResolvedValue(undefined as never);

    const result = await postQuickActionBanner({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      action: { kind: 'rx_sent', prescriptionId: VALID_PRESCRIPTION_ID },
      correlationId: 'corr-rx-1',
    });

    expect(result.kind).toBe('rx_sent');
    expect(typeof result.emittedAt).toBe('string');
    expect(Number.isNaN(new Date(result.emittedAt).getTime())).toBe(false);

    expect(mockedMessages.emitRxSent).toHaveBeenCalledWith(
      VALID_SESSION_ID,
      VALID_PRESCRIPTION_ID,
      'corr-rx-1',
    );
    expect(mockedMessages.emitFollowUpScheduled).not.toHaveBeenCalled();
  });

  it('dispatches follow_up_scheduled to emitFollowUpScheduled on success', async () => {
    mountDoctorAdminMock();
    mockedMessages.emitFollowUpScheduled.mockResolvedValue(undefined as never);

    const scheduledAt = '2026-06-01T10:00:00.000Z';
    const result = await postQuickActionBanner({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      action: {
        kind: 'follow_up_scheduled',
        appointmentId: VALID_APPOINTMENT_ID,
        scheduledAt,
      },
      correlationId: 'corr-followup-1',
    });

    expect(result.kind).toBe('follow_up_scheduled');
    expect(mockedMessages.emitFollowUpScheduled).toHaveBeenCalledWith(
      VALID_SESSION_ID,
      VALID_APPOINTMENT_ID,
      // service converts ISO string -> Date before passing through
      expect.any(Date),
      'corr-followup-1',
    );
    // Verify the date matches what we sent.
    const passedDate = mockedMessages.emitFollowUpScheduled.mock
      .calls[0]?.[2] as Date | undefined;
    expect(passedDate?.toISOString()).toBe(scheduledAt);
    expect(mockedMessages.emitRxSent).not.toHaveBeenCalled();
  });
});
