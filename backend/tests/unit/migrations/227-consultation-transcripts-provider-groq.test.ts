import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/227_consultation_transcripts_provider_groq.sql',
);

describe('227_consultation_transcripts_provider_groq.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('drops and re-adds the provider CHECK with groq_whisper', () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS consultation_transcripts_provider_check/,
    );
    expect(sql).toMatch(
      /CHECK \(provider IN \('openai_whisper', 'deepgram_nova_2', 'groq_whisper'\)\)/,
    );
  });

  it('does not add columns or touch RLS', () => {
    expect(sql).not.toMatch(/ADD COLUMN/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
