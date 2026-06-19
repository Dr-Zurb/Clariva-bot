import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ADDITIONAL_MEDICATIONS_SECTION_ID,
  CHART_MED_CARD_INSTANCE_ATTR,
  CHART_MED_COLLAPSE_HEADER_ATTR,
  scrollChartMedCaptureIntoView,
  scrollChartMedCardHeaderIntoView,
} from "@/lib/chart/chart-medication-scroll";

describe("scrollChartMedCardHeaderIntoView", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the expanded card header into view", () => {
    document.body.innerHTML = `
      <div ${CHART_MED_CARD_INSTANCE_ATTR}="med-1">
        <div ${CHART_MED_COLLAPSE_HEADER_ATTR}>Header</div>
      </div>
    `;

    scrollChartMedCardHeaderIntoView("med-1");

    const header = document.querySelector(`[${CHART_MED_COLLAPSE_HEADER_ATTR}]`);
    expect(header).not.toBeNull();
    expect(header?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
  });

  it("no-ops when the instance is missing", () => {
    document.body.innerHTML = "";
    expect(() => scrollChartMedCardHeaderIntoView("missing")).not.toThrow();
  });
});

describe("scrollChartMedCaptureIntoView", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the med subsection wrapper when present", () => {
    document.body.innerHTML = `<section id="${ADDITIONAL_MEDICATIONS_SECTION_ID}">Meds</section>`;

    scrollChartMedCaptureIntoView({
      sectionId: ADDITIONAL_MEDICATIONS_SECTION_ID,
      captureInputId: "additional-med-capture",
    });

    const section = document.getElementById(ADDITIONAL_MEDICATIONS_SECTION_ID);
    expect(section?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("falls back to the capture input when the section is absent", () => {
    document.body.innerHTML = `<input id="condition-med-capture-c1" />`;

    scrollChartMedCaptureIntoView({
      sectionId: "missing-section",
      captureInputId: "condition-med-capture-c1",
    });

    const input = document.getElementById("condition-med-capture-c1");
    expect(input?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });
});
