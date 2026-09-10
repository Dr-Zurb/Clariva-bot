/**
 * rec-22 — extendVideoGrant + derive grant fields.
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

jest.mock('../../../src/services/twilio-recording-rules', () => ({
  getCurrentRecordingMode: jest.fn(),
}));

jest.mock('../../../src/services/dashboard-events-service', () => ({
  insertDashboardEvent: jest.fn(),
}));

import * as database from '../../../src/config/database';
import {
  deriveVideoEscalationState,
  extendVideoGrant,
  GrantAlreadyExtendedError,
  GrantAlreadyExpiredError,
  NoActiveVideoGrantError,
} from '../../../src/services/recording-escalation-service';

const LIVE = {
  id: 'sess-1',
  doctorId: 'doc-1',
  status: 'live',
  providerSessionId: 'RM1',
};

const NOW = Date.parse('2026-08-20T10:00:00.000Z');
const EXPIRY = new Date(NOW + 60_000).toISOString();

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
    grant_expires_at: EXPIRY,
    grant_extended_at: null,
    video_paused_at: null,
    initiated_by: 'doctor',
    ...overrides,
  };
}

function fetchThenUpdate(fetchRows: unknown[], updateResult: { data: unknown; error: unknown }) {
  const fetchChain: Record<string, unknown> = {};
  fetchChain.select = () => fetchChain;
  fetchChain.eq = () => fetchChain;
  fetchChain.order = () => fetchChain;
  fetchChain.limit = () => Promise.resolve({ data: fetchRows, error: null });

  const updChain: Record<string, unknown> = {};
  updChain.update = () => updChain;
  updChain.eq = () => updChain;
  updChain.is = () => updChain;
  updChain.gt = () => updChain;
  updChain.select = () => updChain;
  updChain.maybeSingle = () => Promise.resolve(updateResult);

  let calls = 0;
  return {
    from: jest.fn(() => {
      calls += 1;
      return calls === 1 ? fetchChain : updChain;
    }),
  };
}

describe('deriveVideoEscalationState — rec-22 grant fields', () => {
  it('surfaces grant expiry and extension-spent on an active allow', () => {
    const state = deriveVideoEscalationState(
      [{
        id: 'g1',
        patient_response: 'allow',
        requested_at: new Date(NOW).toISOString(),
        revoked_at: null,
        revoke_reason: null,
        initiated_by: 'doctor',
        grant_expires_at: EXPIRY,
        grant_extended_at: new Date(NOW).toISOString(),
      }],
      NOW,
    );
    expect(state).toEqual({
      kind: 'locked',
      reason: 'already_recording_video',
      requestId: 'g1',
      grantExpiresAt: EXPIRY,
      extensionSpent: true,
      videoPaused: false,
    });
  });
});

describe('extendVideoGrant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockFindSession.mockResolvedValue(LIVE);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('moves expiry by 120s exactly once', async () => {
    const nextExpiry = new Date(Date.parse(EXPIRY) + 120_000).toISOString();
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      fetchThenUpdate([allowRow()], {
        data: { grant_expires_at: nextExpiry, grant_extended_at: new Date(NOW).toISOString() },
        error: null,
      }),
    );
    const result = await extendVideoGrant({
      sessionId: 'sess-1',
      doctorId: 'doc-1',
      correlationId: 'c-ext',
    });
    expect(result.grantExpiresAt).toBe(nextExpiry);
  });

  it('refuses a second extension', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      fetchThenUpdate(
        [allowRow({ grant_extended_at: new Date(NOW).toISOString() })],
        { data: null, error: null },
      ),
    );
    await expect(
      extendVideoGrant({ sessionId: 'sess-1', doctorId: 'doc-1' }),
    ).rejects.toBeInstanceOf(GrantAlreadyExtendedError);
  });

  it('refuses when there is no active grant', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      fetchThenUpdate([], { data: null, error: null }),
    );
    await expect(
      extendVideoGrant({ sessionId: 'sess-1', doctorId: 'doc-1' }),
    ).rejects.toBeInstanceOf(NoActiveVideoGrantError);
  });

  it('refuses when the grant has already expired', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      fetchThenUpdate(
        [allowRow({ grant_expires_at: new Date(NOW - 1_000).toISOString() })],
        { data: null, error: null },
      ),
    );
    await expect(
      extendVideoGrant({ sessionId: 'sess-1', doctorId: 'doc-1' }),
    ).rejects.toBeInstanceOf(GrantAlreadyExpiredError);
  });
});
