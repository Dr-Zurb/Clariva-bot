/**
 * Unit tests for `frontend/lib/text/format-day-label.ts` (text-A4).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDayLabel } from "../format-day-label";

describe("formatDayLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T14:30:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Today for the same calendar day", () => {
    expect(formatDayLabel(new Date("2026-04-28T09:00:00"))).toBe("Today");
    expect(formatDayLabel("2026-04-28T23:59:59")).toBe("Today");
  });

  it("returns Yesterday for exactly one calendar day ago", () => {
    expect(formatDayLabel(new Date("2026-04-27T23:55:00"))).toBe("Yesterday");
    expect(formatDayLabel("2026-04-27T00:05:00")).toBe("Yesterday");
  });

  it("returns a short en-GB date for older days", () => {
    const label = formatDayLabel(new Date("2026-04-23T12:00:00"));
    expect(label).toMatch(/^\w{3}, \d{1,2} \w{3}$/);
    expect(label).toBe("Thu, 23 Apr");
  });

  it("round-trips string ISO inputs through new Date", () => {
    expect(formatDayLabel("2026-04-28T08:00:00.000Z")).toBe("Today");
  });
});
