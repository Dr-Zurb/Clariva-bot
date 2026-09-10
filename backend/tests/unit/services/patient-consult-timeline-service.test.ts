/**
 * rec-28 — doctor consult timeline (REC-D23 / REC5-D3).
 *
 * Pins: doctor isolation, hard_deleted_at as "was recorded, since deleted",
 * patient_self_serve_visible is not a doctor filter, bounded page,
 * zero Twilio / track-service calls.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

jest.mock('../../../src/services/patient-service', () => ({
  findPatientByIdWithAdmin: jest.fn(),
}));

jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(async () => Buffer.from([])),
  buildPrescriptionPdfContext: jest.fn(async () => ({})),
}));

jest.mock('../../../src/services/twilio-compositions', () => ({
  listCompositionsForRoom: jest.fn(async () => {
    throw new Error('Twilio seam must not be called (REC5-D3)');
  }),
}));

jest.mock('../../../src/services/recording-track-service', () => ({
  getRecordingArtifactsForSession: jest.fn(() => {
    throw new Error('recording-track-service must not be called (REC5-D3)');
  }),
}));

import * as database from '../../../src/config/database';
import * as patientService from '../../../src/services/patient-service';
import * as twilioCompositions from '../../../src/services/twilio-compositions';
import { listPatientConsultTimeline } from '../../../src/services/patient-consult-timeline-service';
import { NotFoundError } from '../../../src/utils/errors';

const listCompositionsForRoom = twilioCompositions.listCompositionsForRoom as jest.Mock;

const mockedDb = database as jest.Mocked<typeof database>;
const mockedPatient = patientService as jest.Mocked<typeof patientService>;

const PATIENT_ID = '22222222-2222-2222-2222-222222222222';
const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_DOCTOR_ID = '33333333-3333-3333-3333-333333333333';
const SESSION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const APPT_A = 'a1111111-1111-1111-1111-111111111111';
const APPT_B = 'b1111111-1111-1111-1111-111111111111';
const CORRELATION_ID = 'corr-rec-28';

type QueryResult = { data: unknown; error: unknown };

interface AdminHarness {
  results: Record<string, QueryResult>;
  inLists: Record<string, unknown[][]>;
  selectArgs: Record<string, string[]>;
  client: { from: (table: string) => unknown };
}

function thenableQuery(
  result: QueryResult,
  table: string,
  harness: AdminHarness,
): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  const self = (): Record<string, unknown> => q;
  q.select = (cols?: string) => {
    if (typeof cols === 'string') {
      (harness.selectArgs[table] ??= []).push(cols);
    }
    return self();
  };
  q.eq = () => self();
  q.not = () => self();
  q.order = () => self();
  q.range = () => self();
  q.in = (_col: string, ids: unknown[]) => {
    (harness.inLists[table] ??= []).push(ids);
    return self();
  };
  q.filter = () => self();
  q.limit = () => self();
  q.maybeSingle = async () => result;
  q.then = (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return q;
}

function buildAdmin(overrides: Partial<Record<string, QueryResult>> = {}): AdminHarness {
  const results: Record<string, QueryResult> = {
    appointments: { data: { id: APPT_A }, error: null },
    conversations: { data: null, error: null },
    consultation_sessions: { data: [], error: null },
    recording_artifact_index: { data: [], error: null },
    prescriptions: { data: [], error: null },
    consultation_messages: { data: [], error: null },
    consultation_transcripts: { data: [], error: null },
    ...overrides,
  };
  const harness: AdminHarness = {
    results,
    inLists: {},
    selectArgs: {},
    client: { from: () => ({}) },
  };
  harness.client.from = (table: string) =>
    thenableQuery(results[table] ?? { data: null, error: null }, table, harness);
  return harness;
}

const endedSession = {
  id: SESSION_A,
  appointment_id: APPT_A,
  modality: 'video' as const,
  actual_started_at: '2026-08-01T10:00:00.000Z',
  actual_ended_at: '2026-08-01T10:15:00.000Z',
  scheduled_start_at: '2026-08-01T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedPatient.findPatientByIdWithAdmin.mockResolvedValue({
    id: PATIENT_ID,
  } as Awaited<ReturnType<typeof patientService.findPatientByIdWithAdmin>>);
});

describe('listPatientConsultTimeline', () => {
  it('returns empty items when the patient has no ended consults', async () => {
    const harness = buildAdmin();
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    const result = await listPatientConsultTimeline({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result).toEqual({ items: [], hasMore: false });
    expect(listCompositionsForRoom).not.toHaveBeenCalled();
  });

  it('maps artifact presence, including a hard-deleted recording as deleted-not-absent', async () => {
    const harness = buildAdmin({
      consultation_sessions: {
        data: [
          endedSession,
          {
            ...endedSession,
            id: SESSION_B,
            appointment_id: APPT_B,
            modality: 'voice',
            actual_started_at: '2026-07-01T09:00:00.000Z',
            actual_ended_at: '2026-07-01T09:10:00.000Z',
          },
        ],
        error: null,
      },
      recording_artifact_index: {
        data: [
          {
            session_id: SESSION_A,
            artifact_kind: 'video_composition',
            hard_deleted_at: '2026-08-15T00:00:00.000Z',
          },
          {
            session_id: SESSION_A,
            artifact_kind: 'transcript',
            hard_deleted_at: null,
          },
          {
            session_id: SESSION_B,
            artifact_kind: 'audio_composition',
            hard_deleted_at: null,
          },
        ],
        error: null,
      },
      prescriptions: {
        data: [{ appointment_id: APPT_A }],
        error: null,
      },
      consultation_messages: {
        data: [{ session_id: SESSION_B }],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    const result = await listPatientConsultTimeline({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      sessionId: SESSION_A,
      appointmentId: APPT_A,
      consultedAt: '2026-08-01T10:00:00.000Z',
      modality: 'video',
      durationSeconds: 900,
      artifacts: {
        hasRecording: false,
        recordingDeleted: true,
        hasTranscript: true,
        hasPrescription: true,
        hasSnapshots: false,
      },
      transcriptStatus: null,
    });
    expect(result.items[1].artifacts).toEqual({
      hasRecording: true,
      recordingDeleted: false,
      hasTranscript: false,
      hasPrescription: false,
      hasSnapshots: true,
    });
    expect(result.hasMore).toBe(false);

    const artifactSelect = harness.selectArgs.recording_artifact_index?.join(' ');
    expect(artifactSelect).toContain('hard_deleted_at');
    expect(artifactSelect).not.toContain('patient_self_serve_visible');
    expect(harness.inLists.recording_artifact_index?.[0]).toEqual([SESSION_A, SESSION_B]);
    expect(listCompositionsForRoom).not.toHaveBeenCalled();
  });

  // Cost-cut step 7: a session holding only raw tracks is replayable via
  // on-demand composition, so the timeline must not call it recording-less.
  it('counts a raw audio track as a recording', async () => {
    const harness = buildAdmin({
      consultation_sessions: { data: [endedSession], error: null },
      recording_artifact_index: {
        data: [
          {
            session_id: SESSION_A,
            artifact_kind: 'audio_track',
            hard_deleted_at: null,
          },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    const result = await listPatientConsultTimeline({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.items[0]?.artifacts).toMatchObject({
      hasRecording: true,
      recordingDeleted: false,
    });
  });

  it('reports an erased raw track as deleted, not as absent', async () => {
    const harness = buildAdmin({
      consultation_sessions: { data: [endedSession], error: null },
      recording_artifact_index: {
        data: [
          {
            session_id: SESSION_A,
            artifact_kind: 'video_track',
            hard_deleted_at: '2026-08-15T00:00:00.000Z',
          },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    const result = await listPatientConsultTimeline({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.items[0]?.artifacts).toMatchObject({
      hasRecording: false,
      recordingDeleted: true,
    });
  });

  it('still succeeds when the Twilio seam is configured to throw', async () => {
    const harness = buildAdmin({
      consultation_sessions: { data: [endedSession], error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    await expect(
      listPatientConsultTimeline({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        correlationId: CORRELATION_ID,
      }),
    ).resolves.toMatchObject({
      items: [{ sessionId: SESSION_A, durationSeconds: 900 }],
      hasMore: false,
    });
    expect(listCompositionsForRoom).not.toHaveBeenCalled();
  });

  it('404s when the doctor has no appointment or conversation with the patient', async () => {
    const harness = buildAdmin({
      appointments: { data: null, error: null },
      conversations: { data: null, error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    await expect(
      listPatientConsultTimeline({
        patientId: PATIENT_ID,
        doctorId: OTHER_DOCTOR_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the patient row is missing', async () => {
    mockedPatient.findPatientByIdWithAdmin.mockResolvedValue(null);
    const harness = buildAdmin();
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    await expect(
      listPatientConsultTimeline({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('bounds the page and sets hasMore when a full page is returned', async () => {
    const rows = Array.from({ length: 2 }, (_, i) => ({
      ...endedSession,
      id: i === 0 ? SESSION_A : SESSION_B,
      appointment_id: i === 0 ? APPT_A : APPT_B,
    }));
    const harness = buildAdmin({
      consultation_sessions: { data: rows, error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    const result = await listPatientConsultTimeline({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      correlationId: CORRELATION_ID,
      limit: 2,
      offset: 0,
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('gates usable-transcript status on consultation_transcripts, not the index flag', async () => {
    const harness = buildAdmin({
      consultation_sessions: {
        data: [
          endedSession,
          {
            ...endedSession,
            id: SESSION_B,
            appointment_id: APPT_B,
            modality: 'voice',
          },
        ],
        error: null,
      },
      consultation_transcripts: {
        data: [
          { consultation_session_id: SESSION_A, status: 'completed' },
          { consultation_session_id: SESSION_B, status: 'processing' },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    const result = await listPatientConsultTimeline({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.items[0]?.transcriptStatus).toBe('completed');
    expect(result.items[0]?.artifacts.hasTranscript).toBe(false);
    expect(result.items[1]?.transcriptStatus).toBe('processing');
    expect(harness.inLists.consultation_transcripts?.[0]).toEqual([SESSION_A, SESSION_B]);
  });

  it('prefers completed over failed when a session has both transcript rows', async () => {
    const harness = buildAdmin({
      consultation_sessions: { data: [endedSession], error: null },
      consultation_transcripts: {
        data: [
          { consultation_session_id: SESSION_A, status: 'failed' },
          { consultation_session_id: SESSION_A, status: 'completed' },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(harness.client as never);

    const result = await listPatientConsultTimeline({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      correlationId: CORRELATION_ID,
    });
    expect(result.items[0]?.transcriptStatus).toBe('completed');
  });

  it('does not import Twilio or the track service', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/services/patient-consult-timeline-service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/twilio-compositions|recording-track-service|listCompositionsForRoom/);
  });
});
