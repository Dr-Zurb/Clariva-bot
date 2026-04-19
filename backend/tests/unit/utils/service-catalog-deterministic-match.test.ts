import { describe, it, expect } from '@jest/globals';
import { runDeterministicServiceCatalogMatchStageA } from '../../../src/utils/service-catalog-deterministic-match';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const sid = (key: string) => deterministicServiceIdForLegacyOffering('det-test-doc', key);

/**
 * Catalog used to exercise the empty-hints bug:
 *   - `ncd` is a chronic-disease follow-up row with EMPTY matcher_hints (the real-world NCD incident).
 *   - `gp` is a general-physician row (no hints by default).
 *   - `other` is the mandatory catch-all.
 * Services on this catalog deliberately do NOT share tokens with arbitrary complaints, so
 * label/description substring hits are the only way into a deterministic match.
 */
function catalogNcdGpOther(): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: sid('ncd'),
        service_key: 'ncd',
        label: 'NCD follow-up',
        modalities: { video: { enabled: true, price_minor: 100_00 } },
      },
      {
        service_id: sid('gp'),
        service_key: 'gp',
        label: 'General physician',
        modalities: {
          text: { enabled: true, price_minor: 50_00 },
          video: { enabled: true, price_minor: 80_00 },
        },
      },
      {
        service_id: sid('other'),
        service_key: 'other',
        label: 'Other / not listed',
        modalities: { video: { enabled: true, price_minor: 90_00 } },
      },
    ],
  };
}

describe('runDeterministicServiceCatalogMatchStageA — empty-hints safety', () => {
  it('returns null when all non-catch services have empty matcher_hints and no label/description hit', () => {
    const catalog = catalogNcdGpOther();

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'cough and headache for two days'
    );

    expect(r).toBeNull();
  });

  it('returns null when matcher_hints object exists with all blank fields (NCD incident scenario)', () => {
    const catalog = catalogNcdGpOther();

    catalog.services[0]!.matcher_hints = {
      keywords: '',
      include_when: '',
      exclude_when: '',
    };
    catalog.services[1]!.matcher_hints = {
      keywords: '   ',
      include_when: '   ',
      exclude_when: '   ',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'cough and headache for two days'
    );

    expect(r).toBeNull();
  });

  it('returns null when matcher_hints has only whitespace in every field', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = {
      keywords: '\t\n  ',
    };
    catalog.services[1]!.matcher_hints = {
      include_when: '     ',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'random vague complaint'
    );

    expect(r).toBeNull();
  });

  it('matches by keywords when exactly one service has non-blank hints that overlap', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = {
      keywords: 'hypertension, diabetes, hypothyroidism',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'uncontrolled diabetes for six months'
    );

    expect(r?.offering.service_key).toBe('ncd');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
  });

  it('ignores a blank include_when (does not penalize a keyword match)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = {
      keywords: 'diabetes',
      include_when: '',
      exclude_when: '',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'diabetes check please'
    );

    expect(r?.offering.service_key).toBe('ncd');
  });

  it('does not treat a blank exclude_when as a match (does not trigger -1 penalty)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = {
      keywords: 'diabetes',
      exclude_when: '',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'diabetes review'
    );

    expect(r?.offering.service_key).toBe('ncd');
  });

  it('applies exclude_when correctly when it has content that overlaps the complaint', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = {
      keywords: 'diabetes',
      exclude_when: 'pregnancy',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'diabetes during pregnancy'
    );

    expect(r).toBeNull();
  });

  it('does not inflate a non-matching service score just because its hints are blank', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = { keywords: '', include_when: '', exclude_when: '' };
    catalog.services[1]!.matcher_hints = { keywords: 'fever' };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'fever since yesterday'
    );

    expect(r?.offering.service_key).toBe('gp');
    expect(r?.confidence).toBe('medium');
  });

  it('preserves single-non-catch-offering fast path (pre-existing behavior)', () => {
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sid('only'),
          service_key: 'only_svc',
          label: 'Only specialty',
          modalities: { video: { enabled: true, price_minor: 100_00 } },
        },
        {
          service_id: sid('other'),
          service_key: 'other',
          label: 'Other / not listed',
          modalities: { video: { enabled: true, price_minor: 50_00 } },
        },
      ],
    };

    const r = runDeterministicServiceCatalogMatchStageA(catalog, 'anything here');

    expect(r?.offering.service_key).toBe('only_svc');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
  });

  it('preserves unique label substring fast path (pre-existing behavior)', () => {
    const catalog = catalogNcdGpOther();

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'I need general physician for a quick check'
    );

    expect(r?.offering.service_key).toBe('gp');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
  });
});

describe('runDeterministicServiceCatalogMatchStageA — SFU-18 scope_mode', () => {
  it('strict label-only match downgrades to medium + autoFinalize false', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[1]!.scope_mode = 'strict';

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'I need general physician for a quick check'
    );

    expect(r?.offering.service_key).toBe('gp');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
  });

  it('strict label match with keyword corroboration stays high + autoFinalize true', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[1]!.scope_mode = 'strict';
    catalog.services[1]!.matcher_hints = { keywords: 'general physician, routine checkup' };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'I need general physician for a quick check'
    );

    expect(r?.offering.service_key).toBe('gp');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
  });

  it('flexible label-only match preserves high + autoFinalize true', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[1]!.scope_mode = 'flexible';

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'I need general physician for a quick check'
    );

    expect(r?.offering.service_key).toBe('gp');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
  });

  it('strict with include_when-only overlap (no keyword hit) yields no deterministic match', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'strict';
    catalog.services[0]!.matcher_hints = {
      include_when: 'diabetes hypertension hypothyroidism',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'hypertension follow-up review'
    );

    // Under strict mode, overlap without a keyword hit no longer yields a positive
    // score, so the router defers to Stage B (LLM) rather than auto-routing here.
    expect(r).toBeNull();
  });

  it('strict with keyword hit still scores and matches normally', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'strict';
    catalog.services[0]!.matcher_hints = {
      keywords: 'hypertension, diabetes',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'hypertension follow-up review'
    );

    expect(r?.offering.service_key).toBe('ncd');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
  });

  /**
   * Routing v2 (Plan 19-04, Task 04): Stage A now reads via `resolveMatcherRouting`.
   * v2 rows that only set `matcher_hints.examples` should score and win the same way
   * legacy `keywords` rows did, including under strict mode.
   */
  it('routing v2 (strict): examples-only hit yields a positive score and matches', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'strict';
    catalog.services[0]!.matcher_hints = {
      examples: ['hypertension follow-up', 'diabetes review', 'thyroid recheck'],
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'I need a hypertension follow-up please'
    );

    expect(r?.offering.service_key).toBe('ncd');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
  });

  it('routing v2: examples win over legacy keywords/include_when on the same row', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = {
      examples: ['blood pressure check'],
      keywords: 'fever, cough',
      include_when: 'totally unrelated topic',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'I need a blood pressure check tomorrow'
    );

    expect(r?.offering.service_key).toBe('ncd');
    expect(r?.confidence).toBe('medium');
  });

  it('routing v2: examples-only row ignores legacy include_when gate (no penalty)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = {
      examples: ['diabetes'],
      include_when: 'something completely off-topic',
    };

    const r = runDeterministicServiceCatalogMatchStageA(catalog, 'diabetes review please');

    expect(r?.offering.service_key).toBe('ncd');
  });

  it('routing v2: examples-only row still honors exclude_when red flag', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.matcher_hints = {
      examples: ['diabetes'],
      exclude_when: 'pregnancy',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'diabetes during pregnancy'
    );

    expect(r).toBeNull();
  });

  it('routing v2 (strict): empty/blank examples fall through to legacy_merge keyword path', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'strict';
    catalog.services[0]!.matcher_hints = {
      examples: ['   '],
      keywords: 'hypertension, diabetes',
    };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'hypertension follow-up review'
    );

    expect(r?.offering.service_key).toBe('ncd');
    expect(r?.confidence).toBe('medium');
  });

  it('strict + single-non-catch-offering fast path still routes (only-option wins)', () => {
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sid('only'),
          service_key: 'only_svc',
          label: 'Only specialty',
          scope_mode: 'strict',
          modalities: { video: { enabled: true, price_minor: 100_00 } },
        },
        {
          service_id: sid('other'),
          service_key: 'other',
          label: 'Other / not listed',
          modalities: { video: { enabled: true, price_minor: 50_00 } },
        },
      ],
    };

    // The strict gate only tightens label/desc fast paths; the "only non-catch
    // offering" fast path remains intentionally untouched (documented trade-off).
    const r = runDeterministicServiceCatalogMatchStageA(catalog, 'anything here');

    expect(r?.offering.service_key).toBe('only_svc');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
  });
});

/**
 * Routing v2 / Phase 2 — Plan 19-04, Task 08.
 *
 * Pins the strict/flexible × resolved-hints matrix on the Stage A entry point so
 * any regression on a documented cell points the reviewer at one named test.
 * The full table also lives in the JSDoc on `runDeterministicServiceCatalogMatchStageA`
 * and in `docs/Development/service-catalog-matching-stages.md` — keep all three in sync.
 *
 * To force a third Stage A code path through the multi-row catalog (and avoid the
 * "single non-catch offering" shortcut at the top of `runDeterministic…`) every
 * test below uses three rows: the row under test (`ncd`), an inert sibling
 * (`gp`), and the mandatory `other`.
 */
describe('runDeterministicServiceCatalogMatchStageA — Phase 2 matrix (Routing v2, Plan 19-04, Task 08)', () => {
  // --- Cells A1–A3: strict + v2 examples ---

  it('A1: strict + examples + patient text contains an example phrase → match medium, autoFinalize=false', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'strict';
    catalog.services[0]!.matcher_hints = { examples: ['htn check'] };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'i need htn check tomorrow morning'
    );

    expect(r?.offering.service_key).toBe('ncd');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
    expect(r?.reasonCodes).toEqual(
      expect.arrayContaining(['keyword_hint_match', 'catalog_allowlist_match'])
    );
  });

  it('A2: strict + examples + patient text has NO overlap → null (Stage B will handle)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'strict';
    catalog.services[0]!.matcher_hints = { examples: ['htn check'] };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'completely unrelated complaint about something else'
    );

    expect(r).toBeNull();
  });

  it('A3: strict + examples + exclude_when overlap → null (excluded; red flag wins over example hit)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'strict';
    catalog.services[0]!.matcher_hints = {
      examples: ['htn'],
      exclude_when: 'pregnancy',
    };

    const r = runDeterministicServiceCatalogMatchStageA(catalog, 'htn during pregnancy');

    expect(r).toBeNull();
  });

  // --- Cells B1–B3: flexible (no strict gating) ---

  it('B1: flexible + examples + patient text contains an example phrase → match medium', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'flexible';
    catalog.services[0]!.matcher_hints = { examples: ['htn check'] };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'i need htn check tomorrow morning'
    );

    expect(r?.offering.service_key).toBe('ncd');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
  });

  it('B2: flexible + examples + patient text has NO overlap → null (Stage B will handle)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'flexible';
    catalog.services[0]!.matcher_hints = { examples: ['htn check'] };

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'completely unrelated complaint about something else'
    );

    expect(r).toBeNull();
  });

  it('B3: flexible + label-only (no hints) + patient text contains label → match high, autoFinalize=true', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[1]!.scope_mode = 'flexible'; // gp row, label "General physician"

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'I need general physician for a quick check'
    );

    expect(r?.offering.service_key).toBe('gp');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
  });

  // --- Cells C1–C3: strict downgrade + legacy include_when asymmetry ---

  it('C1: strict + label-only (no hints) + patient text contains label → match medium, autoFinalize=false (downgrade)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[1]!.scope_mode = 'strict';

    const r = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'I need general physician for a quick check'
    );

    expect(r?.offering.service_key).toBe('gp');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
  });

  it('C2: strict + legacy include_when only + overlap → null (no example-phrase corroboration)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'strict';
    catalog.services[0]!.matcher_hints = {
      include_when: 'diabetes hypertension hypothyroidism',
    };

    const r = runDeterministicServiceCatalogMatchStageA(catalog, 'hypertension follow-up review');

    expect(r).toBeNull();
  });

  it('C3: flexible + legacy include_when only + overlap (no examples, no label hit) → null (legacy_merge yields 0 score)', () => {
    const catalog = catalogNcdGpOther();
    catalog.services[0]!.scope_mode = 'flexible';
    catalog.services[0]!.matcher_hints = {
      include_when: 'diabetes hypertension hypothyroidism',
    };

    // Patient text overlaps `include_when` ('hypertension') but has no label/desc
    // hit and no example-phrase hit. Resolver returns examplePhrases=[] (legacy
    // keywords absent), so matcherHintScore loops over zero phrases → score 0
    // → falls through to `null` even though legacyIncludeWhen *did* pass the
    // overlap gate. This pins the documented asymmetry: include_when is a gate,
    // never a positive signal.
    const r = runDeterministicServiceCatalogMatchStageA(catalog, 'hypertension please');

    expect(r).toBeNull();
  });
});
