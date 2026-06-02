/**
 * Unit tests for post-call-summary-service.ts (Sub-batch D · task-video-D1).
 *
 * Coverage matrix:
 *
 *   1. Validation gate (cheapest first):
 *        - missing sessionId / bad UUID
 *        - missing bearer JWT
 *        - missing correlationId
 *
 *   2. Auth resolution:
 *        - patient JWT with matching session_id → accepted
 *        - patient JWT with mismatched session_id → ForbiddenError
 *        - extra_participant JWT with matching session_id → accepted
 *        - doctor JWT, session.doctor_id matches → accepted
 *        - doctor JWT, session.doctor_id does NOT match → NotFoundError
 *        - bearer that admin.auth.getUser rejects → UnauthorizedError
 *
 *   3. Aggregation:
 *        - duration: both timestamps set, started-only, neither set
 *        - attachments + snapshots counts (zero, many)
 *        - prescription: present (carries id), absent
 *        - recording: text modality short-circuits to not-available
 *        - recording: consent=false short-circuits to not-recorded
 *        - recording: getReplayAvailability available + hasVideo
 *        - recording: getReplayAvailability returns artifact_not_ready (processing)
 *        - recording: getReplayAvailability returns artifact_not_found (not-recorded)
 *        - recording: getReplayAvailability throws → not-available
 *        - counterparty: doctor caller → patient name from appointment
 *        - counterparty: patient caller → doctor name from auth.admin.getUserById
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

jest.mock('../../../src/services/recording-access-service', () => ({
  getReplayAvailability: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import {
  getPostCallSummary,
  type PostCallSummaryDto,
} from '../../../src/services/post-call-summary-service';
import * as database from '../../../src/config/database';
import * as recordingAccess from '../../../src/services/recording-access-service';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedRecording = recordingAccess as jest.Mocked<typeof recordingAccess>;

const SECRET = 'test-secret-at-least-16-chars-long';
const VALID_SESSION_ID = '00000000-0000-0000-0000-000000000123';
const VALID_OTHER_SESSION_ID = '00000000-0000-0000-0000-000000000999';
const VALID_DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const VALID_OTHER_DOCTOR_ID = '00000000-0000-0000-0000-0000000000ff';
const VALID_PATIENT_ID = '00000000-0000-0000-0000-0000000000cc';
const VALID_APPOINTMENT_ID = '00000000-0000-0000-0000-0000000000bb';

// ---------------------------------------------------------------------------
// Token builders
// ---------------------------------------------------------------------------

function buildDoctorJwt(): string {
  return jwt.sign(
    { sub: VALID_DOCTOR_ID, role: 'authenticated', aud: 'authenticated' },
    SECRET,
    { algorithm: 'HS256' },
  );
}

function buildPatientJwt(sessionId: string = VALID_SESSION_ID): string {
  return jwt.sign(
    {
      sub: 'patient:appt-1',
      consult_role: 'patient',
      session_id: sessionId,
      aud: 'authenticated',
    },
    SECRET,
    { algorithm: 'HS256' },
  );
}

function buildExtraParticipantJwt(): string {
  return jwt.sign(
    {
      sub: 'extra:00000000-0000-0000-0000-0000000000ee',
      consult_role: 'extra_participant',
      session_id: VALID_SESSION_ID,
      extra_participant_id: '00000000-0000-0000-0000-0000000000ee',
      aud: 'authenticated',
    },
    SECRET,
    { algorithm: 'HS256' },
  );
}

// ---------------------------------------------------------------------------
// Admin client mock builder
// ---------------------------------------------------------------------------

interface AdminMockOpts {
  /** session row returned by the consultation_sessions lookup; null = not found. */
  sessionRow?: {
    id: string;
    appointment_id: string;
    doctor_id: string;
    patient_id: string | null;
    modality: 'text' | 'voice' | 'video';
    status: 'scheduled' | 'live' | 'ended' | 'no_show' | 'cancelled';
    actual_started_at: string | null;
    actual_ended_at: string | null;
    recording_artifact_ref: string | null;
    recording_consent_at_book: boolean | null;
  } | null;
  /** appointment row for counterparty lookup (doctor caller branch). */
  appointmentRow?: {
    id: string;
    patient_id: string | null;
    patient_name: string | null;
  } | null;
  /** doctor user returned by admin.auth.admin.getUserById. */
  doctorUser?: {
    id: string;
    email: string | null;
    user_metadata: { full_name?: string; name?: string } | null;
  } | null;
  /** auth.getUser result (drives "is this a real doctor token?" branch). */
  authGetUserResult?: {
    data: { user: { id: string } | null } | null;
    error: { message: string } | null;
  };
  /** counts returned by countMessages (kind=attachment). */
  attachmentsCount?: number;
  /** counts returned by countMessages (system_event=snapshot_taken). */
  snapshotsCount?: number;
  /** prescription rows returned by the latest-Rx lookup. */
  prescriptionRows?: Array<{ id: string; created_at: string }>;
}

function mountAdminMock(opts: AdminMockOpts = {}) {
  const {
    sessionRow = {
      id: VALID_SESSION_ID,
      appointment_id: VALID_APPOINTMENT_ID,
      doctor_id: VALID_DOCTOR_ID,
      patient_id: VALID_PATIENT_ID,
      modality: 'video',
      status: 'ended',
      actual_started_at: '2026-05-01T10:00:00Z',
      actual_ended_at: '2026-05-01T10:24:00Z',
      recording_artifact_ref: 'artifact_ref_123',
      recording_consent_at_book: true,
    },
    appointmentRow = {
      id: VALID_APPOINTMENT_ID,
      patient_id: VALID_PATIENT_ID,
      patient_name: 'Maria Patient',
    },
    doctorUser = {
      id: VALID_DOCTOR_ID,
      email: 'doctor@example.test',
      user_metadata: { full_name: 'Dr. Sharma' },
    },
    authGetUserResult = {
      data: { user: { id: VALID_DOCTOR_ID } },
      error: null,
    },
    attachmentsCount = 3,
    snapshotsCount = 2,
    prescriptionRows = [{ id: 'rx-001', created_at: '2026-05-01T10:20:00Z' }],
  } = opts;

  // The `from(table)` builder returns table-specific chains.
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
      // The aggregator does two distinct count queries; both follow
      // the same chain shape (.select(..., {count, head}).eq().eq()
      // for the snapshot one, .eq() for attachments). To distinguish,
      // we don't really need to — both should resolve to the
      // appropriate count. We give a stateful builder that returns
      // the attachment count on the first eq-only call and the
      // snapshot count when system_event eq is added.
      // The countMessages helper does:
      //   from('consultation_messages')
      //     .select('id', { count: 'exact', head: true })
      //     .eq('session_id', sessionId)
      //     .eq('kind', 'attachment')                  // attachments path
      //   OR
      //     .eq('system_event', 'snapshot_taken')      // snapshots path
      // We track a flag set when `system_event` is the column being
      // filtered so the awaited result picks the right count.
      const state = { appliedSystemEventFilter: false };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn((column: unknown) => {
          if (column === 'system_event') state.appliedSystemEventFilter = true;
          return builder;
        }),
        then: (resolve: (value: { count: number; error: null }) => void) => {
          const count = state.appliedSystemEventFilter
            ? snapshotsCount
            : attachmentsCount;
          resolve({ count, error: null });
        },
      };
      return builder;
    }
    if (table === 'prescriptions') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest
                .fn<() => Promise<unknown>>()
                .mockResolvedValue({ data: prescriptionRows, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'appointments') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest
              .fn<() => Promise<unknown>>()
              .mockResolvedValue({ data: appointmentRow, error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  const admin = {
    from: fromMock,
    auth: {
      getUser: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(authGetUserResult),
      admin: {
        getUserById: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ data: { user: doctorUser }, error: null }),
      },
    },
  };

  mockedDb.getSupabaseAdminClient.mockReturnValue(
    admin as unknown as ReturnType<typeof database.getSupabaseAdminClient>,
  );
  return admin;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Default to "Plan 07 says recording is available with video".
  mockedRecording.getReplayAvailability.mockResolvedValue({
    available: true,
    hasVideo: true,
  });
});

describe('post-call-summary-service · validation gate', () => {
  it('throws ValidationError on missing sessionId', async () => {
    await expect(
      getPostCallSummary({
        sessionId: '',
        bearerJwt: buildDoctorJwt(),
        correlationId: 'cid',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError on non-UUID sessionId', async () => {
    await expect(
      getPostCallSummary({
        sessionId: 'not-a-uuid',
        bearerJwt: buildDoctorJwt(),
        correlationId: 'cid',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws UnauthorizedError on empty bearer', async () => {
    await expect(
      getPostCallSummary({
        sessionId: VALID_SESSION_ID,
        bearerJwt: '',
        correlationId: 'cid',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ValidationError on missing correlationId', async () => {
    await expect(
      getPostCallSummary({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        correlationId: '',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('post-call-summary-service · auth', () => {
  it('accepts patient JWT with matching session_id', async () => {
    mountAdminMock();
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildPatientJwt(),
      correlationId: 'cid',
    });
    expect(dto.sessionId).toBe(VALID_SESSION_ID);
    expect(dto.counterparty.role).toBe('doctor');
  });

  it('rejects patient JWT with mismatched session_id', async () => {
    mountAdminMock();
    await expect(
      getPostCallSummary({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildPatientJwt(VALID_OTHER_SESSION_ID),
        correlationId: 'cid',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('accepts extra_participant JWT with matching session_id', async () => {
    mountAdminMock();
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildExtraParticipantJwt(),
      correlationId: 'cid',
    });
    // extra-participant counterparty resolves to the doctor (we
    // treat extras as guests of the doctor).
    expect(dto.counterparty.role).toBe('doctor');
  });

  it('accepts doctor JWT when session.doctor_id matches', async () => {
    mountAdminMock();
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.counterparty.role).toBe('patient');
  });

  it('rejects doctor JWT when session.doctor_id does not match (NotFound shape)', async () => {
    mountAdminMock({
      authGetUserResult: {
        data: { user: { id: VALID_OTHER_DOCTOR_ID } },
        error: null,
      },
    });
    await expect(
      getPostCallSummary({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        correlationId: 'cid',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects bearer when admin.auth.getUser fails', async () => {
    mountAdminMock({
      authGetUserResult: {
        data: { user: null },
        error: { message: 'invalid' },
      },
    });
    await expect(
      getPostCallSummary({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        correlationId: 'cid',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws NotFound when session row does not exist', async () => {
    mountAdminMock({ sessionRow: null });
    await expect(
      getPostCallSummary({
        sessionId: VALID_SESSION_ID,
        bearerJwt: buildDoctorJwt(),
        correlationId: 'cid',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('post-call-summary-service · aggregation', () => {
  it('returns the full DTO shape with happy-path defaults', async () => {
    mountAdminMock();
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    const expected: Partial<PostCallSummaryDto> = {
      sessionId: VALID_SESSION_ID,
      modality: 'video',
      status: 'ended',
      attachmentsCount: 3,
      snapshotsCount: 2,
      prescriptionSent: true,
      prescriptionId: 'rx-001',
      counterparty: { name: 'Maria Patient', role: 'patient' },
      recording: { status: 'available', hasVideo: true },
    };
    expect(dto).toMatchObject(expected);
    expect(dto.duration.startedAt).toBe('2026-05-01T10:00:00Z');
    expect(dto.duration.endedAt).toBe('2026-05-01T10:24:00Z');
    expect(dto.duration.secondsTotal).toBe(24 * 60);
  });

  it('omits prescriptionId when no Rx exists', async () => {
    mountAdminMock({ prescriptionRows: [] });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.prescriptionSent).toBe(false);
    expect(dto.prescriptionId).toBeUndefined();
  });

  it('returns null secondsTotal when actual_ended_at is missing', async () => {
    mountAdminMock({
      sessionRow: {
        id: VALID_SESSION_ID,
        appointment_id: VALID_APPOINTMENT_ID,
        doctor_id: VALID_DOCTOR_ID,
        patient_id: VALID_PATIENT_ID,
        modality: 'video',
        status: 'ended',
        actual_started_at: '2026-05-01T10:00:00Z',
        actual_ended_at: null,
        recording_artifact_ref: 'artifact_ref_123',
        recording_consent_at_book: true,
      },
    });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.duration.secondsTotal).toBeNull();
  });

  it('returns recording.status="not-available" for text modality', async () => {
    mountAdminMock({
      sessionRow: {
        id: VALID_SESSION_ID,
        appointment_id: VALID_APPOINTMENT_ID,
        doctor_id: VALID_DOCTOR_ID,
        patient_id: VALID_PATIENT_ID,
        modality: 'text',
        status: 'ended',
        actual_started_at: '2026-05-01T10:00:00Z',
        actual_ended_at: '2026-05-01T10:24:00Z',
        recording_artifact_ref: null,
        recording_consent_at_book: null,
      },
    });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.recording.status).toBe('not-available');
    // getReplayAvailability should NOT be called for text modality.
    expect(mockedRecording.getReplayAvailability).not.toHaveBeenCalled();
  });

  it('returns recording.status="not-recorded" when consent was false at booking', async () => {
    mountAdminMock({
      sessionRow: {
        id: VALID_SESSION_ID,
        appointment_id: VALID_APPOINTMENT_ID,
        doctor_id: VALID_DOCTOR_ID,
        patient_id: VALID_PATIENT_ID,
        modality: 'video',
        status: 'ended',
        actual_started_at: '2026-05-01T10:00:00Z',
        actual_ended_at: '2026-05-01T10:24:00Z',
        recording_artifact_ref: null,
        recording_consent_at_book: false,
      },
    });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.recording.status).toBe('not-recorded');
    expect(mockedRecording.getReplayAvailability).not.toHaveBeenCalled();
  });

  it('reports recording.status="processing" when artifact_not_ready', async () => {
    mountAdminMock();
    mockedRecording.getReplayAvailability.mockResolvedValueOnce({
      available: false,
      reason: 'artifact_not_ready',
    });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.recording.status).toBe('processing');
  });

  it('reports recording.status="not-recorded" when artifact_not_found', async () => {
    mountAdminMock();
    mockedRecording.getReplayAvailability.mockResolvedValueOnce({
      available: false,
      reason: 'artifact_not_found',
    });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.recording.status).toBe('not-recorded');
  });

  it('reports recording.status="not-available" when getReplayAvailability throws', async () => {
    mountAdminMock();
    mockedRecording.getReplayAvailability.mockRejectedValueOnce(
      new Error('Plan 07 not deployed'),
    );
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.recording.status).toBe('not-available');
  });

  it('falls back to "Patient" when appointment.patient_name is null', async () => {
    mountAdminMock({
      appointmentRow: {
        id: VALID_APPOINTMENT_ID,
        patient_id: VALID_PATIENT_ID,
        patient_name: null,
      },
    });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.counterparty.name).toBe('Patient');
  });

  it('resolves doctor display name from user_metadata.full_name (patient-side caller)', async () => {
    mountAdminMock();
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildPatientJwt(),
      correlationId: 'cid',
    });
    expect(dto.counterparty).toEqual({ name: 'Dr. Sharma', role: 'doctor' });
  });

  it('falls back to email username when doctor user_metadata is empty', async () => {
    mountAdminMock({
      doctorUser: {
        id: VALID_DOCTOR_ID,
        email: 'sharma@example.test',
        user_metadata: null,
      },
    });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildPatientJwt(),
      correlationId: 'cid',
    });
    expect(dto.counterparty.name).toBe('sharma');
  });

  it('falls back to literal "Doctor" when admin.auth.admin.getUserById fails', async () => {
    const admin = mountAdminMock();
    (
      admin.auth.admin.getUserById as jest.Mock<() => Promise<unknown>>
    ).mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'no such user' },
    });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildPatientJwt(),
      correlationId: 'cid',
    });
    expect(dto.counterparty.name).toBe('Doctor');
  });

  it('counts attachments + snapshots independently from the same table', async () => {
    mountAdminMock({ attachmentsCount: 5, snapshotsCount: 7 });
    const dto = await getPostCallSummary({
      sessionId: VALID_SESSION_ID,
      bearerJwt: buildDoctorJwt(),
      correlationId: 'cid',
    });
    expect(dto.attachmentsCount).toBe(5);
    expect(dto.snapshotsCount).toBe(7);
  });
});
