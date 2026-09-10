/**
 * lang-18: scored language-detection corpus.
 * Per-slice floors — a global average must not hide a weak slice.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  resolveTurnLanguage,
  type ConversationLanguage,
} from '../../../src/utils/conversation-language';

/** LANG4 acceptance: overall ≥95%. Named so a change is a deliberate decision. */
const OVERALL_ACCURACY_FLOOR = 0.95;

/** Per-slice floors. emergency / false-positive are zero-miss (handled separately). */
const SLICE_ACCURACY_FLOOR: Readonly<Record<string, number>> = {
  english: 0.95,
  'hinglish-obvious': 0.95,
  'hinglish-sparse': 0.9,
  punjabi: 0.95,
  contention: 0.9,
  devanagari: 1,
  gurmukhi: 1,
  'other-script': 1,
  emergency: 1,
  'false-positive': 1,
};

type CorpusCase = {
  id: string;
  text: string;
  expected: ConversationLanguage;
  storedBefore: ConversationLanguage | null;
  slice: string;
  reviewed: boolean;
  note?: string;
};

type CorpusFile = {
  _meta: { overallFloor?: number };
  cases: CorpusCase[];
};

const corpusPath = join(__dirname, '../../fixtures/language-detection-labels.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as CorpusFile;

type FailRow = {
  id: string;
  slice: string;
  text: string;
  expected: string;
  actual: string;
  reason: string;
};

function scoreSlice(slice: string, rows: CorpusCase[]): { pass: number; fail: FailRow[] } {
  const fail: FailRow[] = [];
  let pass = 0;
  for (const row of rows) {
    // Emergency slice mirrors run-conversation-turn: acuteEmergency lowers the weak bar.
    const result =
      slice === 'emergency'
        ? resolveTurnLanguage(row.storedBefore, row.text, [], { acuteEmergency: true })
        : resolveTurnLanguage(row.storedBefore, row.text);
    if (result.language === row.expected) {
      pass += 1;
    } else {
      fail.push({
        id: row.id,
        slice,
        text: row.text,
        expected: row.expected,
        actual: result.language,
        reason: result.reason,
      });
    }
  }
  return { pass, fail };
}

describe('language-detection corpus (lang-18)', () => {
  const reviewed = corpus.cases.filter((c) => c.reviewed === true);
  const bySlice = new Map<string, CorpusCase[]>();
  for (const row of reviewed) {
    const list = bySlice.get(row.slice) ?? [];
    list.push(row);
    bySlice.set(row.slice, list);
  }

  it('fixture covers all required slices', () => {
    const required = [
      'english',
      'hinglish-obvious',
      'hinglish-sparse',
      'punjabi',
      'contention',
      'devanagari',
      'gurmukhi',
      'other-script',
      'false-positive',
      'emergency',
    ];
    for (const slice of required) {
      expect(bySlice.has(slice)).toBe(true);
      expect((bySlice.get(slice) ?? []).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('overall accuracy meets LANG4 floor', () => {
    const allFail: FailRow[] = [];
    let pass = 0;
    for (const [slice, rows] of bySlice) {
      const scored = scoreSlice(slice, rows);
      pass += scored.pass;
      allFail.push(...scored.fail);
    }
    const total = pass + allFail.length;
    const accuracy = total === 0 ? 0 : pass / total;
    if (allFail.length > 0) {
      // Actionable failure table — not a bare percentage.
      // eslint-disable-next-line no-console
      console.error(
        'language corpus failures:\n' +
          allFail
            .map(
              (f) =>
                `${f.id}\t${f.slice}\texpected=${f.expected}\tactual=${f.actual}\treason=${f.reason}\t${f.text}`
            )
            .join('\n')
      );
    }
    expect(accuracy).toBeGreaterThanOrEqual(OVERALL_ACCURACY_FLOOR);
  });

  it('per-slice accuracy floors hold', () => {
    const report: string[] = [];
    for (const [slice, rows] of bySlice) {
      const floor = SLICE_ACCURACY_FLOOR[slice] ?? OVERALL_ACCURACY_FLOOR;
      const { pass, fail } = scoreSlice(slice, rows);
      const total = pass + fail.length;
      const accuracy = total === 0 ? 0 : pass / total;
      if (accuracy < floor) {
        report.push(
          `${slice}: ${(accuracy * 100).toFixed(1)}% < ${(floor * 100).toFixed(0)}% floor; fails: ${fail
            .map((f) => f.id)
            .join(', ')}`
        );
      }
    }
    expect(report).toEqual([]);
  });

  it('emergency slice: zero English replies to non-English speakers', () => {
    const rows = bySlice.get('emergency') ?? [];
    const misses = rows.filter((row) => {
      if (row.expected === 'en') return false;
      const result = resolveTurnLanguage(row.storedBefore, row.text);
      return result.language === 'en';
    });
    expect(misses.map((m) => m.id)).toEqual([]);
  });

  it('false-positive slice: zero English messages classified non-English', () => {
    const rows = bySlice.get('false-positive') ?? [];
    const flips = rows.filter((row) => {
      const result = resolveTurnLanguage(row.storedBefore, row.text);
      return result.language !== 'en' && row.expected === 'en';
    });
    expect(flips.map((f) => f.id)).toEqual([]);
  });
});
