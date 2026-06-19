/** Wrapper id for the allergies capture block (combobox + quick-add). */
export const ALLERGIES_CAPTURE_SECTION_ID = "allergies-capture";

export interface ScrollAllergyCaptureOptions {
  sectionId?: string;
  captureInputId?: string;
}

/** After expand — align the collapse header to the top of the scroll container. */
export function scrollAllergyCardHeaderIntoView(headerEl: HTMLElement | null): void {
  headerEl?.scrollIntoView({ block: "start", behavior: "auto" });
}

/** After deliberate collapse — bring the capture subsection back into view. */
export function scrollAllergyCaptureIntoView(options: ScrollAllergyCaptureOptions): void {
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
