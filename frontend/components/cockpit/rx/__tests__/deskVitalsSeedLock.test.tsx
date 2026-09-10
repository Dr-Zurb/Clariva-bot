import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import { RxLockProvider } from "@/components/cockpit/rx/useRxLock";
import { DeskVitalsSectionNoteSeed } from "@/components/cockpit/rx/inputs/useLastVisitVitals";
import {
  createPrescription,
  getAppointmentDeskVitals,
  updatePrescription,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getAppointmentDeskVitals: vi.fn(),
    createPrescription: vi.fn(),
    updatePrescription: vi.fn(),
    getDoctorSettings: vi.fn().mockResolvedValue({ data: { settings: {} } }),
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
  };
});

function HrProbe() {
  const { state, isDirty, setField } = useRxForm();
  return (
    <div>
      <span data-testid="hr">{state.fields.vitalsHr ?? "empty"}</span>
      <span data-testid="dirty">{String(isDirty)}</span>
      <button
        type="button"
        data-testid="type-hr"
        onClick={() => setField("vitalsHr", 64)}
      >
        type
      </button>
    </div>
  );
}

function renderSeed(lock: "live" | "ended") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="tok"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled
        prescriptionIdRef={{ current: null }}
        onPrescriptionCreated={() => {}}
      >
        <RxLockProvider cockpitState={lock}>
          <DeskVitalsSectionNoteSeed />
          <HrProbe />
        </RxLockProvider>
      </RxFormProvider>
    </QueryClientProvider>,
  );
  return { queryClient, ...view };
}

describe("rxl-03 desk-vitals seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows desk vitals on an open visit without writing a prescription", async () => {
    vi.mocked(getAppointmentDeskVitals).mockResolvedValue({
      data: {
        vitals: {
          heart_rate: 88,
          bp_systolic: 120,
          bp_diastolic: 80,
          note: null,
        },
      },
    } as never);

    renderSeed("live");

    await waitFor(() => {
      expect(screen.getByTestId("hr")).toHaveTextContent("88");
    });
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");

    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(createPrescription).not.toHaveBeenCalled();
    expect(updatePrescription).not.toHaveBeenCalled();
  });

  it("does not seed a locked note", async () => {
    vi.mocked(getAppointmentDeskVitals).mockResolvedValue({
      data: {
        vitals: {
          heart_rate: 88,
          bp_systolic: 120,
          bp_diastolic: 80,
          note: null,
        },
      },
    } as never);

    renderSeed("ended");

    await waitFor(() => {
      expect(getAppointmentDeskVitals).toHaveBeenCalled();
    });
    expect(screen.getByTestId("hr")).toHaveTextContent("empty");
    expect(createPrescription).not.toHaveBeenCalled();
    expect(updatePrescription).not.toHaveBeenCalled();
  });

  it("fills empty fields when desk vitals arrive after the first empty fetch", async () => {
    vi.mocked(getAppointmentDeskVitals).mockResolvedValue({
      data: { vitals: null },
    } as never);

    const { queryClient } = renderSeed("live");
    await waitFor(() => {
      expect(getAppointmentDeskVitals).toHaveBeenCalled();
    });
    expect(screen.getByTestId("hr")).toHaveTextContent("empty");

    queryClient.setQueryData(queryKeys.consult("appt-1").deskVitals(), {
      ghost: { vitalsHr: 91 },
      note: null,
    });

    await waitFor(() => {
      expect(screen.getByTestId("hr")).toHaveTextContent("91");
    });
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("does not overwrite a doctor-entered vital when desk data arrives later", async () => {
    vi.mocked(getAppointmentDeskVitals).mockResolvedValue({
      data: { vitals: null },
    } as never);

    const { queryClient } = renderSeed("live");
    await waitFor(() => {
      expect(getAppointmentDeskVitals).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByTestId("type-hr"));
    await waitFor(() => {
      expect(screen.getByTestId("hr")).toHaveTextContent("64");
    });

    queryClient.setQueryData(queryKeys.consult("appt-1").deskVitals(), {
      ghost: { vitalsHr: 91 },
      note: null,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("hr")).toHaveTextContent("64");
  });

  it("a doctor keystroke still schedules exactly one create", async () => {
    vi.mocked(getAppointmentDeskVitals).mockResolvedValue({
      data: { vitals: null },
    } as never);
    vi.mocked(createPrescription).mockResolvedValue({
      data: { prescription: { id: "rx-1" } },
    } as never);

    renderSeed("live");
    await waitFor(() => {
      expect(getAppointmentDeskVitals).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("type-hr"));
    await waitFor(
      () => {
        expect(createPrescription).toHaveBeenCalledTimes(1);
      },
      { timeout: 2500 },
    );
  });
});
