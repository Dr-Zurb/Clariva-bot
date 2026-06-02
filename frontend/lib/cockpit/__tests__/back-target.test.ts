import { describe, expect, it } from "vitest";
import {
  buildCockpitAppointmentPath,
  buildCockpitAppointmentPathFromCurrentOrigin,
  appendCockpitOriginFromSearchParams,
  parseCockpitOrigin,
  resolveBackTarget,
} from "../back-target";

describe("back-target (nav-back-01)", () => {
  it("parseCockpitOrigin accepts known origins and rejects unknown", () => {
    expect(parseCockpitOrigin("opd-today")).toBe("opd-today");
    expect(parseCockpitOrigin("today")).toBe("today");
    expect(parseCockpitOrigin("patients-v2")).toBe("patients-v2");
    expect(parseCockpitOrigin("appointments-list")).toBeNull();
    expect(parseCockpitOrigin("bogus")).toBeNull();
    expect(parseCockpitOrigin(null)).toBeNull();
  });

  it("resolveBackTarget maps each origin to label + href", () => {
    expect(resolveBackTarget("opd-today")).toEqual({
      label: "OPD",
      href: "/dashboard/opd-today",
    });
    expect(resolveBackTarget("today")).toEqual({
      label: "Today",
      href: "/dashboard",
    });
    expect(resolveBackTarget("patients-v2", "pat-42")).toEqual({
      label: "Patient profile",
      href: "/dashboard/patients-v2/pat-42",
    });
  });

  it("resolveBackTarget defaults to OPD when origin is null", () => {
    expect(resolveBackTarget(null)).toEqual({
      label: "OPD",
      href: "/dashboard/opd-today",
    });
  });

  it("resolveBackTarget preserves OPD session date in href", () => {
    expect(resolveBackTarget("opd-today", null, "2026-05-09")).toEqual({
      label: "OPD",
      href: "/dashboard/opd-today?date=2026-05-09",
    });
    expect(resolveBackTarget(null, null, "2026-05-09")).toEqual({
      label: "OPD",
      href: "/dashboard/opd-today?date=2026-05-09",
    });
  });

  it("buildCockpitAppointmentPath encodes from and optional pid", () => {
    expect(buildCockpitAppointmentPath("appt-1", "opd-today")).toBe(
      "/dashboard/appointments/appt-1?from=opd-today",
    );
    expect(
      buildCockpitAppointmentPath("appt-1", "patients-v2", {
        patientId: "pat-9",
      }),
    ).toBe("/dashboard/appointments/appt-1?from=patients-v2&pid=pat-9");
    expect(
      buildCockpitAppointmentPath("appt-1", "opd-today", {
        opdDate: "2026-05-09",
      }),
    ).toBe("/dashboard/appointments/appt-1?from=opd-today&date=2026-05-09");
  });

  it("buildCockpitAppointmentPathFromCurrentOrigin preserves existing params", () => {
    const params = new URLSearchParams("from=today");
    expect(
      buildCockpitAppointmentPathFromCurrentOrigin("appt-2", params),
    ).toBe("/dashboard/appointments/appt-2?from=today");
    const opdParams = new URLSearchParams("from=opd-today&date=2026-05-09");
    expect(
      buildCockpitAppointmentPathFromCurrentOrigin("appt-3", opdParams),
    ).toBe("/dashboard/appointments/appt-3?from=opd-today&date=2026-05-09");
  });

  it("appendCockpitOriginFromSearchParams appends to sub-paths", () => {
    const params = new URLSearchParams("from=opd-today");
    expect(
      appendCockpitOriginFromSearchParams(
        "/dashboard/appointments/appt-1/chat-history",
        params,
      ),
    ).toBe("/dashboard/appointments/appt-1/chat-history?from=opd-today");
    const dated = new URLSearchParams("from=opd-today&date=2026-05-09");
    expect(
      appendCockpitOriginFromSearchParams(
        "/dashboard/appointments/appt-1/chat-history",
        dated,
      ),
    ).toBe(
      "/dashboard/appointments/appt-1/chat-history?from=opd-today&date=2026-05-09",
    );
  });
});
