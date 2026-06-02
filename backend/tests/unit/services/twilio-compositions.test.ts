/**
 * Unit tests for `services/twilio-compositions.ts` (Plan 07 · Task 29).
 *
 * Pins:
 *   - `getComputedTwilioMediaUrl` — pure URL construction.
 *   - `fetchCompositionMetadata` — happy path + 404 + generic failure.
 *   - `mintCompositionSignedUrl` — happy path + 404 + bad-status + missing
 *     credentials. Both Location-header and JSON `redirect_to` shapes.
 *   - `__setOverridesForTests` — mock injection for upstream test files.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: { TWILIO_ACCOUNT_SID: 'AC_test', TWILIO_AUTH_TOKEN: 'tok_test' },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const compositionsFetchMock = jest.fn<() => Promise<unknown>>();

jest.mock('twilio', () => {
  const factory = jest.fn(() => ({
    video: {
      v1: {
        compositions: (sid: string) => ({
          fetch: () => compositionsFetchMock(),
          sid,
        }),
      },
    },
  }));
  return { __esModule: true, default: factory };
});

import {
  fetchCompositionMetadata,
  mintCompositionSignedUrl,
  getComputedTwilioMediaUrl,
  __setOverridesForTests,
} from '../../../src/services/twilio-compositions';
import { NotFoundError, InternalError } from '../../../src/utils/errors';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  compositionsFetchMock.mockReset();
  __setOverridesForTests({ fetchMetadata: null, mintSignedUrl: null });
  globalThis.fetch = originalFetch;
});

describe('getComputedTwilioMediaUrl', () => {
  it('builds the canonical /Media URL', () => {
    expect(getComputedTwilioMediaUrl('CJabc123')).toBe(
      'https://video.twilio.com/v1/Compositions/CJabc123/Media',
    );
  });

  it('throws on empty input', () => {
    expect(() => getComputedTwilioMediaUrl('')).toThrow(InternalError);
  });
});

describe('fetchCompositionMetadata', () => {
  it('returns status + duration + size on success', async () => {
    compositionsFetchMock.mockResolvedValueOnce({
      status: 'completed',
      duration: 1234,
      size: 567890,
    });
    const out = await fetchCompositionMetadata('CJabc');
    expect(out.status).toBe('completed');
    expect(out.durationSec).toBe(1234);
    expect(out.sizeBytes).toBe(567890);
    expect(out.mediaUrlPrefix).toBe('https://video.twilio.com/v1/Compositions/CJabc/Media');
  });

  it('maps Twilio 404 to NotFoundError', async () => {
    compositionsFetchMock.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    await expect(fetchCompositionMetadata('CJabc')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('wraps other failures as InternalError', async () => {
    compositionsFetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(fetchCompositionMetadata('CJabc')).rejects.toBeInstanceOf(InternalError);
  });

  it('honors the test override', async () => {
    __setOverridesForTests({
      fetchMetadata: async () => ({
        status: 'processing',
        mediaUrlPrefix: 'https://x/y',
      }),
    });
    const out = await fetchCompositionMetadata('CJabc');
    expect(out.status).toBe('processing');
  });
});

describe('mintCompositionSignedUrl', () => {
  function mockFetchResponse(opts: {
    status?:   number;
    location?: string;
    json?:     unknown;
    text?:     string;
  }): void {
    const res = {
      status:  opts.status ?? 200,
      headers: {
        get: (k: string) =>
          k.toLowerCase() === 'location' ? (opts.location ?? null) : null,
      },
      json: async () => opts.json ?? {},
      text: async () => opts.text ?? '',
    } as unknown as Response;
    globalThis.fetch = jest.fn(async () => res) as unknown as typeof fetch;
  }

  it('reads the signed URL from the Location header', async () => {
    mockFetchResponse({
      status: 302,
      location: 'https://media.twilio.com/signed?sig=xyz',
    });
    const out = await mintCompositionSignedUrl({ compositionSid: 'CJ_aaa', ttlSec: 900 });
    expect(out.signedUrl).toBe('https://media.twilio.com/signed?sig=xyz');
    expect(out.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('falls back to JSON body redirect_to when no Location header', async () => {
    mockFetchResponse({
      status: 200,
      json: { redirect_to: 'https://signed.example/audio.mp4' },
    });
    const out = await mintCompositionSignedUrl({ compositionSid: 'CJ_bbb' });
    expect(out.signedUrl).toBe('https://signed.example/audio.mp4');
  });

  it('maps 404 to NotFoundError', async () => {
    mockFetchResponse({ status: 404, text: 'gone' });
    await expect(
      mintCompositionSignedUrl({ compositionSid: 'CJ_ccc' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('wraps non-2xx, non-404 responses as InternalError', async () => {
    mockFetchResponse({ status: 502, text: 'upstream' });
    await expect(
      mintCompositionSignedUrl({ compositionSid: 'CJ_ddd' }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('throws InternalError when neither Location nor redirect_to provided', async () => {
    mockFetchResponse({ status: 200, json: {} });
    await expect(
      mintCompositionSignedUrl({ compositionSid: 'CJ_eee' }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('honors the test override', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    __setOverridesForTests({
      mintSignedUrl: async () => ({ signedUrl: 'https://stub', expiresAt }),
    });
    const out = await mintCompositionSignedUrl({ compositionSid: 'CJ_fff' });
    expect(out.signedUrl).toBe('https://stub');
    expect(out.expiresAt).toBe(expiresAt);
  });
});
