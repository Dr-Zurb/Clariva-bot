import { describe, it, expect } from '@jest/globals';

import {
  previewMatchRequestSchemaForTests,
  resolveCatalogPreviewMatchEnabled,
  summarizePreviewMatchResult,
} from '../../../src/routes/api/v1/catalog';
import { SERVICE_CATALOG_MATCH_REASON_CODES } from '../../../src/types/conversation';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';
import type { ServiceCatalogMatchResult } from '../../../src/services/service-catalog-matcher';

const sid = (key: string) => deterministicServiceIdForLegacyOffering('preview-test-doc', key);

function tinyCatalog(): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: sid('skin'),
        service_key: 'skin',
        label: 'Dermatology',
        modalities: { video: { enabled: true, price_minor: 100_00 } },
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

function baseResult(overrides: Partial<ServiceCatalogMatchResult> = {}): ServiceCatalogMatchResult {
  return {
    catalogServiceKey: 'skin',
    catalogServiceId: sid('skin'),
    suggestedModality: 'video',
    confidence: 'high',
    reasonCodes: [],
    candidateLabels: [
      { service_key: 'skin', label: 'Dermatology' },
      { service_key: 'other', label: 'Other / not listed' },
    ],
    source: 'deterministic',
    pendingStaffReview: false,
    autoFinalize: true,
    mixedComplaints: false,
    ...overrides,
  };
}

describe('Plan service-catalog-matcher-routing-v2 / Task 10 — preview-match route helpers', () => {
  describe('previewMatchRequestSchema', () => {
    it('accepts a minimal valid payload (catalog + reasonForVisitText)', () => {
      const ok = previewMatchRequestSchemaForTests.safeParse({
        catalog: tinyCatalog(),
        reasonForVisitText: 'red rash on arm',
      });
      expect(ok.success).toBe(true);
    });

    it('accepts optional recentUserMessages and doctorProfile', () => {
      const ok = previewMatchRequestSchemaForTests.safeParse({
        catalog: tinyCatalog(),
        reasonForVisitText: 'red rash on arm',
        recentUserMessages: ['hi', 'I have a rash'],
        doctorProfile: { specialty: 'Dermatology', practiceName: 'Skin Clinic' },
      });
      expect(ok.success).toBe(true);
    });

    it('rejects empty reasonForVisitText (after trim)', () => {
      const bad = previewMatchRequestSchemaForTests.safeParse({
        catalog: tinyCatalog(),
        reasonForVisitText: '   ',
      });
      expect(bad.success).toBe(false);
    });

    it('rejects missing catalog', () => {
      const bad = previewMatchRequestSchemaForTests.safeParse({
        reasonForVisitText: 'red rash on arm',
      });
      expect(bad.success).toBe(false);
    });

    it('rejects unknown top-level keys (strict)', () => {
      const bad = previewMatchRequestSchemaForTests.safeParse({
        catalog: tinyCatalog(),
        reasonForVisitText: 'red rash on arm',
        nonsenseField: 'oops',
      });
      expect(bad.success).toBe(false);
    });

    it('caps recentUserMessages at 8 entries', () => {
      const bad = previewMatchRequestSchemaForTests.safeParse({
        catalog: tinyCatalog(),
        reasonForVisitText: 'red rash on arm',
        recentUserMessages: Array.from({ length: 9 }, (_, i) => `m${i}`),
      });
      expect(bad.success).toBe(false);
    });
  });

  describe('summarizePreviewMatchResult — source → path translation', () => {
    it('source="llm" → path="stage_b"', () => {
      const s = summarizePreviewMatchResult(
        baseResult({ source: 'llm', confidence: 'medium' }),
        'Dermatology',
        true
      );
      expect(s.path).toBe('stage_b');
      expect(s.matchedServiceKey).toBe('skin');
      expect(s.matchedLabel).toBe('Dermatology');
      expect(s.confidence).toBe('medium');
      expect(s.llmAvailable).toBe(true);
    });

    it('source="fallback" → path="fallback"', () => {
      const s = summarizePreviewMatchResult(
        baseResult({
          source: 'fallback',
          catalogServiceKey: 'other',
          confidence: 'low',
          autoFinalize: false,
          reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH],
        }),
        'Other / not listed',
        true
      );
      expect(s.path).toBe('fallback');
      expect(s.matchedServiceKey).toBe('other');
      expect(s.confidence).toBe('low');
      expect(s.autoFinalize).toBe(false);
    });

    it('source="deterministic" + no SINGLE_FEE_MODE reason code → path="stage_a"', () => {
      const s = summarizePreviewMatchResult(
        baseResult({ source: 'deterministic', reasonCodes: ['DETERMINISTIC_HINT_MATCH'] }),
        'Dermatology',
        true
      );
      expect(s.path).toBe('stage_a');
    });

    it('source="deterministic" + SINGLE_FEE_MODE reason code → path="single_fee"', () => {
      const s = summarizePreviewMatchResult(
        baseResult({
          source: 'deterministic',
          reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_FEE_MODE],
        }),
        'Consultation',
        true
      );
      expect(s.path).toBe('single_fee');
    });

    it('passes llmAvailable through verbatim (false propagates so UI can warn on fallback)', () => {
      const s = summarizePreviewMatchResult(
        baseResult({ source: 'fallback', confidence: 'low' }),
        'Other / not listed',
        false
      );
      expect(s.llmAvailable).toBe(false);
      expect(s.path).toBe('fallback');
    });

    it('coerces missing suggestedModality to null (UI never sees undefined)', () => {
      const r = baseResult({ source: 'llm' });
      delete r.suggestedModality;
      const s = summarizePreviewMatchResult(r, 'Dermatology', true);
      expect(s.suggestedModality).toBeNull();
    });

    it('preserves mixedComplaints flag from matcher', () => {
      const s = summarizePreviewMatchResult(
        baseResult({ source: 'llm', mixedComplaints: true }),
        'Dermatology',
        true
      );
      expect(s.mixedComplaints).toBe(true);
    });
  });

  describe('resolveCatalogPreviewMatchEnabled — env gating', () => {
    it('flag=true → enabled regardless of NODE_ENV', () => {
      expect(resolveCatalogPreviewMatchEnabled({ flag: true, nodeEnv: 'production' })).toBe(true);
      expect(resolveCatalogPreviewMatchEnabled({ flag: true, nodeEnv: 'development' })).toBe(true);
    });

    it('flag=false → disabled regardless of NODE_ENV', () => {
      expect(resolveCatalogPreviewMatchEnabled({ flag: false, nodeEnv: 'development' })).toBe(false);
      expect(resolveCatalogPreviewMatchEnabled({ flag: false, nodeEnv: 'production' })).toBe(false);
    });

    it('flag=undefined (auto) → enabled in development and test, disabled in production', () => {
      expect(resolveCatalogPreviewMatchEnabled({ flag: undefined, nodeEnv: 'development' })).toBe(
        true
      );
      expect(resolveCatalogPreviewMatchEnabled({ flag: undefined, nodeEnv: 'test' })).toBe(true);
      expect(resolveCatalogPreviewMatchEnabled({ flag: undefined, nodeEnv: 'production' })).toBe(
        false
      );
    });
  });
});
