/**
 * Unit tests for `services/twilio-recordings.ts` (cost-cut step 7).
 *
 * Pins:
 *   - `getComputedTwilioRecordingMediaUrl` — pure URL construction.
 *   - `listRecordingsForRoom` — grouping-SID query, field mapping, and
 *     `offset` ordering (Twilio's documented cross-track sync key).
 *   - `fetchRecordingMetadata` — container/codec surfaced, 404 mapped.
 *   - `mintRecordingSignedUrl` — Location-header and JSON `redirect_to`
 *     shapes, TTL clamping, 404.
 *   - `deleteRecording` — 404 → NotFoundError so callers can choose
 *     their own idempotency.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: { TWILIO_ACCOUNT_SID: 'AC_test', TWILIO_AUTH_TOKEN: 'tok_test' },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const recordingsListMock = jest.fn<(opts: unknown) => Promise<unknown>>();
const recordingsFetchMock = jest.fn<() => Promise<unknown>>();
const recordingsRemoveMock = jest.fn<() => Promise<unknown>>();

jest.mock('twilio', () => {
  const recordings = Object.assign(
    (sid: string) => ({
      fetch: () => recordingsFetchMock(),
      remove: () => recordingsRemoveMock(),
      sid,
    }),
    { list: (opts: unknown) => recordingsListMock(opts) },
  );
  const factory = jest.fn(() => ({ video: { v1: { recordings } } }));
  return { __esModule: true, default: factory };
});

import {
  listRecordingsForRoom,
  fetchRecordingMetadata,
  mintRecordingSignedUrl,
  deleteRecording,
  getComputedTwilioRecordingMediaUrl,
  __setOverridesForTests,
} from '../../../src/services/twilio-recordings';
import { NotFoundError, InternalError } from '../../../src/utils/errors';

const ROOM_SID = 'RMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECORDING_SID = 'RTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  recordingsListMock.mockReset();
  recordingsFetchMock.mockReset();
  recordingsRemoveMock.mockReset();
  __setOverridesForTests({
    listByRoom: null,
    fetchMetadata: null,
    mintSignedUrl: null,
    deleteRecording: null,
  });
  globalThis.fetch = originalFetch;
});

describe('getComputedTwilioRecordingMediaUrl', () => {
  it('builds the canonical /Media URL', () => {
    expect(getComputedTwilioRecordingMediaUrl(RECORDING_SID)).toBe(
      `https://video.twilio.com/v1/Recordings/${RECORDING_SID}/Media`,
    );
  });

  it('throws on empty input', () => {
    expect(() => getComputedTwilioRecordingMediaUrl('')).toThrow(InternalError);
  });
});

describe('listRecordingsForRoom', () => {
  it('scopes the query by groupingSid', async () => {
    recordingsListMock.mockResolvedValueOnce([]);
    await listRecordingsForRoom(ROOM_SID);
    expect(recordingsListMock).toHaveBeenCalledWith(
      expect.objectContaining({ groupingSid: [ROOM_SID] }),
    );
  });

  it('maps Twilio fields including participant, container and offset', async () => {
    const created = new Date('2026-08-01T10:00:00.000Z');
    recordingsListMock.mockResolvedValueOnce([
      {
        sid: RECORDING_SID,
        type: 'audio',
        containerFormat: 'mka',
        codec: 'opus',
        groupingSids: { room_sid: ROOM_SID, participant_sid: 'PAdoctor' },
        trackName: 'doctor-mic',
        offset: 1500,
        dateCreated: created,
        duration: 360,
        size: 2048,
        status: 'completed',
      },
    ]);

    const [row] = await listRecordingsForRoom(ROOM_SID);

    expect(row).toMatchObject({
      recordingSid: RECORDING_SID,
      type: 'audio',
      containerFormat: 'mka',
      codec: 'opus',
      participantSid: 'PAdoctor',
      trackName: 'doctor-mic',
      offsetMs: 1500,
      durationSeconds: 360,
      sizeBytes: 2048,
      status: 'completed',
    });
    expect(row!.startedAt.toISOString()).toBe(created.toISOString());
  });

  it('orders by offset so a mixer can align tracks, nulls last', async () => {
    recordingsListMock.mockResolvedValueOnce([
      { sid: 'RTthird', type: 'audio', offset: 9000, dateCreated: new Date() },
      { sid: 'RTnoOffset', type: 'audio', offset: null, dateCreated: new Date() },
      { sid: 'RTfirst', type: 'audio', offset: 100, dateCreated: new Date() },
    ]);

    const rows = await listRecordingsForRoom(ROOM_SID);

    expect(rows.map((r) => r.recordingSid)).toEqual([
      'RTfirst',
      'RTthird',
      'RTnoOffset',
    ]);
  });

  it('treats an unrecognised type as a data track rather than guessing', async () => {
    recordingsListMock.mockResolvedValueOnce([
      { sid: RECORDING_SID, type: 'something-new', dateCreated: new Date() },
    ]);
    const [row] = await listRecordingsForRoom(ROOM_SID);
    expect(row!.type).toBe('data');
    expect(row!.containerFormat).toBeNull();
  });

  it('wraps a list failure as InternalError', async () => {
    recordingsListMock.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(listRecordingsForRoom(ROOM_SID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});

describe('fetchRecordingMetadata', () => {
  it('surfaces container and codec so callers can pick a transcode', async () => {
    recordingsFetchMock.mockResolvedValueOnce({
      status: 'completed',
      type: 'audio',
      containerFormat: 'mka',
      codec: 'opus',
      duration: 360,
      size: 2048,
    });

    const out = await fetchRecordingMetadata(RECORDING_SID);

    expect(out).toMatchObject({
      status: 'completed',
      type: 'audio',
      containerFormat: 'mka',
      codec: 'opus',
      durationSec: 360,
      sizeBytes: 2048,
    });
  });

  it('maps Twilio 404 to NotFoundError', async () => {
    recordingsFetchMock.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { status: 404 }),
    );
    await expect(fetchRecordingMetadata(RECORDING_SID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('mintRecordingSignedUrl', () => {
  it('reads the Location header and clamps the TTL', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      status: 302,
      headers: new Headers({ location: 'https://signed.example/track.mka' }),
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await mintRecordingSignedUrl({
      recordingSid: RECORDING_SID,
      ttlSec: 999999,
    });

    expect(out.signedUrl).toBe('https://signed.example/track.mka');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('Ttl=3600');
  });

  it('falls back to the JSON redirect_to shape', async () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      status: 200,
      headers: new Headers({}),
      json: async () => ({ redirect_to: 'https://signed.example/json.mka' }),
      text: async () => '',
    } as unknown as Response) as unknown as typeof fetch;

    const out = await mintRecordingSignedUrl({ recordingSid: RECORDING_SID });
    expect(out.signedUrl).toBe('https://signed.example/json.mka');
  });

  it('maps a 404 media response to NotFoundError', async () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      status: 404,
      headers: new Headers({}),
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response) as unknown as typeof fetch;

    await expect(
      mintRecordingSignedUrl({ recordingSid: RECORDING_SID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deleteRecording', () => {
  it('removes the recording', async () => {
    recordingsRemoveMock.mockResolvedValueOnce(undefined);
    await expect(deleteRecording(RECORDING_SID)).resolves.toBeUndefined();
    expect(recordingsRemoveMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a 404 as NotFoundError for the caller to absorb', async () => {
    recordingsRemoveMock.mockRejectedValueOnce(
      Object.assign(new Error('gone'), { status: 404 }),
    );
    await expect(deleteRecording(RECORDING_SID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('wraps other failures as InternalError', async () => {
    recordingsRemoveMock.mockRejectedValueOnce(new Error('twilio down'));
    await expect(deleteRecording(RECORDING_SID)).rejects.toBeInstanceOf(
      InternalError,
    );
  });
});
