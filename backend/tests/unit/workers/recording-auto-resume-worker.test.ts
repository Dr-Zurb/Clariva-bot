/**
 * rec-16 auto-resume worker — orchestration only.
 * Resume / stamp behaviour is pinned on the pause-service suite.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockFindSessionById = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: (...a: unknown[]) => mockFindSessionById(...a),
}));

const mockScan = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockClaim = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockClear = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRelease = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockResume = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockStamp = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/recording-pause-service', () => ({
  scanDueAutoResumePauses: (...a: unknown[]) => mockScan(...a),
  claimPauseForAutoResume: (...a: unknown[]) => mockClaim(...a),
  clearAutoResumeClaim: (...a: unknown[]) => mockClear(...a),
  releaseStaleAutoResumeClaims: (...a: unknown[]) => mockRelease(...a),
  resumeRecordingAsSystem: (...a: unknown[]) => mockResume(...a),
  stampDanglingPausesForEndedSession: (...a: unknown[]) => mockStamp(...a),
}));

jest.mock('../../../src/services/twilio-recording-rules', () => ({
  TwilioRoomNotFoundError: class TwilioRoomNotFoundError extends Error {
    roomSid: string;
    constructor(roomSid: string) {
      super(`Twilio room ${roomSid} not found`);
      this.roomSid = roomSid;
    }
  },
}));

import { runRecordingAutoResumeJob } from '../../../src/workers/recording-auto-resume-worker';

const dueRow = {
  id: 'pause-1',
  sessionId: 'sess-1',
  autoResumeAt: '2026-08-18T10:10:00.000Z',
  metadata: { status: 'completed' },
};

describe('runRecordingAutoResumeJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRelease.mockResolvedValue(0);
    mockScan.mockResolvedValue([]);
    mockClaim.mockResolvedValue(true);
    mockClear.mockResolvedValue(undefined);
    mockResume.mockResolvedValue(undefined);
    mockStamp.mockResolvedValue(1);
    mockFindSessionById.mockResolvedValue({ id: 'sess-1', status: 'live' });
  });

  it('no-ops when nothing is due', async () => {
    const result = await runRecordingAutoResumeJob('corr-empty');
    expect(result).toEqual({ scanned: 0, resumed: 0, raced: 0, errors: [] });
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('ignores an unexpired pause because the scan cutoff is now', async () => {
    const now = Date.parse('2026-08-18T10:00:00.000Z');
    await runRecordingAutoResumeJob('corr-cutoff', now);
    expect(mockScan).toHaveBeenCalledWith('2026-08-18T10:00:00.000Z');
  });

  it('resumes an expired live pause', async () => {
    mockScan.mockResolvedValueOnce([dueRow]);
    const result = await runRecordingAutoResumeJob('corr-ok');
    expect(result.scanned).toBe(1);
    expect(result.resumed).toBe(1);
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('counts a lost claim as raced and does not resume', async () => {
    mockScan.mockResolvedValueOnce([dueRow, { ...dueRow, id: 'pause-2' }]);
    mockClaim.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await runRecordingAutoResumeJob('corr-race');
    expect(result.raced).toBe(1);
    expect(result.resumed).toBe(1);
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('two concurrent claims: the loser is a no-op', async () => {
    mockScan.mockResolvedValue([dueRow]);
    mockClaim.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const [a, b] = await Promise.all([
      runRecordingAutoResumeJob('corr-a'),
      runRecordingAutoResumeJob('corr-b'),
    ]);
    expect(a.resumed + b.resumed).toBe(1);
    expect(a.raced + b.raced).toBe(1);
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('Twilio failure leaves the pause open (clears claim, does not stamp)', async () => {
    mockScan.mockResolvedValueOnce([dueRow]);
    mockResume.mockRejectedValueOnce(new Error('Twilio 503'));
    const result = await runRecordingAutoResumeJob('corr-fail');
    expect(result.resumed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(mockClear).toHaveBeenCalledWith('pause-1');
    expect(mockStamp).not.toHaveBeenCalled();
  });

  it('stamps an ended session instead of calling Twilio', async () => {
    mockScan.mockResolvedValueOnce([dueRow]);
    mockFindSessionById.mockResolvedValueOnce({ id: 'sess-1', status: 'ended' });
    const result = await runRecordingAutoResumeJob('corr-ended');
    expect(result.resumed).toBe(1);
    expect(mockStamp).toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });
});
