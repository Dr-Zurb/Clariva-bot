/**
 * ARM-09: non-PHI booking hints for GET slot-page-info from conversation state (testable pure helpers).
 */

import { isSlotBookingBlockedPendingStaffReview } from '../types/conversation';
import type { ConversationState, ServiceCatalogMatchConfidence } from '../types/conversation';

export interface SlotPageBookingHints {
  suggestedCatalogServiceKey?: string;
  suggestedCatalogServiceId?: string;
  suggestedConsultationModality?: 'text' | 'voice' | 'video';
  matchConfidence?: ServiceCatalogMatchConfidence;
  serviceSelectionFinalized?: boolean;
  /**
   * When true, the visit type was fixed in chat (staff-confirmed or auto-finalized high-confidence).
   * /book should not let the patient switch to another catalog row to shop a lower price.
   */
  servicePickerLocked?: boolean;
}

/**
 * Derive hints only when selection is conversation-final and staff-review is not blocking.
 * Never surfaces matcher proposal alone (medium/low) — avoids price-shopping on a non-final key.
 */
export function deriveSlotPageBookingHints(state: ConversationState): SlotPageBookingHints {
  if (isSlotBookingBlockedPendingStaffReview(state)) {
    return {};
  }
  if (state.serviceSelectionFinalized !== true) {
    return {};
  }
  const key = state.catalogServiceKey?.trim().toLowerCase();
  if (!key) {
    return {};
  }

  const hints: SlotPageBookingHints = {
    suggestedCatalogServiceKey: key,
    serviceSelectionFinalized: true,
    servicePickerLocked: true,
  };

  const id = state.catalogServiceId?.trim();
  if (id) {
    hints.suggestedCatalogServiceId = id;
  }

  const mod = state.consultationModality;
  if (mod === 'text' || mod === 'voice' || mod === 'video') {
    hints.suggestedConsultationModality = mod;
  }

  const conf = state.serviceCatalogMatchConfidence;
  if (conf === 'high' || conf === 'medium' || conf === 'low') {
    hints.matchConfidence = conf;
  }

  return hints;
}

/** Drop hint fields if the suggested key is not in the token-scoped catalog (stale / doctor edited matrix). */
export function narrowSlotPageBookingHintsToCatalog(
  hints: SlotPageBookingHints,
  allowedServiceKeysLower: Set<string>
): SlotPageBookingHints {
  if (!hints.suggestedCatalogServiceKey) {
    return {};
  }
  if (!allowedServiceKeysLower.has(hints.suggestedCatalogServiceKey)) {
    return {};
  }
  return { ...hints };
}
