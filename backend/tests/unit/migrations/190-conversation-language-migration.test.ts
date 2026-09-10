/**
 * Content-sanity test for migration 190 (conversations.language).
 *
 * @see docs/Work/Daily-plans/August 2026/02-08-2026/bot-language-policy/p1-language-resolver/Tasks/task-lang-02-conversation-language-migration.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Must match LANG-D7 / ConversationLanguage in conversation-language.ts */
const LANG_D7_CODES = ['en', 'hi', 'hi-Latn', 'pa', 'pa-Latn', 'other'] as const;

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/190_conversation_language.sql',
);

describe('190_conversation_language.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column', () => {
    it('adds language as nullable TEXT with IF NOT EXISTS (idempotent)', () => {
      expect(sql).toMatch(
        /ALTER TABLE conversations\s+ADD COLUMN IF NOT EXISTS language TEXT\b/,
      );
      expect(sql).not.toMatch(/language\s+TEXT\s+NOT NULL/);
      expect(sql).not.toMatch(/language\s+TEXT\s+DEFAULT/);
    });

    it('documents the column (NULL = undecided, not PHI)', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN conversations\.language IS/);
      expect(sql).toMatch(/NULL = undecided/);
      expect(sql).toMatch(/not PHI/i);
    });
  });

  describe('CHECK constraint', () => {
    it('adds conversations_language_check guarded by pg_constraint', () => {
      expect(sql).toMatch(/conversations_language_check/);
      expect(sql).toMatch(/FROM pg_constraint/);
      expect(sql).toMatch(/conname = 'conversations_language_check'/);
    });

    it('allows NULL or the exact LANG-D7 set', () => {
      expect(sql).toMatch(/language IS NULL/);
      for (const code of LANG_D7_CODES) {
        expect(sql).toContain(`'${code}'`);
      }
      // Reject drift: IN list should not include unknown codes like 'fr'
      expect(sql).not.toMatch(/'fr'/);
    });

    it('CHECK IN list matches LANG-D7 order-independently', () => {
      const match = sql.match(
        /language IN\s*\(([^)]+)\)/,
      );
      expect(match).not.toBeNull();
      const listed = (match![1].match(/'([^']+)'/g) ?? []).map((s) =>
        s.replace(/'/g, ''),
      );
      expect(listed.sort()).toEqual([...LANG_D7_CODES].sort());
    });
  });

  describe('scope', () => {
    it('does not touch RLS or auth.uid()', () => {
      expect(sql).not.toMatch(/ROW LEVEL SECURITY/);
      expect(sql).not.toMatch(/auth\.uid\(\)/);
      expect(sql).not.toMatch(/CREATE POLICY/);
    });

    it('does not add an index on language', () => {
      expect(sql).not.toMatch(/CREATE INDEX.*language/i);
    });

    it('does not backfill or mutate metadata', () => {
      expect(sql).not.toMatch(/UPDATE\s+conversations/i);
      expect(sql).not.toMatch(/metadata/);
    });
  });
});
