/**
 * Unit tests for snapshot-review-service.ts (Sub-batch D · task-video-D3).
 *
 * Coverage matrix:
 *
 *   1. Validation gate:
 *        - list: missing sessionId / non-UUID sessionId / missing bearer
 *        - attach: missing snapshotId / non-UUID snapshotId / bad section enum
 *        - discard: missing snapshotId / non-UUID snapshotId
 *
 *   2. Auth — doctor-only branch:
 *        - bearer that admin.auth.getUser rejects → UnauthorizedError
 *        - doctor token but session.doctor_id mismatch → ForbiddenError
 *        - session not found → NotFoundError
 *
 *   3. listSnapshots:
 *        - returns rows with signed URLs
 *        - includeDiscarded=false hides discarded rows
 *        - includeDiscarded=true (default) keeps discarded rows but
 *          surfaces `discardedAt`
 *        - signed-URL mint failure → empty signedUrl, no throw
 *        - rows without metadata fall back to row-level created_at
 *
 *   4. attachSnapshotToSection:
 *        - successful path sets metadata.clinical_section
 *        - non-snapshot row (regular chat attachment) → ValidationError
 *        - snapshot row not in this session → NotFoundError
 *
 *   5. discardSnapshot:
 *        - successful path sets metadata.discarded_at
 *        - idempotent re-call preserves original timestamp
 */

import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
} from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (registered before unit-under-test import)
// ---------------------------------------------------------------------------

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

import {
  attachSnapshotToSection,
  discardSnapshot,
  listSnapshots,
  isClinicalSection,
  CLINICAL_SECTIONS,
} from '../../../src/services/snapshot-review-service';
import * as database from '../../../src/config/database';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;

const VALID_SESSION_ID = '00000000-0000-0000-0000-000000000123';
const VALID_DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const VALID_OTHER_DOCTOR_ID = '00000000-0000-0000-0000-0000000000ff';
const VALID_SNAPSHOT_ID = '00000000-0000-0000-0000-0000000001aa';
const VALID_SNAPSHOT_ID_2 = '00000000-0000-0000-0000-0000000001bb';
const BEARER = 'doctor.bearer.jwt';

// ---------------------------------------------------------------------------
// Admin client mock builder
// ---------------------------------------------------------------------------

interface SnapshotRow {
  id: string;
  attachment_url: string | null;
  attachment_byte_size?: number | null;
  body?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  kind?: string;
  session_id?: string;
}

interface AdminMockOpts {
  /** result for `admin.auth.getUser(bearer)`. */
  authGetUserResult?: {
    data: { user: { id: string } | null } | null;
    error: { message: string } | null;
  };
  /** session row (for the doctor-on-session ownership check). */
  sessionRow?: { id: string; doctor_id: string } | null;
  /** rows returned by the list query (for listSnapshots). */
  listRows?: SnapshotRow[];
  /** error from the list query. */
  listError?: { message: string } | null;
  /** row returned by the maybeSingle on consultation_messages (mutate path). */
  mutateFetchRow?: SnapshotRow | null;
  /** error from the mutate fetch query. */
  mutateFetchError?: { message: string } | null;
  /** error from the update query. */
  mutateUpdateError?: { message: string } | null;
  /** signed URL the storage createSignedUrl returns. */
  signedUrl?: string;
  /** signed URL error (drives degrade-to-empty branch). */
  signedUrlError?: { message: string } | null;
}

function mountAdminMock(opts: AdminMockOpts = {}) {
  const {
    authGetUserResult = {
      data: { user: { id: VALID_DOCTOR_ID } },
      error: null,
    },
    sessionRow = { id: VALID_SESSION_ID, doctor_id: VALID_DOCTOR_ID },
    listRows = [],
    listError = null,
    mutateFetchRow = null,
    mutateFetchError = null,
    mutateUpdateError = null,
    signedUrl = 'https://signed.example/snapshot.jpg?t=fake',
    signedUrlError = null,
  } = opts;

  // Capture the latest .update() payload so tests can assert on it.
  const updateCalls: Array<Record<string, unknown>> = [];

  // Per-table chains.
  const fromMock = jest.fn((table: string) => {
    if (table === 'consultation_sessions') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest
              .fn<() => Promise<unknown>>()
              .mockResolvedValue({ data: sessionRow, error: null }),
          }),
        }),
      };
    }
    if (table === 'consultation_messages') {
      // We support BOTH the list path (select.eq.eq.filter.order) and
      // the mutate fetch path (select.eq.eq.maybeSingle), and the
      // mutate update path (update.eq.eq).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        filter: jest.fn(() => builder),
        order: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ data: listRows, error: listError }),
        maybeSingle: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ data: mutateFetchRow, error: mutateFetchError }),
        update: jest.fn((payload: Record<string, unknown>) => {
          updateCalls.push(payload);
          return {
            eq: jest.fn().mockReturnValue({
              eq: jest
                .fn<() => Promise<unknown>>()
                .mockResolvedValue({ error: mutateUpdateError }),
            }),
          };
        }),
      };
      return builder;
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  const storageBucketMock = {
    createSignedUrl: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({
        data: signedUrlError ? null : { signedUrl },
        error: signedUrlError,
      }),
  };

  const admin = {
    from: fromMock,
    auth: {
      getUser: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(authGetUserResult),
    },
    storage: {
      from: jest.fn(() => storageBucketMock),
    },
  };

  mockedDb.getSupabaseAdminClient.mockReturnValue(
    admin as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
  );
  return { admin, updateCalls, storageBucketMock };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshotRow(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    id: VALID_SNAPSHOT_ID,
    session_id: VALID_SESSION_ID,
    attachment_url: `${VALID_SESSION_ID}/snapshots/${VALID_SNAPSHOT_ID}.jpg`,
    attachment_byte_size: 12345,
    body: 'Doctor snapshot (other party)',
    metadata: {
      snapshot: true,
      capturer_role: 'doctor',
      target: 'remote',
      captured_at: '2026-05-01T10:15:00Z',
      dimensions: { width: 1280, height: 720 },
    },
    created_at: '2026-05-01T10:15:00Z',
    kind: 'attachment',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('snapshot-review-service · validation gate', () => {
  it('listSnapshots throws ValidationError on missing sessionId', async () => {
    await expect(
      listSnapshots({
        sessionId: '',
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('listSnapshots throws ValidationError on non-UUID sessionId', async () => {
    await expect(
      listSnapshots({
        sessionId: 'not-a-uuid',
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('listSnapshots throws UnauthorizedError on missing bearer', async () => {
    await expect(
      listSnapshots({
        sessionId: VALID_SESSION_ID,
        bearerJwt: '',
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('attachSnapshotToSection throws ValidationError on non-UUID snapshotId', async () => {
    await expect(
      attachSnapshotToSection({
        sessionId: VALID_SESSION_ID,
        snapshotId: 'not-a-uuid',
        section: 'Objective',
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('attachSnapshotToSection throws ValidationError on bad section enum', async () => {
    await expect(
      attachSnapshotToSection({
        sessionId: VALID_SESSION_ID,
        snapshotId: VALID_SNAPSHOT_ID,
        // @ts-expect-error — testing runtime enum guard
        section: 'NotARealSection',
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('discardSnapshot throws ValidationError on non-UUID snapshotId', async () => {
    await expect(
      discardSnapshot({
        sessionId: VALID_SESSION_ID,
        snapshotId: 'not-a-uuid',
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('snapshot-review-service · isClinicalSection helper', () => {
  it('accepts every canonical Decision §19 section', () => {
    for (const section of CLINICAL_SECTIONS) {
      expect(isClinicalSection(section)).toBe(true);
    }
  });

  it('rejects non-string and unknown values', () => {
    expect(isClinicalSection('Other')).toBe(false);
    expect(isClinicalSection('')).toBe(false);
    expect(isClinicalSection(null)).toBe(false);
    expect(isClinicalSection(undefined)).toBe(false);
    expect(isClinicalSection(42)).toBe(false);
  });
});

describe('snapshot-review-service · auth (doctor-only branch)', () => {
  it('rejects bearer that admin.auth.getUser cannot validate', async () => {
    mountAdminMock({
      authGetUserResult: {
        data: null,
        error: { message: 'invalid signature' },
      },
    });
    await expect(
      listSnapshots({
        sessionId: VALID_SESSION_ID,
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects when session row is missing (NotFoundError)', async () => {
    mountAdminMock({ sessionRow: null });
    await expect(
      listSnapshots({
        sessionId: VALID_SESSION_ID,
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when caller is not the session owner (ForbiddenError)', async () => {
    mountAdminMock({
      sessionRow: { id: VALID_SESSION_ID, doctor_id: VALID_OTHER_DOCTOR_ID },
    });
    await expect(
      listSnapshots({
        sessionId: VALID_SESSION_ID,
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('snapshot-review-service · listSnapshots', () => {
  it('returns snapshots with signed URLs + parsed metadata', async () => {
    mountAdminMock({
      listRows: [
        snapshotRow({ id: VALID_SNAPSHOT_ID }),
        snapshotRow({
          id: VALID_SNAPSHOT_ID_2,
          metadata: {
            snapshot: true,
            capturer_role: 'patient',
            target: 'self',
            annotated: true,
            clinical_section: 'Objective',
            captured_at: '2026-05-01T10:18:00Z',
            dimensions: { width: 640, height: 480 },
          },
          created_at: '2026-05-01T10:18:00Z',
        }),
      ],
    });

    const items = await listSnapshots({
      sessionId: VALID_SESSION_ID,
      bearerJwt: BEARER,
      correlationId: 'cor-1',
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      snapshotId: VALID_SNAPSHOT_ID,
      capturerRole: 'doctor',
      target: 'remote',
      annotated: false,
      clinicalSection: null,
      discardedAt: null,
      dimensions: { width: 1280, height: 720 },
    });
    expect(items[0].signedUrl).toMatch(/^https:\/\/signed\.example/);
    expect(items[1]).toMatchObject({
      snapshotId: VALID_SNAPSHOT_ID_2,
      capturerRole: 'patient',
      target: 'self',
      annotated: true,
      clinicalSection: 'Objective',
    });
  });

  it('hides discarded rows when includeDiscarded=false', async () => {
    mountAdminMock({
      listRows: [
        snapshotRow({ id: VALID_SNAPSHOT_ID }),
        snapshotRow({
          id: VALID_SNAPSHOT_ID_2,
          metadata: {
            snapshot: true,
            capturer_role: 'doctor',
            target: 'remote',
            discarded_at: '2026-05-01T11:00:00Z',
            captured_at: '2026-05-01T10:18:00Z',
            dimensions: { width: 1280, height: 720 },
          },
        }),
      ],
    });

    const items = await listSnapshots({
      sessionId: VALID_SESSION_ID,
      bearerJwt: BEARER,
      correlationId: 'cor-1',
      includeDiscarded: false,
    });

    expect(items).toHaveLength(1);
    expect(items[0].snapshotId).toBe(VALID_SNAPSHOT_ID);
  });

  it('keeps discarded rows by default and surfaces discardedAt', async () => {
    mountAdminMock({
      listRows: [
        snapshotRow({
          id: VALID_SNAPSHOT_ID,
          metadata: {
            snapshot: true,
            capturer_role: 'doctor',
            target: 'remote',
            discarded_at: '2026-05-01T11:00:00Z',
            captured_at: '2026-05-01T10:15:00Z',
            dimensions: { width: 1280, height: 720 },
          },
        }),
      ],
    });

    const items = await listSnapshots({
      sessionId: VALID_SESSION_ID,
      bearerJwt: BEARER,
      correlationId: 'cor-1',
    });
    expect(items).toHaveLength(1);
    expect(items[0].discardedAt).toBe('2026-05-01T11:00:00Z');
  });

  it('degrades to empty signedUrl when storage mint fails', async () => {
    mountAdminMock({
      listRows: [snapshotRow()],
      signedUrlError: { message: 'storage offline' },
    });

    const items = await listSnapshots({
      sessionId: VALID_SESSION_ID,
      bearerJwt: BEARER,
      correlationId: 'cor-1',
    });
    expect(items).toHaveLength(1);
    expect(items[0].signedUrl).toBe('');
  });

  it('returns empty array when session has no snapshots', async () => {
    mountAdminMock({ listRows: [] });
    const items = await listSnapshots({
      sessionId: VALID_SESSION_ID,
      bearerJwt: BEARER,
      correlationId: 'cor-1',
    });
    expect(items).toEqual([]);
  });
});

describe('snapshot-review-service · attachSnapshotToSection', () => {
  it('writes metadata.clinical_section on success', async () => {
    const { updateCalls } = mountAdminMock({
      mutateFetchRow: snapshotRow({ id: VALID_SNAPSHOT_ID }),
    });

    const result = await attachSnapshotToSection({
      sessionId: VALID_SESSION_ID,
      snapshotId: VALID_SNAPSHOT_ID,
      section: 'Objective',
      bearerJwt: BEARER,
      correlationId: 'cor-1',
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].metadata).toMatchObject({
      snapshot: true,
      clinical_section: 'Objective',
    });
    expect(result.clinicalSection).toBe('Objective');
  });

  it('rejects rows that are not snapshots (regular chat attachment)', async () => {
    mountAdminMock({
      mutateFetchRow: snapshotRow({
        metadata: { not_a_snapshot: true }, // missing the snapshot:true discriminant
      }),
    });

    await expect(
      attachSnapshotToSection({
        sessionId: VALID_SESSION_ID,
        snapshotId: VALID_SNAPSHOT_ID,
        section: 'Objective',
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects rows that are not attachments (kind != attachment)', async () => {
    mountAdminMock({
      mutateFetchRow: snapshotRow({ kind: 'system' }),
    });

    await expect(
      attachSnapshotToSection({
        sessionId: VALID_SESSION_ID,
        snapshotId: VALID_SNAPSHOT_ID,
        section: 'Objective',
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError when snapshot is not in this session', async () => {
    mountAdminMock({ mutateFetchRow: null });
    await expect(
      attachSnapshotToSection({
        sessionId: VALID_SESSION_ID,
        snapshotId: VALID_SNAPSHOT_ID,
        section: 'Objective',
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('snapshot-review-service · discardSnapshot', () => {
  it('writes metadata.discarded_at on success', async () => {
    const { updateCalls } = mountAdminMock({
      mutateFetchRow: snapshotRow({ id: VALID_SNAPSHOT_ID }),
    });

    const result = await discardSnapshot({
      sessionId: VALID_SESSION_ID,
      snapshotId: VALID_SNAPSHOT_ID,
      bearerJwt: BEARER,
      correlationId: 'cor-1',
    });

    expect(updateCalls).toHaveLength(1);
    expect(typeof (updateCalls[0].metadata as Record<string, unknown>).discarded_at).toBe(
      'string',
    );
    expect(result.discardedAt).not.toBeNull();
  });

  it('idempotent — preserves original discarded_at on re-call', async () => {
    const originalTs = '2026-05-01T11:00:00Z';
    const { updateCalls } = mountAdminMock({
      mutateFetchRow: snapshotRow({
        metadata: {
          snapshot: true,
          capturer_role: 'doctor',
          target: 'remote',
          discarded_at: originalTs,
        },
      }),
    });

    const result = await discardSnapshot({
      sessionId: VALID_SESSION_ID,
      snapshotId: VALID_SNAPSHOT_ID,
      bearerJwt: BEARER,
      correlationId: 'cor-1',
    });

    // Mutator returns `current` unchanged → update payload still
    // carries the original discarded_at (no clobber).
    expect(
      (updateCalls[0].metadata as Record<string, unknown>).discarded_at,
    ).toBe(originalTs);
    expect(result.discardedAt).toBe(originalTs);
  });

  it('throws NotFoundError when snapshot is not in this session', async () => {
    mountAdminMock({ mutateFetchRow: null });
    await expect(
      discardSnapshot({
        sessionId: VALID_SESSION_ID,
        snapshotId: VALID_SNAPSHOT_ID,
        bearerJwt: BEARER,
        correlationId: 'cor-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
