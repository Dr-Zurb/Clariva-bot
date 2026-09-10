/**
 * Doctor request writes a server-authored reason. Client free text is ignored.
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

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitVideoRecordingFailedToStart: jest.fn(),
  emitVideoRecordingStarted: jest.fn(),
  emitVideoRecordingStopped: jest.fn(),
}));

jest.mock('../../../src/services/recording-track-service', () => ({
  escalateToFullVideoRecording: jest.fn(),
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
  requestVideoEscalation,
  VIDEO_ESCALATION_PRESET_REASONS,
  VIDEO_ESCALATION_REASON_BY_PRESET,
  canonicalVideoEscalationReason,
} from '../../../src/services/recording-escalation-service';
import { ValidationError } from '../../../src/utils/errors';

const LIVE = {
  id: 'sess-1',
  doctorId: 'doc-1',
  patientId: 'pat-1',
  status: 'live',
  providerSessionId: 'RM1',
};

const NOW = Date.parse('2026-08-22T10:00:00.000Z');

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

describe('requestVideoEscalation · canonical reason', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(NOW);
    mockFindSession.mockResolvedValue(LIVE);
    mockGetMode.mockResolvedValue('audio_only');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('every preset maps to a 5..200 server-authored sentence', () => {
    for (const code of VIDEO_ESCALATION_PRESET_REASONS) {
      const text = canonicalVideoEscalationReason(code);
      expect(text.length).toBeGreaterThanOrEqual(5);
      expect(text.length).toBeLessThanOrEqual(200);
      expect(text).toBe(VIDEO_ESCALATION_REASON_BY_PRESET[code]);
    }
  });

  it('discards client free text and writes the canonical sentence', async () => {
    const capture: { payload?: unknown } = {};
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminFrom([
        fetchRecent([]),
        insertRow({ id: 'req-1', requested_at: new Date(NOW).toISOString() }, capture),
      ]),
    );

    await requestVideoEscalation({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      presetReasonCode: 'visible_symptom',
      correlationId: 'corr-1',
    });

    const payload = capture.payload as Record<string, unknown>;
    expect(payload.preset_reason_code).toBe('visible_symptom');
    expect(payload.reason).toBe(VIDEO_ESCALATION_REASON_BY_PRESET.visible_symptom);
    expect(String(payload.reason)).not.toMatch(/rash|forearm|PHI/i);
  });

  it('rejects an unknown preset before insert', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(adminFrom([]));

    await expect(
      requestVideoEscalation({
        sessionId: 'sess-1',
        doctorId: 'doc-1',
        presetReasonCode: 'not_a_preset' as 'other',
        correlationId: 'corr-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(database.getSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
