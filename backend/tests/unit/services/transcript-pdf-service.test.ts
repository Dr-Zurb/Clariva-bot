/**
 * Unit tests for `services/transcript-pdf-service.ts` (Plan 07 · Task 32).
 *
 * Pins the high-value contract:
 *   1. Denial-path audit (always artifact_kind='transcript') for every
 *      MintReplayError → TranscriptExportError mapping, plus the
 *      `session_not_ended` and `revoked` branches this service owns.
 *   2. Granted audit shape — JSONB metadata carries outcome='granted',
 *      cache_hit, ttl_seconds, url_prefix, (when applicable) policy_id
 *      + self_serve_window_ends_at.
 *   3. Cache hit: skips compose + upload, still writes granted audit +
 *      fires notification.
 *   4. Cache miss: calls composeTranscriptPdfStream, uploads to the
 *      `consultation-transcripts` bucket with upsert=true.
 *   5. Notification routing — doctor → notifyPatientOfDoctorReplay with
 *      artifactType='transcript' + actionKind='downloaded';
 *      patient / support_staff → notifyDoctorOfPatientReplay with the
 *      same.
 *
 * We mock the thin edges (`runReplayPolicyChecks`,
 * `isSessionOrCompositionRevoked`, `notification-service`,
 * `doctor-settings-service`, `composeTranscriptPdfStream`,
 * `getSupabaseAdminClient`) rather than the full DB stack — the service
 * is a thin orchestrator and unit tests gain nothing from exercising
 * pdfkit (covered by the composer test) or re-testing the shared
 * policy pipeline (covered by the recording-access-service test).
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/recording-access-service', () => {
  class MintReplayError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = 'MintReplayError';
    }
  }
  return {
    MintReplayError,
    runReplayPolicyChecks: jest.fn(),
    isSessionOrCompositionRevoked: jest.fn(),
  };
});

jest.mock('../../../src/services/notification-service', () => ({
  notifyPatientOfDoctorReplay: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ skipped: true, reason: 'test_stub' }),
  notifyDoctorOfPatientReplay: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ ok: true, eventId: 'ev_1', inserted: true }),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(),
}));

jest.mock('../../../src/services/transcript-pdf-composer', () => ({
  composeTranscriptPdfStream: jest.fn(async (input: { output: NodeJS.WritableStream }) => {
    // Write a trivial "%PDF-stub%" payload and close so the buffer
    // promise in the service resolves.
    input.output.write('%PDF-stub%');
    (input.output as NodeJS.WritableStream & { end: () => void }).end();
    return { bytesWritten: 10 };
  }),
}));

import * as database from '../../../src/config/database';
import * as recAccess from '../../../src/services/recording-access-service';
import * as notif from '../../../src/services/notification-service';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as composer from '../../../src/services/transcript-pdf-composer';
import {
  renderConsultTranscriptPdf,
  TranscriptExportError,
} from '../../../src/services/transcript-pdf-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedRecAccess = recAccess as jest.Mocked<typeof recAccess>;
const mockedNotif = notif as jest.Mocked<typeof notif>;
const mockedDoctorSettings = doctorSettings as jest.Mocked<typeof doctorSettings>;
const mockedComposer = composer as jest.Mocked<typeof composer>;

// ---------------------------------------------------------------------------
// Admin client mock: covers the 4 tables this service touches directly:
//   - consultation_messages              (select.eq.order)
//   - consultation_transcripts           (select.eq.neq.order)
//   - consultation_sessions              (select.eq.maybeSingle) — modality
//   - patients                           (select.eq.maybeSingle) — name
//   - recording_access_audit             (insert().select().single())
// Plus storage:
//   - storage.from(bucket).list(dir)
//   - storage.from(bucket).upload(path, buffer, opts)
//   - storage.from(bucket).createSignedUrl(path, ttl, opts)
// ---------------------------------------------------------------------------

interface AdminMockInit {
  modality?:               string;
  patientName?:            string;
  chatRows?:               Array<Record<string, unknown>>;
  transcriptRows?:         Array<Record<string, unknown>>;
  storageListRows?:        Array<{ name: string; updated_at: string | null }>;
  storageListError?:       string | null;
  storageUploadError?:     string | null;
  signedUrl?:              string;
  signUrlError?:           string | null;
  auditInsertError?:       string | null;
}

function buildAdminMock(opts: AdminMockInit = {}): {
  client: {
    from: (table: string) => unknown;
    storage: { from: (bucket: string) => unknown };
  };
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  uploads: Array<{ path: string; buffer: unknown; opts: unknown }>;
  signs: Array<{ path: string; ttl: number; opts: unknown }>;
} {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const uploads: Array<{ path: string; buffer: unknown; opts: unknown }> = [];
  const signs: Array<{ path: string; ttl: number; opts: unknown }> = [];

  const from = (table: string): unknown => {
    if (table === 'consultation_sessions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { modality: opts.modality ?? 'voice' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'patients') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { name: opts.patientName ?? null },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'consultation_messages') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: opts.chatRows ?? [], error: null }),
          }),
        }),
      };
    }
    if (table === 'consultation_transcripts') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({
              order: async () => ({ data: opts.transcriptRows ?? [], error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'recording_access_audit') {
      return {
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => {
                if (opts.auditInsertError) {
                  return { data: null, error: { message: opts.auditInsertError } };
                }
                return { data: { id: `audit_${inserts.length}` }, error: null };
              },
            }),
            // For denial inserts (no `.select().single()` chain).
            then: (
              resolve: (v: { data: null; error: { message: string } | null }) => unknown,
            ) =>
              resolve({
                data: null,
                error: opts.auditInsertError ? { message: opts.auditInsertError } : null,
              }),
          };
        },
      };
    }
    throw new Error(`Unexpected table access: ${table}`);
  };

  const storage = {
    from: (_bucket: string) => ({
      list: async (_dir: string) => {
        if (opts.storageListError) {
          return { data: null, error: { message: opts.storageListError } };
        }
        return { data: opts.storageListRows ?? [], error: null };
      },
      upload: async (path: string, buffer: unknown, upOpts: unknown) => {
        uploads.push({ path, buffer, opts: upOpts });
        if (opts.storageUploadError) {
          return { error: { message: opts.storageUploadError } };
        }
        return { error: null };
      },
      createSignedUrl: async (path: string, ttl: number, signOpts: unknown) => {
        signs.push({ path, ttl, opts: signOpts });
        if (opts.signUrlError) {
          return { data: null, error: { message: opts.signUrlError } };
        }
        return {
          data: { signedUrl: opts.signedUrl ?? 'https://example.com/signed.pdf?token=abc' },
          error: null,
        };
      },
    }),
  };

  return { client: { from, storage }, inserts, uploads, signs };
}

const ENDED_AT = new Date('2026-04-19T10:00:00.000Z');
const SESSION_ID = 'sess_11111111';

function buildSessionContext(overrides: Partial<recAccess.SessionContext> = {}): recAccess.SessionContext {
  return {
    id:              SESSION_ID,
    doctorId:        'doc_1',
    patientId:       'pat_1',
    actualEndedAt:   ENDED_AT,
    doctorCountry:   'IN',
    doctorSpecialty: 'general',
    ...overrides,
  };
}

// Shared default policy-pass mock — individual tests override when
// they want an error thrown.
function setPolicyPass(sessionOverrides: Partial<recAccess.SessionContext> = {}): void {
  mockedRecAccess.runReplayPolicyChecks.mockResolvedValueOnce({
    session: buildSessionContext(sessionOverrides),
    policyId: 'policy_in',
    selfServeWindowEndsAt: new Date(ENDED_AT.getTime() + 90 * 24 * 60 * 60 * 1000),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedDoctorSettings.getDoctorSettings.mockResolvedValue({
    practice_name: 'Acme Clinic',
    timezone:      'Asia/Kolkata',
    specialty:     'General Physician',
  } as unknown as Awaited<ReturnType<typeof doctorSettings.getDoctorSettings>>);
  mockedRecAccess.isSessionOrCompositionRevoked.mockResolvedValue(false);
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe('renderConsultTranscriptPdf — cache miss', () => {
  it('composes + uploads + mints + audits + notifies (doctor caller)', async () => {
    setPolicyPass();
    const adm = buildAdminMock({ storageListRows: [] }); // cache miss
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await renderConsultTranscriptPdf({
      sessionId:        SESSION_ID,
      requestingUserId: 'doc_1',
      requestingRole:   'doctor',
      correlationId:    'req_1',
    });

    // Returned shape
    expect(result.signedUrl).toMatch(/^https:\/\//);
    expect(result.cacheHit).toBe(false);
    expect(result.filename).toBe(`transcript-${SESSION_ID.slice(0, 8)}.pdf`);
    expect(result.expiresAt).toBeInstanceOf(Date);

    // Composer invoked exactly once; upload happened with upsert=true
    // into the canonical object path.
    expect(mockedComposer.composeTranscriptPdfStream).toHaveBeenCalledTimes(1);
    expect(adm.uploads).toHaveLength(1);
    expect(adm.uploads[0].path).toBe(`${SESSION_ID}/transcript.pdf`);
    expect(adm.uploads[0].opts).toMatchObject({
      contentType: 'application/pdf',
      upsert:      true,
    });

    // Signed URL minted at 900s TTL.
    expect(adm.signs).toHaveLength(1);
    expect(adm.signs[0].ttl).toBe(15 * 60);

    // Granted audit row.
    const audits = adm.inserts.filter((i) => i.table === 'recording_access_audit');
    expect(audits).toHaveLength(1);
    expect(audits[0].row).toMatchObject({
      artifact_kind:    'transcript',
      accessed_by_role: 'doctor',
      session_id:       SESSION_ID,
    });
    expect(audits[0].row.metadata).toMatchObject({
      outcome:     'granted',
      cache_hit:   false,
      ttl_seconds: 15 * 60,
      url_prefix:  `consultation-transcripts/${SESSION_ID}/transcript.pdf`,
      policy_id:   'policy_in',
    });

    // Notification: doctor → patient DM with transcript + downloaded.
    // Fire-and-forget → wait a tick for Promise.resolve().then() to flush.
    await new Promise((r) => setImmediate(r));
    expect(mockedNotif.notifyPatientOfDoctorReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId:    SESSION_ID,
        artifactType: 'transcript',
        actionKind:   'downloaded',
      }),
    );
    expect(mockedNotif.notifyDoctorOfPatientReplay).not.toHaveBeenCalled();
  });

  it('routes patient-caller notification via notifyDoctorOfPatientReplay with actionKind=downloaded', async () => {
    setPolicyPass();
    const adm = buildAdminMock({ storageListRows: [] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    await renderConsultTranscriptPdf({
      sessionId:        SESSION_ID,
      requestingUserId: 'pat_1',
      requestingRole:   'patient',
      correlationId:    'req_2',
    });

    await new Promise((r) => setImmediate(r));
    expect(mockedNotif.notifyDoctorOfPatientReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactType:     'transcript',
        actionKind:       'downloaded',
        accessedByRole:   'patient',
        accessedByUserId: 'pat_1',
      }),
    );
    expect(mockedNotif.notifyPatientOfDoctorReplay).not.toHaveBeenCalled();
  });
});

describe('renderConsultTranscriptPdf — cache hit', () => {
  it('serves cached PDF without invoking composer or uploading', async () => {
    setPolicyPass();
    const adm = buildAdminMock({
      storageListRows: [
        {
          name:       'transcript.pdf',
          updated_at: new Date(ENDED_AT.getTime() + 60_000).toISOString(),
        },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await renderConsultTranscriptPdf({
      sessionId:        SESSION_ID,
      requestingUserId: 'doc_1',
      requestingRole:   'doctor',
      correlationId:    'req_3',
    });

    expect(result.cacheHit).toBe(true);
    expect(mockedComposer.composeTranscriptPdfStream).not.toHaveBeenCalled();
    expect(adm.uploads).toHaveLength(0);
    expect(adm.signs).toHaveLength(1);

    const audits = adm.inserts.filter((i) => i.table === 'recording_access_audit');
    expect(audits).toHaveLength(1);
    expect(audits[0].row.metadata).toMatchObject({
      outcome:   'granted',
      cache_hit: true,
    });
  });

  it('invalidates a cached PDF older than the session end timestamp', async () => {
    setPolicyPass();
    const adm = buildAdminMock({
      storageListRows: [
        {
          name:       'transcript.pdf',
          updated_at: new Date(ENDED_AT.getTime() - 60_000).toISOString(),
        },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await renderConsultTranscriptPdf({
      sessionId:        SESSION_ID,
      requestingUserId: 'doc_1',
      requestingRole:   'doctor',
      correlationId:    'req_4',
    });

    expect(result.cacheHit).toBe(false);
    expect(mockedComposer.composeTranscriptPdfStream).toHaveBeenCalledTimes(1);
    expect(adm.uploads).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Denial paths
// ---------------------------------------------------------------------------

describe('renderConsultTranscriptPdf — denial paths', () => {
  it('maps not_a_participant MintReplayError → TranscriptExportError + writes denial audit', async () => {
    mockedRecAccess.runReplayPolicyChecks.mockRejectedValueOnce(
      new recAccess.MintReplayError('not_a_participant', 'nope'),
    );
    const adm = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    await expect(
      renderConsultTranscriptPdf({
        sessionId:        SESSION_ID,
        requestingUserId: 'other_user',
        requestingRole:   'doctor',
        correlationId:    'req_d1',
      }),
    ).rejects.toMatchObject({
      name: 'TranscriptExportError',
      code: 'not_a_participant',
    });

    const audits = adm.inserts.filter((i) => i.table === 'recording_access_audit');
    expect(audits).toHaveLength(1);
    expect(audits[0].row).toMatchObject({
      artifact_kind: 'transcript',
      artifact_ref:  '',
    });
    expect(audits[0].row.metadata).toMatchObject({
      outcome:     'denied',
      deny_reason: 'not_a_participant',
    });
  });

  it('writes session_not_ended denial audit when session.actualEndedAt is null', async () => {
    mockedRecAccess.runReplayPolicyChecks.mockResolvedValueOnce({
      session: buildSessionContext({ actualEndedAt: null }),
    });
    const adm = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    await expect(
      renderConsultTranscriptPdf({
        sessionId:        SESSION_ID,
        requestingUserId: 'doc_1',
        requestingRole:   'doctor',
        correlationId:    'req_d2',
      }),
    ).rejects.toMatchObject({
      name: 'TranscriptExportError',
      code: 'session_not_ended',
    });

    const audits = adm.inserts.filter((i) => i.table === 'recording_access_audit');
    expect(audits).toHaveLength(1);
    expect(audits[0].row.metadata).toMatchObject({
      outcome:     'denied',
      deny_reason: 'session_not_ended',
    });
  });

  it('writes revoked denial audit when the blocklist matches', async () => {
    setPolicyPass();
    mockedRecAccess.isSessionOrCompositionRevoked.mockResolvedValueOnce(true);
    const adm = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    await expect(
      renderConsultTranscriptPdf({
        sessionId:        SESSION_ID,
        requestingUserId: 'doc_1',
        requestingRole:   'doctor',
        correlationId:    'req_d3',
      }),
    ).rejects.toMatchObject({
      name: 'TranscriptExportError',
      code: 'revoked',
    });

    const audits = adm.inserts.filter((i) => i.table === 'recording_access_audit');
    expect(audits).toHaveLength(1);
    expect(audits[0].row.metadata).toMatchObject({
      outcome:     'denied',
      deny_reason: 'revoked',
    });
  });

  it('maps beyond_self_serve_window MintReplayError to TranscriptExportError', async () => {
    mockedRecAccess.runReplayPolicyChecks.mockRejectedValueOnce(
      new recAccess.MintReplayError('beyond_self_serve_window', 'expired'),
    );
    const adm = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    await expect(
      renderConsultTranscriptPdf({
        sessionId:        SESSION_ID,
        requestingUserId: 'pat_1',
        requestingRole:   'patient',
        correlationId:    'req_d4',
      }),
    ).rejects.toMatchObject({
      code: 'beyond_self_serve_window',
    });

    const audits = adm.inserts.filter((i) => i.table === 'recording_access_audit');
    expect(audits).toHaveLength(1);
    expect(audits[0].row.metadata).toMatchObject({
      deny_reason: 'beyond_self_serve_window',
    });
  });
});

describe('renderConsultTranscriptPdf — input validation', () => {
  it('throws ValidationError on empty sessionId and does NOT audit', async () => {
    const adm = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);
    await expect(
      renderConsultTranscriptPdf({
        sessionId: '',
        requestingUserId: 'x',
        requestingRole:   'doctor',
        correlationId:    'req_v1',
      }),
    ).rejects.toBeInstanceOf(Error);

    // No audit row written — bad input never audits.
    expect(
      adm.inserts.filter((i) => i.table === 'recording_access_audit'),
    ).toHaveLength(0);
  });
});

// Keep the import's type surface honored — export assertion.
it('exports TranscriptExportError with a code field', () => {
  const e = new TranscriptExportError('session_not_ended', 'x');
  expect(e.code).toBe('session_not_ended');
  expect(e.name).toBe('TranscriptExportError');
});
