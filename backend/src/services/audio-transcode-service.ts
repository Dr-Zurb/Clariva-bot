/**
 * Local audio transcode + mix (cost-cut step 7).
 *
 * ## Why this exists
 *
 * Twilio raw Recordings are **Matroska** — `.mka` (OPUS / PCMU) and
 * `.mkv` (VP8 / H264). Twilio documents them as incompatible with most
 * players, and Groq's upload set (flac, mp3, mp4, mpeg, mpga, m4a, ogg,
 * wav, webm) excludes the container entirely. Deepgram advertises 100+
 * formats but does not document Matroska.
 *
 * A Twilio Composition is the only vendor-side transcode, and it is the
 * `$0.01`/composed-minute meter this step is trying to switch off. So to
 * stop paying it we have to own the transcode, which is what this module
 * does: `ffmpeg-static` ships a prebuilt binary as an ordinary npm
 * dependency, so there is no Dockerfile or Render change involved.
 *
 * ## Alignment
 *
 * Each Recording carries `offset` — milliseconds between a point in time
 * common to all group rooms and the moment that track's room started.
 * Twilio documents it as the synchronisation mechanism for recordings
 * belonging to the same room, so tracks are delayed by their offset
 * relative to the earliest track before being mixed.
 *
 * ## Output format
 *
 * 16 kHz mono FLAC. Whisper and Nova-3 both downsample to 16 kHz mono
 * anyway, mono halves the payload, and FLAC is lossless — this is
 * clinical audio, so a lossy intermediate is not worth the bytes. Groq's
 * own guidance recommends FLAC when reducing file size, and both vendors
 * accept the container.
 *
 * ## Error taxonomy
 *
 * Download and process failures are `TranscriptionTransientError` so the
 * worker's existing backoff retries them. A track the decoder cannot
 * read at all is `TranscriptionPermanentError` — retrying will not
 * change the bytes.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';

import { logger } from '../config/logger';
import {
  TranscriptionPermanentError,
  TranscriptionTransientError,
} from '../types/consultation-transcript';

const execFileAsync = promisify(execFile);

/** Guards against a runaway mix pinning a worker process. */
const FFMPEG_TIMEOUT_MS = 5 * 60_000;

/** Groq's free tier caps uploads at 25 MB; warn before we get there. */
const OUTPUT_SIZE_WARN_BYTES = 20 * 1024 * 1024;

export interface TranscodeTrackInput {
  /** Short-TTL Twilio media URL for one raw track. */
  signedUrl:    string;
  /** Twilio's cross-track sync key, in milliseconds. */
  offsetMs:     number | null;
  /** Carried only for logging. */
  recordingSid: string;
}

export interface MixTracksResult {
  bytes:       Buffer;
  contentType: string;
  /** Filename hint for multipart uploads that key off the extension. */
  filename:    string;
  sizeBytes:   number;
}

export interface MixTracksInput {
  tracks:        TranscodeTrackInput[];
  correlationId: string;
}

function requireFfmpeg(): string {
  if (!ffmpegPath) {
    throw new TranscriptionPermanentError(
      'audio-transcode: ffmpeg-static did not resolve a binary for this platform',
    );
  }
  return ffmpegPath;
}

async function downloadTrack(
  track: TranscodeTrackInput,
  destination: string,
  correlationId: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(track.signedUrl);
  } catch (err) {
    throw new TranscriptionTransientError(
      `audio-transcode: network error downloading ${track.recordingSid}`,
      err,
    );
  }

  if (!res.ok) {
    // Twilio signs media URLs with a short TTL; an expired one is worth
    // another attempt with a freshly minted URL.
    throw new TranscriptionTransientError(
      `audio-transcode: download failed (${res.status}) for ${track.recordingSid}`,
    );
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) {
    throw new TranscriptionPermanentError(
      `audio-transcode: ${track.recordingSid} downloaded as zero bytes`,
    );
  }

  await writeFile(destination, bytes);
  logger.debug(
    { correlationId, recordingSid: track.recordingSid, sizeBytes: bytes.length },
    'audio-transcode: track downloaded',
  );
}

/**
 * Build the ffmpeg filter graph that delays each track to its own
 * offset and mixes the result down to one stream.
 *
 * `normalize=0` keeps `amix` from attenuating every input by 1/N, which
 * would quietly halve the volume of a two-person consult.
 */
export function buildMixFilter(offsetsMs: number[]): string {
  if (offsetsMs.length === 1) return '';

  const base = Math.min(...offsetsMs);
  const delays = offsetsMs.map((offset) => Math.max(0, Math.round(offset - base)));

  const stages = delays.map(
    (delay, index) => `[${index}:a]adelay=${delay}|${delay}[a${index}]`,
  );
  const labels = delays.map((_, index) => `[a${index}]`).join('');

  return `${stages.join(';')};${labels}amix=inputs=${delays.length}:duration=longest:normalize=0[out]`;
}

/**
 * Download every raw track, align them on Twilio's `offset`, and mix
 * down to a single 16 kHz mono FLAC suitable for any STT vendor.
 *
 * A single track skips the mix filter and is simply transcoded.
 */
export async function mixTracksToFlac(
  input: MixTracksInput,
): Promise<MixTracksResult> {
  const { correlationId } = input;
  const tracks = input.tracks.filter((t) => t.signedUrl?.trim());

  if (tracks.length === 0) {
    throw new TranscriptionPermanentError(
      'audio-transcode: no tracks supplied',
    );
  }

  const binary = requireFfmpeg();
  const workdir = await mkdtemp(join(tmpdir(), 'haloaid-transcode-'));

  try {
    const inputPaths: string[] = [];
    for (const [index, track] of tracks.entries()) {
      const destination = join(workdir, `track-${index}.mka`);
      await downloadTrack(track, destination, correlationId);
      inputPaths.push(destination);
    }

    const outputPath = join(workdir, 'mixed.flac');
    const filter = buildMixFilter(tracks.map((t) => t.offsetMs ?? 0));

    const args = [
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      ...inputPaths.flatMap((path) => ['-i', path]),
      ...(filter ? ['-filter_complex', filter, '-map', '[out]'] : []),
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'flac',
      '-y',
      outputPath,
    ];

    try {
      await execFileAsync(binary, args, {
        timeout:   FFMPEG_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      const stderr = String((err as { stderr?: unknown }).stderr ?? '').slice(0, 500);
      const killed = (err as { killed?: boolean }).killed === true;
      if (killed) {
        throw new TranscriptionTransientError(
          `audio-transcode: ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms`,
          err,
        );
      }
      // ffmpeg exits non-zero on undecodable input as readily as on a
      // transient resource problem, and it does not distinguish them in
      // its exit code. Treat it as permanent: the bytes will not change
      // on a retry, and a poison track should not occupy the queue.
      throw new TranscriptionPermanentError(
        `audio-transcode: ffmpeg failed — ${stderr}`,
        err,
      );
    }

    const bytes = await readFile(outputPath);
    if (bytes.length === 0) {
      throw new TranscriptionPermanentError(
        'audio-transcode: ffmpeg produced an empty file',
      );
    }
    if (bytes.length > OUTPUT_SIZE_WARN_BYTES) {
      logger.warn(
        { correlationId, sizeBytes: bytes.length, trackCount: tracks.length },
        'audio-transcode: mixed output is close to the vendor upload cap',
      );
    }

    logger.info(
      {
        correlationId,
        trackCount: tracks.length,
        sizeBytes:  bytes.length,
        mixed:      filter !== '',
      },
      'audio-transcode: tracks mixed',
    );

    return {
      bytes,
      contentType: 'audio/flac',
      filename:    'consult.flac',
      sizeBytes:   bytes.length,
    };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}
