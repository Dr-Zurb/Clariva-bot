/**
 * rec-05 — artifact-index backfill.
 *
 * Pins: dry-run writes nothing; apply goes through rec-02's writer;
 * already-present is not an error; one bad session does not abort;
 * hide-eligible / unresolvable counters; includeVideo bucketing.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const envState = { ARCHIVAL_HARD_DELETE_ENABLED: false };

jest.mock('../../../src/config/env', () => ({
  env: envState,
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/twilio-compositions', () => ({
  listCompositionsForRoom: jest.fn(),
}));

jest.mock('../../../src/services/recording-artifact-service', () => ({
  buildTwilioCompositionStorageUri: (sid: string) => `twilio-composition:${sid}`,
  registerFinalisedComposition: jest.fn(),
}));

import * as database from '../../../src/config/database';
import * as twilioCompositions from '../../../src/services/twilio-compositions';
import * as artifactSvc from '../../../src/services/recording-artifact-service';
import { runArtifactIndexBackfill } from '../../../src/services/recording-artifact-backfill-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedList = twilioCompositions.listCompositionsForRoom as jest.MockedFunction<
  typeof twilioCompositions.listCompositionsForRoom
>;
const mockedRegister = artifactSvc.registerFinalisedComposition as jest.MockedFunction<
  typeof artifactSvc.registerFinalisedComposition
>;

const SESSION_VOICE = '11111111-1111-4111-8111-111111111111';
const SESSION_VIDEO = '22222222-2222-4222-8222-222222222222';
const ROOM_VOICE = 'RMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROOM_VIDEO = 'RMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const AUDIO_SID = 'CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const VIDEO_SID = 'CJcccccccccccccccccccccccccccccccc';

interface SessionRow {
  id: string;
  modality: string;
  provider_session_id: string | null;
  actual_ended_at: string;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function buildAdminMock(opts: { pages: SessionRow[][]; existingUris?: string[] }): {
  client: { from: (table: string) => unknown };
} {
  let pageIndex = 0;
  const existing = new Set(opts.existingUris ?? []);

  const from = (table: string): unknown => {
    if (table === 'consultation_sessions') {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.not = self;
      chain.in = self;
      chain.order = self;
      chain.gte = self;
      chain.lt = self;
      chain.range = async () => {
        const page = opts.pages[pageIndex] ?? [];
        pageIndex += 1;
        return { data: page, error: null };
      };
      return chain;
    }
    if (table === 'recording_artifact_index') {
      const filters: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq: (col: string, val: string) => {
          filters[col] = val;
          return chain;
        },
        maybeSingle: async () => {
          const uri = filters.storage_uri;
          return { data: uri && existing.has(uri) ? { id: 'existing' } : null, error: null };
        },
      };
      return chain;
    }
    throw new Error(`unexpected table ${table}`);
  };

  return { client: { from } };
}

function audioSummary(sid = AUDIO_SID) {
  return {
    compositionSid: sid,
    includeAudio: true,
    includeVideo: false,
    startedAt: new Date(),
    endedAt: new Date(),
    durationSeconds: 20,
    status: 'completed' as const,
  };
}

function videoSummary(sid = VIDEO_SID) {
  return {
    compositionSid: sid,
    includeAudio: true,
    includeVideo: true,
    startedAt: new Date(),
    endedAt: new Date(),
    durationSeconds: 8,
    status: 'completed' as const,
  };
}

describe('runArtifactIndexBackfill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    envState.ARCHIVAL_HARD_DELETE_ENABLED = false;
    mockedRegister.mockResolvedValue({
      created: true,
      artifactId: 'art-1',
      storageUri: `twilio-composition:${AUDIO_SID}`,
      bytes: 100,
    });
  });

  it('dry-run reports wouldCreate and never calls the writer', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VIDEO,
            modality: 'video',
            provider_session_id: ROOM_VIDEO,
            actual_ended_at: daysAgo(10),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList.mockResolvedValue([audioSummary()]);

    const stats = await runArtifactIndexBackfill({ dryRun: true });

    expect(mockedRegister).not.toHaveBeenCalled();
    expect(stats.dryRun).toBe(true);
    expect(stats.sessionsScanned).toBe(1);
    expect(stats.wouldCreate).toBe(1);
    expect(stats.created).toBe(0);
    expect(stats.byKind.audio_composition).toBe(1);
    expect(stats.byModality.video).toBe(1);
    expect(stats.archivalHardDeleteEnabled).toBe(false);
    expect(stats.immediatelyHideEligible).toBe(0);
  });

  it('counts already-present in dry-run without treating it as a failure', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VOICE,
            modality: 'voice',
            provider_session_id: ROOM_VOICE,
            actual_ended_at: daysAgo(5),
          },
        ],
      ],
      existingUris: [`twilio-composition:${AUDIO_SID}`],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList.mockResolvedValue([audioSummary()]);

    const stats = await runArtifactIndexBackfill({ dryRun: true });
    expect(stats.alreadyPresent).toBe(1);
    expect(stats.wouldCreate).toBe(0);
    expect(stats.failures).toBe(0);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('apply path calls registerFinalisedComposition and treats created:false as already present', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VOICE,
            modality: 'voice',
            provider_session_id: ROOM_VOICE,
            actual_ended_at: daysAgo(5),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList.mockResolvedValue([audioSummary()]);
    mockedRegister
      .mockResolvedValueOnce({
        created: true,
        artifactId: 'art-1',
        storageUri: `twilio-composition:${AUDIO_SID}`,
        bytes: 100,
      })
      .mockResolvedValueOnce({
        created: false,
        artifactId: 'art-1',
        storageUri: `twilio-composition:${AUDIO_SID}`,
        bytes: 100,
      });

    const first = await runArtifactIndexBackfill({ dryRun: false });
    expect(first.created).toBe(1);
    expect(mockedRegister).toHaveBeenCalledWith({
      sessionId: SESSION_VOICE,
      compositionSid: AUDIO_SID,
      artifactKind: 'audio_composition',
      correlationId: expect.any(String),
    });

    const { client: client2 } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VOICE,
            modality: 'voice',
            provider_session_id: ROOM_VOICE,
            actual_ended_at: daysAgo(5),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client2 as never);
    mockedList.mockResolvedValue([audioSummary()]);

    const second = await runArtifactIndexBackfill({ dryRun: false });
    expect(second.created).toBe(0);
    expect(second.alreadyPresent).toBe(1);
  });

  it('buckets includeVideo as video_composition and does not collide with audio', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VIDEO,
            modality: 'video',
            provider_session_id: ROOM_VIDEO,
            actual_ended_at: daysAgo(12),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList.mockResolvedValue([audioSummary(), videoSummary()]);

    const stats = await runArtifactIndexBackfill({ dryRun: true });
    expect(stats.wouldCreate).toBe(2);
    expect(stats.byKind.audio_composition).toBe(1);
    expect(stats.byKind.video_composition).toBe(1);
  });

  it('skips sessions with no room and rooms with no compositions', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VOICE,
            modality: 'voice',
            provider_session_id: null,
            actual_ended_at: daysAgo(3),
          },
          {
            id: SESSION_VIDEO,
            modality: 'video',
            provider_session_id: ROOM_VIDEO,
            actual_ended_at: daysAgo(3),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList.mockResolvedValue([]);

    const stats = await runArtifactIndexBackfill({ dryRun: true });
    expect(stats.skippedNoRoom).toBe(1);
    expect(stats.skippedNoCompositions).toBe(1);
    expect(stats.sessionsStillUnresolvable).toBe(2);
    expect(stats.wouldCreate).toBe(0);
  });

  it('does not register in-flight compositions', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VIDEO,
            modality: 'video',
            provider_session_id: ROOM_VIDEO,
            actual_ended_at: daysAgo(2),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList.mockResolvedValue([{ ...audioSummary(), status: 'enqueued' }]);

    const stats = await runArtifactIndexBackfill({ dryRun: true });
    expect(stats.skippedNotCompleted).toBe(1);
    expect(stats.wouldCreate).toBe(0);
    expect(stats.unresolvableReasons.noCompletedCompositions).toBe(1);
  });

  it('counts immediately hide-eligible rows past 90 days', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VOICE,
            modality: 'voice',
            provider_session_id: ROOM_VOICE,
            actual_ended_at: daysAgo(120),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList.mockResolvedValue([audioSummary()]);

    const stats = await runArtifactIndexBackfill({ dryRun: true });
    expect(stats.wouldCreate).toBe(1);
    expect(stats.immediatelyHideEligible).toBe(1);
    expect(stats.hardDeleteCandidates).toBe(0);
  });

  it('continues after a per-session list failure', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VOICE,
            modality: 'voice',
            provider_session_id: ROOM_VOICE,
            actual_ended_at: daysAgo(4),
          },
          {
            id: SESSION_VIDEO,
            modality: 'video',
            provider_session_id: ROOM_VIDEO,
            actual_ended_at: daysAgo(4),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList
      .mockRejectedValueOnce(new Error('twilio 429'))
      .mockRejectedValueOnce(new Error('twilio 429'))
      .mockResolvedValueOnce([audioSummary()]);

    const stats = await runArtifactIndexBackfill({ dryRun: true });
    expect(stats.failures).toBe(1);
    expect(stats.wouldCreate).toBe(1);
    expect(stats.sessionsScanned).toBe(2);
  });

  it('honours --limit', async () => {
    const { client } = buildAdminMock({
      pages: [
        [
          {
            id: SESSION_VOICE,
            modality: 'voice',
            provider_session_id: ROOM_VOICE,
            actual_ended_at: daysAgo(1),
          },
        ],
        [
          {
            id: SESSION_VIDEO,
            modality: 'video',
            provider_session_id: ROOM_VIDEO,
            actual_ended_at: daysAgo(1),
          },
        ],
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);
    mockedList.mockResolvedValue([audioSummary()]);

    const stats = await runArtifactIndexBackfill({ dryRun: true, limit: 1 });
    expect(stats.sessionsScanned).toBe(1);
    expect(mockedList).toHaveBeenCalledTimes(1);
  });
});
