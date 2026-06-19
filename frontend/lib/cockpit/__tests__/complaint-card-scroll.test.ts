import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CHIEF_COMPLAINTS_SECTION_ID,
  COMPLAINT_CAPTURE_INPUT_ID,
  COMPLAINT_CARD_HEADER_ATTR,
  COMPLAINT_CARD_INSTANCE_ATTR,
  scrollComplaintCaptureIntoView,
  scrollComplaintCardHeaderIntoView,
} from "@/lib/cockpit/complaint-card-scroll";

describe("scrollComplaintCardHeaderIntoView", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the expanded card header into view", () => {
    document.body.innerHTML = `
      <div ${COMPLAINT_CARD_INSTANCE_ATTR}="row-1">
        <div ${COMPLAINT_CARD_HEADER_ATTR}>Header</div>
      </div>
    `;

    scrollComplaintCardHeaderIntoView("row-1");

    const header = document.querySelector(`[${COMPLAINT_CARD_HEADER_ATTR}]`);
    expect(header).not.toBeNull();
    expect(header?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
  });

  it("no-ops when the instance is missing", () => {
    document.body.innerHTML = "";
    expect(() => scrollComplaintCardHeaderIntoView("missing")).not.toThrow();
  });
});

describe("scrollComplaintCaptureIntoView", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the whole chief-complaints section into view", () => {
    document.body.innerHTML = `
      <section id="${CHIEF_COMPLAINTS_SECTION_ID}">
        <input id="${COMPLAINT_CAPTURE_INPUT_ID}" />
      </section>
    `;

    const section = document.getElementById(CHIEF_COMPLAINTS_SECTION_ID)!;
    const sectionSpy = vi.spyOn(section, "scrollIntoView").mockImplementation(() => {});

    scrollComplaintCaptureIntoView();

    expect(sectionSpy).toHaveBeenCalledTimes(1);
    expect(sectionSpy).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("falls back to the capture input when the section is missing", () => {
    document.body.innerHTML = `<input id="${COMPLAINT_CAPTURE_INPUT_ID}" />`;

    scrollComplaintCaptureIntoView();

    const input = document.getElementById(COMPLAINT_CAPTURE_INPUT_ID);
    expect(input?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("no-ops when neither the section nor the input exists", () => {
    document.body.innerHTML = "";
    expect(() => scrollComplaintCaptureIntoView()).not.toThrow();
  });
});
