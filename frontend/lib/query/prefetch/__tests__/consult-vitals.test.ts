import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deskVitalsQueryOptions,
  deskVitalsSeedFromReading,
  extractLastVisitGhostVitals,
  fetchDeskVisitVitalsPayload,
  ghostVitalsFromLastVisitSummary,
  hasDeskVitalsReading,
} from "@/lib/cockpit/desk-vitals-query";
import type { PatientVitalsReading } from "@/types/patient-chart";
import { getAppointmentDeskVitals } from "@/lib/api";
import { prefetchConsultVitalsQueries } from "@/lib/query/prefetch/consult-vitals";
import { queryKeys } from "@/lib/query/keys";
import { POLL_INTERVAL } from "@/lib/query/polling";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";
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
}));

vi.mock("@/lib/api/last-visit-summary", () => ({
  getLastVisitSummary: vi.fn().mockResolvedValue({
    data: {
      summary: {
        sourcePrescriptionId: "rx-1",
        sourceCreatedAt: "2026-08-12T10:00:00.000Z",
        complaints: [],
        diagnoses: [],
        provisionalDiagnosis: null,
        medicines: [],
        investigationsOrders: null,
        advice: null,
        followUp: null,
        followUpValue: null,
        followUpUnit: null,
        vitals: { vitalsBpSystolic: 118, vitalsHr: 70 },
      },
    },
  }),
}));

describe("consult vitals query options", () => {
  it("desk and last-visit-summary keys share the consult appointment prefix", () => {
    const desk = deskVitalsQueryOptions("tok", "appt-1");
    expect(desk.queryKey).toEqual(queryKeys.consult("appt-1").deskVitals());
    expect(queryKeys.consult("appt-1").lastVisitSummary()).toEqual([
      "consult",
      "appt-1",
      "last-visit-summary",
    ]);
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

  it("ghostVitalsFromLastVisitSummary ignores an empty payload", () => {
    expect(ghostVitalsFromLastVisitSummary(null)).toBeNull();
    expect(
      ghostVitalsFromLastVisitSummary({
        vitals: {},
      } as LastVisitSummary)
    ).toBeNull();
    expect(
      ghostVitalsFromLastVisitSummary({
        vitals: { vitalsHr: 72 },
      } as LastVisitSummary)
    ).toEqual({ vitalsHr: 72 });
  });
});

describe("desk vitals arriving mid-visit", () => {
  const interval = (data: unknown) =>
    deskVitalsQueryOptions("tok", "appt-1").refetchInterval({
      state: { data },
    } as never);

  it("keeps watching while the desk has recorded nothing", () => {
    expect(interval(undefined)).toBe(POLL_INTERVAL.DESK_VITALS);
    expect(interval({ ghost: null, note: null })).toBe(
      POLL_INTERVAL.DESK_VITALS
    );
  });

  it("stops watching once a reading lands", () => {
    expect(interval({ ghost: { vitalsHr: 88 }, note: null })).toBe(false);
    expect(interval({ ghost: null, note: "sitting, post-walk" })).toBe(false);
  });

  it("hasDeskVitalsReading treats an empty payload as nothing recorded", () => {
    expect(hasDeskVitalsReading(undefined)).toBe(false);
    expect(hasDeskVitalsReading({ ghost: null, note: null })).toBe(false);
    expect(hasDeskVitalsReading({ ghost: { vitalsHr: 88 }, note: null })).toBe(
      true
    );
  });

  it("rejects a failed fetch instead of caching it as no reading", async () => {
    vi.mocked(getAppointmentDeskVitals).mockRejectedValueOnce(
      new Error("desk-vitals unavailable")
    );
    await expect(fetchDeskVisitVitalsPayload("tok", "appt-1")).rejects.toThrow(
      "desk-vitals unavailable"
    );
  });
});

describe("prefetchConsultVitalsQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warms desk vitals and last-visit-summary when a patient is known", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await prefetchConsultVitalsQueries(client, "tok", "appt-1", "pat-1");

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
      client.getQueryData(queryKeys.consult("appt-1").lastVisitSummary())
    ).toMatchObject({
      vitals: { vitalsBpSystolic: 118, vitalsHr: 70 },
    });
  });

  it("no-ops without token or appointment id", async () => {
    const client = new QueryClient();
    await prefetchConsultVitalsQueries(client, "", "appt-1");
    await prefetchConsultVitalsQueries(client, "tok", "");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
