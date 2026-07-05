import { afterEach, describe, expect, it } from "vitest";
import { isCollapsibleAtStickyLine } from "@/lib/cockpit/collapse-scroll";

/**
 * Build a scroll parent (overflow-y auto) with a child, stubbing the rects so we can
 * exercise the sticky-line guard deterministically in jsdom.
 */
function mountScrollPane(childTop: number, parentTop: number, marginTop = 0) {
  const parent = document.createElement("div");
  parent.style.overflowY = "auto";
  const child = document.createElement("div");
  if (marginTop) child.style.scrollMarginTop = `${marginTop}px`;
  parent.appendChild(child);
  document.body.appendChild(parent);

  parent.getBoundingClientRect = () =>
    ({ top: parentTop } as DOMRect);
  child.getBoundingClientRect = () =>
    ({ top: childTop } as DOMRect);

  return { parent, child };
}

describe("isCollapsibleAtStickyLine", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false when there is no scroll parent (can't tell)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(isCollapsibleAtStickyLine(el)).toBe(false);
  });

  it("returns false for a null element", () => {
    expect(isCollapsibleAtStickyLine(null)).toBe(false);
  });

  it("is true when the header sits exactly on the sticky line", () => {
    const { child } = mountScrollPane(100, 100);
    expect(isCollapsibleAtStickyLine(child)).toBe(true);
  });

  it("is true when the header has scrolled above the sticky line", () => {
    const { child } = mountScrollPane(40, 100);
    expect(isCollapsibleAtStickyLine(child)).toBe(true);
  });

  it("accounts for scroll-margin-top when measuring the sticky line", () => {
    // child top 148, parent top 100, margin 48 → offset 0 → parked.
    const { child } = mountScrollPane(148, 100, 48);
    expect(isCollapsibleAtStickyLine(child)).toBe(true);
  });

  it("is false when the header is below its sticky line (needs a scroll)", () => {
    const { child } = mountScrollPane(400, 100);
    expect(isCollapsibleAtStickyLine(child)).toBe(false);
  });

  it("absorbs sub-pixel rounding within the tolerance", () => {
    const { child } = mountScrollPane(101.5, 100);
    expect(isCollapsibleAtStickyLine(child)).toBe(true);
  });
});
