/**
 * Tests for `services/recording-compose-on-demand-service.ts`
 * (cost-cut step 7, replay half).
 *
 * This module can start a billable Twilio job from a read endpoint, so
 * most of what is pinned here is restraint: it must not compose when the
 * flag is off, when a composition already exists in any non-terminal
 * state, or when the room has no finished media to compose.
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    RECORDING_COMPOSE_ON_DEMAND: true,
    WEBHOOK_BASE_URL: 'https://api.test',
  },
}));

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
}));

jest.mock('../../../src/services/twilio-recordings', () => ({
  listRecordingsForRoom: jest.fn(),
}));

jest.mock('../../../src/services/twilio-compositions', () => ({
  listCompositionsForRoom: jest.fn(),
  createCompositionForRoom: jest.fn(),
}));

import { ensureCompositionForSession } from '../../../src/services/recording-compose-on-demand-service';
import * as sessionService from '../../../src/services/consultation-session-service';
import * as twilioRecordings from '../../../src/services/twilio-recordings';
import * as twilioCompositions from '../../../src/services/twilio-compositions';
import { env } from '../../../src/config/env';

const mockedSession = sessionService as jest.Mocked<typeof sessionService>;
const mockedRecordings = twilioRecordings as jest.Mocked<typeof twilioRecordings>;
const mockedCompositions = twilioCompositions as jest.Mocked<typeof twilioCompositions>;

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_SID = 'RM11111111111111111111111111111111';

function audioTrack(overrides: Record<string, unknown> = {}) {
  return {
    recordingSid: 'RTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    type: 'audio',
    containerFormat: 'mka',
    codec: 'OPUS',
    participantSid: null,
    trackName: null,
    offsetMs: 0,
    startedAt: new Date(),
    durationSeconds: 300,
    sizeBytes: 1000,
    status: 'completed',
    ...overrides,
  } as never;
}

function composition(overrides: Record<string, unknown> = {}) {
  return {
    compositionSid: 'CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    includeAudio: true,
    includeVideo: false,
    startedAt: new Date(),
    endedAt: null,
    durationSeconds: null,
    status: 'completed',
    ...overrides,
  } as never;
}

const mutableEnv = env as unknown as { RECORDING_COMPOSE_ON_DEMAND: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  mutableEnv.RECORDING_COMPOSE_ON_DEMAND = true;
  mockedSession.findSessionById.mockResolvedValue({
    id: SESSION_ID,
    providerSessionId: ROOM_SID,
  } as never);
  mockedCompositions.listCompositionsForRoom.mockResolvedValue([] as never);
  mockedRecordings.listRecordingsForRoom.mockResolvedValue([audioTrack()] as never);
  mockedCompositions.createCompositionForRoom.mockResolvedValue({
    compositionSid: 'CJnew',
    status: 'enqueued',
  } as never);
});

afterEach(() => {
  mutableEnv.RECORDING_COMPOSE_ON_DEMAND = true;
});

async function callWithFlag(
  enabled: boolean,
  artifactKind: 'audio' | 'video' = 'audio',
) {
  mutableEnv.RECORDING_COMPOSE_ON_DEMAND = enabled;
  return ensureCompositionForSession({
    sessionId: SESSION_ID,
    artifactKind,
    correlationId: 'c-1',
  });
}

describe('ensureCompositionForSession — the meter stays off', () => {
  it('does nothing at all when the flag is off', async () => {
    const out = await callWithFlag(false);

    expect(out).toEqual({ state: 'unavailable', reason: 'disabled' });
    expect(mockedCompositions.createCompositionForRoom).not.toHaveBeenCalled();
    expect(mockedCompositions.listCompositionsForRoom).not.toHaveBeenCalled();
  });

  it('never creates a second composition while one is still processing', async () => {
    mockedCompositions.listCompositionsForRoom.mockResolvedValue([
      composition({ compositionSid: 'CJinflight', status: 'processing' }),
    ] as never);

    const out = await callWithFlag(true);

    expect(out).toEqual({
      state: 'pending',
      compositionSid: 'CJinflight',
      status: 'processing',
    });
    expect(mockedCompositions.createCompositionForRoom).not.toHaveBeenCalled();
  });

  it('treats an already-enqueued composition as in flight, not as absent', async () => {
    mockedCompositions.listCompositionsForRoom.mockResolvedValue([
      composition({ compositionSid: 'CJqueued', status: 'enqueued' }),
    ] as never);

    const out = await callWithFlag(true);

    expect(out).toMatchObject({ state: 'pending', compositionSid: 'CJqueued' });
    expect(mockedCompositions.createCompositionForRoom).not.toHaveBeenCalled();
  });

  it('refuses to compose a room with no finished tracks', async () => {
    mockedRecordings.listRecordingsForRoom.mockResolvedValue([
      audioTrack({ status: 'processing' }),
    ] as never);

    const out = await callWithFlag(true);

    expect(out).toEqual({ state: 'unavailable', reason: 'no_raw_tracks' });
    expect(mockedCompositions.createCompositionForRoom).not.toHaveBeenCalled();
  });

  it('refuses to compose a session with no room SID', async () => {
    mockedSession.findSessionById.mockResolvedValue({
      id: SESSION_ID,
      providerSessionId: null,
    } as never);

    const out = await callWithFlag(true);

    expect(out).toEqual({ state: 'unavailable', reason: 'no_room_sid' });
    expect(mockedCompositions.createCompositionForRoom).not.toHaveBeenCalled();
  });
});

describe('ensureCompositionForSession — composing', () => {
  it('creates an audio composition when tracks exist and nothing is composed', async () => {
    const out = await callWithFlag(true);

    expect(mockedCompositions.createCompositionForRoom).toHaveBeenCalledTimes(1);
    expect(mockedCompositions.createCompositionForRoom).toHaveBeenCalledWith(
      expect.objectContaining({ roomSid: ROOM_SID, includeVideo: false }),
    );
    expect(out).toMatchObject({ state: 'pending', compositionSid: 'CJnew' });
  });

  it('asks for video and matches on video tracks when the caller wants video', async () => {
    mockedRecordings.listRecordingsForRoom.mockResolvedValue([
      audioTrack({ recordingSid: 'RTvid', type: 'video', containerFormat: 'mkv' }),
    ] as never);

    await callWithFlag(true, 'video');

    expect(mockedCompositions.createCompositionForRoom).toHaveBeenCalledWith(
      expect.objectContaining({ includeVideo: true }),
    );
  });

  it('does not reuse an audio composition to satisfy a video request', async () => {
    mockedCompositions.listCompositionsForRoom.mockResolvedValue([
      composition({ includeVideo: false, status: 'completed' }),
    ] as never);
    mockedRecordings.listRecordingsForRoom.mockResolvedValue([
      audioTrack({ recordingSid: 'RTvid', type: 'video', containerFormat: 'mkv' }),
    ] as never);

    const out = await callWithFlag(true, 'video');

    expect(out).toMatchObject({ state: 'pending', compositionSid: 'CJnew' });
    expect(mockedCompositions.createCompositionForRoom).toHaveBeenCalled();
  });

  it('reports a finished composition as ready so a dropped webhook self-heals', async () => {
    mockedCompositions.listCompositionsForRoom.mockResolvedValue([
      composition({ compositionSid: 'CJdone', status: 'completed' }),
    ] as never);

    const out = await callWithFlag(true);

    expect(out).toEqual({ state: 'ready', compositionSid: 'CJdone' });
    expect(mockedCompositions.createCompositionForRoom).not.toHaveBeenCalled();
  });

  it('ignores failed and deleted compositions when deciding to compose', async () => {
    mockedCompositions.listCompositionsForRoom.mockResolvedValue([
      composition({ compositionSid: 'CJdead', status: 'failed' }),
      composition({ compositionSid: 'CJgone', status: 'deleted' }),
    ] as never);

    const out = await callWithFlag(true);

    expect(out).toMatchObject({ state: 'pending', compositionSid: 'CJnew' });
    expect(mockedCompositions.createCompositionForRoom).toHaveBeenCalledTimes(1);
  });
});

describe('module export surface', () => {
  it('exports ensureCompositionForSession', () => {
    expect(typeof ensureCompositionForSession).toBe('function');
  });
});
