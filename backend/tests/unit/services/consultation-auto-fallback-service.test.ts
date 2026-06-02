/**
 * Unit tests for consultation-auto-fallback-service.ts (Sub-batch E ·
 * task-video-E2).
 *
 * Two categories — same shape as the C6 quick-actions test:
 *
 *   1. Pure helper — `validateAutoFallbackAction` (exported for this
 *      purpose). Exercises the validation matrix in isolation so the
 *      route doesn't have to duplicate the contract knowledge.
 *
 *   2. `postAutoFallbackBanner` auth + dispatch — the doctor-only
 *      auth gate, the validation-runs-before-auth gate-ordering
 *      doctrine, and the dispatch into the right emitter
 *      (`emitAutoAudioFallback` vs `emitAutoAudioRecovered`).
 *
 * Storage / DB writes are NOT exercised here (the emitters are
 * mocked); their own tests live in the system-emitter suite.
 *
 * Mock shape mirrors `consultation-quick-actions-service.test.ts`
 * line-for-line so the doctor-auth pattern stays single-source.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

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
  emitAutoAudioFallback: jest.fn(),
  emitAutoAudioRecovered: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import {
  AUTO_FALLBACK_KINDS,
  postAutoFallbackBanner,
  validateAutoFallbackAction,
} from '../../../src/services/consultation-auto-fallback-service';
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
const SECRET = 'test-secret-at-least-16-chars-long';

// ---------------------------------------------------------------------------
// Test fixtures (lifted verbatim from quick-actions test for parity)
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
// 1. validateAutoFallbackAction — pure validation matrix
// ---------------------------------------------------------------------------

describe('validateAutoFallbackAction (Sub-batch E · task-video-E2)', () => {
  it('exposes the AUTO_FALLBACK_KINDS whitelist', () => {
    expect(AUTO_FALLBACK_KINDS).toContain('engaged');
    expect(AUTO_FALLBACK_KINDS).toContain('restored');
    expect(AUTO_FALLBACK_KINDS).toHaveLength(2);
  });

  it('rejects a missing body', () => {
    expect(() => validateAutoFallbackAction(undefined)).toThrow(
      ValidationError,
    );
    expect(() => validateAutoFallbackAction(null)).toThrow(ValidationError);
  });

  it('rejects a non-object body', () => {
    expect(() => validateAutoFallbackAction('engaged')).toThrow(
      ValidationError,
    );
    expect(() => validateAutoFallbackAction(42)).toThrow(ValidationError);
  });

  it('rejects a missing kind', () => {
    expect(() => validateAutoFallbackAction({})).toThrow(/kind/);
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      validateAutoFallbackAction({ kind: 'cancelled', attempt: 1 }),
    ).toThrow(/kind/);
  });

  it('rejects engaged without attempt', () => {
    expect(() =>
      validateAutoFallbackAction({ kind: 'engaged', thresholdLevel: 1 }),
    ).toThrow(/attempt/);
  });

  it('rejects engaged with non-finite attempt', () => {
    expect(() =>
      validateAutoFallbackAction({
        kind: 'engaged',
        attempt: Number.POSITIVE_INFINITY,
        thresholdLevel: 1,
      }),
    ).toThrow(/attempt/);
  });

  it('rejects engaged with attempt < 1', () => {
    expect(() =>
      validateAutoFallbackAction({
        kind: 'engaged',
        attempt: 0,
        thresholdLevel: 1,
      }),
    ).toThrow(/attempt/);
  });

  it('rejects engaged with attempt > 100', () => {
    expect(() =>
      validateAutoFallbackAction({
        kind: 'engaged',
        attempt: 101,
        thresholdLevel: 1,
      }),
    ).toThrow(/attempt/);
  });

  it('rejects engaged without thresholdLevel', () => {
    expect(() =>
      validateAutoFallbackAction({ kind: 'engaged', attempt: 1 }),
    ).toThrow(/thresholdLevel/);
  });

  it('rejects engaged with thresholdLevel out of [0,5]', () => {
    expect(() =>
      validateAutoFallbackAction({
        kind: 'engaged',
        attempt: 1,
        thresholdLevel: 6,
      }),
    ).toThrow(/thresholdLevel/);
    expect(() =>
      validateAutoFallbackAction({
        kind: 'engaged',
        attempt: 1,
        thresholdLevel: -1,
      }),
    ).toThrow(/thresholdLevel/);
  });

  it('accepts well-formed engaged and narrows the type', () => {
    const result = validateAutoFallbackAction({
      kind: 'engaged',
      attempt: 1,
      thresholdLevel: 1,
    });
    expect(result.kind).toBe('engaged');
    if (result.kind === 'engaged') {
      expect(result.attempt).toBe(1);
      expect(result.thresholdLevel).toBe(1);
    }
  });

  it('truncates fractional attempt + thresholdLevel', () => {
    const result = validateAutoFallbackAction({
      kind: 'engaged',
      attempt: 2.7,
      thresholdLevel: 1.4,
    });
    if (result.kind === 'engaged') {
      expect(result.attempt).toBe(2);
      expect(result.thresholdLevel).toBe(1);
    }
  });

  it('rejects restored without durationSeconds', () => {
    expect(() =>
      validateAutoFallbackAction({ kind: 'restored', attempt: 1 }),
    ).toThrow(/durationSeconds/);
  });

  it('rejects restored with non-finite durationSeconds', () => {
    expect(() =>
      validateAutoFallbackAction({
        kind: 'restored',
        attempt: 1,
        durationSeconds: Number.NaN,
      }),
    ).toThrow(/durationSeconds/);
  });

  it('clamps negative durationSeconds to 0', () => {
    const result = validateAutoFallbackAction({
      kind: 'restored',
      attempt: 1,
      durationSeconds: -42,
    });
    if (result.kind === 'restored') {
      expect(result.durationSeconds).toBe(0);
    }
  });

  it('clamps absurd durationSeconds to the 4h ceiling', () => {
    const result = validateAutoFallbackAction({
      kind: 'restored',
      attempt: 1,
      durationSeconds: 999_999,
    });
    if (result.kind === 'restored') {
      expect(result.durationSeconds).toBe(60 * 60 * 4);
    }
  });

  it('accepts well-formed restored and narrows the type', () => {
    const result = validateAutoFallbackAction({
      kind: 'restored',
      attempt: 2,
      durationSeconds: 134,
    });
    expect(result.kind).toBe('restored');
    if (result.kind === 'restored') {
      expect(result.attempt).toBe(2);
      expect(result.durationSeconds).toBe(134);
    }
  });

  it('tolerates extra fields (forwards-compat)', () => {
    expect(() =>
      validateAutoFallbackAction({
        kind: 'engaged',
        attempt: 1,
        thresholdLevel: 1,
        futureField: 'whatever',
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. postAutoFallbackBanner — auth + dispatch
// ---------------------------------------------------------------------------

describe('postAutoFallbackBanner (Sub-batch E · task-video-E2)', () => {
  it('rejects a non-UUID sessionId BEFORE any auth round-trip', async () => {
    mountDoctorAdminMock();
    await expect(
      postAutoFallbackBanner({
        sessionId: 'not-a-uuid',
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'engaged', attempt: 1, thresholdLevel: 1 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a missing correlationId', async () => {
    await expect(
      postAutoFallbackBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'engaged', attempt: 1, thresholdLevel: 1 },
        correlationId: '',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('runs validation BEFORE auth (gate-ordering doctrine)', async () => {
    mountDoctorAdminMock();
    await expect(
      postAutoFallbackBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'unknown_kind' } as never,
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a patient JWT with ForbiddenError (doctor-only)', async () => {
    mountDoctorAdminMock();
    await expect(
      postAutoFallbackBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(VALID_SESSION_ID),
        action: { kind: 'engaged', attempt: 1, thresholdLevel: 1 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(mockedMessages.emitAutoAudioFallback).not.toHaveBeenCalled();
  });

  it('rejects a doctor JWT for the wrong session (doctor_id mismatch)', async () => {
    mountDoctorAdminMock({
      sessionRowDoctorId: '00000000-0000-0000-0000-0000000000ff',
    });
    await expect(
      postAutoFallbackBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'engaged', attempt: 1, thresholdLevel: 1 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(UnauthorizedError);
    expect(mockedMessages.emitAutoAudioFallback).not.toHaveBeenCalled();
  });

  it('rejects when the session row is not found', async () => {
    mountDoctorAdminMock({ sessionRowMissing: true });
    await expect(
      postAutoFallbackBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'engaged', attempt: 1, thresholdLevel: 1 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(NotFoundError);
    expect(mockedMessages.emitAutoAudioFallback).not.toHaveBeenCalled();
  });

  it('rejects when admin.auth.getUser returns no user', async () => {
    mountDoctorAdminMock({ returnedDoctorId: '__INVALID__' });
    await expect(
      postAutoFallbackBanner({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        action: { kind: 'engaged', attempt: 1, thresholdLevel: 1 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(UnauthorizedError);
    expect(mockedMessages.emitAutoAudioFallback).not.toHaveBeenCalled();
  });

  it('dispatches engaged to emitAutoAudioFallback on success', async () => {
    mountDoctorAdminMock();
    mockedMessages.emitAutoAudioFallback.mockResolvedValue(undefined as never);

    const result = await postAutoFallbackBanner({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      action: { kind: 'engaged', attempt: 3, thresholdLevel: 1 },
      correlationId: 'corr-engaged-1',
    });

    expect(result.kind).toBe('engaged');
    expect(typeof result.emittedAt).toBe('string');
    expect(Number.isNaN(new Date(result.emittedAt).getTime())).toBe(false);

    expect(mockedMessages.emitAutoAudioFallback).toHaveBeenCalledWith(
      VALID_SESSION_ID,
      3,
      1,
      'corr-engaged-1',
    );
    expect(mockedMessages.emitAutoAudioRecovered).not.toHaveBeenCalled();
  });

  it('dispatches restored to emitAutoAudioRecovered on success', async () => {
    mountDoctorAdminMock();
    mockedMessages.emitAutoAudioRecovered.mockResolvedValue(undefined as never);

    const result = await postAutoFallbackBanner({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      action: { kind: 'restored', attempt: 3, durationSeconds: 134 },
      correlationId: 'corr-restored-1',
    });

    expect(result.kind).toBe('restored');
    expect(mockedMessages.emitAutoAudioRecovered).toHaveBeenCalledWith(
      VALID_SESSION_ID,
      3,
      134,
      'corr-restored-1',
    );
    expect(mockedMessages.emitAutoAudioFallback).not.toHaveBeenCalled();
  });
});
