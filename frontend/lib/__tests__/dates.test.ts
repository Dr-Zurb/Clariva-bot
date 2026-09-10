import { describe, expect, it } from "vitest";
import {
  addLocalIsoDays,
  formatOpdSessionDateLabel,
  parseLocalIsoDate,
} from "@/lib/dates";

describe("parseLocalIsoDate", () => {
  it("parses a local calendar day", () => {
    const d = parseLocalIsoDate("2026-08-11");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7);
    expect(d!.getDate()).toBe(11);
  });

  it("rejects invalid calendar days", () => {
    expect(parseLocalIsoDate("2026-02-31")).toBeNull();
    expect(parseLocalIsoDate("not-a-date")).toBeNull();
  });
});

describe("addLocalIsoDays", () => {
  it("shifts across month boundaries", () => {
    expect(addLocalIsoDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addLocalIsoDays("2026-08-11", -1)).toBe("2026-08-10");
  });
});

describe("formatOpdSessionDateLabel", () => {
  const now = new Date(2026, 7, 11, 9, 0, 0, 0);

  it("labels today / yesterday / tomorrow", () => {
    expect(formatOpdSessionDateLabel("2026-08-11", now)).toMatch(/^Today · /);
    expect(formatOpdSessionDateLabel("2026-08-10", now)).toMatch(/^Yesterday · /);
    expect(formatOpdSessionDateLabel("2026-08-12", now)).toMatch(/^Tomorrow · /);
  });

  it("uses weekday label for other days", () => {
    expect(formatOpdSessionDateLabel("2026-08-15", now)).toMatch(/Aug/);
    expect(formatOpdSessionDateLabel("2026-08-15", now)).not.toMatch(/^Today/);
  });
});
