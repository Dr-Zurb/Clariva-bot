/**
 * rxl-04 — Phase 1 gate suite.
 * Five SOAP surfaces + vitals field-by-field, fails-closed, zero-write, desk immediacy.
 */
import { cloneElement, isValidElement, type ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import {
  RxLockProvider,
  resolveRxLock,
  useRxLock,
  useRxSectionLock,
} from "@/components/cockpit/rx/useRxLock";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { AssessmentSection } from "@/components/cockpit/rx/sections/AssessmentSection";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import { PlanSection } from "@/components/cockpit/rx/sections/PlanSection";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import { DeskVitalsSectionNoteSeed } from "@/components/cockpit/rx/inputs/useLastVisitVitals";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createPrescription,
  getAppointmentDeskVitals,
  getDoctorSettings,
  updatePrescription,
} from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: vi.fn().mockResolvedValue({
      data: { settings: { vitals_hidden: [], vitals_custom: [] } },
    }),
    getAppointmentById: vi.fn().mockResolvedValue({
      data: { appointment: { consultation_type: "in_clinic" } },
    }),
    getAppointmentDeskVitals: vi.fn().mockResolvedValue({
      data: { vitals: null },
    }),
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
    getPatientById: vi.fn().mockResolvedValue({
      data: {
        patient: {
          id: "pat-1",
          name: "Test",
          phone: "999",
          date_of_birth: "1990-01-01",
          gender: "male",
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      },
    }),
    patchDoctorSettings: vi.fn(),
    updatePrescription: vi.fn(),
    createPrescription: vi.fn(),
  };
});

vi.mock("@/hooks/queries/useVitalsTrendsQuery", async () => {
  const { buildVitalsTrendSeries, indexVitalsTrendSeries } =
    await import("@/lib/cockpit/vitals-trends");
  const { buildCategoricalVitalTimelines } =
    await import("@/lib/cockpit/categorical-vitals-timeline");
  const {
    buildCustomVitalTextTimelines,
    buildCustomVitalTrendSeries,
    indexCustomVitalTrendSeries,
  } = await import("@/lib/cockpit/custom-vitals-trends");
  const empty = buildVitalsTrendSeries([]);
  const emptyCustom = buildCustomVitalTrendSeries([]);
  return {
    useVitalsTrendsQuery: () => ({
      series: empty,
      byMetric: indexVitalsTrendSeries(empty),
      categoricalTimelines: buildCategoricalVitalTimelines([]),
      customTrendSeries: emptyCustom,
      byCustomId: indexCustomVitalTrendSeries(emptyCustom),
      customTextTimelines: buildCustomVitalTextTimelines([]),
      isLoading: false,
      isEmpty: true,
      error: null,
    }),
  };
});

vi.mock("@/components/cockpit/rx/objective/PediatricGrowthChartsSection", () => ({
  PediatricGrowthChartsSection: () => null,
}));

function LockDisabledChild({ children }: { children: React.ReactNode }) {
  const { contentLocked } = useRxSectionLock();
  if (!isValidElement(children)) return children;
  return cloneElement(children as ReactElement<{ disabled?: boolean }>, {
    disabled: contentLocked,
  });
}

function renderLocked(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RxFormProvider
          appointmentId="appt-1"
          patientId="pat-1"
          token="t"
          entryMode="structured"
          initialFields={createEmptyRxFormFields()}
          autosaveEnabled={false}
          prescriptionIdRef={{ current: null }}
          onPrescriptionCreated={() => {}}
        >
          <RxLockProvider cockpitState="ended">
            <LockDisabledChild>{ui}</LockDisabledChild>
          </RxLockProvider>
        </RxFormProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function LockProbe() {
  const { contentLocked } = useRxLock();
  return <input aria-label="unwired-probe" disabled={contentLocked} />;
}

function DeskProbe() {
  const { state, isDirty } = useRxForm();
  return (
    <div>
      <span data-testid="gate-hr">{state.fields.vitalsHr ?? "empty"}</span>
      <span data-testid="gate-dirty">{String(isDirty)}</span>
    </div>
  );
}

function renderDeskSeed(lock: "live" | "ended") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
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
          <DeskProbe />
        </RxLockProvider>
      </RxFormProvider>
    </QueryClientProvider>,
  );
}

describe("rxl-04 Phase 1 gate — five surfaces", () => {
  it("locks subjective on an ended visit", async () => {
    renderLocked(<SubjectiveSection heading={null} />);
    expect(await screen.findByTestId("subjective-clear-all")).toBeDisabled();
    fireEvent.click(screen.getByTestId("subjective-expand-all"));
    expect(
      await screen.findByLabelText("Additional history notes"),
    ).toBeDisabled();
  });

  it("locks objective notes on an ended visit", async () => {
    renderLocked(<ObjectiveSection heading={null} />);
    expect(await screen.findByTestId("objective-notes-textarea")).toBeDisabled();
  });

  it("locks vitals field-by-field on an ended visit", async () => {
    renderLocked(<VitalsGrid />);
    await waitFor(() => expect(getDoctorSettings).toHaveBeenCalled());
    expect(screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i)).toBeDisabled();
    expect(screen.getByLabelText(/Systolic blood pressure/i)).toBeDisabled();
    expect(screen.getByLabelText(/Diastolic blood pressure/i)).toBeDisabled();
    expect(screen.getByTestId("vitals-section-note-add")).toBeDisabled();
    expect(screen.getByTestId("vitals-wnl-fill-trigger")).toBeDisabled();
  });

  it("locks assessment impression on an ended visit", async () => {
    renderLocked(<AssessmentSection heading={null} />);
    expect(
      await screen.findByPlaceholderText(
        "Clinical impression, reasoning, and other notes",
      ),
    ).toBeDisabled();
  });

  it("locks plan follow-up and hides investigation search on an ended visit", async () => {
    renderLocked(
      <PlanSection
        heading={null}
        safetyLifted
        token="t"
        medicineInstanceIds={[]}
        setMedicineInstanceIds={() => {}}
        generateInstanceIds={() => []}
        drugMasterIndex={new Map()}
        setDrugMasterIndex={() => {}}
        allergies={[]}
        ddiInteractions={[]}
        isAcked={() => false}
        onAcknowledge={() => {}}
        onAckDdi={() => {}}
      />,
    );
    expect(await screen.findByTestId("investigations-chip-row")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search panel, test, or imaging…"),
    ).not.toBeInTheDocument();
    const followUpToggle = await screen.findByRole("button", {
      name: /Toggle Follow-up/i,
    });
    if (followUpToggle.getAttribute("aria-expanded") === "false") {
      fireEvent.click(followUpToggle);
    }
    expect(screen.getByLabelText(/^Notes$/)).toBeDisabled();
  });
});

describe("rxl-04 Phase 1 gate — fails closed", () => {
  it("locks content when nothing is wired", () => {
    expect(resolveRxLock(undefined).contentLocked).toBe(true);
    render(<LockProbe />);
    expect(screen.getByLabelText("unwired-probe")).toBeDisabled();
  });
});

describe("rxl-04 Phase 1 gate — zero write + desk immediacy", () => {
  beforeEach(() => {
    vi.mocked(getAppointmentDeskVitals).mockReset();
    vi.mocked(createPrescription).mockClear();
    vi.mocked(updatePrescription).mockClear();
  });

  it("opens a chart with desk vitals and issues zero prescription writes", async () => {
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

    renderDeskSeed("ended");
    await waitFor(() => {
      expect(getAppointmentDeskVitals).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(createPrescription).not.toHaveBeenCalled();
    expect(updatePrescription).not.toHaveBeenCalled();
  });

  it("shows desk vitals immediately on an open visit without dirtying", async () => {
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

    renderDeskSeed("live");
    await waitFor(() => {
      expect(screen.getByTestId("gate-hr")).toHaveTextContent("88");
    });
    expect(screen.getByTestId("gate-dirty")).toHaveTextContent("false");
    expect(createPrescription).not.toHaveBeenCalled();
    expect(updatePrescription).not.toHaveBeenCalled();
  });
});
