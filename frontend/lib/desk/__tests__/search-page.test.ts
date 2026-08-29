import { describe, expect, it } from "vitest";
import {
  DESK_SEARCH_MIN_PAGE,
  deskSearchPageCount,
  deskSearchPageNumbers,
  deskSearchPageSizeFromHeight,
  deskSearchVisibleEnd,
} from "@/lib/desk/search-page";

describe("deskSearchPageSizeFromHeight", () => {
  it("fills the pane and stays within bounds", () => {
    expect(deskSearchPageSizeFromHeight(33 + 4 + 37 * 16, 37, 33)).toBe(16);
    expect(deskSearchPageSizeFromHeight(36 + 4 + 52 * 8, 52, 36)).toBe(8);
    expect(deskSearchPageSizeFromHeight(10)).toBe(DESK_SEARCH_MIN_PAGE);
    expect(deskSearchPageSizeFromHeight(36 + 4 + 52 * 80, 52, 36)).toBe(30);
  });
});

describe("deskSearchPageCount", () => {
  it("rounds up and treats empty as one page", () => {
    expect(deskSearchPageCount(47, 12)).toBe(4);
    expect(deskSearchPageCount(0, 12)).toBe(1);
  });
});

describe("deskSearchVisibleEnd", () => {
  it("uses rows on screen instead of the requested page size", () => {
    expect(deskSearchVisibleEnd(1, 13, 11, 41)).toBe(11);
    expect(deskSearchVisibleEnd(2, 13, 13, 41)).toBe(26);
    expect(deskSearchVisibleEnd(4, 13, 2, 41)).toBe(41);
    expect(deskSearchVisibleEnd(1, 13, 0, 0)).toBe(0);
  });
});

describe("deskSearchPageNumbers", () => {
  it("lists every page when there are few", () => {
    expect(deskSearchPageNumbers(1, 3)).toEqual([1, 2, 3]);
  });

  it("windows the current page when there are many", () => {
    expect(deskSearchPageNumbers(1, 10)).toEqual([1, 2, "ellipsis", 10]);
    expect(deskSearchPageNumbers(5, 10)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  });
});
