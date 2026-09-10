/**
 * Composition-status handler (rec-01).
 *
 * Pins: only completed events register; failed/other do not; unresolved
 * session is dropped without throw; kind from includeVideo; webhook/poll
 * race collapses via rec-02's created:false.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

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

jest.mock('../../../src/services/twilio-compositions', () => ({
  listCompositionsForRoom: jest.fn(),
}));

import * as sessionSvc from '../../../src/services/consultation-session-service';
import * as artifactSvc from '../../../src/services/recording-artifact-service';
import * as twilioCompositions from '../../../src/services/twilio-compositions';
import { handleCompositionStatusCallback } from '../../../src/services/twilio-composition-status-service';

const mockedSession = sessionSvc as jest.Mocked<typeof sessionSvc>;
const mockedArtifact = artifactSvc as jest.Mocked<typeof artifactSvc>;
const mockedTwilio = twilioCompositions as jest.Mocked<typeof twilioCompositions>;

const COMPOSITION_SID = 'CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOM_SID = 'RMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function completedPayload() {
  return {
    compositionSid: COMPOSITION_SID,
    roomSid: ROOM_SID,
    statusCallbackEvent: 'composition-available',
  };
}

describe('handleCompositionStatusCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSession.findSessionByProviderSessionId.mockResolvedValue({
      id: SESSION_ID,
    } as never);
    mockedTwilio.listCompositionsForRoom.mockResolvedValue([
      {
        compositionSid: COMPOSITION_SID,
        includeAudio: true,
        includeVideo: false,
        startedAt: new Date(),
        endedAt: new Date(),
        durationSeconds: 12,
        status: 'completed',
      },
    ]);
    mockedArtifact.registerFinalisedComposition.mockResolvedValue({
      created: true,
      artifactId: 'art-1',
      storageUri: `twilio-composition:${COMPOSITION_SID}`,
      bytes: 1024,
    });
  });

  it('registers a completed composition as audio when includeVideo is false', async () => {
    await handleCompositionStatusCallback(completedPayload(), 'corr-1');

    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      compositionSid: COMPOSITION_SID,
      artifactKind: 'audio_composition',
      correlationId: 'corr-1',
    });
  });

  it('registers as video_composition when includeVideo is true', async () => {
    mockedTwilio.listCompositionsForRoom.mockResolvedValue([
      {
        compositionSid: COMPOSITION_SID,
        includeAudio: true,
        includeVideo: true,
        startedAt: new Date(),
        endedAt: new Date(),
        durationSeconds: 12,
        status: 'completed',
      },
    ]);

    await handleCompositionStatusCallback(completedPayload(), 'corr-video');

    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenCalledWith(
      expect.objectContaining({ artifactKind: 'video_composition' })
    );
  });

  it('does not register a failed composition', async () => {
    await handleCompositionStatusCallback(
      {
        compositionSid: COMPOSITION_SID,
        roomSid: ROOM_SID,
        statusCallbackEvent: 'composition-failed',
      },
      'corr-fail'
    );
    expect(mockedArtifact.registerFinalisedComposition).not.toHaveBeenCalled();
  });

  it('does not register a progress / other event', async () => {
    await handleCompositionStatusCallback(
      {
        compositionSid: COMPOSITION_SID,
        roomSid: ROOM_SID,
        statusCallbackEvent: 'composition-progress',
      },
      'corr-progress'
    );
    expect(mockedArtifact.registerFinalisedComposition).not.toHaveBeenCalled();
  });

  it('drops an unresolvable session without throwing', async () => {
    mockedSession.findSessionByProviderSessionId.mockResolvedValue(null);

    await expect(
      handleCompositionStatusCallback(completedPayload(), 'corr-orphan')
    ).resolves.toBeUndefined();
    expect(mockedArtifact.registerFinalisedComposition).not.toHaveBeenCalled();
  });

  it('tries twilio_video then twilio_video_audio', async () => {
    mockedSession.findSessionByProviderSessionId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: SESSION_ID } as never);

    await handleCompositionStatusCallback(completedPayload(), 'corr-voice');

    expect(mockedSession.findSessionByProviderSessionId).toHaveBeenNthCalledWith(
      1,
      'twilio_video',
      ROOM_SID
    );
    expect(mockedSession.findSessionByProviderSessionId).toHaveBeenNthCalledWith(
      2,
      'twilio_video_audio',
      ROOM_SID
    );
    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenCalled();
  });

  it('treats a second register (webhook/poll race) as success via created:false', async () => {
    mockedArtifact.registerFinalisedComposition
      .mockResolvedValueOnce({
        created: true,
        artifactId: 'art-1',
        storageUri: `twilio-composition:${COMPOSITION_SID}`,
        bytes: 1024,
      })
      .mockResolvedValueOnce({
        created: false,
        artifactId: 'art-1',
        storageUri: `twilio-composition:${COMPOSITION_SID}`,
        bytes: 1024,
      });

    await handleCompositionStatusCallback(completedPayload(), 'corr-a');
    await handleCompositionStatusCallback(completedPayload(), 'corr-b');

    expect(mockedArtifact.registerFinalisedComposition).toHaveBeenCalledTimes(2);
  });
});
