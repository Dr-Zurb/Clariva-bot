import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/228_consultation_transcripts_provider_nova3.sql',
);

describe('228_consultation_transcripts_provider_nova3.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('widens the provider CHECK to include deepgram_nova_3', () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS consultation_transcripts_provider_check/,
    );
    expect(sql).toMatch(/deepgram_nova_3/);
    expect(sql).toMatch(/groq_whisper/);
  });

  it('does not add columns or touch RLS', () => {
    expect(sql).not.toMatch(/ADD COLUMN/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
