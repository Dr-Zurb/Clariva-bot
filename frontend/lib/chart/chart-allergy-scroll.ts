import {
  reAnchorCollapsibleOnClose,
  scrollCollapsibleToStickyTop,
} from "@/lib/cockpit/collapse-scroll";

/** Wrapper id for the allergies capture block (combobox + quick-add). */
export const ALLERGIES_CAPTURE_SECTION_ID = "allergies-capture";

/** After expand — glide the card beneath the stacked sticky headers (L0 + L1). */
export function scrollAllergyCardHeaderIntoView(cardEl: HTMLElement | null): void {
  scrollCollapsibleToStickyTop(cardEl);
}

/**
 * After a deliberate collapse — settle the closing card back to its sticky line as a
 * single fold-locked motion (pull-up-only), the same gesture the exam finding cards
 * use. This reveals the capture block / sibling cards above without the aggressive
 * re-glide that the old capture-section jump produced.
 */
export function reAnchorAllergyCardOnClose(cardEl: HTMLElement | null): void {
  reAnchorCollapsibleOnClose(cardEl);
}
