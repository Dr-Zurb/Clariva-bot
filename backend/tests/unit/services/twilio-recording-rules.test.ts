/**
 * Unit tests for `services/twilio-recording-rules.ts` — the merge-aware
 * wrapper around Twilio's `RecordingRules.update()` primitive used by
 * the Plan 07 Task 28 pause/resume service.
 *
 * Pins the rule-merge semantics: fetching current rules, de-duping by
 * (kind, all=true), and passing through any non-all rules unchanged.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN:  'tok_test',
  },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

type UpdateCall = { rules: unknown[] };

// ---------------------------------------------------------------------------
// Mock the `twilio` module so the wrapper's `Twilio(...)` call returns a
// client whose `video.v1.rooms(sid).recordingRules` surface we control
// per-test.
// ---------------------------------------------------------------------------

const fetchMock = jest.fn<() => Promise<{ rules: unknown[] }>>();
const updateMock = jest.fn<(args: UpdateCall) => Promise<unknown>>();

const twilioClient = {
  video: {
    v1: {
      rooms: (_sid: string) => ({
        recordingRules: {
          fetch:  fetchMock,
          update: updateMock,
        },
      }),
    },
  },
};

jest.mock('twilio', () => {
  const ctor = jest.fn(() => twilioClient);
  return { __esModule: true, default: ctor };
});

import {
  excludeAllParticipantsFromRecording,
  getCurrentRecordingMode,
  includeAllParticipantsInRecording,
  mergeAllParticipantsRule,
  setRecordingRulesToAudioAndVideo,
  setRecordingRulesToAudioOnly,
  TwilioRoomNotFoundError,
} from '../../../src/services/twilio-recording-rules';

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ rules: [] });
  updateMock.mockResolvedValue({});
});

function setCurrentRules(rules: unknown[] | Error): void {
  if (rules instanceof Error) {
    fetchMock.mockRejectedValueOnce(rules);
  } else {
    fetchMock.mockResolvedValueOnce({ rules });
  }
}

function capturedUpdateRules(): unknown[] {
  expect(updateMock).toHaveBeenCalledTimes(1);
  const call = updateMock.mock.calls[0]?.[0] as UpdateCall;
  return call.rules;
}

// ===========================================================================
// mergeAllParticipantsRule — the pure merge helper
// ===========================================================================

describe('mergeAllParticipantsRule', () => {
  it('produces a single exclude/audio rule when starting from empty', async () => {
    setCurrentRules([]);
    const merged = await mergeAllParticipantsRule(
      twilioClient as unknown as Parameters<typeof mergeAllParticipantsRule>[0],
      'RM1',
      { type: 'exclude', all: true, kind: 'audio' },
    );
    expect(merged).toEqual([{ type: 'exclude', all: true, kind: 'audio' }]);
  });

  it('replaces an existing same-kind all-rule (last-write-wins per kind)', async () => {
    setCurrentRules([{ type: 'include', all: true, kind: 'audio' }]);
    const merged = await mergeAllParticipantsRule(
      twilioClient as unknown as Parameters<typeof mergeAllParticipantsRule>[0],
      'RM1',
      { type: 'exclude', all: true, kind: 'audio' },
    );
    expect(merged).toEqual([{ type: 'exclude', all: true, kind: 'audio' }]);
  });

  it('preserves the other-kind all-rule when merging (audio pause keeps video include)', async () => {
    setCurrentRules([{ type: 'include', all: true, kind: 'video' }]);
    const merged = await mergeAllParticipantsRule(
      twilioClient as unknown as Parameters<typeof mergeAllParticipantsRule>[0],
      'RM1',
      { type: 'exclude', all: true, kind: 'audio' },
    );
    expect(merged).toEqual([
      { type: 'include', all: true, kind: 'video' },
      { type: 'exclude', all: true, kind: 'audio' },
    ]);
  });

  it('passes through non-all rules untouched (per-participant rules)', async () => {
    setCurrentRules([
      { type: 'include', publisher: 'doctor-1', kind: 'audio' },
      { type: 'exclude', all: true, kind: 'video' },
    ]);
    const merged = await mergeAllParticipantsRule(
      twilioClient as unknown as Parameters<typeof mergeAllParticipantsRule>[0],
      'RM1',
      { type: 'exclude', all: true, kind: 'audio' },
    );
    expect(merged).toEqual([
      { type: 'include', publisher: 'doctor-1', kind: 'audio' },
      { type: 'exclude', all: true, kind: 'video' },
      { type: 'exclude', all: true, kind: 'audio' },
    ]);
  });

  it('proceeds with an empty baseline when the fetch throws', async () => {
    setCurrentRules(new Error('Twilio 500'));
    const merged = await mergeAllParticipantsRule(
      twilioClient as unknown as Parameters<typeof mergeAllParticipantsRule>[0],
      'RM1',
      { type: 'exclude', all: true, kind: 'audio' },
    );
    expect(merged).toEqual([{ type: 'exclude', all: true, kind: 'audio' }]);
  });
});

// ===========================================================================
// excludeAllParticipantsFromRecording — integration shape
// ===========================================================================

describe('excludeAllParticipantsFromRecording', () => {
  it('sends the merged rules to Twilio update()', async () => {
    setCurrentRules([{ type: 'include', all: true, kind: 'video' }]);
    await excludeAllParticipantsFromRecording('RM1', 'audio', 'corr-1');
    const sent = capturedUpdateRules();
    expect(sent).toEqual([
      { type: 'include', all: true, kind: 'video' },
      { type: 'exclude', all: true, kind: 'audio' },
    ]);
  });

  it('throws InternalError when roomSid is empty', async () => {
    await expect(
      excludeAllParticipantsFromRecording('', 'audio', 'corr-1'),
    ).rejects.toThrow('roomSid is required');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('wraps a Twilio update() failure as InternalError with a useful message', async () => {
    setCurrentRules([]);
    updateMock.mockRejectedValueOnce(new Error('twilio_timeout'));
    await expect(
      excludeAllParticipantsFromRecording('RM1', 'audio', 'corr-1'),
    ).rejects.toThrow(/Failed to exclude audio on room RM1/);
  });
});

// ===========================================================================
// includeAllParticipantsInRecording — symmetry test
// ===========================================================================

describe('includeAllParticipantsInRecording', () => {
  it('toggles back to include on resume', async () => {
    setCurrentRules([{ type: 'exclude', all: true, kind: 'audio' }]);
    await includeAllParticipantsInRecording('RM1', 'audio', 'corr-2');
    const sent = capturedUpdateRules();
    expect(sent).toEqual([{ type: 'include', all: true, kind: 'audio' }]);
  });
});

// ===========================================================================
// Plan 08 · Task 43 — mode-level helpers
// ===========================================================================

describe('getCurrentRecordingMode', () => {
  it('interprets audio include + video exclude as audio_only', async () => {
    setCurrentRules([
      { type: 'include', all: true, kind: 'audio' },
      { type: 'exclude', all: true, kind: 'video' },
    ]);
    const mode = await getCurrentRecordingMode('RM_t43_1');
    expect(mode).toBe('audio_only');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('interprets audio include + video include as audio_and_video', async () => {
    setCurrentRules([
      { type: 'include', all: true, kind: 'audio' },
      { type: 'include', all: true, kind: 'video' },
    ]);
    const mode = await getCurrentRecordingMode('RM_t43_1');
    expect(mode).toBe('audio_and_video');
  });

  it('returns other for non-canonical rule combinations (no rules)', async () => {
    setCurrentRules([]);
    const mode = await getCurrentRecordingMode('RM_t43_1');
    expect(mode).toBe('other');
  });

  it('returns other when video is included but audio is excluded (never produced by Plan 08)', async () => {
    setCurrentRules([
      { type: 'exclude', all: true, kind: 'audio' },
      { type: 'include', all: true, kind: 'video' },
    ]);
    const mode = await getCurrentRecordingMode('RM_t43_1');
    expect(mode).toBe('other');
  });

  it('throws TwilioRoomNotFoundError on Twilio 404', async () => {
    const err = Object.assign(new Error('twilio 404'), { status: 404 });
    fetchMock.mockRejectedValueOnce(err);
    await expect(getCurrentRecordingMode('RM_gone')).rejects.toBeInstanceOf(
      TwilioRoomNotFoundError,
    );
  });

  it('throws InternalError on other Twilio fetch failures', async () => {
    const err = Object.assign(new Error('twilio 503'), { status: 503 });
    fetchMock.mockRejectedValueOnce(err);
    await expect(getCurrentRecordingMode('RM_boom')).rejects.toThrow(
      /fetch failed for room RM_boom/,
    );
  });
});

describe('setRecordingRulesToAudioOnly', () => {
  it('short-circuits (no PATCH) when the room is already audio_only', async () => {
    setCurrentRules([
      { type: 'include', all: true, kind: 'audio' },
      { type: 'exclude', all: true, kind: 'video' },
    ]);
    await setRecordingRulesToAudioOnly('RM_t43_2', 'corr-mode-1');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('issues include-audio + exclude-video PATCHes when starting from audio_and_video', async () => {
    // 1) getCurrentRecordingMode -> audio_and_video
    fetchMock.mockResolvedValueOnce({
      rules: [
        { type: 'include', all: true, kind: 'audio' },
        { type: 'include', all: true, kind: 'video' },
      ],
    });
    // 2) includeAllParticipantsInRecording(audio) re-fetches
    fetchMock.mockResolvedValueOnce({
      rules: [
        { type: 'include', all: true, kind: 'audio' },
        { type: 'include', all: true, kind: 'video' },
      ],
    });
    // 3) excludeAllParticipantsFromRecording(video) re-fetches (after
    //    audio re-merge; still audio include + video include in our
    //    mock because updateMock doesn't actually persist)
    fetchMock.mockResolvedValueOnce({
      rules: [
        { type: 'include', all: true, kind: 'audio' },
        { type: 'include', all: true, kind: 'video' },
      ],
    });

    await setRecordingRulesToAudioOnly('RM_t43_3', 'corr-mode-2');

    expect(updateMock).toHaveBeenCalledTimes(2);
    const firstCall = updateMock.mock.calls[0]?.[0] as UpdateCall;
    const secondCall = updateMock.mock.calls[1]?.[0] as UpdateCall;
    // Order: audio include first, then video exclude.
    expect(firstCall.rules).toEqual(
      expect.arrayContaining([{ type: 'include', all: true, kind: 'audio' }]),
    );
    expect(secondCall.rules).toEqual(
      expect.arrayContaining([{ type: 'exclude', all: true, kind: 'video' }]),
    );
  });

  it('propagates TwilioRoomNotFoundError from the mode read', async () => {
    const err = Object.assign(new Error('twilio 404'), { status: 404 });
    fetchMock.mockRejectedValueOnce(err);
    await expect(
      setRecordingRulesToAudioOnly('RM_gone', 'corr-mode-3'),
    ).rejects.toBeInstanceOf(TwilioRoomNotFoundError);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('setRecordingRulesToAudioAndVideo', () => {
  it('short-circuits (no PATCH) when already audio_and_video', async () => {
    setCurrentRules([
      { type: 'include', all: true, kind: 'audio' },
      { type: 'include', all: true, kind: 'video' },
    ]);
    await setRecordingRulesToAudioAndVideo('RM_t43_4', 'corr-mode-4');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('issues include-audio + include-video PATCHes when starting from audio_only', async () => {
    // 1) getCurrentRecordingMode -> audio_only
    fetchMock.mockResolvedValueOnce({
      rules: [
        { type: 'include', all: true, kind: 'audio' },
        { type: 'exclude', all: true, kind: 'video' },
      ],
    });
    // 2) include(audio) fetch
    fetchMock.mockResolvedValueOnce({
      rules: [
        { type: 'include', all: true, kind: 'audio' },
        { type: 'exclude', all: true, kind: 'video' },
      ],
    });
    // 3) include(video) fetch
    fetchMock.mockResolvedValueOnce({
      rules: [
        { type: 'include', all: true, kind: 'audio' },
        { type: 'exclude', all: true, kind: 'video' },
      ],
    });

    await setRecordingRulesToAudioAndVideo('RM_t43_5', 'corr-mode-5');

    expect(updateMock).toHaveBeenCalledTimes(2);
    const secondCall = updateMock.mock.calls[1]?.[0] as UpdateCall;
    expect(secondCall.rules).toEqual(
      expect.arrayContaining([{ type: 'include', all: true, kind: 'video' }]),
    );
  });
});
