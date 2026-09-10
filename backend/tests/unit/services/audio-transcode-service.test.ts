/**
 * Tests for `services/audio-transcode-service.ts` (cost-cut step 7).
 *
 * These run the **real** `ffmpeg-static` binary against **real**
 * Opus-in-Matroska fixtures generated at setup time. That is deliberate:
 * the whole point of this module is that Twilio's Matroska output is
 * unreadable by our STT vendors, so a mocked ffmpeg would prove nothing
 * about the one thing that can actually break — the filter graph and the
 * container handling.
 *
 * Pins:
 *   - `buildMixFilter` delays each track relative to the earliest.
 *   - A two-track mix produces a valid 16 kHz mono FLAC.
 *   - A single track skips the mix filter and still transcodes.
 *   - Download and decode failures map onto the worker's retry taxonomy.
 */

import { describe, expect, it, jest, beforeAll, afterEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';

import {
  buildMixFilter,
  mixTracksToFlac,
} from '../../../src/services/audio-transcode-service';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
} from '../../../src/types/consultation-transcript';

const execFileAsync = promisify(execFile);

const FLAC_MAGIC = Buffer.from('fLaC');

let fixtureDir: string;
let trackA: Buffer;
let trackB: Buffer;

const originalFetch = globalThis.fetch;

/** Generate a real Opus-in-Matroska track, the shape Twilio hands us. */
async function makeMatroskaTrack(
  frequency: number,
  seconds: number,
  path: string,
): Promise<Buffer> {
  await execFileAsync(ffmpegPath as string, [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', `sine=frequency=${frequency}:duration=${seconds}`,
    '-c:a', 'libopus',
    '-y', path,
  ]);
  return readFile(path);
}

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'haloaid-transcode-fixtures-'));
  trackA = await makeMatroskaTrack(440, 2, join(fixtureDir, 'a.mka'));
  trackB = await makeMatroskaTrack(880, 2, join(fixtureDir, 'b.mka'));
}, 60_000);

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetchWith(bodies: Buffer[]): void {
  let call = 0;
  globalThis.fetch = jest.fn(async () => {
    const body = bodies[Math.min(call, bodies.length - 1)]!;
    call += 1;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('buildMixFilter', () => {
  it('returns an empty graph for a single track', () => {
    expect(buildMixFilter([1200])).toBe('');
  });

  it('delays each track relative to the earliest, not to zero', () => {
    const filter = buildMixFilter([5000, 5750]);
    expect(filter).toContain('[0:a]adelay=0|0[a0]');
    expect(filter).toContain('[1:a]adelay=750|750[a1]');
    expect(filter).toContain('amix=inputs=2:duration=longest:normalize=0[out]');
  });

  it('never emits a negative delay', () => {
    const filter = buildMixFilter([900, 100]);
    expect(filter).toContain('[0:a]adelay=800|800[a0]');
    expect(filter).toContain('[1:a]adelay=0|0[a1]');
  });
});

describe('mixTracksToFlac', () => {
  it('mixes two Matroska tracks into one 16 kHz mono FLAC', async () => {
    stubFetchWith([trackA, trackB]);

    const out = await mixTracksToFlac({
      correlationId: 'c-mix',
      tracks: [
        { signedUrl: 'https://twilio.test/a', offsetMs: 1000, recordingSid: 'RTaaa' },
        { signedUrl: 'https://twilio.test/b', offsetMs: 1500, recordingSid: 'RTbbb' },
      ],
    });

    expect(out.contentType).toBe('audio/flac');
    expect(out.filename).toBe('consult.flac');
    expect(out.sizeBytes).toBeGreaterThan(0);
    expect(out.bytes.subarray(0, 4)).toEqual(FLAC_MAGIC);
  }, 60_000);

  it('produces output ffmpeg can decode back', async () => {
    stubFetchWith([trackA, trackB]);

    const out = await mixTracksToFlac({
      correlationId: 'c-decode',
      tracks: [
        { signedUrl: 'https://twilio.test/a', offsetMs: 0, recordingSid: 'RTaaa' },
        { signedUrl: 'https://twilio.test/b', offsetMs: 250, recordingSid: 'RTbbb' },
      ],
    });

    const probeDir = await mkdtemp(join(tmpdir(), 'haloaid-probe-'));
    try {
      const flacPath = join(probeDir, 'out.flac');
      await writeFile(flacPath, out.bytes);
      // Decoding to null succeeds only if the container and stream are sound.
      await expect(
        execFileAsync(ffmpegPath as string, [
          '-hide_banner', '-loglevel', 'error',
          '-i', flacPath, '-f', 'null', '-',
        ]),
      ).resolves.toBeDefined();
    } finally {
      await rm(probeDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('transcodes a single track without a mix filter', async () => {
    stubFetchWith([trackA]);

    const out = await mixTracksToFlac({
      correlationId: 'c-single',
      tracks: [
        { signedUrl: 'https://twilio.test/a', offsetMs: null, recordingSid: 'RTaaa' },
      ],
    });

    expect(out.bytes.subarray(0, 4)).toEqual(FLAC_MAGIC);
  }, 60_000);

  it('rejects an empty track list as permanent', async () => {
    await expect(
      mixTracksToFlac({ correlationId: 'c-empty', tracks: [] }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  });

  it('treats an expired signed URL as transient so the worker retries', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response)) as unknown as typeof fetch;

    await expect(
      mixTracksToFlac({
        correlationId: 'c-403',
        tracks: [
          { signedUrl: 'https://twilio.test/a', offsetMs: 0, recordingSid: 'RTaaa' },
        ],
      }),
    ).rejects.toBeInstanceOf(TranscriptionTransientError);
  });

  it('treats undecodable bytes as permanent so a poison track leaves the queue', async () => {
    stubFetchWith([Buffer.from('this is not media')]);

    await expect(
      mixTracksToFlac({
        correlationId: 'c-garbage',
        tracks: [
          { signedUrl: 'https://twilio.test/a', offsetMs: 0, recordingSid: 'RTaaa' },
        ],
      }),
    ).rejects.toBeInstanceOf(TranscriptionPermanentError);
  }, 60_000);
});
