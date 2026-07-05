import {
  scrollCollapsibleToStickyTop,
} from "@/lib/cockpit/collapse-scroll";

/** Scroll anchor on the expanded chart-med collapse header row. */
export const CHART_MED_COLLAPSE_HEADER_ATTR = "data-chart-med-collapse-header";

/** Instance id on the chart-med card root (summary chip or expanded card). */
export const CHART_MED_CARD_INSTANCE_ATTR = "data-chart-med-instance";

/** Wrapper id for the "Additional medications" block in problem-oriented PMH. */
export const ADDITIONAL_MEDICATIONS_SECTION_ID = "additional-medications";

/** Capture input id for the standalone medications section. */
export const MEDICATIONS_SECTION_CAPTURE_INPUT_ID = "medications-capture";

/** Wrapper id for the standalone medications section. */
export const MEDICATIONS_SECTION_ID = "medications-section";

export function conditionMedSectionId(conditionId: string): string {
  return `condition-meds-${conditionId}`;
}

export interface ScrollChartMedContainerOptions {
  /** Fallback "bigger container" (standalone / unlinked meds) when the card is not nested inside a condition. */
  sectionId?: string;
}

/**
 * OPEN: glide the expanded card's collapse header smoothly to the top of the scroll
 * area, landing just beneath the live stack of sticky headers so it is never cut off
 * (mirrors chief complaints). Depth-agnostic — works both standalone and nested
 * inside a condition card.
 */
export function scrollChartMedCardHeaderIntoView(medId: string): void {
  if (typeof document === "undefined" || !medId) return;

  const root = document.querySelector(`[${CHART_MED_CARD_INSTANCE_ATTR}="${medId}"]`);
  const header = root?.querySelector(`[${CHART_MED_COLLAPSE_HEADER_ATTR}]`);
  if (header instanceof HTMLElement) {
    scrollCollapsibleToStickyTop(header);
  }
}

/**
 * CLOSE: glide the card's "bigger container" back to the top — the enclosing
 * condition card when nested (so collapsing e.g. Amlodipine returns to the
 * Hypertension card), otherwise the standalone medications section. Smooth.
 */
export function scrollChartMedContainerIntoView(
  medId: string,
  options: ScrollChartMedContainerOptions = {},
): void {
  if (typeof document === "undefined" || !medId) return;

  const root = document.querySelector(`[${CHART_MED_CARD_INSTANCE_ATTR}="${medId}"]`);

  const conditionCard =
    root instanceof HTMLElement
      ? root.closest<HTMLElement>('[data-testid^="condition-card-"]')
      : null;
  if (conditionCard) {
    scrollCollapsibleToStickyTop(conditionCard);
    return;
  }

  if (options.sectionId) {
    const section = document.getElementById(options.sectionId);
    if (section instanceof HTMLElement) {
      scrollCollapsibleToStickyTop(section);
    }
  }
}

const NUDGE_RING_CLASS = ["ring-2", "ring-primary/60", "ring-offset-1"] as const;

/**
 * Scroll an existing med card into view and briefly ring it when the doctor
 * tries to add the same drug again.
 */
export function nudgeChartMedCard(medId: string): void {
  if (typeof document === "undefined" || !medId) return;

  const root = document.querySelector(`[${CHART_MED_CARD_INSTANCE_ATTR}="${medId}"]`);
  if (!(root instanceof HTMLElement)) return;

  root.scrollIntoView({ block: "nearest", behavior: "smooth" });
  root.classList.add(...NUDGE_RING_CLASS);
  window.setTimeout(() => root.classList.remove(...NUDGE_RING_CLASS), 2000);
}
