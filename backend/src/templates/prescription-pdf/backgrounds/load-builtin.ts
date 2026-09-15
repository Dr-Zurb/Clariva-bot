/**
 * Built-in letterhead page backgrounds (paper / cross).
 * PNG bytes for @react-pdf <Image>. Never a URL (BRD-D5).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { LetterheadLogoBytes } from '../../../types/letterhead';

const cache = new Map<string, LetterheadLogoBytes>();

export function loadBuiltinBackground(
  preset: 'paper' | 'cross'
): LetterheadLogoBytes {
  const hit = cache.get(preset);
  if (hit) return hit;
  const file = preset === 'paper' ? 'bg-paper.png' : 'bg-cross.png';
  const bytes = readFileSync(join(__dirname, file));
  const asset: LetterheadLogoBytes = {
    bytes,
    format: 'png',
    contentType: 'image/png',
  };
  cache.set(preset, asset);
  return asset;
}
