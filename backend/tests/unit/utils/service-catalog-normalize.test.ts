import { describe, it, expect } from '@jest/globals';
import { mergeServiceCatalogOnSave } from '../../../src/utils/service-catalog-normalize';
import { CATALOG_CATCH_ALL_SERVICE_KEY } from '../../../src/utils/service-catalog-schema';
import type { ServiceCatalogV1 } from '../../../src/utils/service-catalog-schema';

const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('mergeServiceCatalogOnSave (ARM-01 key promotion)', () => {
  it('promotes incoming service_key to catch-all when same service_id and incoming sends other', () => {
    const previous: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          service_key: 'misc_bucket',
          label: 'Other visits',
          modalities: { video: { enabled: true, price_minor: 100 } },
        },
        {
          service_id: '22222222-2222-4222-8222-222222222222',
          service_key: 'general',
          label: 'General',
          modalities: { video: { enabled: true, price_minor: 200 } },
        },
      ],
    };
    const incoming: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
          label: 'Other / not listed',
          modalities: { video: { enabled: true, price_minor: 100 } },
        },
        {
          service_id: '22222222-2222-4222-8222-222222222222',
          service_key: 'general',
          label: 'General',
          modalities: { video: { enabled: true, price_minor: 200 } },
        },
      ],
    };
    const out = mergeServiceCatalogOnSave(DOC, incoming, previous);
    const row = out.services.find((s) => s.service_id === '11111111-1111-4111-8111-111111111111');
    expect(row?.service_key).toBe(CATALOG_CATCH_ALL_SERVICE_KEY);
  });

  it('still preserves immutable key when incoming is not promoting to other', () => {
    const previous: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          service_key: 'general',
          label: 'General',
          modalities: { video: { enabled: true, price_minor: 200 } },
        },
        {
          service_id: '22222222-2222-4222-8222-222222222222',
          service_key: 'other',
          label: 'Other / not listed',
          modalities: { video: { enabled: true, price_minor: 50 } },
        },
      ],
    };
    const incoming: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          service_key: 'renamed_key_attempt',
          label: 'Renamed label',
          modalities: { video: { enabled: true, price_minor: 200 } },
        },
        {
          service_id: '22222222-2222-4222-8222-222222222222',
          service_key: 'other',
          label: 'Other / not listed',
          modalities: { video: { enabled: true, price_minor: 50 } },
        },
      ],
    };
    const out = mergeServiceCatalogOnSave(DOC, incoming, previous);
    const g = out.services.find((s) => s.service_id === '11111111-1111-4111-8111-111111111111');
    expect(g?.service_key).toBe('general');
  });
});
