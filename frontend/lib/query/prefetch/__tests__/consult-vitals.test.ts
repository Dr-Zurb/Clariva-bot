import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deskVitalsQueryOptions,
  deskVitalsSeedFromReading,
  extractLastVisitGhostVitals,
  lastVisitVitalsQueryOptions,
} from "@/lib/cockpit/desk-vitals-query";
import type { PatientVitalsReading } from "@/types/patient-chart";
import { prefetchConsultVitalsQueries } from "@/lib/query/prefetch/consult-vitals";
import { queryKeys } from "@/lib/query/keys";
import type { PrescriptionWithRelations } from "@/types/prescription";

vi.mock("@/lib/api", () => ({
  getAppointmentDeskVitals: vi.fn().mockResolvedValue({
    data: {
      vitals: {
        bp_systolic: 120,
        bp_diastolic: 80,
        heart_rate: 72,
        note: null,
      },
    },
  }),
  getLastPrescriptionInEpisode: vi.fn().mockResolvedValue({
    data: {
      prescription: {
        id: "rx-1",
        vitals_bp_systolic: 118,
        vitals_hr: 70,
      },
    },
  }),
}));

vi.mock("@/lib/api/last-visit-summary", () => ({
  getLastVisitSummary: vi.fn().mockResolvedValue({
    data: { summary: null },
  }),
}));

describe("consult vitals query options", () => {
  it("desk and last-visit keys share the consult appointment prefix", () => {
    const desk = deskVitalsQueryOptions("tok", "appt-1");
    const last = lastVisitVitalsQueryOptions("tok", "appt-1");
    expect(desk.queryKey).toEqual(queryKeys.consult("appt-1").deskVitals());
    expect(last.queryKey).toEqual(
      queryKeys.consult("appt-1").lastVisitVitals()
    );
  });

  it("deskVitalsSeedFromReading maps a desk row for the consult cache", () => {
    expect(
      deskVitalsSeedFromReading({
        bp_systolic: 118,
        bp_diastolic: 76,
        heart_rate: 70,
        note: " sitting ",
      } as PatientVitalsReading)
    ).toEqual({
      ghost: {
        vitalsBpSystolic: 118,
        vitalsBpDiastolic: 76,
        vitalsHr: 70,
      },
      note: "sitting",
    });
    expect(deskVitalsSeedFromReading(null)).toEqual({
      ghost: null,
      note: null,
    });
  });

  it("extractLastVisitGhostVitals copies finite column vitals only", () => {
    const ghost = extractLastVisitGhostVitals({
      vitals_bp_systolic: 118,
      vitals_hr: 70,
      vitals_temp_c: null,
    } as PrescriptionWithRelations);
    expect(ghost).toEqual({
      vitalsBpSystolic: 118,
      vitalsHr: 70,
    });
  });
});

describe("prefetchConsultVitalsQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warms both consult vitals keys", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await prefetchConsultVitalsQueries(client, "tok", "appt-1");

    expect(
      client.getQueryData(queryKeys.consult("appt-1").deskVitals())
    ).toEqual({
      ghost: {
        vitalsBpSystolic: 120,
        vitalsBpDiastolic: 80,
        vitalsHr: 72,
      },
      note: null,
    });
    expect(
      client.getQueryData(queryKeys.consult("appt-1").lastVisitVitals())
    ).toEqual({
      vitalsBpSystolic: 118,
      vitalsHr: 70,
    });
  });

  it("no-ops without token or appointment id", async () => {
    const client = new QueryClient();
    await prefetchConsultVitalsQueries(client, "", "appt-1");
    await prefetchConsultVitalsQueries(client, "tok", "");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
