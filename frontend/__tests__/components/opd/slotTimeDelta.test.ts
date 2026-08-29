import { describe, expect, it } from "vitest";
import { formatSlotDelta } from "@/components/opd/shared/slotTimeDelta";

const NOW = new Date("2026-08-12T14:00:00.000Z").getTime();

function at(minutesFromNow: number): string {
  return new Date(NOW + minutesFromNow * 60_000).toISOString();
}

describe("formatSlotDelta", () => {
  it("labels an imminent slot as due", () => {
    expect(formatSlotDelta(at(3), NOW)).toEqual({ label: "in 3m", tone: "due" });
    expect(formatSlotDelta(at(15), NOW)).toEqual({
      label: "in 15m",
      tone: "due",
    });
  });

  it("labels a distant slot as future", () => {
    expect(formatSlotDelta(at(16), NOW)).toEqual({
      label: "in 16m",
      tone: "future",
    });
    expect(formatSlotDelta(at(95), NOW)).toEqual({
      label: "in 1h 35m",
      tone: "future",
    });
  });

  it("drops the minutes part on a whole hour", () => {
    expect(formatSlotDelta(at(120), NOW)?.label).toBe("in 2h");
  });

  it("labels a passed slot as late", () => {
    expect(formatSlotDelta(at(-8), NOW)).toEqual({
      label: "8m late",
      tone: "late",
    });
    expect(formatSlotDelta(at(-75), NOW)).toEqual({
      label: "1h 15m late",
      tone: "late",
    });
  });

  it("collapses the current minute to now", () => {
    expect(formatSlotDelta(at(0), NOW)).toEqual({ label: "now", tone: "due" });
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatSlotDelta("not-a-date", NOW)).toBeNull();
  });
});
