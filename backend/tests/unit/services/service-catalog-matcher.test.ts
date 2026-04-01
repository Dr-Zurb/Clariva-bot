import { describe, it, expect } from '@jest/globals';
import {
  matchServiceCatalogOffering,
  resolveCatalogOfferingByKey,
  runDeterministicServiceCatalogMatchStageA,
  pickSuggestedModality,
  type ServiceCatalogMatchMetricEvent,
} from '../../../src/services/service-catalog-matcher';
import { SERVICE_CATALOG_MATCH_REASON_CODES } from '../../../src/types/conversation';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const sid = (key: string) => deterministicServiceIdForLegacyOffering('matcher-test-doc', key);

function catalogSkinGpOther(): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: sid('skin'),
        service_key: 'skin',
        label: 'Dermatology',
        modalities: {
          video: { enabled: true, price_minor: 100_00 },
        },
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
        modalities: {
          video: { enabled: true, price_minor: 90_00 },
        },
      },
    ],
  };
}

describe('service-catalog-matcher (ARM-04)', () => {
  const correlationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  it('returns null for empty catalog', async () => {
    const r = await matchServiceCatalogOffering(
      {
        catalog: null,
        reasonForVisitText: 'rash',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r).toBeNull();
  });

  it('Stage A: single non-catch offering + other → high, auto-finalize', async () => {
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
          label: 'Other',
          modalities: { video: { enabled: true, price_minor: 50_00 } },
        },
      ],
    };
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'anything',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('only_svc');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
    expect(r?.pendingStaffReview).toBe(false);
    expect(r?.source).toBe('deterministic');
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_SERVICE_CATALOG);
  });

  it('Stage A: unique label substring → high, finalize', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'I need dermatology for a rash',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('skin');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH);
  });

  it('Stage A: ARM-02 matcher_hints unique winner → medium, staff review', async () => {
    const catalog = catalogSkinGpOther();
    catalog.services[1]!.matcher_hints = {
      keywords: 'fever, cold',
      include_when: '',
      exclude_when: '',
    };

    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'fever since yesterday',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('gp');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
    expect(r?.pendingStaffReview).toBe(true);
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.KEYWORD_HINT_MATCH);
  });

  it('skipLlm + no Stage A match → fallback other, low', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'something vague',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('other');
    expect(r?.confidence).toBe('low');
    expect(r?.source).toBe('fallback');
    expect(r?.pendingStaffReview).toBe(true);
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH);
  });

  it('mock LLM returns valid key → llm source', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'unclear symptoms',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'skin',
            modality: 'video',
            match_confidence: 'high',
          }),
      }
    );
    expect(r?.source).toBe('llm');
    expect(r?.catalogServiceKey).toBe('skin');
    expect(r?.autoFinalize).toBe(true);
    expect(r?.suggestedModality).toBe('video');
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.SERVICE_MATCH_LLM);
  });

  it('mock LLM returns hallucinated key → fallback other', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'test',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'fake_neurology',
            modality: null,
            match_confidence: 'high',
          }),
      }
    );
    expect(r?.catalogServiceKey).toBe('other');
    expect(r?.source).toBe('fallback');
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.MATCHER_ERROR);
  });

  it('resolveCatalogOfferingByKey rejects unknown key', () => {
    const catalog = catalogSkinGpOther();
    expect(resolveCatalogOfferingByKey(catalog, 'nope')).toBeNull();
    expect(resolveCatalogOfferingByKey(catalog, 'skin')?.service_key).toBe('skin');
  });

  it('pickSuggestedModality returns undefined when multiple enabled', () => {
    const catalog = catalogSkinGpOther();
    const gp = catalog.services.find((s) => s.service_key === 'gp')!;
    expect(pickSuggestedModality(gp)).toBeUndefined();
    const skin = catalog.services.find((s) => s.service_key === 'skin')!;
    expect(pickSuggestedModality(skin)).toBe('video');
  });

  it('metrics hook receives events', async () => {
    const catalog = catalogSkinGpOther();
    const events: ServiceCatalogMatchMetricEvent[] = [];
    await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'dermatology',
        correlationId,
      },
      {
        skipLlm: true,
        metrics: (e) => events.push(e),
      }
    );
    expect(events.length).toBe(1);
    expect(events[0]!.source).toBe('deterministic');
    expect(events[0]!.llmParseFailed).toBe(false);
  });

  it('runDeterministicServiceCatalogMatchStageA returns null when ambiguous hints tie', () => {
    const catalog = catalogSkinGpOther();
    catalog.services[0]!.matcher_hints = { keywords: 'pain' };
    catalog.services[1]!.matcher_hints = { keywords: 'pain' };
    const a = runDeterministicServiceCatalogMatchStageA(catalog, 'pain in body');
    expect(a).toBeNull();
  });
});
