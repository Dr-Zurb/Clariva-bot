/**
 * Unit tests for `services/recording-artifact-service.ts`
 * (recording-governance-v2 · rec-02).
 *
 * Pins:
 *   - REC1-D1 `storage_uri` is deterministic, extractable by the
 *     existing `extractCompositionSid` regex, and slash-free so
 *     `parseStorageUri` rejects it (REC1-D7).
 *   - A completed composition writes one row with kind, uri, bytes
 *     and `patient_self_serve_visible = true`.
 *   - Same SID twice → one conceptual row, second call `created: false`.
 *   - Non-completed compositions are not registered.
 *   - Missing `sizeBytes` still writes (`bytes` NULL).
 *   - Unknown kind is rejected.
 *   - Round-trip: a row this writer produces is resolved by
 *     `getReplayAvailability` → Path A (`source: 'index'`).
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

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

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
}));

jest.mock('../../../src/services/twilio-compositions', () => ({
  fetchCompositionMetadata: jest.fn(),
  __setOverridesForTests:   jest.fn(),
  mintCompositionSignedUrl: jest.fn(),
  listCompositionsForRoom:  jest.fn(),
  getComputedTwilioMediaUrl: (sid: string) =>
    `https://video.twilio.com/v1/Compositions/${sid}/Media`,
}));

jest.mock('../../../src/services/twilio-recordings', () => ({
  fetchRecordingMetadata: jest.fn(),
  deleteRecording:        jest.fn(),
}));

jest.mock('../../../src/services/recording-track-service', () => ({
  getRecordingArtifactsForSession: jest.fn(),
}));

jest.mock('../../../src/services/regulatory-retention-service', () => ({
  resolveRetentionPolicy: jest.fn(),
}));

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
import * as twilioCompositions from '../../../src/services/twilio-compositions';
import * as twilioRecordings from '../../../src/services/twilio-recordings';
import * as trackSvc from '../../../src/services/recording-track-service';
import {
  buildTwilioCompositionStorageUri,
  buildTwilioRecordingStorageUri,
  registerFinalisedComposition,
  registerFinalisedRecording,
  TWILIO_COMPOSITION_STORAGE_URI_PREFIX,
  TWILIO_RECORDING_STORAGE_URI_PREFIX,
} from '../../../src/services/recording-artifact-service';
import { getReplayAvailability } from '../../../src/services/recording-access-service';
import { parseStorageUri } from '../../../src/services/storage-service';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSessionSvc = sessionSvc as jest.Mocked<typeof sessionSvc>;
const mockedTwilio = twilioCompositions as jest.Mocked<typeof twilioCompositions>;
const mockedTwilioRecordings = twilioRecordings as jest.Mocked<typeof twilioRecordings>;
const mockedTrack = trackSvc as jest.Mocked<typeof trackSvc>;

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const DOCTOR_ID = '22222222-2222-2222-2222-222222222222';
const COMPOSITION_SID = 'CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECORDING_SID = 'RTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CORRELATION_ID = 'corr-rec-02';

type SessionRecord = NonNullable<Awaited<ReturnType<typeof sessionSvc.findSessionById>>>;

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id:                SESSION_ID,
    appointmentId:     'appt-1',
    doctorId:          DOCTOR_ID,
    patientId:         'pat-1',
    modality:          'video',
    provider:          'twilio_video',
    providerSessionId: 'RMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    status:            'ended',
    scheduledStartAt:  new Date('2026-08-01T10:00:00.000Z'),
    expectedEndAt:     new Date('2026-08-01T10:20:00.000Z'),
    actualStartedAt:   new Date('2026-08-01T10:01:00.000Z'),
    actualEndedAt:     new Date('2026-08-01T10:18:00.000Z'),
    ...overrides,
  } as SessionRecord;
}

interface IndexRow {
  id:                         string;
  session_id:                 string;
  artifact_kind:              string;
  storage_uri:                string;
  bytes:                      number | null;
  patient_self_serve_visible: boolean;
}

interface AdminMockHandle {
  client: { from: (table: string) => unknown };
  insertedRows: IndexRow[];
  nextInsertError: { code?: string; message: string } | null;
}

function buildAdminMock(): AdminMockHandle {
  const insertedRows: IndexRow[] = [];
  const handle: AdminMockHandle = {
    client: { from: () => ({}) },
    insertedRows,
    nextInsertError: null,
  };

  const from = (table: string): unknown => {
    if (table === 'recording_artifact_index') {
      return {
        insert: (row: Record<string, unknown>) => {
          if (handle.nextInsertError) {
            const err = handle.nextInsertError;
            handle.nextInsertError = null;
            return {
              select: () => ({
                maybeSingle: async () => ({ data: null, error: err }),
              }),
            };
          }
          const stored: IndexRow = {
            id:                         `art-${insertedRows.length + 1}`,
            session_id:                 String(row.session_id),
            artifact_kind:              String(row.artifact_kind),
            storage_uri:                String(row.storage_uri),
            bytes:                      typeof row.bytes === 'number' ? row.bytes : null,
            patient_self_serve_visible: row.patient_self_serve_visible === true,
          };
          insertedRows.push(stored);
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: stored.id }, error: null }),
            }),
          };
        },
        select: (_cols: string) => {
          const filters: Record<string, string> = {};
          const chain = {
            eq: (col: string, val: string) => {
              filters[col] = val;
              return chain;
            },
            is: () => chain,
            order: () => chain,
            limit: async () => {
              const matches = insertedRows.filter((r) => {
                if (filters.session_id && r.session_id !== filters.session_id) return false;
                if (filters.artifact_kind && r.artifact_kind !== filters.artifact_kind) return false;
                if (filters.storage_uri && r.storage_uri !== filters.storage_uri) return false;
                return true;
              });
              return { data: matches, error: null };
            },
            maybeSingle: async () => {
              const matches = insertedRows.filter((r) => {
                if (filters.session_id && r.session_id !== filters.session_id) return false;
                if (filters.artifact_kind && r.artifact_kind !== filters.artifact_kind) return false;
                if (filters.storage_uri && r.storage_uri !== filters.storage_uri) return false;
                return true;
              });
              return { data: matches[0] ?? null, error: null };
            },
          };
          return chain;
        },
      };
    }
    if (table === 'consultation_sessions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:  { actual_ended_at: '2026-08-01T10:18:00.000Z' },
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
              data:  { country: 'IN', specialty: 'general' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'signed_url_revocation') {
      return {
        select: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      };
    }
    if (table === 'consultation_transcripts') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  };

  handle.client = { from };
  return handle;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedSessionSvc.findSessionById.mockResolvedValue(makeSession());
  mockedTwilio.fetchCompositionMetadata.mockResolvedValue({
    status:         'completed',
    durationSec:    120,
    sizeBytes:      4096,
    mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${COMPOSITION_SID}/Media`,
  });
  mockedTwilioRecordings.fetchRecordingMetadata.mockResolvedValue({
    status:          'completed',
    type:            'audio',
    containerFormat: 'mka',
    codec:           'opus',
    durationSec:     120,
    sizeBytes:       2048,
    mediaUrlPrefix:  `https://video.twilio.com/v1/Recordings/${RECORDING_SID}/Media`,
  });
  mockedTrack.getRecordingArtifactsForSession.mockResolvedValue({
    audioCompositions: [],
    videoCompositions: [],
  });
});

describe('buildTwilioCompositionStorageUri (REC1-D1)', () => {
  it('is deterministic per SID and extractable by the existing regex', () => {
    const a = buildTwilioCompositionStorageUri(COMPOSITION_SID);
    const b = buildTwilioCompositionStorageUri(`  ${COMPOSITION_SID}  `);
    expect(a).toBe(`${TWILIO_COMPOSITION_STORAGE_URI_PREFIX}${COMPOSITION_SID}`);
    expect(a).toBe(b);
    const extracted = /(CJ[a-zA-Z0-9]{10,})/.exec(a)?.[1];
    expect(extracted).toBe(COMPOSITION_SID);
  });

  it('does not parse as a Supabase <bucket>/<path> (REC1-D7)', () => {
    const uri = buildTwilioCompositionStorageUri(COMPOSITION_SID);
    expect(uri.includes('/')).toBe(false);
    expect(() => parseStorageUri(uri)).toThrow(ValidationError);
  });

  it('rejects a room SID', () => {
    expect(() =>
      buildTwilioCompositionStorageUri('RMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toThrow(ValidationError);
  });
});

describe('buildTwilioRecordingStorageUri (cost-cut step 7)', () => {
  it('is deterministic per SID and slash-free like the composition form', () => {
    const a = buildTwilioRecordingStorageUri(RECORDING_SID);
    const b = buildTwilioRecordingStorageUri(`  ${RECORDING_SID}  `);
    expect(a).toBe(`${TWILIO_RECORDING_STORAGE_URI_PREFIX}${RECORDING_SID}`);
    expect(a).toBe(b);
    expect(a.includes('/')).toBe(false);
    expect(() => parseStorageUri(a)).toThrow(ValidationError);
  });

  it('is invisible to the replay CJ extractor, so a track can never be minted as a composition', () => {
    const uri = buildTwilioRecordingStorageUri(RECORDING_SID);
    expect(/(CJ[a-zA-Z0-9]{10,})/.exec(uri)).toBeNull();
  });

  it('rejects a composition SID and a room SID', () => {
    expect(() => buildTwilioRecordingStorageUri(COMPOSITION_SID)).toThrow(
      ValidationError,
    );
    expect(() =>
      buildTwilioRecordingStorageUri('RMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toThrow(ValidationError);
  });
});

describe('registerFinalisedRecording', () => {
  function mockAdmin(): AdminMockHandle {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as ReturnType<typeof database.getSupabaseAdminClient>,
    );
    return admin;
  }

  it('writes an audio_track row with the recording URI and bytes', async () => {
    const admin = mockAdmin();

    const result = await registerFinalisedRecording({
      sessionId:     SESSION_ID,
      recordingSid:  RECORDING_SID,
      correlationId: CORRELATION_ID,
    });

    expect(result.created).toBe(true);
    expect(result.artifactKind).toBe('audio_track');
    expect(result.storageUri).toBe(buildTwilioRecordingStorageUri(RECORDING_SID));
    expect(admin.insertedRows[0]).toMatchObject({
      session_id:                 SESSION_ID,
      artifact_kind:              'audio_track',
      storage_uri:                result.storageUri,
      bytes:                      2048,
      patient_self_serve_visible: true,
    });
  });

  it('derives video_track from Twilio type rather than trusting a caller', async () => {
    mockAdmin();
    mockedTwilioRecordings.fetchRecordingMetadata.mockResolvedValue({
      status:          'completed',
      type:            'video',
      containerFormat: 'mkv',
      codec:           'VP8',
      sizeBytes:       9001,
      mediaUrlPrefix:  `https://video.twilio.com/v1/Recordings/${RECORDING_SID}/Media`,
    });

    const result = await registerFinalisedRecording({
      sessionId:     SESSION_ID,
      recordingSid:  RECORDING_SID,
      correlationId: CORRELATION_ID,
    });

    expect(result.artifactKind).toBe('video_track');
  });

  it('rejects a data track — no transcodable media', async () => {
    mockAdmin();
    mockedTwilioRecordings.fetchRecordingMetadata.mockResolvedValue({
      status:          'completed',
      type:            'data',
      containerFormat: null,
      codec:           null,
      mediaUrlPrefix:  `https://video.twilio.com/v1/Recordings/${RECORDING_SID}/Media`,
    });

    await expect(
      registerFinalisedRecording({
        sessionId:     SESSION_ID,
        recordingSid:  RECORDING_SID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('does not register a recording Twilio is still processing', async () => {
    const admin = mockAdmin();
    mockedTwilioRecordings.fetchRecordingMetadata.mockResolvedValue({
      status:          'processing',
      type:            'audio',
      containerFormat: 'mka',
      codec:           'opus',
      mediaUrlPrefix:  `https://video.twilio.com/v1/Recordings/${RECORDING_SID}/Media`,
    });

    await expect(
      registerFinalisedRecording({
        sessionId:     SESSION_ID,
        recordingSid:  RECORDING_SID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(ValidationError);
    expect(admin.insertedRows).toHaveLength(0);
  });

  it('collapses a repeat registration onto the existing row', async () => {
    const admin = mockAdmin();

    const first = await registerFinalisedRecording({
      sessionId:     SESSION_ID,
      recordingSid:  RECORDING_SID,
      correlationId: CORRELATION_ID,
    });
    admin.nextInsertError = { code: '23505', message: 'duplicate key' };
    const second = await registerFinalisedRecording({
      sessionId:     SESSION_ID,
      recordingSid:  RECORDING_SID,
      correlationId: CORRELATION_ID,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.artifactId).toBe(first.artifactId);
    expect(admin.insertedRows).toHaveLength(1);
  });

  it('rejects an unknown session', async () => {
    mockAdmin();
    mockedSessionSvc.findSessionById.mockResolvedValue(null);

    await expect(
      registerFinalisedRecording({
        sessionId:     SESSION_ID,
        recordingSid:  RECORDING_SID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('registerFinalisedComposition', () => {
  it('writes a row with kind, storage_uri, bytes and visible=true', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    const result = await registerFinalisedComposition({
      sessionId:      SESSION_ID,
      compositionSid: COMPOSITION_SID,
      artifactKind:   'audio_composition',
      correlationId:  CORRELATION_ID,
    });

    expect(result.created).toBe(true);
    expect(result.bytes).toBe(4096);
    expect(result.storageUri).toBe(
      buildTwilioCompositionStorageUri(COMPOSITION_SID),
    );
    expect(admin.insertedRows).toHaveLength(1);
    expect(admin.insertedRows[0]).toMatchObject({
      session_id:                 SESSION_ID,
      artifact_kind:              'audio_composition',
      storage_uri:                result.storageUri,
      bytes:                      4096,
      patient_self_serve_visible: true,
    });
  });

  it('registers video_composition through the same entry point', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    const result = await registerFinalisedComposition({
      sessionId:      SESSION_ID,
      compositionSid: COMPOSITION_SID,
      artifactKind:   'video_composition',
      correlationId:  CORRELATION_ID,
    });

    expect(result.created).toBe(true);
    expect(admin.insertedRows[0]?.artifact_kind).toBe('video_composition');
  });

  it('collapses a UNIQUE violation to created:false (REC1-D2)', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    const first = await registerFinalisedComposition({
      sessionId:      SESSION_ID,
      compositionSid: COMPOSITION_SID,
      artifactKind:   'audio_composition',
      correlationId:  CORRELATION_ID,
    });
    expect(first.created).toBe(true);

    admin.nextInsertError = { code: '23505', message: 'duplicate key value' };

    const second = await registerFinalisedComposition({
      sessionId:      SESSION_ID,
      compositionSid: COMPOSITION_SID,
      artifactKind:   'audio_composition',
      correlationId:  `${CORRELATION_ID}-retry`,
    });

    expect(second.created).toBe(false);
    expect(second.artifactId).toBe(first.artifactId);
    expect(second.storageUri).toBe(first.storageUri);
    expect(admin.insertedRows).toHaveLength(1);
  });

  it('does not register a non-completed composition', async () => {
    mockedTwilio.fetchCompositionMetadata.mockResolvedValue({
      status:         'processing',
      mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${COMPOSITION_SID}/Media`,
    });
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    await expect(
      registerFinalisedComposition({
        sessionId:      SESSION_ID,
        compositionSid: COMPOSITION_SID,
        artifactKind:   'audio_composition',
        correlationId:  CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(admin.insertedRows).toHaveLength(0);
  });

  it('writes the row when Twilio omits sizeBytes', async () => {
    mockedTwilio.fetchCompositionMetadata.mockResolvedValue({
      status:         'completed',
      mediaUrlPrefix: `https://video.twilio.com/v1/Compositions/${COMPOSITION_SID}/Media`,
    });
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    const result = await registerFinalisedComposition({
      sessionId:      SESSION_ID,
      compositionSid: COMPOSITION_SID,
      artifactKind:   'audio_composition',
      correlationId:  CORRELATION_ID,
    });

    expect(result.created).toBe(true);
    expect(result.bytes).toBeNull();
    expect(admin.insertedRows[0]?.bytes).toBeNull();
  });

  it('rejects an unknown artifact kind', async () => {
    await expect(
      registerFinalisedComposition({
        sessionId:      SESSION_ID,
        compositionSid: COMPOSITION_SID,
        artifactKind:   'transcript',
        correlationId:  CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockedTwilio.fetchCompositionMetadata).not.toHaveBeenCalled();
  });

  it('rejects a missing session', async () => {
    mockedSessionSvc.findSessionById.mockResolvedValue(null);
    await expect(
      registerFinalisedComposition({
        sessionId:      SESSION_ID,
        compositionSid: COMPOSITION_SID,
        artifactKind:   'audio_composition',
        correlationId:  CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('round-trips through resolveAudioArtifact Path A (source: index)', async () => {
    const admin = buildAdminMock();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin.client as ReturnType<typeof database.getSupabaseAdminClient>,
    );

    const written = await registerFinalisedComposition({
      sessionId:      SESSION_ID,
      compositionSid: COMPOSITION_SID,
      artifactKind:   'audio_composition',
      correlationId:  CORRELATION_ID,
    });
    expect(written.created).toBe(true);

    const availability = await getReplayAvailability({
      sessionId:        SESSION_ID,
      requestingUserId: DOCTOR_ID,
      requestingRole:   'doctor',
    });

    expect(availability.available).toBe(true);
    expect(mockedTwilio.fetchCompositionMetadata).toHaveBeenCalledWith(
      COMPOSITION_SID,
    );
    // Path B is empty in the mock; if Path A had failed we would have
    // `artifact_not_found` instead of a completed-composition lookup
    // with the SID this writer stored.
    expect(availability.reason).toBeUndefined();
  });
});
