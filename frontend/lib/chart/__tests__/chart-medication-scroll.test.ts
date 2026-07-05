import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ADDITIONAL_MEDICATIONS_SECTION_ID,
  CHART_MED_CARD_INSTANCE_ATTR,
  CHART_MED_COLLAPSE_HEADER_ATTR,
  scrollChartMedContainerIntoView,
  scrollChartMedCardHeaderIntoView,
} from "@/lib/chart/chart-medication-scroll";

describe("scrollChartMedCardHeaderIntoView", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("smoothly glides the expanded card header to the top", () => {
    document.body.innerHTML = `
      <div ${CHART_MED_CARD_INSTANCE_ATTR}="med-1">
        <div ${CHART_MED_COLLAPSE_HEADER_ATTR}>Header</div>
      </div>
    `;

    scrollChartMedCardHeaderIntoView("med-1");

    // No scrollable ancestor in jsdom → the shared glide falls back to native smooth scroll.
    const header = document.querySelector(`[${CHART_MED_COLLAPSE_HEADER_ATTR}]`);
    expect(header).not.toBeNull();
    expect(header?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("no-ops when the instance is missing", () => {
    document.body.innerHTML = "";
    expect(() => scrollChartMedCardHeaderIntoView("missing")).not.toThrow();
  });
});

describe("scrollChartMedContainerIntoView", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("glides the enclosing condition card to the top when nested", () => {
    document.body.innerHTML = `
      <div data-testid="condition-card-c1">
        <div id="condition-meds-c1">
          <div ${CHART_MED_CARD_INSTANCE_ATTR}="med-1">
            <div ${CHART_MED_COLLAPSE_HEADER_ATTR}>Header</div>
          </div>
        </div>
      </div>
    `;

    scrollChartMedContainerIntoView("med-1", { sectionId: "condition-meds-c1" });

    const conditionCard = document.querySelector('[data-testid="condition-card-c1"]');
    expect(conditionCard?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("falls back to the standalone meds section when not nested in a condition", () => {
    document.body.innerHTML = `
      <section id="${ADDITIONAL_MEDICATIONS_SECTION_ID}">
        <div ${CHART_MED_CARD_INSTANCE_ATTR}="med-2">
          <div ${CHART_MED_COLLAPSE_HEADER_ATTR}>Header</div>
        </div>
      </section>
    `;

    scrollChartMedContainerIntoView("med-2", { sectionId: ADDITIONAL_MEDICATIONS_SECTION_ID });

    const section = document.getElementById(ADDITIONAL_MEDICATIONS_SECTION_ID);
    expect(section?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("no-ops when the instance is missing", () => {
    document.body.innerHTML = "";
    expect(() =>
      scrollChartMedContainerIntoView("missing", { sectionId: "nope" }),
    ).not.toThrow();
  });
});
