import { describe, expect, it } from '@jest/globals';
import {
  COMPLAINT_CLARIFICATION_MAX_ATTEMPTS,
  COMPLAINT_CLARIFICATION_RESPONSE_EN,
  countRealCatalogServices,
  resolveComplaintClarificationMessage,
  shouldRequestComplaintClarification,
} from '../../../src/utils/complaint-clarification';
import type { ServiceCatalogV1 } from '../../../src/utils/service-catalog-schema';

/**
 * Task 05: unit coverage for the clarification utility. The webhook handler depends on this
 * behaving as a pure function — locale-aware copy, deterministic predicate — so we lock it down
 * at the module boundary and skip heavier handler integration.
 */

function makeCatalog(keys: string[]): ServiceCatalogV1 {
  return {
    version: 1,
    services: keys.map((key) => ({
      service_id: `00000000-0000-0000-0000-${key.padStart(12, '0')}`,
      service_key: key,
      label: key === 'other' ? 'Other' : key,
      modalities: { video: { enabled: true, price_minor: 10_00 } },
    })),
  };
}

describe('complaint-clarification (Task 05)', () => {
  describe('resolveComplaintClarificationMessage', () => {
    it('returns English copy for empty / English text', () => {
      expect(resolveComplaintClarificationMessage('')).toBe(COMPLAINT_CLARIFICATION_RESPONSE_EN);
      expect(resolveComplaintClarificationMessage('I have a few things going on')).toBe(
        COMPLAINT_CLARIFICATION_RESPONSE_EN
      );
    });

    it('returns Devanagari Hindi for Devanagari input', () => {
      const msg = resolveComplaintClarificationMessage('मुझे कई समस्याएँ हैं');
      expect(msg).toMatch(/आपने/);
      expect(msg).not.toMatch(/Aapne/);
    });

    it('returns Romanized Hindi for Hinglish input (no Devanagari)', () => {
      const msg = resolveComplaintClarificationMessage('Mujhe kai problems hain aaj');
      expect(msg).toMatch(/Aapne/);
      expect(msg).not.toMatch(/आपने/);
    });

    it('returns Gurmukhi Punjabi for Gurmukhi input', () => {
      const msg = resolveComplaintClarificationMessage('ਮੈਨੂੰ ਕਈ ਤਕਲੀਫ਼ਾਂ ਹਨ');
      expect(msg).toMatch(/ਤੁਸੀਂ/);
      expect(msg).not.toMatch(/Tussi/);
    });

    it('returns Romanized Punjabi for Latin Punjabi markers (no Gurmukhi)', () => {
      const msg = resolveComplaintClarificationMessage('Menu kai problems ne');
      expect(msg).toMatch(/Tussi/);
      expect(msg).not.toMatch(/ਤੁਸੀਂ/);
    });

    it('never echoes patient text (no PHI leakage)', () => {
      const phi = 'BP 180/110 and chest pain and rash on arm';
      const msg = resolveComplaintClarificationMessage(phi);
      expect(msg).not.toContain('BP');
      expect(msg).not.toContain('chest');
      expect(msg).not.toContain('rash');
    });
  });

  describe('countRealCatalogServices', () => {
    it('excludes the catch-all "other" row', () => {
      expect(countRealCatalogServices(makeCatalog(['skin', 'gp', 'other']))).toBe(2);
      expect(countRealCatalogServices(makeCatalog(['other']))).toBe(0);
      expect(countRealCatalogServices(makeCatalog(['only']))).toBe(1);
    });

    it('treats casing / whitespace variants of "other" as catch-all', () => {
      expect(countRealCatalogServices(makeCatalog([' Other ', 'skin']))).toBe(1);
    });
  });

  describe('shouldRequestComplaintClarification', () => {
    const baseCatalog = makeCatalog(['skin', 'gp', 'other']);
    const baseInput = {
      mixedComplaints: true as boolean,
      confidence: 'low' as const,
      catalog: baseCatalog,
      pendingStaffServiceReview: false,
      attemptCount: 0,
    };

    it('returns true for the textbook trigger case (mixed+low+multi+attempts left)', () => {
      expect(shouldRequestComplaintClarification(baseInput)).toBe(true);
    });

    it('returns false when mixedComplaints is false', () => {
      expect(
        shouldRequestComplaintClarification({ ...baseInput, mixedComplaints: false })
      ).toBe(false);
    });

    it('returns false for medium / high confidence (matcher is sure enough)', () => {
      expect(
        shouldRequestComplaintClarification({ ...baseInput, confidence: 'medium' })
      ).toBe(false);
      expect(
        shouldRequestComplaintClarification({ ...baseInput, confidence: 'high' })
      ).toBe(false);
    });

    it('returns false when staff service review is already pending', () => {
      expect(
        shouldRequestComplaintClarification({ ...baseInput, pendingStaffServiceReview: true })
      ).toBe(false);
    });

    it('returns false once the per-event attempt cap is hit', () => {
      expect(
        shouldRequestComplaintClarification({
          ...baseInput,
          attemptCount: COMPLAINT_CLARIFICATION_MAX_ATTEMPTS,
        })
      ).toBe(false);
    });

    it('returns false when catalog has ≤1 real service (nothing to disambiguate)', () => {
      const onlyCatchAll = makeCatalog(['other']);
      expect(
        shouldRequestComplaintClarification({ ...baseInput, catalog: onlyCatchAll })
      ).toBe(false);
      const singleReal = makeCatalog(['only', 'other']);
      expect(
        shouldRequestComplaintClarification({ ...baseInput, catalog: singleReal })
      ).toBe(false);
    });

    // Task 10 (Plan 03): guard single-fee doctors even when the catalog is synthetic-multi
    // (belt-and-suspenders: catalog for single-fee is always one entry, but the mode flag
    // is the source of truth, not cardinality).
    it('returns false when catalogMode is "single_fee" (even with a multi-service catalog)', () => {
      expect(
        shouldRequestComplaintClarification({ ...baseInput, catalogMode: 'single_fee' })
      ).toBe(false);
    });

    it('keeps pre-Task-10 behavior for catalogMode "multi_service" and null/undefined', () => {
      expect(
        shouldRequestComplaintClarification({ ...baseInput, catalogMode: 'multi_service' })
      ).toBe(true);
      expect(shouldRequestComplaintClarification({ ...baseInput, catalogMode: null })).toBe(
        true
      );
      expect(
        shouldRequestComplaintClarification({ ...baseInput, catalogMode: undefined })
      ).toBe(true);
    });
  });

  it('attempt cap is 1 (simplified one-round policy per task 05 plan)', () => {
    expect(COMPLAINT_CLARIFICATION_MAX_ATTEMPTS).toBe(1);
  });
});
