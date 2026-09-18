/**
 * Tests for `services/recording-track-registration-service.ts`
 * (cost-cut step 7).
 *
 * The sweep is a governance feed, not a replay feed: rows it fails to
 * write are raw media that retention and DPDP erasure will never find.
 * So the pins here are mostly about what it *doesn't* do — it must never
 * throw into a webhook, and it must never register media that Twilio has
 * not finished writing.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/twilio-recordings', () => ({
  listRecordingsForRoom: jest.fn(),
}));

jest.mock('../../../src/services/recording-artifact-service', () => ({
  registerFinalisedRecording: jest.fn(),
}));

import { registerSessionRecordings } from '../../../src/services/recording-track-registration-service';
import * as twilioRecordings from '../../../src/services/twilio-recordings';
import * as artifactService from '../../../src/services/recording-artifact-service';

const mockedTwilio = twilioRecordings as jest.Mocked<typeof twilioRecordings>;
const mockedArtifact = artifactService as jest.Mocked<typeof artifactService>;

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_SID = 'RM11111111111111111111111111111111';

function track(overrides: Record<string, unknown> = {}) {
  return {
    recordingSid:    'RTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    type:            'audio',
    containerFormat: 'mka',
    codec:           'OPUS',
    participantSid:  null,
    trackName:       null,
    offsetMs:        0,
    startedAt:       new Date(),
    durationSeconds: 300,
    sizeBytes:       1000,
    status:          'completed',
    ...overrides,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedArtifact.registerFinalisedRecording.mockResolvedValue({
    artifactId: 'a-1',
    created: true,
  } as never);
});

describe('registerSessionRecordings', () => {
  it('registers every completed media track', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([
      track({ recordingSid: 'RTaudio1' }),
      track({ recordingSid: 'RTvideo1', type: 'video', containerFormat: 'mkv' }),
    ] as never);

    const result = await registerSessionRecordings({
      sessionId: SESSION_ID,
      roomSid: ROOM_SID,
      correlationId: 'c-1',
    });

    expect(result.registered).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockedArtifact.registerFinalisedRecording).toHaveBeenCalledTimes(2);
  });

  it('skips tracks Twilio is still processing rather than registering a partial file', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([
      track({ recordingSid: 'RTdone' }),
      track({ recordingSid: 'RTbusy', status: 'processing' }),
    ] as never);

    const result = await registerSessionRecordings({
      sessionId: SESSION_ID,
      roomSid: ROOM_SID,
      correlationId: 'c-2',
    });

    expect(result.registered).toBe(1);
    expect(result.skippedNotCompleted).toBe(1);
    expect(mockedArtifact.registerFinalisedRecording).toHaveBeenCalledTimes(1);
  });

  it('skips data tracks, which carry no media to govern', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([
      track({ recordingSid: 'RTdata', type: 'data', containerFormat: null }),
    ] as never);

    const result = await registerSessionRecordings({
      sessionId: SESSION_ID,
      roomSid: ROOM_SID,
      correlationId: 'c-3',
    });

    expect(result.skippedNonMedia).toBe(1);
    expect(mockedArtifact.registerFinalisedRecording).not.toHaveBeenCalled();
  });

  it('counts an already-present row separately from a fresh write', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([track()] as never);
    mockedArtifact.registerFinalisedRecording.mockResolvedValue({
      artifactId: 'a-1',
      created: false,
    } as never);

    const result = await registerSessionRecordings({
      sessionId: SESSION_ID,
      roomSid: ROOM_SID,
      correlationId: 'c-4',
    });

    expect(result.registered).toBe(0);
    expect(result.alreadyPresent).toBe(1);
  });

  it('keeps going when one track fails, so a single bad row cannot orphan the rest', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([
      track({ recordingSid: 'RTbad' }),
      track({ recordingSid: 'RTgood' }),
    ] as never);
    mockedArtifact.registerFinalisedRecording
      .mockRejectedValueOnce(new Error('supabase down') as never)
      .mockResolvedValueOnce({ artifactId: 'a-2', created: true } as never);

    const result = await registerSessionRecordings({
      sessionId: SESSION_ID,
      roomSid: ROOM_SID,
      correlationId: 'c-5',
    });

    expect(result.failed).toBe(1);
    expect(result.registered).toBe(1);
  });

  it('never throws when Twilio listing fails — a webhook must still return 200', async () => {
    mockedTwilio.listRecordingsForRoom.mockRejectedValue(
      new Error('twilio 503') as never,
    );

    const result = await registerSessionRecordings({
      sessionId: SESSION_ID,
      roomSid: ROOM_SID,
      correlationId: 'c-6',
    });

    expect(result).toEqual({
      listed: 0,
      registered: 0,
      alreadyPresent: 0,
      skippedNotCompleted: 0,
      skippedNonMedia: 0,
      failed: 0,
    });
  });

  it('refuses to call Twilio at all without a room SID', async () => {
    const result = await registerSessionRecordings({
      sessionId: SESSION_ID,
      roomSid: '   ',
      correlationId: 'c-7',
    });

    expect(result.listed).toBe(0);
    expect(mockedTwilio.listRecordingsForRoom).not.toHaveBeenCalled();
  });
});
