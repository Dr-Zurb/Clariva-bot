import { describe, expect, it } from "vitest";
import {
  formatInboxAbsoluteTime,
  formatInboxDaySeparator,
  formatInboxRelativeTime,
  isSameCalendarDay,
} from "@/lib/inbox/format-relative";

describe("formatInboxRelativeTime", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");

  it("formats recent minutes and hours", () => {
    expect(
      formatInboxRelativeTime("2026-07-27T11:55:00.000Z", now)
    ).toBe("5m ago");
    expect(
      formatInboxRelativeTime("2026-07-27T10:00:00.000Z", now)
    ).toBe("2h ago");
  });

  it("formats yesterday", () => {
    expect(
      formatInboxRelativeTime("2026-07-26T12:00:00.000Z", now)
    ).toBe("Yesterday");
  });
});

describe("inbox day helpers", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");

  it("detects same calendar day (local)", () => {
    // Midday UTC stays on the same local calendar day in ±12h zones.
    expect(
      isSameCalendarDay("2026-07-27T10:00:00.000Z", "2026-07-27T14:00:00.000Z")
    ).toBe(true);
    expect(
      isSameCalendarDay("2026-07-27T12:00:00.000Z", "2026-07-26T12:00:00.000Z")
    ).toBe(false);
  });

  it("labels today and yesterday", () => {
    expect(formatInboxDaySeparator("2026-07-27T08:00:00.000Z", now)).toBe(
      "Today"
    );
    expect(formatInboxDaySeparator("2026-07-26T08:00:00.000Z", now)).toBe(
      "Yesterday"
    );
  });

  it("formats absolute time", () => {
    expect(formatInboxAbsoluteTime("2026-07-27T08:07:00.000Z").length).toBeGreaterThan(0);
  });
});
