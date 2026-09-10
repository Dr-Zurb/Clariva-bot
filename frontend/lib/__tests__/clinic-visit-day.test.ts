import { describe, expect, it } from "vitest";
import {
  clinicVisitDayYmd,
  isSameClinicVisitDay,
} from "@/lib/clinic-visit-day";

const TZ = "Asia/Kolkata";

function at(iso: string): Date {
  return new Date(iso);
}

describe("clinicVisitDayYmd (RXL-Q7 06:00 cutover)", () => {
  it("keeps 10:15 AM and 11:30 PM on the same calendar date", () => {
    expect(clinicVisitDayYmd(at("2026-09-09T04:45:00.000Z"), TZ)).toBe(
      "2026-09-09",
    );
    expect(clinicVisitDayYmd(at("2026-09-09T18:00:00.000Z"), TZ)).toBe(
      "2026-09-09",
    );
  });

  it("assigns 1:00 AM to the previous clinic day", () => {
    expect(clinicVisitDayYmd(at("2026-09-09T19:30:00.000Z"), TZ)).toBe(
      "2026-09-09",
    );
  });

  it("rolls at 06:00 local", () => {
    expect(clinicVisitDayYmd(at("2026-09-10T00:29:59.000Z"), TZ)).toBe(
      "2026-09-09",
    );
    expect(clinicVisitDayYmd(at("2026-09-10T00:30:00.000Z"), TZ)).toBe(
      "2026-09-10",
    );
  });
});

describe("isSameClinicVisitDay", () => {
  it("treats 11:30 PM and 5:59 AM as the same slip", () => {
    expect(
      isSameClinicVisitDay(
        at("2026-09-09T18:00:00.000Z"),
        at("2026-09-10T00:29:00.000Z"),
        TZ,
      ),
    ).toBe(true);
  });

  it("treats 10:15 AM and 6:00 AM the next morning as a new day", () => {
    expect(
      isSameClinicVisitDay(
        at("2026-09-09T04:45:00.000Z"),
        at("2026-09-10T00:30:00.000Z"),
        TZ,
      ),
    ).toBe(false);
  });
});
