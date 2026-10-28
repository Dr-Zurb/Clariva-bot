/**
 * Makes a photo match what Instagram will accept for a feed post or a story.
 * JPEG, sRGB via canvas, 320–1440 px wide, ratio from 4:5 to 1.91:1.
 * A story is 9:16. A photo for a reel is held as a short MP4. The original file is left as the doctor saved it.
 */

import { execFile } from 'child_process';
import { createCanvas, loadImage } from 'canvas';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

const MIN_RATIO = 0.8;
const MAX_RATIO = 1.91;
const MIN_WIDTH = 320;
const FEED_MAX_WIDTH = 1440;
const STORY_RATIO = 9 / 16;
const STORY_MAX_WIDTH = 1080;
const MAX_BYTES = 8 * 1024 * 1024;

export function feedRatio(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
}

export async function toInstagramJpeg(
  input: Buffer,
  shape: 'feed' | 'story',
  ratio?: number,
  place: 'fill' | 'fit' = 'fill'
): Promise<Buffer> {
  const source = await loadImage(input);
  if (shape === 'story' && place === 'fit') return fitStory(source);
  const target = shape === 'story' ? STORY_RATIO : (ratio ?? feedRatio(source.width, source.height));
  const maxWidth = shape === 'story' ? STORY_MAX_WIDTH : FEED_MAX_WIDTH;
  let cropW = source.width;
  let cropH = source.height;
  if (cropW / cropH > target) cropW = Math.max(1, Math.round(cropH * target));
  else cropH = Math.max(1, Math.round(cropW / target));
  const sx = Math.max(0, Math.floor((source.width - cropW) / 2));
  const sy = Math.max(0, Math.floor((source.height - cropH) / 2));
  let outW = cropW;
  let outH = cropH;
  if (outW > maxWidth) {
    outH = Math.max(1, Math.round((outH * maxWidth) / outW));
    outW = maxWidth;
  }
  if (outW < MIN_WIDTH) {
    outH = Math.max(1, Math.round((outH * MIN_WIDTH) / outW));
    outW = MIN_WIDTH;
  }
  outH = Math.max(1, Math.round(outW / target));
  if (shape === 'feed' && outW / outH > MAX_RATIO) outH += 1;
  if (shape === 'feed' && outH > 1 && outW / outH < MIN_RATIO) outH -= 1;
  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, outW, outH);
  let quality = 0.9;
  let out = canvas.toBuffer('image/jpeg', { quality });
  while (out.length > MAX_BYTES && quality > 0.45) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    out = canvas.toBuffer('image/jpeg', { quality });
  }
  return out;
}

/** The whole photo, centered on a black 9:16 story. */
function fitStory(source: Awaited<ReturnType<typeof loadImage>>): Buffer {
  const outW = STORY_MAX_WIDTH;
  const outH = Math.max(1, Math.round(outW / STORY_RATIO));
  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outW, outH);
  const scale = Math.min(outW / Math.max(1, source.width), outH / Math.max(1, source.height));
  const dw = Math.max(1, Math.round(source.width * scale));
  const dh = Math.max(1, Math.round(source.height * scale));
  ctx.drawImage(source, 0, 0, source.width, source.height, Math.floor((outW - dw) / 2), Math.floor((outH - dh) / 2), dw, dh);
  let quality = 0.9;
  let out = canvas.toBuffer('image/jpeg', { quality });
  while (out.length > MAX_BYTES && quality > 0.45) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    out = canvas.toBuffer('image/jpeg', { quality });
  }
  return out;
}

const REEL_SECONDS = '5';
const REEL_SIZE = '1080:1920';

/** A still, held for a few seconds, as an MP4 reel. The photo itself is left as saved. */
export async function stillToReel(jpeg: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error('container');
  const dir = await mkdtemp(join(tmpdir(), `reel-${randomUUID()}-`));
  const input = join(dir, 'still.jpg');
  const output = join(dir, 'reel.mp4');
  try {
    await writeFile(input, jpeg);
    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-loop',
        '1',
        '-framerate',
        '30',
        '-t',
        REEL_SECONDS,
        '-i',
        input,
        '-f',
        'lavfi',
        '-t',
        REEL_SECONDS,
        '-i',
        'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-vf',
        `scale=${REEL_SIZE}:force_original_aspect_ratio=increase,crop=${REEL_SIZE},format=yuv420p`,
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        '-movflags',
        '+faststart',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        output,
      ],
      { timeout: 30000 }
    );
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
