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

export interface ScrollChartMedCaptureOptions {
  /** Preferred — keeps the subsection title + capture bar visible. */
  sectionId?: string;
  /** Fallback when the section wrapper is absent (tests / legacy markup). */
  captureInputId?: string;
}

/**
 * After expanding a chart-med card, align its collapse header to the top of the
 * nearest scroll container so the body expands downward (mirrors chief complaints).
 */
export function scrollChartMedCardHeaderIntoView(medId: string): void {
  if (typeof document === "undefined" || !medId) return;

  const root = document.querySelector(`[${CHART_MED_CARD_INSTANCE_ATTR}="${medId}"]`);
  const header = root?.querySelector(`[${CHART_MED_COLLAPSE_HEADER_ATTR}]`);
  if (header instanceof HTMLElement) {
    header.scrollIntoView({ block: "start", behavior: "auto" });
  }
}

/**
 * After a deliberate card collapse, bring the med capture subsection back into
 * view so the doctor can add another medicine. Scrolls the section wrapper when
 * present; does not focus the input (avoids keyboard steal).
 */
export function scrollChartMedCaptureIntoView(options: ScrollChartMedCaptureOptions): void {
  if (typeof document === "undefined") return;

  const { sectionId, captureInputId } = options;

  if (sectionId) {
    const section = document.getElementById(sectionId);
    if (section && "scrollIntoView" in section) {
      section.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
  }

  if (captureInputId) {
    const input = document.getElementById(captureInputId);
    if (input && "scrollIntoView" in input) {
      input.scrollIntoView({ block: "start", behavior: "smooth" });
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
