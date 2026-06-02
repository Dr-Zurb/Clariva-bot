/**
 * Appointment Wrap-up Service Tests (pf-02)
 *
 * Covers the four failure modes called out in
 * `task-pf-02-wrapup-backend.md`:
 *   1. Happy path — confirmed appointment with live session → flip to
 *      completed + endSession dispatched.
 *   2. Idempotency — already-completed appointment → no-op, no endSession,
 *      no audit log, no side-effects.
 *   3. Forbidden — caller doctor_id ≠ appointment.doctor_id → 403.
 *   4. Cancelled — wrap-up refused with 400.
 *
 * Plus a race-safety check: concurrent wrap-up where the row UPDATE matches
 * zero rows (some other caller already flipped status) → idempotent
 * fallthrough, no endSession, no audit log.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { wrapUpAppointment } from '../../../src/services/appointment-service';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../src/utils/errors';

import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';
import * as consultationSessionService from '../../../src/services/consultation-session-service';
import * as careEpisodeService from '../../../src/services/care-episode-service';
import * as opdQueueService from '../../../src/services/opd/opd-queue-service';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

jest.mock('../../../src/services/consultation-session-service', () => {
  const actual = jest.requireActual(
    '../../../src/services/consultation-session-service'
  ) as object;
  return {
    ...actual,
    endSession: jest.fn(async () => undefined),
    findLatestAppointmentSessionSummary: jest.fn(async () => null),
    findLatestAppointmentSessionSummariesBulk: jest.fn(async () => new Map()),
  };
});

jest.mock('../../../src/services/care-episode-service', () => ({
  syncCareEpisodeLifecycleOnAppointmentCompleted: jest.fn(async () => {}),
}));

jest.mock('../../../src/services/opd/opd-queue-service', () => ({
  syncOpdQueueEntryOnAppointmentStatus: jest.fn(async () => {}),
}));

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;
const mockedSession = consultationSessionService as jest.Mocked<
  typeof consultationSessionService
>;
const mockedCareEpisode = careEpisodeService as jest.Mocked<
  typeof careEpisodeService
>;
const mockedOpdQueue = opdQueueService as jest.Mocked<typeof opdQueueService>;

const APPT_ID = '550e8400-e29b-41d4-a716-446655440010';
const DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440099';
const SESSION_ID = '770e8400-e29b-41d4-a716-446655440000';
const CORRELATION_ID = 'corr-pf02';

const baseAppointment = {
  id: APPT_ID,
  doctor_id: DOCTOR_ID,
  patient_id: null,
  patient_name: 'PATIENT_TEST',
  patient_phone: '+10000000000',
  appointment_date: new Date('2026-05-07T10:00:00Z'),
  status: 'confirmed' as const,
  notes: null,
  diagnosis_text: null,
  diagnosis_tags: [],
  followup_date: null,
  followup_kind: null,
  created_at: new Date('2026-05-07T08:00:00Z'),
  updated_at: new Date('2026-05-07T08:00:00Z'),
};

/**
 * Build a chainable Supabase admin mock. `responses` is a queue of terminal
 * responses keyed by call order — `maybeSingle`, `single`, and `then`
 * (await-on-chain) all consume from the same queue, mirroring how the real
 * client returns from any of these terminators.
 */
function createMockAdmin(
  responses: ({ data: unknown; error: unknown })[]
): { from: jest.Mock; chain: Record<string, jest.Mock> } {
  let idx = 0;
  const next = () => responses[idx++] ?? { data: null, error: null };

  const chain: Record<string, jest.Mock> = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),
    in: jest.fn(),
    gt: jest.fn(),
    gte: jest.fn(),
    lt: jest.fn(),
    is: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
  };

  for (const key of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'neq',
    'in',
    'gt',
    'gte',
    'lt',
    'is',
    'order',
    'limit',
  ]) {
    chain[key]!.mockReturnValue(chain);
  }

  chain.single!.mockImplementation(() => Promise.resolve(next()));
  chain.maybeSingle!.mockImplementation(() => Promise.resolve(next()));

  const from = jest.fn().mockReturnValue(chain);
  return { from, chain };
}

const validBody = {
  diagnosis_text: 'Viral fever',
  diagnosis_tags: ['flu', 'viral'],
  followup_date: '2026-06-01',
  followup_kind: 'in_person' as const,
};

describe('wrapUpAppointment (pf-02)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logAuditEvent as jest.Mock).mockImplementation(() =>
      Promise.resolve()
    );
    (mockedSession.endSession as jest.Mock).mockImplementation(() =>
      Promise.resolve()
    );
    (mockedSession.findLatestAppointmentSessionSummary as jest.Mock).mockImplementation(
      () => Promise.resolve(null)
    );
    (mockedCareEpisode.syncCareEpisodeLifecycleOnAppointmentCompleted as jest.Mock).mockImplementation(
      () => Promise.resolve()
    );
    (mockedOpdQueue.syncOpdQueueEntryOnAppointmentStatus as jest.Mock).mockImplementation(
      () => Promise.resolve()
    );
  });

  it('happy path: confirmed appointment with live session → flips to completed and ends session', async () => {
    const updatedRow = {
      ...baseAppointment,
      status: 'completed',
      diagnosis_text: validBody.diagnosis_text,
      diagnosis_tags: validBody.diagnosis_tags,
      followup_date: validBody.followup_date,
      followup_kind: validBody.followup_kind,
    };

    // Three terminal calls flow through admin in order:
    //   1) lookup existing appointment (.maybeSingle)
    //   2) UPDATE … RETURNING * (.maybeSingle)
    //   3) post-update enrichment session lookup (mocked at helper level)
    const mockAdmin = createMockAdmin([
      { data: baseAppointment, error: null },
      { data: updatedRow, error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

    (mockedSession.findLatestAppointmentSessionSummary as jest.Mock)
      .mockImplementationOnce(() =>
        Promise.resolve({
          id: SESSION_ID,
          modality: 'video',
          status: 'live',
          provider: 'twilio_video',
          provider_session_id: 'RM_FAKE',
          actual_started_at: '2026-05-07T10:01:00Z',
          actual_ended_at: null,
        })
      )
      // Post-update enrichment call — return null (test doesn't care).
      .mockImplementationOnce(() => Promise.resolve(null));

    const result = await wrapUpAppointment(
      APPT_ID,
      validBody,
      CORRELATION_ID,
      DOCTOR_ID
    );

    expect(result.status).toBe('completed');
    expect(result.diagnosis_text).toBe(validBody.diagnosis_text);
    expect(result.diagnosis_tags).toEqual(validBody.diagnosis_tags);
    expect(mockedSession.endSession).toHaveBeenCalledTimes(1);
    expect(mockedSession.endSession).toHaveBeenCalledWith(
      SESSION_ID,
      CORRELATION_ID
    );
    expect(
      mockedOpdQueue.syncOpdQueueEntryOnAppointmentStatus
    ).toHaveBeenCalledWith(APPT_ID, 'completed', CORRELATION_ID);
    expect(
      mockedCareEpisode.syncCareEpisodeLifecycleOnAppointmentCompleted
    ).toHaveBeenCalledTimes(1);
    expect(mockedAudit.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'wrap_up_appointment',
        resourceType: 'appointment',
        resourceId: APPT_ID,
        status: 'success',
      })
    );
  });

  it('happy path with no live session: still flips to completed but skips endSession', async () => {
    const updatedRow = { ...baseAppointment, status: 'completed' };
    const mockAdmin = createMockAdmin([
      { data: baseAppointment, error: null },
      { data: updatedRow, error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

    // Latest session is `ended` — endSession should not be invoked.
    (mockedSession.findLatestAppointmentSessionSummary as jest.Mock)
      .mockImplementationOnce(() =>
        Promise.resolve({
          id: SESSION_ID,
          modality: 'video',
          status: 'ended',
          provider: 'twilio_video',
          provider_session_id: 'RM_FAKE',
          actual_started_at: '2026-05-07T10:01:00Z',
          actual_ended_at: '2026-05-07T10:30:00Z',
        })
      )
      .mockImplementationOnce(() => Promise.resolve(null));

    const result = await wrapUpAppointment(
      APPT_ID,
      validBody,
      CORRELATION_ID,
      DOCTOR_ID
    );

    expect(result.status).toBe('completed');
    expect(mockedSession.endSession).not.toHaveBeenCalled();
    expect(mockedAudit.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('idempotency: already-completed appointment is a no-op (no endSession, no audit, no side-effects)', async () => {
    const completedAppointment = {
      ...baseAppointment,
      status: 'completed',
      diagnosis_text: 'Pre-existing dx',
      diagnosis_tags: ['flu'],
    };
    const mockAdmin = createMockAdmin([
      { data: completedAppointment, error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

    const result = await wrapUpAppointment(
      APPT_ID,
      validBody,
      CORRELATION_ID,
      DOCTOR_ID
    );

    // Returns the existing row untouched — diagnosis_text from the request is NOT applied.
    expect(result.diagnosis_text).toBe('Pre-existing dx');
    expect(result.diagnosis_tags).toEqual(['flu']);
    expect(mockedSession.endSession).not.toHaveBeenCalled();
    expect(mockedAudit.logAuditEvent).not.toHaveBeenCalled();
    expect(
      mockedOpdQueue.syncOpdQueueEntryOnAppointmentStatus
    ).not.toHaveBeenCalled();
    expect(
      mockedCareEpisode.syncCareEpisodeLifecycleOnAppointmentCompleted
    ).not.toHaveBeenCalled();
    expect(mockAdmin.chain.update).not.toHaveBeenCalled();
  });

  it('forbidden: caller doctor_id !== appointment.doctor_id → 403', async () => {
    const otherDoctorAppointment = {
      ...baseAppointment,
      doctor_id: OTHER_DOCTOR_ID,
    };
    const mockAdmin = createMockAdmin([
      { data: otherDoctorAppointment, error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

    const err = await wrapUpAppointment(
      APPT_ID,
      validBody,
      CORRELATION_ID,
      DOCTOR_ID
    ).catch((e) => e);

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(mockedSession.endSession).not.toHaveBeenCalled();
    expect(mockedAudit.logAuditEvent).not.toHaveBeenCalled();
    expect(mockAdmin.chain.update).not.toHaveBeenCalled();
  });

  it('cancelled appointment: wrap-up is refused with ValidationError', async () => {
    const cancelledAppointment = { ...baseAppointment, status: 'cancelled' };
    const mockAdmin = createMockAdmin([
      { data: cancelledAppointment, error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

    const err = await wrapUpAppointment(
      APPT_ID,
      validBody,
      CORRELATION_ID,
      DOCTOR_ID
    ).catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe('Cannot wrap up a cancelled appointment');
    expect(mockedSession.endSession).not.toHaveBeenCalled();
    expect(mockedAudit.logAuditEvent).not.toHaveBeenCalled();
  });

  it('not found: missing appointment → NotFoundError', async () => {
    const mockAdmin = createMockAdmin([{ data: null, error: null }]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

    const err = await wrapUpAppointment(
      APPT_ID,
      validBody,
      CORRELATION_ID,
      DOCTOR_ID
    ).catch((e) => e);

    expect(err).toBeInstanceOf(NotFoundError);
    expect(mockedSession.endSession).not.toHaveBeenCalled();
  });

  it('race-safety: UPDATE matches 0 rows → idempotent fallthrough, no endSession, no audit', async () => {
    const refetchedRow = { ...baseAppointment, status: 'completed' };
    // 1) lookup → confirmed (still pre-flip from this caller's POV)
    // 2) UPDATE → 0 rows because some other caller flipped first
    // 3) refetch via .single() → completed row
    const mockAdmin = createMockAdmin([
      { data: baseAppointment, error: null },
      { data: null, error: null },
      { data: refetchedRow, error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockAdmin as any);

    (mockedSession.findLatestAppointmentSessionSummary as jest.Mock).mockImplementation(
      () => Promise.resolve(null)
    );

    const result = await wrapUpAppointment(
      APPT_ID,
      validBody,
      CORRELATION_ID,
      DOCTOR_ID
    );

    expect(result.status).toBe('completed');
    expect(mockedSession.endSession).not.toHaveBeenCalled();
    expect(mockedAudit.logAuditEvent).not.toHaveBeenCalled();
  });
});
