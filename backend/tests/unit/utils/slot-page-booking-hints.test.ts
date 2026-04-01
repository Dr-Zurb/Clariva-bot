import { describe, it, expect } from '@jest/globals';
import {
  deriveSlotPageBookingHints,
  narrowSlotPageBookingHintsToCatalog,
} from '../../../src/utils/slot-page-booking-hints';

describe('slot-page-booking-hints (ARM-09)', () => {
  it('returns empty hints when staff review is still blocking', () => {
    const h = deriveSlotPageBookingHints({
      serviceSelectionFinalized: false,
      pendingStaffServiceReview: true,
      catalogServiceKey: 'skin',
      matcherProposedCatalogServiceKey: 'skin',
      serviceCatalogMatchConfidence: 'medium',
    });
    expect(h).toEqual({});
  });

  it('returns empty hints when selection is not finalized', () => {
    const h = deriveSlotPageBookingHints({
      serviceSelectionFinalized: false,
      pendingStaffServiceReview: false,
      catalogServiceKey: 'skin',
      serviceCatalogMatchConfidence: 'high',
    });
    expect(h).toEqual({});
  });

  it('returns locked suggestion when finalized with catalog key', () => {
    const h = deriveSlotPageBookingHints({
      serviceSelectionFinalized: true,
      pendingStaffServiceReview: false,
      catalogServiceKey: 'Skin',
      catalogServiceId: 'id-1',
      consultationModality: 'video',
      serviceCatalogMatchConfidence: 'high',
    });
    expect(h).toMatchObject({
      suggestedCatalogServiceKey: 'skin',
      suggestedCatalogServiceId: 'id-1',
      suggestedConsultationModality: 'video',
      matchConfidence: 'high',
      serviceSelectionFinalized: true,
      servicePickerLocked: true,
    });
  });

  it('drops hints when suggested key is not in token catalog', () => {
    const raw = deriveSlotPageBookingHints({
      serviceSelectionFinalized: true,
      catalogServiceKey: 'legacy_removed',
    });
    const narrowed = narrowSlotPageBookingHintsToCatalog(raw, new Set(['skin', 'other']));
    expect(narrowed).toEqual({});
  });

  it('keeps hints when key matches catalog', () => {
    const raw = deriveSlotPageBookingHints({
      serviceSelectionFinalized: true,
      catalogServiceKey: 'skin',
      consultationModality: 'voice',
    });
    const narrowed = narrowSlotPageBookingHintsToCatalog(raw, new Set(['skin']));
    expect(narrowed.suggestedCatalogServiceKey).toBe('skin');
    expect(narrowed.suggestedConsultationModality).toBe('voice');
    expect(narrowed.servicePickerLocked).toBe(true);
  });
});
