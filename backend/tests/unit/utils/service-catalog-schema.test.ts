/**
 * SFU-01: service catalog Zod + helpers
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseServiceCatalogV1,
  safeParseServiceCatalogV1FromDb,
} from '../../../src/utils/service-catalog-schema';
import { getActiveServiceCatalog, findServiceOfferingByKey } from '../../../src/utils/service-catalog-helpers';
import { ValidationError } from '../../../src/utils/errors';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

const SVC_ID_A = '11111111-1111-4111-8111-111111111111';
const SVC_ID_B = '22222222-2222-4222-8222-222222222222';

function minimalCatalog() {
  return {
    version: 1 as const,
    services: [
      {
        service_id: SVC_ID_A,
        service_key: 'general',
        label: 'General consult',
        modalities: { text: { enabled: true, price_minor: 100 } },
      },
    ],
  };
}

describe('parseServiceCatalogV1', () => {
  it('accepts minimal valid catalog', () => {
    const data = minimalCatalog();
    const out = parseServiceCatalogV1(data);
    expect(out.version).toBe(1);
    expect(out.services).toHaveLength(1);
    expect(out.services[0]!.service_key).toBe('general');
  });

  it('rejects duplicate service_key', () => {
    expect(() =>
      parseServiceCatalogV1({
        version: 1,
        services: [
          {
            service_id: SVC_ID_A,
            service_key: 'x',
            label: 'A',
            modalities: { voice: { enabled: true, price_minor: 0 } },
          },
          {
            service_id: SVC_ID_B,
            service_key: 'x',
            label: 'B',
            modalities: { video: { enabled: true, price_minor: 1 } },
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it('rejects when no modality enabled', () => {
    expect(() =>
      parseServiceCatalogV1({
        version: 1,
        services: [
          {
            service_id: SVC_ID_A,
            service_key: 'only_off',
            label: 'Nope',
            modalities: {
              text: { enabled: false, price_minor: 0 },
              voice: { enabled: false, price_minor: 0 },
            },
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it('rejects follow-up percent discount > 100', () => {
    expect(() =>
      parseServiceCatalogV1({
        version: 1,
        services: [
          {
            service_id: SVC_ID_A,
            service_key: 'svc',
            label: 'Svc',
            modalities: { text: { enabled: true, price_minor: 1 } },
            followup_policy: {
              enabled: true,
              max_followups: 1,
              eligibility_window_days: 7,
              discount_type: 'percent',
              discount_value: 101,
            },
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it('accepts follow-up policy with discount_tiers (SFU-09 Phase A)', () => {
    const out = parseServiceCatalogV1({
      version: 1,
      services: [
        {
          service_id: SVC_ID_A,
          service_key: 'svc',
          label: 'Svc',
          modalities: { text: { enabled: true, price_minor: 100 } },
          followup_policy: {
            enabled: true,
            max_followups: 2,
            eligibility_window_days: 30,
            discount_type: 'percent',
            discount_value: 10,
            discount_tiers: [
              { from_visit: 2, discount_type: 'percent', discount_value: 25 },
              { from_visit: 3, discount_type: 'free' },
            ],
          },
        },
      ],
    });
    expect(out.services[0]!.followup_policy?.discount_tiers).toHaveLength(2);
  });
});

describe('safeParseServiceCatalogV1FromDb', () => {
  it('returns null for invalid raw JSON', () => {
    expect(safeParseServiceCatalogV1FromDb({ version: 99, services: [] })).toBeNull();
  });

  it('returns null for null', () => {
    expect(safeParseServiceCatalogV1FromDb(null)).toBeNull();
  });

  it('hydrates legacy rows without service_id when doctorId provided', () => {
    const raw = {
      version: 1,
      services: [
        {
          service_key: 'general',
          label: 'General consult',
          modalities: { text: { enabled: true, price_minor: 100 } },
        },
      ],
    };
    const cat = safeParseServiceCatalogV1FromDb(raw, '33333333-3333-4333-8333-333333333333');
    expect(cat).not.toBeNull();
    expect(cat!.services[0]!.service_id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('getActiveServiceCatalog / findServiceOfferingByKey', () => {
  it('returns null when settings or column null', () => {
    expect(getActiveServiceCatalog(null)).toBeNull();
    const row = {
      service_offerings_json: null,
    } as unknown as DoctorSettingsRow;
    expect(getActiveServiceCatalog(row)).toBeNull();
  });

  it('returns null for invalid stored shape', () => {
    const row = {
      doctor_id: '44444444-4444-4444-4444-444444444444',
      service_offerings_json: { bad: true },
    } as unknown as DoctorSettingsRow;
    expect(getActiveServiceCatalog(row)).toBeNull();
  });

  it('findServiceOfferingByKey is case-normalized on lookup', () => {
    const cat = parseServiceCatalogV1(minimalCatalog());
    expect(findServiceOfferingByKey(cat, 'GENERAL')?.label).toBe('General consult');
  });
});
