import { describe, expect, it } from "vitest";
import {
  parseOpdSessionDateParam,
  resolveSessionDate,
  todayLocalIso,
} from "../dates";

describe("resolveSessionDate", () => {
  it("prefers a valid YYYY-MM-DD over the fallback", () => {
    expect(resolveSessionDate("2026-09-10", "2026-09-13")).toBe("2026-09-10");
  });

  it("uses the fallback when the preferred value is missing or invalid", () => {
    expect(resolveSessionDate(null, "2026-09-10")).toBe("2026-09-10");
    expect(resolveSessionDate("13-09-2026", "2026-09-10")).toBe("2026-09-10");
  });

  it("falls back to today when neither value is a calendar day", () => {
    expect(resolveSessionDate(undefined, "nope")).toBe(todayLocalIso());
  });
});

describe("parseOpdSessionDateParam", () => {
  it("keeps a valid OPD date and otherwise returns today", () => {
    expect(parseOpdSessionDateParam("2026-09-10")).toBe("2026-09-10");
    expect(parseOpdSessionDateParam("")).toBe(todayLocalIso());
  });
});
