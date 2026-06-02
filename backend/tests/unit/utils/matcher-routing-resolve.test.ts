/**
 * Routing v2 — unit tests for `resolveMatcherRouting` (Plan 19-04, Task 03).
 *
 * Locks the legacy-merge algorithm so Stage A + LLM consumers (Tasks 04–05) share one source
 * of truth. If you need to change the merge rules, update these fixtures in the same PR so
 * downstream callers update together.
 */

import { describe, it, expect } from '@jest/globals';
import {
  legacyKeywordsToPhraseParts,
  normalizeMatcherExamplePhrases,
  resolveMatcherRouting,
} from '../../../src/utils/matcher-routing-resolve';
import {
  MATCHER_HINT_EXAMPLE_MAX_CHARS,
  MATCHER_HINT_EXAMPLES_MAX_COUNT,
} from '../../../src/utils/service-catalog-schema';
import type { ServiceOfferingV1 } from '../../../src/utils/service-catalog-schema';

const SVC_ID = '11111111-1111-4111-8111-111111111111';

function offering(matcher_hints?: ServiceOfferingV1['matcher_hints']): ServiceOfferingV1 {
  return {
    service_id: SVC_ID,
    service_key: 'general',
    label: 'General consult',
    modalities: { text: { enabled: true, price_minor: 100 } },
    ...(matcher_hints ? { matcher_hints } : {}),
  };
}

describe('resolveMatcherRouting — examples path (routing v2)', () => {
  it('uses examples when present and reports legacySource="examples"', () => {
    const out = resolveMatcherRouting(
      offering({
        examples: ['I have a fever', 'cough since 3 days'],
      })
    );
    expect(out.legacySource).toBe('examples');
    expect(out.examplePhrases).toEqual(['I have a fever', 'cough since 3 days']);
    expect(out.legacyIncludeWhen).toBeUndefined();
    expect(out.excludeWhen).toBeUndefined();
  });

  it('ignores legacy keywords/include_when when examples are present (no dual-feed)', () => {
    const out = resolveMatcherRouting(
      offering({
        examples: ['I have a fever'],
        keywords: 'flu, viral',
        include_when: 'symptoms older than 1 day',
      })
    );
    expect(out.legacySource).toBe('examples');
    expect(out.examplePhrases).toEqual(['I have a fever']);
    expect(out.legacyIncludeWhen).toBeUndefined();
  });

  it('still surfaces exclude_when alongside examples', () => {
    const out = resolveMatcherRouting(
      offering({
        examples: ['I have a fever'],
        exclude_when: 'requires in-person exam',
      })
    );
    expect(out.legacySource).toBe('examples');
    expect(out.excludeWhen).toBe('requires in-person exam');
  });

  it('trims, dedupes case-insensitively, and preserves first-seen order', () => {
    const out = resolveMatcherRouting(
      offering({
        examples: ['  Fever  ', 'fever', 'Cough', 'COUGH', 'sore throat'],
      })
    );
    expect(out.examplePhrases).toEqual(['Fever', 'Cough', 'sore throat']);
  });

  it('clips overly long phrases to MATCHER_HINT_EXAMPLE_MAX_CHARS', () => {
    const long = 'a'.repeat(MATCHER_HINT_EXAMPLE_MAX_CHARS + 50);
    const out = resolveMatcherRouting(offering({ examples: [long] }));
    expect(out.examplePhrases).toHaveLength(1);
    expect(out.examplePhrases[0]!.length).toBe(MATCHER_HINT_EXAMPLE_MAX_CHARS);
  });

  it('falls through to legacy_merge when examples normalize to empty (all blanks)', () => {
    const out = resolveMatcherRouting(
      offering({
        examples: ['   ', '\t'],
        keywords: 'flu',
      })
    );
    expect(out.legacySource).toBe('legacy_merge');
    expect(out.examplePhrases).toEqual(['flu']);
  });
});

describe('resolveMatcherRouting — legacy_merge path (golden fixtures)', () => {
  it('Fixture 1: keywords only → split CSV → examplePhrases', () => {
    const out = resolveMatcherRouting(
      offering({
        keywords: 'fever, cough; sore throat\nrunny nose',
      })
    );
    expect(out).toEqual({
      examplePhrases: ['fever', 'cough', 'sore throat', 'runny nose'],
      legacySource: 'legacy_merge',
    });
  });

  it('Fixture 2: include_when only → legacyIncludeWhen blob, no examplePhrases', () => {
    const out = resolveMatcherRouting(
      offering({
        include_when: 'patient mentions symptoms older than 24 hours',
      })
    );
    expect(out).toEqual({
      examplePhrases: [],
      legacySource: 'legacy_merge',
      legacyIncludeWhen: 'patient mentions symptoms older than 24 hours',
    });
  });

  it('Fixture 3: keywords + include_when + exclude_when → all three populated', () => {
    const out = resolveMatcherRouting(
      offering({
        keywords: 'fever, cough',
        include_when: 'first-time visit',
        exclude_when: 'requires in-person exam',
      })
    );
    expect(out).toEqual({
      examplePhrases: ['fever', 'cough'],
      excludeWhen: 'requires in-person exam',
      legacySource: 'legacy_merge',
      legacyIncludeWhen: 'first-time visit',
    });
  });

  it('dedupes legacy keyword fragments case-insensitively', () => {
    const out = resolveMatcherRouting(
      offering({ keywords: 'fever, FEVER, Fever, cough' })
    );
    expect(out.examplePhrases).toEqual(['fever', 'cough']);
  });

  it('caps legacy keyword fragments at MATCHER_HINT_EXAMPLES_MAX_COUNT', () => {
    const many = Array.from({ length: MATCHER_HINT_EXAMPLES_MAX_COUNT + 5 }, (_, i) => `kw${i}`).join(',');
    const out = resolveMatcherRouting(offering({ keywords: many }));
    expect(out.examplePhrases).toHaveLength(MATCHER_HINT_EXAMPLES_MAX_COUNT);
    expect(out.examplePhrases[0]).toBe('kw0');
    expect(out.examplePhrases[MATCHER_HINT_EXAMPLES_MAX_COUNT - 1]).toBe(
      `kw${MATCHER_HINT_EXAMPLES_MAX_COUNT - 1}`
    );
  });

  it('drops empty fragments produced by repeated/trailing delimiters', () => {
    const out = resolveMatcherRouting(offering({ keywords: ',, fever ,;; , cough,' }));
    expect(out.examplePhrases).toEqual(['fever', 'cough']);
  });

  it('omits legacyIncludeWhen when include_when is whitespace-only', () => {
    const out = resolveMatcherRouting(
      offering({ keywords: 'fever', include_when: '   ' })
    );
    expect(out.legacyIncludeWhen).toBeUndefined();
  });
});

describe('resolveMatcherRouting — edge cases', () => {
  it('offering with no matcher_hints → empty legacy_merge result', () => {
    const out = resolveMatcherRouting(offering());
    expect(out).toEqual({
      examplePhrases: [],
      legacySource: 'legacy_merge',
    });
  });

  it('only exclude_when set → empty examplePhrases, excludeWhen surfaced', () => {
    const out = resolveMatcherRouting(offering({ exclude_when: 'no insurance billing' }));
    expect(out).toEqual({
      examplePhrases: [],
      excludeWhen: 'no insurance billing',
      legacySource: 'legacy_merge',
    });
  });

  it('catch-all-style row (blank hints) still resolves cleanly', () => {
    const catchAll: ServiceOfferingV1 = {
      service_id: SVC_ID,
      service_key: 'other',
      label: 'Other / not listed',
      modalities: { video: { enabled: true, price_minor: 100 } },
    };
    const out = resolveMatcherRouting(catchAll);
    expect(out.examplePhrases).toEqual([]);
    expect(out.legacySource).toBe('legacy_merge');
    expect(out.legacyIncludeWhen).toBeUndefined();
    expect(out.excludeWhen).toBeUndefined();
  });
});

describe('helpers exported by matcher-routing-resolve', () => {
  it('normalizeMatcherExamplePhrases — trims, clips, dedupes, caps', () => {
    const out = normalizeMatcherExamplePhrases([
      ' a ',
      'A',
      'b',
      'B',
      'c'.repeat(MATCHER_HINT_EXAMPLE_MAX_CHARS + 5),
    ]);
    expect(out[0]).toBe('a');
    expect(out[1]).toBe('b');
    expect(out[2]!.length).toBe(MATCHER_HINT_EXAMPLE_MAX_CHARS);
    expect(out).toHaveLength(3);
  });

  it('legacyKeywordsToPhraseParts — splits on , ; \\n \\r and trims', () => {
    expect(legacyKeywordsToPhraseParts('a, b; c\nd\re')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(legacyKeywordsToPhraseParts(undefined)).toEqual([]);
    expect(legacyKeywordsToPhraseParts('')).toEqual([]);
    expect(legacyKeywordsToPhraseParts('   ')).toEqual([]);
  });
});
