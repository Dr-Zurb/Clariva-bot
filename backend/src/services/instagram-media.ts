/**
 * Makes a photo match what Instagram will accept for a feed post or a story.
 * JPEG, sRGB via canvas, 320–1440 px wide, ratio from 4:5 to 1.91:1.
 * A story is 9:16. The original file is left as the doctor saved it.
 */

import { createCanvas, loadImage } from 'canvas';

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
  ratio?: number
): Promise<Buffer> {
  const source = await loadImage(input);
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
