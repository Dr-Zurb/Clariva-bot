/**
 * Tests for the raw-track half of `workers/voice-transcription-worker.ts`
 * (cost-cut step 7).
 *
 * Kept out of the main worker test file because it needs the Twilio
 * recordings and transcode modules mocked, which the composition path
 * deliberately does not touch.
 *
 * The load-bearing pin is the split between resolution and mixing:
 * resolution runs before the row is claimed and must stay cheap, so it
 * may not download or transcode anything.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/voice-transcription-service', () => ({
  processVoiceTranscription: jest.fn(),
}));

jest.mock('../../../src/services/twilio-recordings', () => ({
  listRecordingsForRoom: jest.fn(),
  mintRecordingSignedUrl: jest.fn(),
}));

jest.mock('../../../src/services/audio-transcode-service', () => ({
  mixTracksToFlac: jest.fn(),
}));

jest.mock('../../../src/services/recording-track-registration-service', () => ({
  registerSessionRecordings: jest.fn(),
}));

import {
  resolveRawTracks,
  mixResolvedTracks,
} from '../../../src/workers/voice-transcription-worker';
import * as twilioRecordings from '../../../src/services/twilio-recordings';
import * as transcode from '../../../src/services/audio-transcode-service';
import * as registration from '../../../src/services/recording-track-registration-service';

const mockedTwilio = twilioRecordings as jest.Mocked<typeof twilioRecordings>;
const mockedTranscode = transcode as jest.Mocked<typeof transcode>;
const mockedRegistration = registration as jest.Mocked<typeof registration>;

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
  mockedRegistration.registerSessionRecordings.mockResolvedValue({
    listed: 0,
    registered: 0,
    alreadyPresent: 0,
    skippedNotCompleted: 0,
    skippedNonMedia: 0,
    failed: 0,
  } as never);
  mockedTwilio.mintRecordingSignedUrl.mockImplementation((async (input: {
    recordingSid: string;
  }) => ({
    signedUrl: `https://media.test/${input.recordingSid}`,
    expiresAt: new Date(Date.now() + 900_000),
  })) as never);
  mockedTranscode.mixTracksToFlac.mockResolvedValue({
    bytes: Buffer.from('fLaC-mixed'),
    contentType: 'audio/flac',
    filename: 'consult.flac',
    sizeBytes: 10,
  } as never);
});

describe('resolveRawTracks', () => {
  it('returns null while every track is still processing, leaving the row queued', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([
      track({ status: 'processing' }),
    ] as never);

    const out = await resolveRawTracks(SESSION_ID, ROOM_SID, 'c-1');

    expect(out).toBeNull();
    expect(mockedTranscode.mixTracksToFlac).not.toHaveBeenCalled();
  });

  it('ignores video tracks — transcription only needs the audio', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([
      track({ recordingSid: 'RTvid', type: 'video', containerFormat: 'mkv' }),
      track({ recordingSid: 'RTaud' }),
    ] as never);

    const out = await resolveRawTracks(SESSION_ID, ROOM_SID, 'c-2');

    expect(out?.tracks).toHaveLength(1);
    expect(out?.tracks[0]?.recordingSid).toBe('RTaud');
  });

  it('reports the longest track as the duration, not the sum of both sides', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([
      track({ recordingSid: 'RTdoc', durationSeconds: 360 }),
      track({ recordingSid: 'RTpat', durationSeconds: 350 }),
    ] as never);

    const out = await resolveRawTracks(SESSION_ID, ROOM_SID, 'c-3');

    expect(out?.twilioDurationSeconds).toBe(360);
  });

  it('does no downloading or transcoding before the row is claimed', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([track()] as never);

    await resolveRawTracks(SESSION_ID, ROOM_SID, 'c-4');

    expect(mockedTranscode.mixTracksToFlac).not.toHaveBeenCalled();
    expect(mockedTwilio.mintRecordingSignedUrl).not.toHaveBeenCalled();
  });

  it('runs the governance sweep so retention can find the raw media later', async () => {
    mockedTwilio.listRecordingsForRoom.mockResolvedValue([track()] as never);

    await resolveRawTracks(SESSION_ID, ROOM_SID, 'c-5');

    expect(mockedRegistration.registerSessionRecordings).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomSid: ROOM_SID,
      correlationId: 'c-5',
    });
  });
});

describe('mixResolvedTracks', () => {
  it('mints a fresh URL per track and forwards Twilio offsets to the mixer', async () => {
    const resolved = {
      roomSid: ROOM_SID,
      tracks: [
        track({ recordingSid: 'RTdoc', offsetMs: 5000 }),
        track({ recordingSid: 'RTpat', offsetMs: 5750 }),
      ],
    } as never;

    const out = await mixResolvedTracks(resolved, 'c-6');

    expect(mockedTwilio.mintRecordingSignedUrl).toHaveBeenCalledTimes(2);
    expect(mockedTranscode.mixTracksToFlac).toHaveBeenCalledWith({
      correlationId: 'c-6',
      tracks: [
        { signedUrl: 'https://media.test/RTdoc', offsetMs: 5000, recordingSid: 'RTdoc' },
        { signedUrl: 'https://media.test/RTpat', offsetMs: 5750, recordingSid: 'RTpat' },
      ],
    });
    expect(out.contentType).toBe('audio/flac');
    expect(out.filename).toBe('consult.flac');
  });
});
