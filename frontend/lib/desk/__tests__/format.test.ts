import { describe, expect, it } from "vitest";
import {
  formatDeskWeekday,
  walkInAppointmentIso,
  walkInAppointmentIsoOnDay,
  zonedLocalIso,
} from "@/lib/desk/format";

describe("formatDeskWeekday", () => {
  it("prints a short weekday date in the clinic timezone", () => {
    const noonUtc = new Date("2026-08-23T06:30:00.000Z");
    expect(formatDeskWeekday("Asia/Kolkata", noonUtc)).toMatch(/Aug/);
    expect(formatDeskWeekday("Asia/Kolkata", noonUtc)).toMatch(/23/);
  });
});

describe("zonedLocalIso", () => {
  it("maps Kolkata noon to 06:30 UTC", () => {
    expect(zonedLocalIso("2026-09-01", 12, 0, "Asia/Kolkata")).toBe(
      "2026-09-01T06:30:00.000Z"
    );
  });
});

describe("walkInAppointmentIsoOnDay", () => {
  it("uses noon on a future clinic day", () => {
    expect(
      walkInAppointmentIsoOnDay(
        "2026-09-02",
        "Asia/Kolkata",
        new Date("2026-09-01T06:30:00.000Z")
      )
    ).toBe("2026-09-02T06:30:00.000Z");
  });
});

describe("walkInAppointmentIso", () => {
  it("is far enough in the future to survive desk latency", () => {
    const iso = walkInAppointmentIso();
    const deltaMs = new Date(iso).getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(60_000);
    expect(deltaMs).toBeLessThanOrEqual(120_000);
  });
});
