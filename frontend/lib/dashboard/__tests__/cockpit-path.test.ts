import { describe, expect, it } from "vitest";
import { isCockpitAppointmentPath } from "@/lib/dashboard/cockpit-path";

describe("isCockpitAppointmentPath", () => {
  it("matches appointment-detail only", () => {
    expect(isCockpitAppointmentPath("/dashboard/appointments/abc-123")).toBe(
      true,
    );
    expect(isCockpitAppointmentPath("/dashboard/appointments")).toBe(false);
    expect(
      isCockpitAppointmentPath("/dashboard/appointments/abc-123/chat-history"),
    ).toBe(false);
    expect(isCockpitAppointmentPath("/dashboard/opd-today")).toBe(false);
    expect(isCockpitAppointmentPath(null)).toBe(false);
  });
});
