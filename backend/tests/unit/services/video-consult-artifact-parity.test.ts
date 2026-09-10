/**
 * rec-03 — video-consult artifact parity.
 *
 * Finding: video rooms inherit the account-level audio Composition Hook
 * and rec-01's webhook (`twilio_video` first). No new writer/webhook
 * wiring. These tests pin that inherited path.
 *
 * Twilio is stubbed via `__setOverridesForTests` — no live calls.
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionByProviderSessionId: jest.fn(),
}));

jest.mock('../../../src/services/recording-artifact-service', () => ({
  registerFinalisedComposition: jest.fn(),
}));

import * as sessionSvc from '../../../src/services/consultation-session-service';
import * as artifactSvc from '../../../src/services/recording-artifact-service';
import { __setOverridesForTests } from '../../../src/services/twilio-compositions';
import { handleCompositionStatusCallback } from '../../../src/services/twilio-composition-status-service';

const mockedSession = sessionSvc as jest.Mocked<typeof sessionSvc>;
const mockedArtifact = artifactSvc as jest.Mocked<typeof artifactSvc>;

const VIDEO_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const VOICE_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ROOM_SID = 'RMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const AUDIO_SID = 'CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const VIDEO_SID = 'CJcccccccccccccccccccccccccccccccc';

function completed(compositionSid: string) {
  return {
    compositionSid,
    roomSid: ROOM_SID,
    statusCallbackEvent: 'composition-available',
  };
}

describe('rec-03 video-consult artifact parity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSession.findSessionByProviderSessionId.mockImplementation(async (provider) => {
      if (provider === 'twilio_video') {
        return { id: VIDEO_SESSION_ID, modality: 'video', provider } as never;
      }
      return null;
    });
    mockedArtifact.registerFinalisedComposition.mockImplementation(async (input) => ({
      created: true,
      artifactId: `art-${input.compositionSid}`,
      storageUri: `twilio-composition:${input.compositionSid}`,
      bytes: 2048,
    }));
  });

  afterEach(() => {
    __setOverridesForTests({ listByRoom: null });
  });

  it('a video session whose room yields an audio composition registers audio_composition', async () => {
    __setOverridesForTests({
      listByRoom: async () => [
        {
          compositionSid: AUDIO_SID,
          includeAudio: true,
          includeVideo: false,
          startedAt: new Date(),
          endedAt: new Date(),
          durationSeconds: 20,
          status: 'completed',
        },
      ],
    });

    await handleCompositionStatusCallback(completed(AUDIO_SID), 'corr-rec-03-audio');

    expect(mockedSession.findSessionByProviderSessionId).toHaveBeenCalledWith(
      'twilio_video',
      ROOM_SID
    );
    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenCalledTimes(1);
    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenCalledWith({
      sessionId: VIDEO_SESSION_ID,
      compositionSid: AUDIO_SID,
      artifactKind: 'audio_composition',
      correlationId: 'corr-rec-03-audio',
    });
  });

  it('an escalated video session registers audio and video rows that do not collide', async () => {
    __setOverridesForTests({
      listByRoom: async () => [
        {
          compositionSid: AUDIO_SID,
          includeAudio: true,
          includeVideo: false,
          startedAt: new Date(),
          endedAt: new Date(),
          durationSeconds: 20,
          status: 'completed',
        },
        {
          compositionSid: VIDEO_SID,
          includeAudio: true,
          includeVideo: true,
          startedAt: new Date(),
          endedAt: new Date(),
          durationSeconds: 8,
          status: 'completed',
        },
      ],
    });

    await handleCompositionStatusCallback(completed(AUDIO_SID), 'corr-rec-03-both-a');
    await handleCompositionStatusCallback(completed(VIDEO_SID), 'corr-rec-03-both-v');

    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenCalledTimes(2);
    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenNthCalledWith(1, {
      sessionId: VIDEO_SESSION_ID,
      compositionSid: AUDIO_SID,
      artifactKind: 'audio_composition',
      correlationId: 'corr-rec-03-both-a',
    });
    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenNthCalledWith(2, {
      sessionId: VIDEO_SESSION_ID,
      compositionSid: VIDEO_SID,
      artifactKind: 'video_composition',
      correlationId: 'corr-rec-03-both-v',
    });
  });

  it('a voice session still resolves and registers audio_composition (no regression)', async () => {
    mockedSession.findSessionByProviderSessionId.mockImplementation(async (provider) => {
      if (provider === 'twilio_video') {
        return { id: VOICE_SESSION_ID, modality: 'voice', provider } as never;
      }
      return null;
    });
    __setOverridesForTests({
      listByRoom: async () => [
        {
          compositionSid: AUDIO_SID,
          includeAudio: true,
          includeVideo: false,
          startedAt: new Date(),
          endedAt: new Date(),
          durationSeconds: 15,
          status: 'completed',
        },
      ],
    });

    await handleCompositionStatusCallback(completed(AUDIO_SID), 'corr-rec-03-voice');

    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenCalledWith({
      sessionId: VOICE_SESSION_ID,
      compositionSid: AUDIO_SID,
      artifactKind: 'audio_composition',
      correlationId: 'corr-rec-03-voice',
    });
  });

  it('video adapter source never enqueues transcription', () => {
    const videoSrc = readFileSync(
      join(__dirname, '../../../src/services/video-session-twilio.ts'),
      'utf8'
    );
    const consultSrc = readFileSync(
      join(__dirname, '../../../src/services/consultation-session-service.ts'),
      'utf8'
    );
    expect(videoSrc).not.toMatch(/enqueueVoiceTranscription/);
    expect(consultSrc).not.toMatch(/enqueueVoiceTranscription/);
  });
});
