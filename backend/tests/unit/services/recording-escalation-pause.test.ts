/**
 * rec-24 — patient video pause / resume on the existing grant.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: { TWILIO_ACCOUNT_SID: 'AC_test', TWILIO_AUTH_TOKEN: 'tok_test' },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

const mockFindSession = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: (...a: unknown[]) => mockFindSession(...a),
}));

const mockEmitPaused = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockEmitResumed = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/consultation-message-service', () => ({
  emitVideoRecordingFailedToStart: jest.fn(),
  emitVideoRecordingStarted: jest.fn(),
  emitVideoRecordingStopped: jest.fn(),
  emitVideoRecordingPaused: (...a: unknown[]) => mockEmitPaused(...a),
  emitVideoRecordingResumed: (...a: unknown[]) => mockEmitResumed(...a),
}));

const mockEscalate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRevert = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/recording-track-service', () => ({
  escalateToFullVideoRecording: (...a: unknown[]) => mockEscalate(...a),
  revertToAudioOnlyRecording: (...a: unknown[]) => mockRevert(...a),
}));

jest.mock('../../../src/services/twilio-recording-rules', () => ({
  getCurrentRecordingMode: jest.fn(),
}));

jest.mock('../../../src/services/dashboard-events-service', () => ({
  insertDashboardEvent: jest.fn(),
}));

import * as database from '../../../src/config/database';
import {
  deriveVideoEscalationState,
  pauseVideoGrant,
  resumeVideoGrant,
  VideoGrantEndedError,
} from '../../../src/services/recording-escalation-service';

const NOW = Date.parse('2026-08-20T10:00:00.000Z');
const LIVE = {
  id: 'sess-1',
  doctorId: 'doc-1',
  patientId: 'pat-1',
  status: 'live',
  providerSessionId: 'RM1',
};

function allowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    session_id: 'sess-1',
    doctor_id: 'doc-1',
    reason: 'Need to see the rash',
    preset_reason_code: 'visible_symptom',
    patient_response: 'allow',
    requested_at: new Date(NOW - 30_000).toISOString(),
    responded_at: new Date(NOW - 25_000).toISOString(),
    correlation_id: 'c1',
    revoked_at: null,
    revoke_reason: null,
    grant_expires_at: new Date(NOW + 90_000).toISOString(),
    grant_extended_at: null,
    video_paused_at: null,
    initiated_by: 'doctor',
    ...overrides,
  };
}

function fetchRecent(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.order = () => c;
  c.limit = () => Promise.resolve({ data: rows, error: null });
  return c;
}

function updateOk(row: unknown = { id: 'g1' }) {
  const c: Record<string, unknown> = {};
  c.update = jest.fn(() => c);
  c.eq = () => c;
  c.is = () => c;
  c.not = () => c;
  c.select = () => c;
  c.maybeSingle = () => Promise.resolve({ data: row, error: null });
  return c;
}

function adminFrom(steps: unknown[]) {
  let i = 0;
  return {
    from: jest.fn(() => {
      const step = steps[Math.min(i, steps.length - 1)];
      i += 1;
      return step;
    }),
  };
}

describe('pauseVideoGrant / resumeVideoGrant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockFindSession.mockResolvedValue(LIVE);
    mockRevert.mockResolvedValue({ correlationId: 'c1' });
    mockEscalate.mockResolvedValue({ correlationId: 'c1' });
    mockEmitPaused.mockResolvedValue(undefined);
    mockEmitResumed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stamps video_paused_at on the existing row and leaves revoked_at null', async () => {
    const upd = updateOk();
    const admin = adminFrom([fetchRecent([allowRow()]), upd]);
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(admin);

    const result = await pauseVideoGrant({
      sessionId: 'sess-1',
      patientId: 'pat-1',
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('paused');
    expect(mockRevert).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'patient_paused',
        initiatedBy: 'patient',
      }),
    );
    const stamped = (upd.update as jest.Mock).mock.calls[0][0] as {
      video_paused_at: string;
    };
    expect(Number.isFinite(Date.parse(stamped.video_paused_at))).toBe(true);
    expect(stamped).not.toHaveProperty('revoked_at');
    expect(mockEmitPaused).toHaveBeenCalledTimes(1);
    expect(admin.from).toHaveBeenCalledTimes(2);
  });

  it('pause then resume inserts zero new escalation audit rows', async () => {
    const pauseAdmin = adminFrom([fetchRecent([allowRow()]), updateOk()]);
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(pauseAdmin);
    await pauseVideoGrant({ sessionId: 'sess-1', patientId: 'pat-1' });
    const pauseFrom = pauseAdmin.from as jest.Mock;
    expect(
      pauseFrom.mock.results.every((r) => {
        const chain = r.value as { insert?: unknown };
        return typeof chain.insert !== 'function';
      }),
    ).toBe(true);

    const resumeAdmin = adminFrom([
      fetchRecent([allowRow({ video_paused_at: new Date(NOW).toISOString() })]),
      updateOk(),
    ]);
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(resumeAdmin);
    const resumed = await resumeVideoGrant({ sessionId: 'sess-1', patientId: 'pat-1' });
    expect(resumed.status).toBe('resumed');
    expect(mockEscalate).toHaveBeenCalledTimes(1);
    const resumeFrom = resumeAdmin.from as jest.Mock;
    expect(
      resumeFrom.mock.results.every((r) => {
        const chain = r.value as { insert?: unknown };
        return typeof chain.insert !== 'function';
      }),
    ).toBe(true);
  });

  it('double-tap pause is already_paused', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([fetchRecent([allowRow({ video_paused_at: new Date(NOW).toISOString() })])]),
    );
    const result = await pauseVideoGrant({
      sessionId: 'sess-1',
      patientId: 'pat-1',
      correlationId: 'corr-1',
    });
    expect(result).toEqual({ status: 'already_paused', correlationId: 'corr-1' });
    expect(mockRevert).not.toHaveBeenCalled();
  });

  it('refuses resume after the grant expired', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent([
          allowRow({
            video_paused_at: new Date(NOW - 10_000).toISOString(),
            grant_expires_at: new Date(NOW - 1_000).toISOString(),
          }),
        ]),
      ]),
    );
    await expect(
      resumeVideoGrant({ sessionId: 'sess-1', patientId: 'pat-1' }),
    ).rejects.toBeInstanceOf(VideoGrantEndedError);
    expect(mockEscalate).not.toHaveBeenCalled();
  });

  it('a paused grant still derives as locked already_recording_video', () => {
    const state = deriveVideoEscalationState(
      [{
        id: 'g1',
        patient_response: 'allow',
        requested_at: new Date(NOW - 30_000).toISOString(),
        revoked_at: null,
        revoke_reason: null,
        initiated_by: 'doctor',
        grant_expires_at: new Date(NOW + 90_000).toISOString(),
        video_paused_at: new Date(NOW).toISOString(),
      }],
      NOW,
    );
    expect(state).toMatchObject({
      kind: 'locked',
      reason: 'already_recording_video',
      videoPaused: true,
    });
  });
});
