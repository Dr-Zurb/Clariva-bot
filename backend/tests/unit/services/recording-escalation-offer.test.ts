/**
 * rec-25 — patient-initiated video offer.
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

const mockEmitStarted = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockEmitFailed = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/consultation-message-service', () => ({
  emitVideoRecordingFailedToStart: (...a: unknown[]) => mockEmitFailed(...a),
  emitVideoRecordingStarted: (...a: unknown[]) => mockEmitStarted(...a),
  emitVideoRecordingStopped: jest.fn(),
}));

const mockEscalate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/recording-track-service', () => ({
  escalateToFullVideoRecording: (...a: unknown[]) => mockEscalate(...a),
  revertToAudioOnlyRecording: jest.fn(),
}));

const mockGetMode = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/twilio-recording-rules', () => ({
  getCurrentRecordingMode: (...a: unknown[]) => mockGetMode(...a),
}));

jest.mock('../../../src/services/dashboard-events-service', () => ({
  insertDashboardEvent: jest.fn(),
}));

import * as database from '../../../src/config/database';
import {
  CooldownInProgressError,
  deriveVideoEscalationState,
  isChargeableEscalationRow,
  offerVideoRecording,
  OfferBlockedByPendingRequestError,
  PATIENT_OFFER_REASON,
  type EscalationDeriveInput,
} from '../../../src/services/recording-escalation-service';

const LIVE = {
  id: 'sess-1',
  doctorId: 'doc-1',
  patientId: 'pat-1',
  status: 'live',
  providerSessionId: 'RM1',
};

const NOW = Date.parse('2026-08-20T10:00:00.000Z');

function fetchRecent(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.order = () => c;
  c.limit = () => Promise.resolve({ data: rows, error: null });
  return c;
}

function insertRow(row: unknown, capture?: { payload?: unknown }) {
  const c: Record<string, unknown> = {};
  c.insert = (payload: unknown) => {
    if (capture) capture.payload = payload;
    return c;
  };
  c.select = () => c;
  c.single = () => Promise.resolve({ data: row, error: null });
  return c;
}

function updateOk() {
  const c: Record<string, unknown> = {};
  c.update = () => c;
  c.eq = () => c;
  c.is = () => c;
  c.then = (
    onFulfilled?: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve({ data: {}, error: null }).then(onFulfilled, onRejected);
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

describe('offerVideoRecording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(NOW);
    mockFindSession.mockResolvedValue(LIVE);
    mockGetMode.mockResolvedValue('audio_only');
    mockEscalate.mockResolvedValue(undefined);
    mockEmitStarted.mockResolvedValue(undefined);
    mockEmitFailed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes an already-answered patient-initiated row and starts the grant', async () => {
    const capture: { payload?: unknown } = {};
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent([]),
        insertRow({ id: 'off-1', requested_at: new Date(NOW).toISOString() }, capture),
        updateOk(),
      ]),
    );

    const result = await offerVideoRecording({
      sessionId: 'sess-1',
      patientId: 'pat-1',
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('started');
    if (result.status !== 'started') throw new Error('expected started');
    expect(result.requestId).toBe('off-1');
    expect(result.grantExpiresAt).toBe(new Date(NOW + 120_000).toISOString());

    const payload = capture.payload as Record<string, unknown>;
    expect(payload.initiated_by).toBe('patient');
    expect(payload.patient_response).toBe('allow');
    expect(payload.responded_at).toBe(new Date(NOW).toISOString());
    expect(payload.preset_reason_code).toBe('patient_request');
    expect(payload.reason).toBe(PATIENT_OFFER_REASON);
    expect(payload.doctor_id).toBe('doc-1');
    expect(isChargeableEscalationRow({
      id: 'off-1',
      patient_response: 'allow',
      requested_at: new Date(NOW).toISOString(),
      revoked_at: null,
      revoke_reason: null,
      initiated_by: 'patient',
    })).toBe(false);
    expect(mockEscalate).toHaveBeenCalledTimes(1);
    expect(mockEmitStarted).toHaveBeenCalledTimes(1);
  });

  it('does not change attemptsUsed and still offers at max_attempts', async () => {
    const declines: EscalationDeriveInput[] = [
      {
        id: 'd2',
        patient_response: 'decline',
        requested_at: new Date(NOW - 6 * 60_000).toISOString(),
        revoked_at: null,
        revoke_reason: null,
        initiated_by: 'doctor',
      },
      {
        id: 'd1',
        patient_response: 'decline',
        requested_at: new Date(NOW - 12 * 60_000).toISOString(),
        revoked_at: null,
        revoke_reason: null,
        initiated_by: 'doctor',
      },
    ];
    const usedBefore = deriveVideoEscalationState(declines, NOW);
    expect(usedBefore).toEqual({
      kind: 'locked',
      reason: 'max_attempts',
      requestId: null,
    });

    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent(declines),
        insertRow({ id: 'off-1', requested_at: new Date(NOW).toISOString() }),
        updateOk(),
      ]),
    );

    const result = await offerVideoRecording({
      sessionId: 'sess-1',
      patientId: 'pat-1',
    });
    expect(result.status).toBe('started');

    const after = deriveVideoEscalationState(
      [
        {
          id: 'off-1',
          patient_response: 'allow',
          requested_at: new Date(NOW).toISOString(),
          revoked_at: null,
          revoke_reason: null,
          initiated_by: 'patient',
        },
        ...declines,
      ],
      NOW,
    );
    expect(after.kind).toBe('locked');
    if (after.kind === 'locked') {
      expect(after.reason).toBe('already_recording_video');
    }
  });

  it('returns already_recording when Twilio is already audio_and_video', async () => {
    mockGetMode.mockResolvedValue('audio_and_video');
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(adminFrom([]));

    const result = await offerVideoRecording({
      sessionId: 'sess-1',
      patientId: 'pat-1',
      correlationId: 'corr-1',
    });
    expect(result).toEqual({ status: 'already_recording', correlationId: 'corr-1' });
    expect(mockEscalate).not.toHaveBeenCalled();
  });

  it('returns already_recording when an allow row is still active', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent([{
          id: 'g1',
          patient_response: 'allow',
          requested_at: new Date(NOW - 10_000).toISOString(),
          revoked_at: null,
          revoke_reason: null,
          initiated_by: 'doctor',
        }]),
      ]),
    );

    const result = await offerVideoRecording({
      sessionId: 'sess-1',
      patientId: 'pat-1',
      correlationId: 'corr-1',
    });
    expect(result.status).toBe('already_recording');
    expect(mockEscalate).not.toHaveBeenCalled();
  });

  it('refuses while a doctor request is pending', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent([{
          id: 'p1',
          patient_response: null,
          requested_at: new Date(NOW - 5_000).toISOString(),
          revoked_at: null,
          revoke_reason: null,
          initiated_by: 'doctor',
        }]),
      ]),
    );

    await expect(
      offerVideoRecording({ sessionId: 'sess-1', patientId: 'pat-1' }),
    ).rejects.toBeInstanceOf(OfferBlockedByPendingRequestError);
    expect(mockEscalate).not.toHaveBeenCalled();
  });

  it('does not treat a doctor decline cooldown as a block', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent([{
          id: 'd1',
          patient_response: 'decline',
          requested_at: new Date(NOW - 30_000).toISOString(),
          revoked_at: null,
          revoke_reason: null,
          initiated_by: 'doctor',
        }]),
        insertRow({ id: 'off-1', requested_at: new Date(NOW).toISOString() }),
        updateOk(),
      ]),
    );

    const result = await offerVideoRecording({
      sessionId: 'sess-1',
      patientId: 'pat-1',
    });
    expect(result.status).toBe('started');
  });

  it('refuses during the 30s stop debounce', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent([{
          id: 's1',
          patient_response: 'allow',
          requested_at: new Date(NOW - 60_000).toISOString(),
          revoked_at: new Date(NOW - 10_000).toISOString(),
          revoke_reason: 'patient_revoked',
          initiated_by: 'patient',
        }]),
      ]),
    );

    await expect(
      offerVideoRecording({ sessionId: 'sess-1', patientId: 'pat-1' }),
    ).rejects.toBeInstanceOf(CooldownInProgressError);
  });

  it('leaves the row honest and emits failure after a Twilio double-fail', async () => {
    mockEscalate.mockRejectedValue(new Error('twilio down'));
    const capture: { payload?: unknown } = {};
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent([]),
        insertRow({ id: 'off-1', requested_at: new Date(NOW).toISOString() }, capture),
        updateOk(),
      ]),
    );

    const result = await offerVideoRecording({
      sessionId: 'sess-1',
      patientId: 'pat-1',
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('started');
    if (result.status !== 'started') throw new Error('expected started');
    expect(result.grantExpiresAt).toBeNull();
    expect(capture.payload).toMatchObject({
      initiated_by: 'patient',
      patient_response: 'allow',
    });
    expect(mockEscalate).toHaveBeenCalledTimes(2);
    expect(mockEmitFailed).toHaveBeenCalledTimes(1);
    expect(mockEmitStarted).not.toHaveBeenCalled();
  });
});
