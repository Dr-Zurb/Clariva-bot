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
