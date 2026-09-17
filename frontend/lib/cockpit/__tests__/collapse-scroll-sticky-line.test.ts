import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isCollapsibleAtStickyLine,
  scrollCollapsibleIntoViewIfNeeded,
} from "@/lib/cockpit/collapse-scroll";

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

function mountOverflowPane(opts: {
  parentTop: number;
  parentBottom: number;
  childTop: number;
  childBottom: number;
  scrollTop?: number;
  marginTop?: number;
}) {
  const parent = document.createElement("div");
  parent.style.overflowY = "auto";
  parent.scrollTop = opts.scrollTop ?? 0;
  const child = document.createElement("div");
  if (opts.marginTop) child.style.scrollMarginTop = `${opts.marginTop}px`;
  parent.appendChild(child);
  document.body.appendChild(parent);

  parent.getBoundingClientRect = () =>
    ({
      top: opts.parentTop,
      bottom: opts.parentBottom,
      height: opts.parentBottom - opts.parentTop,
    }) as DOMRect;
  child.getBoundingClientRect = () =>
    ({
      top: opts.childTop,
      bottom: opts.childBottom,
      height: opts.childBottom - opts.childTop,
    }) as DOMRect;

  const scrollTo = vi.fn((arg: number | ScrollToOptions) => {
    parent.scrollTop = typeof arg === "number" ? arg : (arg.top ?? parent.scrollTop);
  });
  parent.scrollTo = scrollTo as unknown as typeof parent.scrollTo;

  return { parent, child, scrollTo };
}

describe("scrollCollapsibleIntoViewIfNeeded", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not scroll when the card is fully on screen", () => {
    const { parent, child, scrollTo } = mountOverflowPane({
      parentTop: 0,
      parentBottom: 400,
      childTop: 80,
      childBottom: 200,
    });

    scrollCollapsibleIntoViewIfNeeded(child);

    expect(scrollTo).not.toHaveBeenCalled();
    expect(parent.scrollTop).toBe(0);
  });

  it("nudges up when the expanded card overflows the bottom", () => {
    const { parent, child, scrollTo } = mountOverflowPane({
      parentTop: 0,
      parentBottom: 400,
      childTop: 280,
      childBottom: 520,
    });

    scrollCollapsibleIntoViewIfNeeded(child);

    expect(scrollTo).toHaveBeenCalledWith({ top: 120, behavior: "smooth" });
    expect(parent.scrollTop).toBe(120);
  });

  it("pins the top when the card is taller than the pane", () => {
    const { parent, child, scrollTo } = mountOverflowPane({
      parentTop: 0,
      parentBottom: 300,
      childTop: 80,
      childBottom: 500,
    });

    scrollCollapsibleIntoViewIfNeeded(child);

    expect(scrollTo).toHaveBeenCalledWith({ top: 80, behavior: "smooth" });
    expect(parent.scrollTop).toBe(80);
  });

  it("does not pin a tall Plan section whose header is already usable", () => {
    const { parent, child, scrollTo } = mountOverflowPane({
      parentTop: 0,
      parentBottom: 300,
      childTop: 80,
      childBottom: 500,
    });

    scrollCollapsibleIntoViewIfNeeded(child, { pinTopIfTaller: false });

    expect(scrollTo).not.toHaveBeenCalled();
    expect(parent.scrollTop).toBe(0);
  });

  it("falls back to nearest scrollIntoView without a scroll parent", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const spy = vi.spyOn(el, "scrollIntoView").mockImplementation(() => {});

    scrollCollapsibleIntoViewIfNeeded(el);

    expect(spy).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    spy.mockRestore();
  });
});
