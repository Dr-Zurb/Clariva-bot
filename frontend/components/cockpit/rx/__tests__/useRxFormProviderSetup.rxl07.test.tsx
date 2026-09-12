/**
 * rxl-07 / rxl-24 — drafts and empty visits stay as they were. Today's issued
 * note is adopted writable; a previous clinic day's note is reviewed
 * read-only. Opening without typing must not mint a row.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useRxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import type { PrescriptionWithRelations } from "@/types/prescription";
import {
  createPrescription,
  getAppointmentById,
  getAppointmentDeskVitals,
  listPrescriptionsByAppointment,
} from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listPrescriptionsByAppointment: vi.fn(),
    getAppointmentById: vi.fn(),
    getAppointmentDeskVitals: vi.fn(),
    getDoctorSettings: vi.fn().mockResolvedValue({
      data: {
        settings: {
          timezone: "Asia/Kolkata",
          subjective_custom_subsections: [],
          objective_custom_sections: [],
          assessment_custom_sections: [],
          plan_custom_sections: [],
        },
      },
    }),
    createPrescription: vi.fn(),
    updatePrescription: vi.fn(),
  };
});

vi.mock("@/lib/api/doctor-settings-shared", () => ({
  getDoctorSettingsShared: vi.fn().mockResolvedValue({
    data: {
      settings: {
        timezone: "Asia/Kolkata",
        subjective_custom_subsections: [],
        objective_custom_sections: [],
        assessment_custom_sections: [],
        plan_custom_sections: [],
      },
    },
  }),
  peekDoctorSettingsShared: vi.fn().mockReturnValue(null),
}));

const listed = vi.mocked(listPrescriptionsByAppointment);
const apptById = vi.mocked(getAppointmentById);
const deskVitals = vi.mocked(getAppointmentDeskVitals);

function rx(
  overrides: Partial<PrescriptionWithRelations> = {},
): PrescriptionWithRelations {
  return {
    id: "rx-closed",
    appointment_id: "appt-1",
    patient_id: "pat-1",
    doctor_id: "doc-1",
    type: "structured",
    cc: "Cough",
    hopi: null,
    provisional_diagnosis: "URI",
    investigations_orders: "CBC",
    follow_up: null,
    patient_education: null,
    clinical_notes: "private",
    sent_to_patient_at: null,
    created_at: "2026-08-31T10:00:00.000Z",
    updated_at: "2026-08-31T10:00:00.000Z",
    complaints: [{ id: "c1", name: "Cough" }],
    vitals_hr: 90,
    examination_findings: "NAD",
    advice: "rest",
    ...overrides,
  } as PrescriptionWithRelations;
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useRxFormProviderSetup rxl-07 / rxl-24", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({
      now: new Date("2026-09-10T06:30:00.000Z"),
      toFake: ["Date"],
    });
    deskVitals.mockResolvedValue({ data: { vitals: null } } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reviews a previous day's attested note read-only and does not mint a row", async () => {
    const closed = rx({ attested_at: "2026-08-31T12:00:00.000Z" });
    listed.mockResolvedValue({ data: { prescriptions: [closed] } } as never);
    apptById.mockResolvedValue({
      data: { appointment: { consultation_type: "in_clinic", status: "completed" } },
    } as never);

    const { result } = renderHook(
      () =>
        useRxFormProviderSetup({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.prescription?.id).toBe("rx-closed");
    expect(result.current.prescriptionIdRef.current).toBe("rx-closed");
    expect(result.current.noteClosed).toBe(true);
    expect(result.current.closedSibling).toBeNull();
    expect(result.current.initialFields?.vitalsHr).toBe(90);
    expect(result.current.initialFields?.examinationFindings).toBe("NAD");
    expect(createPrescription).not.toHaveBeenCalled();
  });

  it("adopts today's issued note as an editable continuation", async () => {
    const today = rx({
      id: "rx-today",
      attested_at: "2026-09-10T04:45:00.000Z",
      vitals_hr: 76,
    });
    listed.mockResolvedValue({ data: { prescriptions: [today] } } as never);
    apptById.mockResolvedValue({
      data: { appointment: { consultation_type: "in_clinic", status: "completed" } },
    } as never);

    const { result } = renderHook(
      () =>
        useRxFormProviderSetup({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.prescription?.id).toBe("rx-today");
    expect(result.current.prescriptionIdRef.current).toBe("rx-today");
    expect(result.current.noteClosed).toBe(false);
    expect(result.current.initialFields?.vitalsHr).toBe(76);
    expect(createPrescription).not.toHaveBeenCalled();
  });

  it("still rehydrates a draft newest note", async () => {
    const draft = rx({ id: "rx-draft", attested_at: null, vitals_hr: 72 });
    listed.mockResolvedValue({ data: { prescriptions: [draft] } } as never);
    apptById.mockResolvedValue({
      data: { appointment: { consultation_type: "in_clinic", status: "confirmed" } },
    } as never);

    const { result } = renderHook(
      () =>
        useRxFormProviderSetup({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.prescription?.id).toBe("rx-draft");
    expect(result.current.prescriptionIdRef.current).toBe("rx-draft");
    expect(result.current.initialFields?.vitalsHr).toBe(72);
    expect(createPrescription).not.toHaveBeenCalled();
  });

  it("keeps a brand-new visit empty and does not mint on open", async () => {
    listed.mockResolvedValue({ data: { prescriptions: [] } } as never);
    apptById.mockResolvedValue({
      data: { appointment: { consultation_type: "in_clinic", status: "confirmed" } },
    } as never);

    const { result } = renderHook(
      () =>
        useRxFormProviderSetup({
          appointmentId: "appt-new",
          patientId: "pat-1",
          token: "token",
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.prescription).toBeNull();
    expect(result.current.prescriptionIdRef.current).toBeNull();
    expect(result.current.closedSibling).toBeNull();
    expect(result.current.initialFields?.complaints).toEqual([]);
    expect(createPrescription).not.toHaveBeenCalled();
  });

  it("uses the caller's appointment context instead of re-fetching it", async () => {
    const closed = rx({ attested_at: "2026-08-31T12:00:00.000Z" });
    listed.mockResolvedValue({ data: { prescriptions: [closed] } } as never);

    const { result } = renderHook(
      () =>
        useRxFormProviderSetup({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          appointmentContext: {
            consultationType: "in_clinic",
            status: "completed",
          },
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // The cockpit route already fetched this appointment — two round-trips per
    // patient switch used to re-fetch it before the form accepted typing.
    expect(apptById).not.toHaveBeenCalled();
    expect(result.current.prescription?.id).toBe("rx-closed");
    expect(result.current.noteClosed).toBe(true);
  });
});
