import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CHIEF_COMPLAINTS_SECTION_ID,
  COMPLAINT_CAPTURE_INPUT_ID,
  COMPLAINT_CARD_HEADER_ATTR,
  COMPLAINT_CARD_INSTANCE_ATTR,
  measurePrecedingComplaintCardStickyOffset,
  scrollComplaintCaptureIntoView,
  scrollComplaintCardIntoView,
  scrollParentComplaintCardIntoView,
} from "@/lib/cockpit/complaint-card-scroll";

describe("scrollComplaintCardIntoView", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("glides the expanded card root into view", () => {
    document.body.innerHTML = `
      <div ${COMPLAINT_CARD_INSTANCE_ATTR}="row-1">
        <div ${COMPLAINT_CARD_HEADER_ATTR}>Header</div>
      </div>
    `;

    scrollComplaintCardIntoView("row-1");

    // No scroll pane in jsdom → the shared glide falls back to native smooth scroll.
    const root = document.querySelector(`[${COMPLAINT_CARD_INSTANCE_ATTR}="row-1"]`);
    expect(root).not.toBeNull();
    expect(root?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("no-ops when the instance is missing", () => {
    document.body.innerHTML = "";
    expect(() => scrollComplaintCardIntoView("missing")).not.toThrow();
  });
});

describe("measurePrecedingComplaintCardStickyOffset", () => {
  it("sums expanded sibling card headers above the target in an associated list", () => {
    document.body.innerHTML = `
      <div ${COMPLAINT_CARD_INSTANCE_ATTR}="parent">
        <div id="associated-list" role="group" aria-label="Associated complaints of Headache">
          <div class="wrap">
            <div ${COMPLAINT_CARD_INSTANCE_ATTR}="card-a">
              <div ${COMPLAINT_CARD_HEADER_ATTR} style="height: 36px">A</div>
            </div>
          </div>
          <div class="wrap">
            <div ${COMPLAINT_CARD_INSTANCE_ATTR}="card-b">
              <div ${COMPLAINT_CARD_HEADER_ATTR} style="height: 36px">B</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const cardB = document.querySelector(
      `[${COMPLAINT_CARD_INSTANCE_ATTR}="card-b"]`,
    ) as HTMLElement;
    const cardAHeader = document.querySelector(
      `[${COMPLAINT_CARD_INSTANCE_ATTR}="card-a"] [${COMPLAINT_CARD_HEADER_ATTR}]`,
    ) as HTMLElement;
    Object.defineProperty(cardAHeader, "offsetHeight", { value: 36, configurable: true });

    expect(measurePrecedingComplaintCardStickyOffset(cardB)).toBe(36);
  });

  it("returns 0 when the card is first in its list", () => {
    document.body.innerHTML = `
      <div id="list">
        <div ${COMPLAINT_CARD_INSTANCE_ATTR}="card-a">
          <div ${COMPLAINT_CARD_HEADER_ATTR}>A</div>
        </div>
      </div>
    `;

    const cardA = document.querySelector(
      `[${COMPLAINT_CARD_INSTANCE_ATTR}="card-a"]`,
    ) as HTMLElement;
    expect(measurePrecedingComplaintCardStickyOffset(cardA)).toBe(0);
  });
});

describe("scrollParentComplaintCardIntoView", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("glides the parent chief-complaint card root into view on associated close", () => {
    document.body.innerHTML = `
      <div ${COMPLAINT_CARD_INSTANCE_ATTR}="parent-row">
        <div ${COMPLAINT_CARD_HEADER_ATTR}>Parent header</div>
      </div>
    `;

    scrollParentComplaintCardIntoView("parent-row");

    const root = document.querySelector(`[${COMPLAINT_CARD_INSTANCE_ATTR}="parent-row"]`);
    expect(root?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
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
