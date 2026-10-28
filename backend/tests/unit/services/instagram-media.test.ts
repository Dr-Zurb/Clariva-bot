import { describe, it, expect } from '@jest/globals';
import { createCanvas, loadImage } from 'canvas';
import { feedRatio, toInstagramJpeg } from '../../../src/services/instagram-media';

function jpeg(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#336699';
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/jpeg', { quality: 0.8 });
}

async function size(buffer: Buffer): Promise<{ width: number; height: number }> {
  const image = await loadImage(buffer);
  return { width: image.width, height: image.height };
}

describe('instagram photo fit', () => {
  it('narrows a wide photo to 1.91 and 1440', async () => {
    const out = await toInstagramJpeg(jpeg(2000, 1000), 'feed');
    const box = await size(out);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(box.width).toBeLessThanOrEqual(1440);
    expect(box.width).toBeGreaterThanOrEqual(320);
    expect(box.width / box.height).toBeLessThanOrEqual(1.91);
    expect(box.width / box.height).toBeGreaterThanOrEqual(0.8);
    expect(out.length).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('crops a tall photo up to 4:5', async () => {
    const out = await toInstagramJpeg(jpeg(800, 2000), 'feed');
    const box = await size(out);
    expect(box.width / box.height).toBeGreaterThanOrEqual(0.8);
    expect(box.width / box.height).toBeLessThanOrEqual(1.91);
  });

  it('uses one ratio for every picture in a set', async () => {
    const wide = jpeg(1800, 900);
    const tall = jpeg(600, 1600);
    const first = await loadImage(wide);
    const ratio = feedRatio(first.width, first.height);
    const left = await size(await toInstagramJpeg(wide, 'feed', ratio));
    const right = await size(await toInstagramJpeg(tall, 'feed', ratio));
    expect(Math.abs(left.width / left.height - right.width / right.height)).toBeLessThan(0.02);
  });

  it('turns a png into a jpeg that stays inside the feed rules', async () => {
    const canvas = createCanvas(5120, 2880);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#cc8844';
    ctx.fillRect(0, 0, 5120, 2880);
    const out = await toInstagramJpeg(canvas.toBuffer('image/png'), 'feed');
    const box = await size(out);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(box.width).toBe(1440);
    expect(box.width / box.height).toBeLessThanOrEqual(1.91);
    expect(box.width / box.height).toBeGreaterThanOrEqual(0.8);
  });

  it('crops to 1:1, 4:5, or 16:9 when that ratio is chosen', async () => {
    const square = await size(await toInstagramJpeg(jpeg(1600, 900), 'feed', 1));
    const portrait = await size(await toInstagramJpeg(jpeg(1600, 900), 'feed', 4 / 5));
    const wide = await size(await toInstagramJpeg(jpeg(800, 1200), 'feed', 16 / 9));
    expect(Math.abs(square.width / square.height - 1)).toBeLessThan(0.02);
    expect(Math.abs(portrait.width / portrait.height - 4 / 5)).toBeLessThan(0.02);
    expect(Math.abs(wide.width / wide.height - 16 / 9)).toBeLessThan(0.02);
  });

  it('makes a story 9:16', async () => {
    const out = await toInstagramJpeg(jpeg(1600, 900), 'story');
    const box = await size(out);
    expect(box.width).toBeLessThanOrEqual(1080);
    expect(Math.abs(box.width / box.height - 9 / 16)).toBeLessThan(0.02);
  });

  it('fits a wide photo inside a 9:16 story', async () => {
    const out = await toInstagramJpeg(jpeg(1600, 900), 'story', undefined, 'fit');
    const image = await loadImage(out);
    expect(Math.abs(image.width / image.height - 9 / 16)).toBeLessThan(0.02);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const corner = ctx.getImageData(0, 0, 1, 1).data;
    const middle = ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data;
    expect(corner[0]).toBeLessThan(16);
    expect(middle[2]).toBeGreaterThan(80);
  });
});
