import { describe, expect, it } from "vitest";
import { makeLine, makeRank } from "../make-plan";

const now = new Date(2026, 9, 30, 12, 0).getTime();

describe("make plan", () => {
  it("names a future start, today, a late card, and work already in Making", () => {
    expect(makeLine(new Date(2026, 10, 12, 9, 0).toISOString(), "chosen", now)).toMatch(/^Start making /);
    expect(makeLine(new Date(2026, 9, 30, 15, 0).toISOString(), "chosen", now)).toMatch(/^Start today · /);
    expect(makeLine(new Date(2026, 9, 29, 9, 0).toISOString(), "chosen", now)).toMatch(/^Late · /);
    expect(makeLine(new Date(2026, 10, 2, 9, 0).toISOString(), "making", now)).toMatch(/^Work on it /);
    expect(makeLine(new Date(2026, 9, 29, 9, 0).toISOString(), "making", now)).toMatch(/^Late · /);
  });

  it("ranks late before today before a future plan", () => {
    const late = new Date(2026, 9, 29, 9, 0).toISOString();
    const today = new Date(2026, 9, 30, 15, 0).toISOString();
    const later = new Date(2026, 10, 12, 9, 0).toISOString();
    expect(makeRank(late, "chosen", now)).toBeLessThan(makeRank(today, "chosen", now));
    expect(makeRank(today, "chosen", now)).toBeLessThan(makeRank(later, "chosen", now));
    expect(makeRank(null, "chosen", now)).toBeGreaterThan(makeRank(later, "chosen", now));
  });
});