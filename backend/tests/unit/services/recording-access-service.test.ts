/**
 * Unit tests for `services/recording-access-service.ts` (Plan 07 · Task 29).
 *
 * Pins:
 *   - Pipeline order (authZ → escalation → window → revocation → ready
 *     → audit → mint → notify).
 *   - Audit row written on EVERY denial branch (regulatory doctrine).
 *   - Audit row never written on `ValidationError` (bad input never
 *     audits).
 *   - `getReplayAvailability` writes ZERO audit rows on any branch.
 *   - Patient self-serve window honored; doctors and support_staff
 *     bypass.
 *   - Revocation list match denies all roles (including doctor).
 *   - Notification stub fires fire-and-forget; failure is non-fatal.
 *   - Audit metadata JSONB shape (drift pin).
 *   - 15-min TTL on the signed URL.
 *
 * Out of scope here (covered in `twilio-compositions.test.ts`):
 *   - Twilio fetch / mint internals — we mock the adapter via
 *     `__setOverridesForTests`.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: { TWILIO_ACCOUNT_SID: 'AC_test', TWILIO_AUTH_TOKEN: 'tok_test' },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
}));

jest.mock('../../../src/services/regulatory-retention-service', () => ({
  resolveRetentionPolicy: jest.fn(),
}));

// Cost-cut step 7. Defaults to "off" so every pre-existing test keeps
// seeing the plain 404 behaviour; the on-demand cases opt in.
jest.mock('../../../src/services/recording-compose-on-demand-service', () => ({
  ensureCompositionForSession: jest.fn(),
}));

// Notification helpers are exercised in their own test file; here we
// stub them to deterministic resolves so the fire-and-forget step at
// the end of mintReplayUrl doesn't trigger real DB / IG-DM lookups.
jest.mock('../../../src/services/notification-service', () => ({
  notifyPatientOfDoctorReplay: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ skipped: true, reason: 'test_stub' }),
  notifyDoctorOfPatientReplay: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ skipped: true, reason: 'test_stub' }),
}));

import * as database from '../../../src/config/database';
import * as sessionSvc from '../../../src/services/consultation-session-service';
import * as retentionSvc from '../../../src/services/regulatory-retention-service';
import * as notificationService from '../../../src/services/notification-service';
import * as composeOnDemand from '../../../src/services/recording-compose-on-demand-service';
import { __setOverridesForTests } from '../../../src/services/twilio-compositions';
import { __resetArtifactCacheForTests } from '../../../src/services/recording-track-service';
import {
  mintReplayUrl,
  getReplayAvailability,
  MintReplayError,
  TRANSCRIPT_AUDIO_FALLBACK_ENABLED,
} from '../../../src/services/recording-access-service';
import { ValidationError } from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSessionSvc = sessionSvc as jest.Mocked<typeof sessionSvc>;
const mockedRetentionSvc = retentionSvc as jest.Mocked<typeof retentionSvc>;
const mockedComposeOnDemand = composeOnDemand as jest.Mocked<typeof composeOnDemand>;

// ---------------------------------------------------------------------------
// Mock builder for the supabase admin client.
//
// Touched chains:
//   - consultation_sessions:    select('actual_ended_at').eq('id').maybeSingle()
//   - doctor_settings:          select('country, specialty').eq('doctor_id').maybeSingle()
//   - recording_artifact_index: select(...).eq().eq().is().order().limit() → array
//   - consultation_transcripts: select(...).eq().neq().order().limit() → array
//   - signed_url_revocation:    select('url_prefix').order().limit() → array
//   - recording_access_audit:   insert(row) → { error }
// ---------------------------------------------------------------------------

interface AdminMockInit {
  actualEndedAt?: string | null;
  doctorCountry?: string | null;
  doctorSpecialty?: string | null;
  artifactRows?: Array<{
    storage_uri: string;
    artifact_kind?: string;
    hard_deleted_at?: string | null;
    patient_self_serve_visible?: boolean | null;
  }>;
  transcriptRows?: Array<{ composition_sid: string; status?: string }>;
  revocationPrefixes?: string[];
  revocationLookupError?: { message: string };
  insertError?: { message: string } | null;
}

function buildAdminMock(opts: AdminMockInit = {}): {
  client: { from: (table: string) => unknown };
  insertedRows: Array<Record<string, unknown>>;
} {
  const insertedRows: Array<Record<string, unknown>> = [];

  const from = (table: string): unknown => {
    if (table === 'consultation_sessions') {
      return {
        select: (): unknown => ({
          eq: (): unknown => ({
            maybeSingle: async (): Promise<{ data: unknown; error: null }> => ({
              data: { actual_ended_at: opts.actualEndedAt ?? null },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'doctor_settings') {
      return {
        select: (): unknown => ({
          eq: (): unknown => ({
            maybeSingle: async (): Promise<{ data: unknown; error: null }> => ({
              data: {
                country: opts.doctorCountry ?? null,
                specialty: opts.doctorSpecialty ?? null,
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'recording_artifact_index') {
      const filters: Record<string, string> = {};
      const resolveRows = (): { data: unknown; error: null } => {
        const rows = (opts.artifactRows ?? []).filter((row) => {
          if (row.hard_deleted_at) return false;
          if (
            filters.artifact_kind &&
            row.artifact_kind &&
            row.artifact_kind !== filters.artifact_kind
          ) {
            return false;
          }
          return true;
        });
        return { data: rows, error: null };
      };
      const chain = {
        eq: (col: string, val: string) => {
          filters[col] = val;
          return chain;
        },
        is: () => chain,
        order: () => chain,
        limit: async () => resolveRows(),
        then: (
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(resolveRows()).then(resolve, reject),
      };
      return { select: (): unknown => chain };
    }
    if (table === 'consultation_transcripts') {
      return {
        select: (): unknown => ({
          eq: (): unknown => ({
            neq: (): unknown => ({
              order: (): unknown => ({
                limit: async (): Promise<{ data: unknown; error: null }> => ({
                  data: opts.transcriptRows ?? [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'signed_url_revocation') {
      return {
        select: (): unknown => ({
          order: (): unknown => ({
            limit: async (): Promise<{
              data: unknown;
              error: { message: string } | null;
            }> => {
              if (opts.revocationLookupError) {
                return { data: null, error: opts.revocationLookupError };
              }
              return {
                data: (opts.revocationPrefixes ?? []).map((p) => ({
                  url_prefix: p,
                })),
                error: null,
              };
            },
          }),
        }),
      };
    }
    if (table === 'recording_access_audit') {
      const insert = (row: Record<string, unknown>): unknown => {
        insertedRows.push(row);
        return {
          select: () => ({
            single: async (): Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }> => {
              if (opts.insertError) {
                return { data: null, error: opts.insertError };
              }
              return {
                data: { id: `audit-${insertedRows.length}` },
                error: null,
              };
            },
          }),
        };
      };
      return { insert };
    }
    throw new Error(`buildAdminMock: unexpected table ${table}`);
  };

  return { client: { from }, insertedRows };
}

// ---------------------------------------------------------------------------
// Session fixture
// ---------------------------------------------------------------------------

type SessionRecord = Awaited<ReturnType<typeof sessionSvc.findSessionById>>;

function makeSession(
  overrides: Partial<NonNullable<SessionRecord>> = {}
): NonNullable<SessionRecord> {
  return {
    id: 'sess-1',
    appointmentId: 'appt-1',
    doctorId: 'doc-1',
    patientId: 'pat-1',
    modality: 'voice',
    status: 'ended',
    provider: 'twilio_video',
    providerSessionId: 'RM_twilio_1',
    scheduledStartAt: new Date('2026-04-19T10:00:00Z'),
    expectedEndAt: new Date('2026-04-19T10:30:00Z'),
    ...(overrides as object),
  } as NonNullable<SessionRecord>;
}

const POLICY = {
  retentionYears: 5,
  retentionUntilAge: null as number | null,
  patientSelfServeDays: 90,
  source: 'test seed',
  policyId: 'pol-1',
  matchedTier: 'global' as const,
  matchedCountry: '*',
  matchedSpecialty: '*',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  __resetArtifactCacheForTests();
  mockedRetentionSvc.resolveRetentionPolicy.mockResolvedValue(POLICY);
  mockedComposeOnDemand.ensureCompositionForSession.mockResolvedValue({
    state: 'unavailable',
    reason: 'disabled',
  } as never);

  __setOverridesForTests({
    fetchMetadata: async (sid) => ({
      status: 'completed',
      durationSec: 600,
      sizeBytes: 4_000_000,
      mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${sid}/Media`,
    }),
    mintSignedUrl: async ({ compositionSid, ttlSec }) => ({
      signedUrl: `https://signed.example/${compositionSid}?sig=ok`,
      expiresAt: new Date(Date.now() + (ttlSec ?? 900) * 1000),
    }),
    listByRoom: async () => [],
  });
});

// ===========================================================================
// mintReplayUrl
// ===========================================================================

describe('mintReplayUrl — input validation', () => {
  it('throws ValidationError for empty sessionId', async () => {
    await expect(
      mintReplayUrl({
        sessionId: '   ',
        artifactKind: 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for an unsupported artifactKind (non-audio, non-video)', async () => {
    // v1 accepts 'audio' (Plan 07 Task 29) + 'video' (Plan 08 Task 44).
    // Anything else (e.g. the provisional 'transcript' value referenced
    // in the task doc but NOT yet wired) is rejected at the entrypoint
    // before any policy check runs. Cast through unknown because the
    // union narrows at the type level; this test pins the runtime guard
    // as a belt-and-suspenders against a future additive kind that
    // sneaks in via a bad downcast upstream.
    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'transcript' as unknown as 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('mintReplayUrl — authZ', () => {
  it('denies a non-participant (and writes a denial audit row)', async () => {
    const { client, insertedRows } = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'someone-else',
        requestingRole: 'patient',
        correlationId: 'cid',
      })
    ).rejects.toMatchObject({
      name: 'MintReplayError',
      code: 'not_a_participant',
    });

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      session_id: 'sess-1',
      accessed_by: 'someone-else',
      accessed_by_role: 'patient',
      metadata: {
        outcome: 'denied',
        deny_reason: 'not_a_participant',
      },
    });
  });
});

describe('mintReplayUrl — support_staff escalation', () => {
  it('throws ValidationError when escalationReason missing (no audit)', async () => {
    const { client, insertedRows } = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'support-1',
        requestingRole: 'support_staff',
        correlationId: 'cid',
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(insertedRows).toHaveLength(0);
  });

  it('persists escalation_reason in the granted audit row', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'support-1',
      requestingRole: 'support_staff',
      escalationReason: 'Customer ticket #4521 — recording lost on patient device',
      correlationId: 'cid',
    });

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].metadata).toMatchObject({
      outcome: 'granted',
      escalation_reason: expect.stringContaining('Customer ticket'),
    });

    await new Promise((r) => setImmediate(r));
    expect(notificationService.notifyDoctorOfPatientReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        accessedByRole: 'support_staff',
        escalationReason: expect.stringContaining('Customer ticket'),
      }),
    );
    expect(notificationService.notifyPatientOfDoctorReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        accessedByRole: 'support_staff',
        artifactType: 'audio',
      }),
    );
    const patientCall = (notificationService.notifyPatientOfDoctorReplay as jest.Mock)
      .mock.calls[0][0] as Record<string, unknown>;
    expect(patientCall.escalationReason).toBeUndefined();
  });
});

describe('mintReplayUrl — patient self-serve window', () => {
  it('denies a patient past the 90-day window', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'pat-1',
        requestingRole: 'patient',
        correlationId: 'cid',
      })
    ).rejects.toMatchObject({ code: 'beyond_self_serve_window' });

    expect(insertedRows[0].metadata).toMatchObject({
      outcome: 'denied',
      deny_reason: 'beyond_self_serve_window',
    });
  });

  it('lets a doctor through the same fixture (window bypass)', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid',
    });
    expect(out.signedUrl).toMatch(/^https:\/\/signed\.example\//);
    expect(insertedRows[0].metadata).toMatchObject({ outcome: 'granted' });
  });

  it('falls back to the 90-day default when policy lookup returns 0', async () => {
    mockedRetentionSvc.resolveRetentionPolicy.mockResolvedValueOnce({
      ...POLICY,
      patientSelfServeDays: 0,
    });
    const { client } = buildAdminMock({
      actualEndedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    // 30 days ago + default 90 = still inside window → grants.
    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'pat-1',
        requestingRole: 'patient',
        correlationId: 'cid',
      })
    ).resolves.toBeDefined();
  });
});

describe('mintReplayUrl — revocation list', () => {
  it('denies when a revocation prefix matches the composition URL', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
      revocationPrefixes: ['https://video.twilio.com/v1/Compositions/CJabc'],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toMatchObject({ code: 'revoked' });

    expect(insertedRows[0].metadata).toMatchObject({
      outcome: 'denied',
      deny_reason: 'revoked',
    });
  });

  it('denies a doctor too (revocation is a hard stop for everyone)', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
      revocationPrefixes: ['CJabc'],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toMatchObject({ code: 'revoked' });
  });

  it('denies when the revocation list lookup fails (fail-closed)', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
      revocationLookupError: { message: 'connection reset' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toMatchObject({ code: 'revoked' });

    expect(insertedRows[0].metadata).toMatchObject({
      outcome: 'denied',
      deny_reason: 'revoked',
    });
  });
});

describe('mintReplayUrl — artifact readiness', () => {
  it('denies when no composition exists', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toMatchObject({ code: 'artifact_not_found' });
    expect(insertedRows[0].metadata).toMatchObject({ deny_reason: 'artifact_not_found' });
  });

  // Cost-cut step 7: with the Composition Hook off, "no composition"
  // stops meaning "no recording" — it means "not composed yet".
  it('returns not-ready, not not-found, while an on-demand composition builds', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);
    mockedComposeOnDemand.ensureCompositionForSession.mockResolvedValue({
      state: 'pending',
      compositionSid: 'CJpending',
      status: 'enqueued',
    } as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toMatchObject({ code: 'artifact_not_ready' });
    expect(insertedRows[0].metadata).toMatchObject({
      deny_reason: 'artifact_not_ready',
    });
    expect(insertedRows[0].artifact_ref).toBe('CJpending');
  });

  it('recovers a composition Twilio finished but the index never recorded', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);
    mockedComposeOnDemand.ensureCompositionForSession.mockResolvedValue({
      state: 'ready',
      compositionSid: 'CJorphan',
    } as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid',
    });

    expect(out.signedUrl).toContain('CJorphan');
  });

  it('does not consult the on-demand path when an artifact already exists', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      artifactRows: [
        {
          storage_uri: 'twilio-composition:CJexistingaaaaaaaaaaaaaaaaaaaaa',
          artifact_kind: 'audio_composition',
          hard_deleted_at: null,
          patient_self_serve_visible: true,
        },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid',
    });

    expect(
      mockedComposeOnDemand.ensureCompositionForSession,
    ).not.toHaveBeenCalled();
  });

  it('denies when Twilio status is processing', async () => {
    __setOverridesForTests({
      fetchMetadata: async (sid) => ({
        status: 'processing',
        mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${sid}/Media`,
      }),
    });
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toMatchObject({ code: 'artifact_not_ready' });
    expect(insertedRows[0].metadata).toMatchObject({
      deny_reason: 'artifact_not_ready',
      twilio_status: 'processing',
    });
  });
});

describe('mintReplayUrl — happy paths', () => {
  it('grants for a doctor, mints URL, writes granted audit', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid',
    });

    expect(out.signedUrl).toBe('https://signed.example/CJabc123?sig=ok');
    expect(out.artifactRef).toBe('CJabc123');
    // ttl ≈ 15 min ± clock skew tolerance
    const ttlMs = out.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(14 * 60 * 1000);
    expect(ttlMs).toBeLessThan(16 * 60 * 1000);

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      session_id: 'sess-1',
      artifact_ref: 'CJabc123',
      artifact_kind: 'audio',
      accessed_by: 'doc-1',
      accessed_by_role: 'doctor',
      metadata: {
        outcome: 'granted',
        ttl_seconds: 900,
        twilio_status: 'completed',
        url_prefix: 'https://video.twilio.com/v1/Compositions/CJabc123/Media',
      },
    });
  });

  it('grants for a patient and stamps self_serve_window_ends_at', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'pat-1',
      requestingRole: 'patient',
      correlationId: 'cid',
    });

    const meta = insertedRows[0].metadata as Record<string, unknown>;
    expect(meta.outcome).toBe('granted');
    expect(meta.self_serve_window_ends_at).toEqual(expect.any(String));
    expect(meta.policy_id).toBe('pol-1');
  });

  it('does not throw when a Twilio failure happens during mint AFTER audit', async () => {
    // Flip the mint to throw — ensures the granted audit is already
    // written. The thrown error propagates; the audit row stays.
    __setOverridesForTests({
      mintSignedUrl: async () => {
        throw new Error('twilio 503');
      },
    });
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid',
      })
    ).rejects.toThrow(/twilio 503/);

    // Granted audit row was written before the mint attempt.
    expect(insertedRows[0].metadata).toMatchObject({ outcome: 'granted' });
  });
});

// ===========================================================================
// getReplayAvailability
// ===========================================================================

describe('getReplayAvailability', () => {
  it('returns available=true with selfServeExpiresAt for a patient inside the window', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'pat-1',
      requestingRole: 'patient',
    });
    expect(out.available).toBe(true);
    expect(out.selfServeExpiresAt).toBeInstanceOf(Date);
    expect(insertedRows).toHaveLength(0);
  });

  it('writes ZERO audit rows on any branch', async () => {
    const { client, insertedRows } = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'someone-else',
      requestingRole: 'patient',
    });
    expect(out).toEqual({ available: false, reason: 'not_a_participant' });
    expect(insertedRows).toHaveLength(0);
  });

  it('returns available=false reason=revoked when blocklist matches', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
      revocationPrefixes: ['CJabc'],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
    });
    expect(out).toEqual({ available: false, reason: 'revoked' });
    expect(insertedRows).toHaveLength(0);
  });

  it('returns available=false reason=revoked when revocation lookup fails', async () => {
    const { client, insertedRows } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
      revocationLookupError: { message: 'timeout' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
    });
    expect(out).toEqual({ available: false, reason: 'revoked' });
    expect(insertedRows).toHaveLength(0);
  });

  it('returns available=false reason=artifact_not_ready for processing composition', async () => {
    __setOverridesForTests({
      fetchMetadata: async (sid) => ({
        status: 'processing',
        mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${sid}/Media`,
      }),
    });
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
    });
    expect(out).toEqual({ available: false, reason: 'artifact_not_ready' });
  });
});

// ===========================================================================
// rec-04 — index preference + transcript fallback (REC1-D5)
// ===========================================================================

describe('rec-04 replay resolves from the index', () => {
  it('keeps the transcript fallback enabled until rec-05 backfill + p5', () => {
    expect(TRANSCRIPT_AUDIO_FALLBACK_ENABLED).toBe(true);
  });

  it('prefers an index audio row (source: index) over a transcript row', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      artifactRows: [
        {
          storage_uri: 'twilio-composition:CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          artifact_kind: 'audio_composition',
        },
      ],
      transcriptRows: [{ composition_sid: 'CJbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }) as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid-index',
    });
    expect(out.signedUrl).toContain('CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(out.signedUrl).not.toContain('CJbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('falls back to transcript when no index row exists', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid-transcript',
    });
    expect(out.signedUrl).toContain('CJabc123');
  });

  it('video consult with empty index and no transcript is artifact_not_found (finding #1 404)', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }) as never);

    const avail = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
    });
    expect(avail).toEqual({ available: false, reason: 'artifact_not_found' });
  });

  it('video consult with an index audio row is available (finding #1 gone)', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      artifactRows: [
        {
          storage_uri: 'twilio-composition:CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          artifact_kind: 'audio_composition',
        },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }) as never);

    const avail = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
    });
    expect(avail.available).toBe(true);
  });

  it('does not return a hard-deleted index row', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      artifactRows: [
        {
          storage_uri: 'twilio-composition:CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          artifact_kind: 'audio_composition',
          hard_deleted_at: '2026-08-01T00:00:00.000Z',
        },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const avail = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
    });
    expect(avail).toEqual({ available: false, reason: 'artifact_not_found' });
  });

  it('falls through to Path B when the index storage_uri is unparseable', async () => {
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      artifactRows: [
        {
          storage_uri: 'not-a-composition-uri',
          artifact_kind: 'audio_composition',
        },
      ],
      transcriptRows: [{ composition_sid: 'CJabc123' }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'audio',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid-unparseable',
    });
    expect(out.signedUrl).toContain('CJabc123');
  });

  it('resolves video from the index without calling Twilio', async () => {
    __setOverridesForTests({
      fetchMetadata: async (sid) => ({
        status: 'completed',
        durationSec: 30,
        sizeBytes: 1_000_000,
        mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${sid}/Media`,
      }),
      mintSignedUrl: async ({ compositionSid, ttlSec }) => ({
        signedUrl: `https://signed.example/${compositionSid}?sig=ok`,
        expiresAt: new Date(Date.now() + (ttlSec ?? 900) * 1000),
      }),
      listByRoom: async () => {
        throw new Error('Twilio list must not run when a video index row exists');
      },
    });
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
      artifactRows: [
        {
          storage_uri: 'twilio-composition:CJcccccccccccccccccccccccccccccccc',
          artifact_kind: 'video_composition',
        },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }) as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'video',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid-video-index',
    });
    expect(out.signedUrl).toContain('CJcccccccccccccccccccccccccccccccc');
  });

  it('falls back to the Twilio video path when no index row exists', async () => {
    __setOverridesForTests({
      fetchMetadata: async (sid) => ({
        status: 'completed',
        durationSec: 30,
        sizeBytes: 1_000_000,
        mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${sid}/Media`,
      }),
      mintSignedUrl: async ({ compositionSid, ttlSec }) => ({
        signedUrl: `https://signed.example/${compositionSid}?sig=ok`,
        expiresAt: new Date(Date.now() + (ttlSec ?? 900) * 1000),
      }),
      listByRoom: async () => [
        {
          compositionSid: 'CJdddddddddddddddddddddddddddddddd',
          includeAudio: true,
          includeVideo: true,
          startedAt: new Date(),
          endedAt: new Date(),
          durationSeconds: 12,
          status: 'completed',
        },
      ],
    });
    const { client } = buildAdminMock({
      actualEndedAt: '2026-04-15T12:00:00Z',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession({ modality: 'video' }) as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'video',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid-video-twilio',
    });
    expect(out.signedUrl).toContain('CJdddddddddddddddddddddddddddddddd');
  });
});

// ===========================================================================
// MintReplayError shape
// ===========================================================================

describe('MintReplayError', () => {
  it('exposes a typed code field', () => {
    const e = new MintReplayError('revoked', 'Revoked recording');
    expect(e.code).toBe('revoked');
    expect(e.name).toBe('MintReplayError');
  });
});

// ===========================================================================
// rec-29 — multi-composition listing + per-SID mint (REC5-D4)
// ===========================================================================

const SID_A = 'CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SID_B = 'CJbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SID_C = 'CJcccccccccccccccccccccccccccccccc';
const SID_PROC = 'CJpppppppppppppppppppppppppppppppp';

function roomRow(
  sid: string,
  kind: 'audio' | 'video',
  startedAt: string,
  status: 'completed' | 'processing' | 'failed' | 'deleted' = 'completed',
  durationSeconds = 60,
) {
  return {
    compositionSid: sid,
    includeAudio: true,
    includeVideo: kind === 'video',
    startedAt: new Date(startedAt),
    endedAt: new Date(startedAt),
    durationSeconds,
    status,
  };
}

describe('rec-29 multi-composition replay', () => {
  it('lists completed video compositions in startedAt order and skips non-completed', async () => {
    __setOverridesForTests({
      listByRoom: async () => [
        roomRow(SID_C, 'video', '2026-08-20T10:06:00.000Z', 'completed', 40),
        roomRow(SID_A, 'video', '2026-08-20T10:00:00.000Z', 'completed', 90),
        roomRow(SID_B, 'video', '2026-08-20T10:03:00.000Z', 'completed', 50),
        roomRow(SID_PROC, 'video', '2026-08-20T10:08:00.000Z', 'processing', 0),
        roomRow(SID_A.replace('aaa', 'fff'), 'audio', '2026-08-20T10:00:00.000Z'),
      ],
    });
    const { client } = buildAdminMock({
      actualEndedAt: '2026-08-20T10:00:00Z',
      transcriptRows: [{ composition_sid: SID_A }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await getReplayAvailability({
      sessionId: 'sess-1',
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
    });

    expect(out.available).toBe(true);
    expect(out.videoCompositions?.map((row) => row.compositionSid)).toEqual([
      SID_A,
      SID_B,
      SID_C,
    ]);
    expect(out.videoCompositions?.some((row) => row.compositionSid === SID_PROC)).toBe(
      false,
    );
    expect(out.hasVideo).toBe(true);
  });

  it('mints the requested composition, not the newest', async () => {
    __setOverridesForTests({
      listByRoom: async () => [
        roomRow(SID_A, 'video', '2026-08-20T10:00:00.000Z'),
        roomRow(SID_B, 'video', '2026-08-20T10:03:00.000Z'),
        roomRow(SID_C, 'video', '2026-08-20T10:06:00.000Z'),
      ],
      mintSignedUrl: async ({ compositionSid, ttlSec }) => ({
        signedUrl: `https://signed.example/${compositionSid}?sig=ok`,
        expiresAt: new Date(Date.now() + (ttlSec ?? 900) * 1000),
      }),
    });
    const { client } = buildAdminMock({
      actualEndedAt: '2026-08-20T10:00:00Z',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    const out = await mintReplayUrl({
      sessionId: 'sess-1',
      artifactKind: 'video',
      compositionSid: SID_B,
      requestingUserId: 'doc-1',
      requestingRole: 'doctor',
      correlationId: 'cid-rec-29-sid',
    });
    expect(out.artifactRef).toBe(SID_B);
    expect(out.signedUrl).toContain(SID_B);
    expect(out.signedUrl).not.toContain(SID_A);
  });

  it('refuses a composition SID that does not belong to the session', async () => {
    __setOverridesForTests({
      listByRoom: async () => [roomRow(SID_A, 'video', '2026-08-20T10:00:00.000Z')],
    });
    const { client } = buildAdminMock({
      actualEndedAt: '2026-08-20T10:00:00Z',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'video',
        compositionSid: SID_C,
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid-rec-29-foreign',
      }),
    ).rejects.toMatchObject({ code: 'no_video_artifact' });
  });

  it('surfaces a provider-deleted composition honestly', async () => {
    __setOverridesForTests({
      listByRoom: async () => [roomRow(SID_A, 'audio', '2026-08-20T10:00:00.000Z')],
      fetchMetadata: async () => ({
        status: 'deleted',
        mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${SID_A}/Media`,
      }),
    });
    const { client } = buildAdminMock({
      actualEndedAt: '2026-08-20T10:00:00Z',
      transcriptRows: [{ composition_sid: SID_A }],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedSessionSvc.findSessionById.mockResolvedValue(makeSession() as never);

    await expect(
      mintReplayUrl({
        sessionId: 'sess-1',
        artifactKind: 'audio',
        compositionSid: SID_A,
        requestingUserId: 'doc-1',
        requestingRole: 'doctor',
        correlationId: 'cid-rec-29-deleted',
      }),
    ).rejects.toMatchObject({
      code: 'artifact_not_found',
      message: 'This recording has been deleted at the provider',
    });
  });
});
