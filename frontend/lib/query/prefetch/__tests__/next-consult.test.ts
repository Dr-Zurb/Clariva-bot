import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchNextConsultQueries } from "@/lib/query/prefetch/next-consult";
import { queryKeys } from "@/lib/query/keys";

vi.mock("@/lib/api", () => ({
  getAppointmentDeskVitals: vi.fn().mockResolvedValue({
    data: { vitals: { bp_systolic: 120, bp_diastolic: 80, heart_rate: 72 } },
  }),
  listPatientAllergies: vi.fn().mockResolvedValue({
    data: { allergies: [], sectionNotes: null, noKnownAllergies: true },
  }),
  getPatientMedicalBackground: vi.fn().mockResolvedValue({
    data: {
      medicalBackground: { conditions: [], medications: [], notes: null },
    },
  }),
  listPatientConditions: vi.fn().mockResolvedValue({
    data: { conditions: [] },
  }),
}));

vi.mock("@/lib/api/last-visit-summary", () => ({
  getLastVisitSummary: vi.fn().mockResolvedValue({
    data: { summary: null },
  }),
}));

describe("prefetchNextConsultQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warms consult vitals and chart keys for the next patient", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await prefetchNextConsultQueries(client, "tok", {
      appointmentId: "appt-next",
      patientId: "pat-next",
    });

    expect(
      client.getQueryData(queryKeys.consult("appt-next").deskVitals())
    ).toBeTruthy();
    expect(
      client.getQueryData(queryKeys.consult("appt-next").lastVisitSummary())
    ).toBeDefined();
    expect(
      client.getQueryData(queryKeys.patient("pat-next").allergies())
    ).toEqual({
      allergies: [],
      sectionNotes: null,
      noKnownAllergies: true,
    });
    expect(
      client.getQueryData(queryKeys.patient("pat-next").medicalBackground())
    ).toBeTruthy();
    expect(
      client.getQueryData(queryKeys.patient("pat-next").conditions())
    ).toEqual([]);
  });

  it("skips chart keys when the next visit has no patient row", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await prefetchNextConsultQueries(client, "tok", {
      appointmentId: "appt-walkin",
    });
    expect(
      client.getQueryData(queryKeys.consult("appt-walkin").deskVitals())
    ).toBeTruthy();
    expect(client.getQueryCache().findAll({ queryKey: ["patient"] })).toEqual(
      []
    );
  });

  it("no-ops without a next appointment", async () => {
    const client = new QueryClient();
    await prefetchNextConsultQueries(client, "tok", null);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
