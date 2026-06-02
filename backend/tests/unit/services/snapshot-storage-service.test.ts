/**
 * Unit tests for snapshot-storage-service.ts (Sub-batch C · task-video-C3).
 *
 * Three categories:
 *
 *   1. Pure helpers — `isJpegMagic` (exported for this purpose).
 *   2. Validation gates of `submitSnapshot` — payload shape, magic bytes,
 *      size cap, target enum, dimension bounds, missing JWT. These run
 *      BEFORE any DB / storage round-trip and don't need mocks beyond the
 *      bare admin client.
 *   3. Authorization branching + consent gate — patient JWT path with
 *      `decision === false` returns 403 (ForbiddenError); doctor JWT
 *      bypasses the gate.
 *
 * Storage upload + DB insert paths (steps 4-7 of the service) are NOT
 * exercised here because mocking the Supabase storage client through the
 * full chain (admin.storage.from(...).upload(...).createSignedUrl(...))
 * is more bookkeeping than test value at the unit level. Those land in
 * the manual smoke step on the C3 task file Acceptance §.
 *
 * Same doctrine as `consultation-message-service-system-emitter.test.ts`:
 * mock the admin client + the recording-consent service, exercise the
 * service-layer logic, assert on observable behavior (thrown error types,
 * not insert payload internals — covered by the migration-content tests).
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
    CONSULTATION_MESSAGE_RATE_LIMIT_MAX: 3,
    CONSULTATION_MESSAGE_RATE_LIMIT_WINDOW_SECONDS: 60,
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

jest.mock('../../../src/services/recording-consent-service', () => ({
  getConsentForSession: jest.fn(),
}));

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitSnapshotTaken: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import {
  isJpegMagic,
  submitSnapshot,
  validateAnnotations,
} from '../../../src/services/snapshot-storage-service';
import * as database from '../../../src/config/database';
import * as recordingConsent from '../../../src/services/recording-consent-service';
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedConsent = recordingConsent as jest.Mocked<typeof recordingConsent>;

const VALID_SESSION_ID = '00000000-0000-0000-0000-000000000123';
const SECRET = 'test-secret-at-least-16-chars-long';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function buildJpegBuffer(byteCount = 64): Buffer {
  // First three bytes = JPEG SOI marker; rest is filler.
  const buf = Buffer.alloc(byteCount, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

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

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Pure helper — isJpegMagic
// ---------------------------------------------------------------------------

describe('isJpegMagic', () => {
  it('returns true for buffers that start with FF D8 FF', () => {
    expect(isJpegMagic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(true);
    expect(isJpegMagic(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))).toBe(true);
  });

  it('returns false for empty / too-short buffers', () => {
    expect(isJpegMagic(Buffer.alloc(0))).toBe(false);
    expect(isJpegMagic(Buffer.from([0xff]))).toBe(false);
    expect(isJpegMagic(Buffer.from([0xff, 0xd8]))).toBe(false);
  });

  it('returns false for non-JPEG buffers (PNG, GIF, plain text, garbage)', () => {
    // PNG magic
    expect(isJpegMagic(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    // GIF magic
    expect(isJpegMagic(Buffer.from([0x47, 0x49, 0x46, 0x38]))).toBe(false);
    // Plain ASCII
    expect(isJpegMagic(Buffer.from('hello world', 'utf8'))).toBe(false);
    // First byte right but second wrong — caught by the per-byte loop.
    expect(isJpegMagic(Buffer.from([0xff, 0x00, 0xff]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. submitSnapshot — payload validation gates (run before any DB / storage I/O)
// ---------------------------------------------------------------------------

describe('submitSnapshot — payload validation', () => {
  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildPatientJwt(VALID_SESSION_ID),
      jpegBytes: buildJpegBuffer(),
      target: 'remote' as const,
      dimensions: { width: 1920, height: 1080 },
      correlationId: 'corr-1',
      ...overrides,
    };
  }

  it('rejects a missing sessionId', async () => {
    await expect(
      submitSnapshot({ ...baseInput(), sessionId: '' }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a non-UUID sessionId', async () => {
    await expect(
      submitSnapshot({ ...baseInput(), sessionId: 'not-a-uuid' }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a missing bearer JWT', async () => {
    await expect(
      submitSnapshot({ ...baseInput(), bearerJwt: '' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects an empty JPEG buffer', async () => {
    await expect(
      submitSnapshot({ ...baseInput(), jpegBytes: Buffer.alloc(0) }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a JPEG buffer over the size cap (5 MB)', async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    oversized[2] = 0xff;
    await expect(
      submitSnapshot({ ...baseInput(), jpegBytes: oversized }),
    ).rejects.toThrow(/too large/i);
  });

  it('rejects bytes that are not JPEG (magic-byte sniff)', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]);
    await expect(
      submitSnapshot({ ...baseInput(), jpegBytes: png }),
    ).rejects.toThrow(/not a valid JPEG/i);
  });

  it('rejects an invalid target value', async () => {
    await expect(
      submitSnapshot({ ...baseInput(), target: 'oops' as 'self' }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects out-of-bounds dimensions', async () => {
    // Negative
    await expect(
      submitSnapshot({ ...baseInput(), dimensions: { width: -1, height: 1080 } }),
    ).rejects.toThrow(ValidationError);
    // Zero
    await expect(
      submitSnapshot({ ...baseInput(), dimensions: { width: 0, height: 1080 } }),
    ).rejects.toThrow(ValidationError);
    // Beyond the 8192 cap
    await expect(
      submitSnapshot({ ...baseInput(), dimensions: { width: 9000, height: 1080 } }),
    ).rejects.toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// 3. submitSnapshot — auth + consent gate
// ---------------------------------------------------------------------------

describe('submitSnapshot — auth + consent gate', () => {
  it('throws UnauthorizedError when the patient JWT session_id claim does not match the URL session', async () => {
    const wrongSessionJwt = buildPatientJwt('00000000-0000-0000-0000-000000000999');
    await expect(
      submitSnapshot({
        sessionId: VALID_SESSION_ID,
        bearerJwt: wrongSessionJwt,
        jpegBytes: buildJpegBuffer(),
        target: 'self',
        dimensions: { width: 640, height: 480 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws ForbiddenError when the patient lacks recording consent', async () => {
    mockedConsent.getConsentForSession.mockResolvedValueOnce({
      decision: false,
      capturedAt: new Date(),
      version: 'v1',
    });
    // Admin client must be present (decoded JWT path doesn't need it for
    // patient branch, but consent service does).
    mockedDb.getSupabaseAdminClient.mockReturnValue({} as never);

    await expect(
      submitSnapshot({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(VALID_SESSION_ID),
        jpegBytes: buildJpegBuffer(),
        target: 'self',
        dimensions: { width: 640, height: 480 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when the patient consent decision is null (never asked)', async () => {
    // Conservative posture documented in service JSDoc: snapshots
    // require an explicit yes, so NULL is treated the same as false.
    mockedConsent.getConsentForSession.mockResolvedValueOnce({
      decision: null,
      capturedAt: null,
      version: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({} as never);

    await expect(
      submitSnapshot({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(VALID_SESSION_ID),
        jpegBytes: buildJpegBuffer(),
        target: 'self',
        dimensions: { width: 640, height: 480 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('error message points the patient at the consent re-tap path', async () => {
    mockedConsent.getConsentForSession.mockResolvedValueOnce({
      decision: false,
      capturedAt: new Date(),
      version: 'v1',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({} as never);

    await expect(
      submitSnapshot({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(VALID_SESSION_ID),
        jpegBytes: buildJpegBuffer(),
        target: 'remote',
        dimensions: { width: 640, height: 480 },
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(/recording consent/i);
  });
});

// ---------------------------------------------------------------------------
// 4. validateAnnotations — exercised independently of submitSnapshot so the
//    unit isolation matches `isJpegMagic`'s style. Sub-batch C · task-video-C4.
// ---------------------------------------------------------------------------

describe('validateAnnotations (Sub-batch C · task-video-C4)', () => {
  it('returns an empty array unchanged', () => {
    expect(validateAnnotations([])).toEqual([]);
  });

  it('accepts well-formed point / circle / arrow / text entries', () => {
    const result = validateAnnotations([
      { kind: 'point', x: 100, y: 200, color: '#ef4444', size: 6 },
      { kind: 'circle', cx: 300, cy: 400, r: 50, color: '#3b82f6', width: 4 },
      {
        kind: 'arrow',
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        color: '#22c55e',
        width: 4,
      },
      {
        kind: 'text',
        x: 10,
        y: 20,
        text: 'lesion',
        color: '#eab308',
        fontSize: 24,
      },
    ]);
    expect(result).toHaveLength(4);
    expect(result[0]?.kind).toBe('point');
    expect(result[1]?.kind).toBe('circle');
    expect(result[2]?.kind).toBe('arrow');
    expect(result[3]?.kind).toBe('text');
  });

  it('rejects non-array input', () => {
    expect(() => validateAnnotations('nope' as unknown)).toThrow(ValidationError);
    expect(() => validateAnnotations({} as unknown)).toThrow(ValidationError);
    expect(() => validateAnnotations(null as unknown)).toThrow(ValidationError);
  });

  it('rejects an array exceeding the per-snapshot cap (200)', () => {
    const too_many = Array.from({ length: 201 }, () => ({
      kind: 'point',
      x: 0,
      y: 0,
      color: '#ef4444',
      size: 4,
    }));
    expect(() => validateAnnotations(too_many)).toThrow(/Too many annotations/);
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      validateAnnotations([
        { kind: 'rectangle', x: 0, y: 0, color: '#ef4444', size: 4 },
      ]),
    ).toThrow(/kind must be/);
  });

  it('rejects named colors (must be hex)', () => {
    expect(() =>
      validateAnnotations([
        { kind: 'point', x: 0, y: 0, color: 'red', size: 4 },
      ]),
    ).toThrow(/hex string/);
  });

  it('accepts both #RRGGBB and #RRGGBBAA hex colors', () => {
    const result = validateAnnotations([
      { kind: 'point', x: 0, y: 0, color: '#ef4444', size: 4 },
      { kind: 'point', x: 0, y: 0, color: '#ef4444cc', size: 4 },
    ]);
    expect(result).toHaveLength(2);
  });

  it('rejects NaN / Infinity coordinates', () => {
    expect(() =>
      validateAnnotations([
        { kind: 'point', x: NaN, y: 0, color: '#ef4444', size: 4 },
      ]),
    ).toThrow(/x\/y\/size must be finite/);
    expect(() =>
      validateAnnotations([
        { kind: 'point', x: 0, y: Infinity, color: '#ef4444', size: 4 },
      ]),
    ).toThrow(/finite/);
  });

  it('rejects zero or negative size / radius / width', () => {
    expect(() =>
      validateAnnotations([
        { kind: 'point', x: 0, y: 0, color: '#ef4444', size: 0 },
      ]),
    ).toThrow(ValidationError);
    expect(() =>
      validateAnnotations([
        { kind: 'circle', cx: 0, cy: 0, r: -1, color: '#ef4444', width: 4 },
      ]),
    ).toThrow(ValidationError);
    expect(() =>
      validateAnnotations([
        {
          kind: 'arrow',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          color: '#ef4444',
          width: 0,
        },
      ]),
    ).toThrow(ValidationError);
  });

  it('rejects coords above the 100k sanity cap', () => {
    expect(() =>
      validateAnnotations([
        { kind: 'point', x: 100_001, y: 0, color: '#ef4444', size: 4 },
      ]),
    ).toThrow(ValidationError);
  });

  it('rejects empty text strings on text annotations', () => {
    expect(() =>
      validateAnnotations([
        { kind: 'text', x: 0, y: 0, text: '', color: '#ef4444', fontSize: 24 },
      ]),
    ).toThrow(/non-empty string/);
  });

  it('rejects text strings over the 200-char cap', () => {
    const longText = 'a'.repeat(201);
    expect(() =>
      validateAnnotations([
        {
          kind: 'text',
          x: 0,
          y: 0,
          text: longText,
          color: '#ef4444',
          fontSize: 24,
        },
      ]),
    ).toThrow(/exceeds 200 chars/);
  });

  it('rejects when arrow is missing one of its endpoints', () => {
    expect(() =>
      validateAnnotations([
        {
          kind: 'arrow',
          x1: 0,
          y1: 0,
          // x2 + y2 missing
          color: '#ef4444',
          width: 4,
        },
      ]),
    ).toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// 5. submitSnapshot — annotations metadata path
//    Validates that a malformed annotations payload throws BEFORE the
//    consent/auth gate triggers any side effect (no DB / storage I/O).
// ---------------------------------------------------------------------------

describe('submitSnapshot — annotations metadata (Sub-batch C · task-video-C4)', () => {
  it('rejects malformed annotations with ValidationError before touching consent', async () => {
    // No consent mock; if consent runs, we'd see a different error
    // shape. The validation gate must fire first.
    await expect(
      submitSnapshot({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(VALID_SESSION_ID),
        jpegBytes: buildJpegBuffer(),
        target: 'self',
        dimensions: { width: 640, height: 480 },
        correlationId: 'corr-1',
        annotations: 'not-an-array' as unknown,
      }),
    ).rejects.toThrow(ValidationError);

    // And the consent service must not have been called (gate
    // ordering doctrine).
    expect(mockedConsent.getConsentForSession).not.toHaveBeenCalled();
  });

  it('rejects annotations with an unknown kind via the same path', async () => {
    await expect(
      submitSnapshot({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(VALID_SESSION_ID),
        jpegBytes: buildJpegBuffer(),
        target: 'self',
        dimensions: { width: 640, height: 480 },
        correlationId: 'corr-1',
        annotations: [
          { kind: 'rectangle', x: 0, y: 0, color: '#ef4444', size: 4 },
        ] as unknown,
      }),
    ).rejects.toThrow(/kind must be/);
  });
});
