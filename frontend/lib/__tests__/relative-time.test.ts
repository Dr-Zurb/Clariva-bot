import { describe, expect, it } from "vitest";
import { formatAgo, formatTimeUntil } from "@/lib/relative-time";

const NOW = Date.parse("2026-05-31T12:00:00.000Z");

describe("formatTimeUntil", () => {
  it("deadline 38 min out → Due in 38m, urgency soon", () => {
    const deadline = new Date(NOW + 38 * 60_000).toISOString();
    expect(formatTimeUntil(deadline, NOW)).toEqual({
      label: "Due in 38m",
      urgency: "soon",
    });
  });

  it("deadline 4h out → Due in 4h, urgency later", () => {
    const deadline = new Date(NOW + 4 * 60 * 60_000).toISOString();
    expect(formatTimeUntil(deadline, NOW)).toEqual({
      label: "Due in 4h",
      urgency: "later",
    });
  });

  it("deadline 5 min past → Overdue 5m, urgency overdue", () => {
    const deadline = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatTimeUntil(deadline, NOW)).toEqual({
      label: "Overdue 5m",
      urgency: "overdue",
    });
  });

  it("exactly 60 min → soon (boundary inclusive)", () => {
    const deadline = new Date(NOW + 60 * 60_000).toISOString();
    expect(formatTimeUntil(deadline, NOW)).toEqual({
      label: "Due in 1h",
      urgency: "soon",
    });
  });

  it("invalid ISO → —, later (no throw)", () => {
    expect(formatTimeUntil("not-a-date", NOW)).toEqual({
      label: "—",
      urgency: "later",
    });
  });
});

describe("formatAgo", () => {
  it("returns 3h ago from injected now", () => {
    const iso = new Date(NOW - 3 * 60 * 60_000).toISOString();
    expect(formatAgo(iso, NOW)).toBe("3h ago");
  });

  it("returns 12m ago from injected now", () => {
    const iso = new Date(NOW - 12 * 60_000).toISOString();
    expect(formatAgo(iso, NOW)).toBe("12m ago");
  });

  it("invalid ISO → —", () => {
    expect(formatAgo("bad", NOW)).toBe("—");
  });
});
