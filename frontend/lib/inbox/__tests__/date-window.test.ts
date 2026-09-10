import { describe, expect, it } from "vitest";
import {
  inboxDateBounds,
  resolveCustomInboxDates,
} from "@/lib/inbox/date-window";

describe("inboxDateBounds", () => {
  it("returns ISO from/to for 30d", () => {
    const { dateFrom, dateTo } = inboxDateBounds("30d");
    expect(dateFrom).toBeTruthy();
    expect(dateTo).toBeTruthy();
    const from = Date.parse(dateFrom!);
    const to = Date.parse(dateTo!);
    expect(to - from).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(to - from).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 1000);
  });

  it("supports 90d preset", () => {
    const ninety = inboxDateBounds("90d");
    expect(Date.parse(ninety.dateTo!) - Date.parse(ninety.dateFrom!)).toBeGreaterThan(
      89 * 24 * 60 * 60 * 1000
    );
  });
});

describe("resolveCustomInboxDates", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");

  it("treats a single date as that day", () => {
    const res = resolveCustomInboxDates("2026-07-20", undefined, now);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.dateFrom).toContain("2026-07");
    expect(Date.parse(res.dateTo) - Date.parse(res.dateFrom)).toBeLessThan(
      24 * 60 * 60 * 1000
    );
  });

  it("rejects ranges over 365 days", () => {
    const res = resolveCustomInboxDates("2025-07-27", "2026-07-28", now);
    expect(res).toEqual({ error: "Pick a range up to 365 days." });
  });

  it("rejects lookback older than 1 year", () => {
    const res = resolveCustomInboxDates("2025-06-01", "2025-06-02", now);
    expect(res).toEqual({ error: "Inbox only covers the last year." });
  });
});
