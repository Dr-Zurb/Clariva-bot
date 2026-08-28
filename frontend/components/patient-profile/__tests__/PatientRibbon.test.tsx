import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import type { Appointment } from "@/types/appointment";

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <div>{children}</div>),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));

vi.mock("@/components/patient-profile/panes/SnapshotPane", () => ({
  default: () => <div data-testid="mock-snapshot-pane">SnapshotPane</div>,
}));

vi.mock("@/components/patient-profile/panes/HistoryPane", () => ({
  default: () => <div data-testid="mock-history-pane">HistoryPane</div>,
}));

vi.mock("@/components/ehr/sections/AllergiesSection", () => ({
  default: () => <div data-testid="mock-allergies-section">AllergiesSection</div>,
}));

import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PatientRibbon } from "@/components/patient-profile/PatientRibbon";
import SideSheetHost from "@/components/patient-profile/SideSheetHost";

const prescriptionIdRef = { current: null as string | null };

const mockRibbonData = {
  allergies: [] as Array<{
    id: string;
    name: string;
    reaction?: string | null;
    severity?: "mild" | "moderate" | "severe" | null;
  }>,
  chronicConditions: [] as Array<{
    id: string;
    name: string;
    since?: string | null;
  }>,
  activeMeds: [] as Array<{ id: string; name: string; detail?: string | null }>,
  activeMedsCount: 0,
  isLoading: false,
  error: null,
};

vi.mock("@/hooks/usePatientRibbonData", () => ({
  usePatientRibbonData: vi.fn(() => mockRibbonData),
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitV2RRibbonLanded: vi.fn(),
}));

const useOptionalRxSafetyMock = vi.fn(() => null);

vi.mock("@/components/cockpit/rx/RxSafetyContext", () => ({
  useOptionalRxSafety: () => useOptionalRxSafetyMock(),
}));

function makeAppointment(
  overrides: Partial<Appointment> = {},
): Appointment {
  return {
    id: "appt-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    patient_name: "Test Patient",
    patient_phone: "+91 90000 00000",
    appointment_date: "2026-05-26T10:00:00.000Z",
    status: "confirmed",
    notes: null,
    created_at: "2026-05-01T08:00:00.000Z",
    updated_at: "2026-05-26T09:00:00.000Z",
    consultation_type: "video",
    consultation_session: null,
    ...overrides,
  };
}

function renderRibbon(options?: {
  provisionalDiagnosis?: string;
  safetyVisible?: boolean;
  appointment?: Appointment;
}) {
  const fields = createEmptyRxFormFields();
  if (options?.provisionalDiagnosis !== undefined) {
    fields.provisionalDiagnosis = options.provisionalDiagnosis;
  }

  if (options?.safetyVisible) {
    useOptionalRxSafetyMock.mockReturnValue({
      visible: true,
      clashesCount: 1,
      ddiCount: 0,
    });
  } else {
    useOptionalRxSafetyMock.mockReturnValue(null);
  }

  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={fields}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      <SideSheetHost>
        <PatientRibbon
          appointment={options?.appointment ?? makeAppointment()}
          token="test-token"
        />
      </SideSheetHost>
    </RxFormProvider>,
  );
}

describe("PatientRibbon indicator labels (cnc-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOptionalRxSafetyMock.mockReturnValue(null);
    mockRibbonData.allergies = [];
    mockRibbonData.activeMeds = [];
    mockRibbonData.activeMedsCount = 0;
  });

  it("does not render demographics identity (header owns age/sex)", () => {
    renderRibbon();
    expect(screen.queryByText(/42 y/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^M$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no demographics/i)).not.toBeInTheDocument();
  });

  it("safety indicator has aria-label", () => {
    renderRibbon();
    expect(
      screen.getByLabelText(/safety status — no concerns/i),
    ).toBeInTheDocument();
  });

  it("safety indicator shows review required when clashes are visible", () => {
    renderRibbon({ safetyVisible: true });
    expect(
      screen.getByLabelText(/safety status — review required/i),
    ).toBeInTheDocument();
  });

  it("treating indicator shows 'not assigned' when diagnosis is empty", () => {
    renderRibbon({ provisionalDiagnosis: "" });
    expect(screen.getByText(/treating: not assigned/i)).toBeInTheDocument();
  });

  it("treating indicator shows diagnosis when set", () => {
    renderRibbon({ provisionalDiagnosis: "Upper respiratory infection" });
    expect(
      screen.getByText(/treating: upper respiratory infection/i),
    ).toBeInTheDocument();
  });

  it("treating indicator never renders the legacy em-dash placeholder", () => {
    renderRibbon({ provisionalDiagnosis: "" });
    expect(screen.queryByText(/treating: —/)).not.toBeInTheDocument();
    expect(screen.queryByText(/treating: --/)).not.toBeInTheDocument();
  });

  it("safety tooltip describes review when clashes are visible", () => {
    renderRibbon({ safetyVisible: true });
    expect(
      screen.getByText(/check allergies, interactions, and contraindications/i),
    ).toBeInTheDocument();
  });

  it("safety tooltip describes clear state when no clashes", () => {
    renderRibbon();
    expect(
      screen.getByText(/no unacknowledged allergy clashes or drug interactions/i),
    ).toBeInTheDocument();
  });

  it("returns null for walk-in appointments without patient_id", () => {
    const { container } = render(
      <RxFormProvider
        appointmentId="appt-walkin"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <SideSheetHost>
          <PatientRibbon
            appointment={makeAppointment({ patient_id: null })}
            token="test-token"
          />
        </SideSheetHost>
      </RxFormProvider>,
    );
    expect(container.querySelector('[data-testid="patient-ribbon"]')).toBeNull();
  });
});

describe("PatientRibbon expand surfaces (ribbon-expand Phase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOptionalRxSafetyMock.mockReturnValue(null);
    mockRibbonData.allergies = [];
    mockRibbonData.activeMeds = [];
    mockRibbonData.activeMedsCount = 0;
  });

  it("opens SnapshotPane in a side sheet from the chart trigger", async () => {
    renderRibbon();

    fireEvent.click(screen.getByTestId("ribbon-open-chart"));

    await waitFor(() => {
      expect(screen.getByTestId("side-sheet-host")).toBeInTheDocument();
      expect(screen.getByTestId("mock-snapshot-pane")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Patient chart" }),
      ).toBeInTheDocument();
    });
  });

  it("opens HistoryPane in a side sheet from the history trigger", async () => {
    renderRibbon();

    fireEvent.click(screen.getByTestId("ribbon-open-history"));

    await waitFor(() => {
      expect(screen.getByTestId("side-sheet-host")).toBeInTheDocument();
      expect(screen.getByTestId("mock-history-pane")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Visit history" }),
      ).toBeInTheDocument();
    });
  });

  it("opens AllergiesSection in a popover from the allergies trigger", async () => {
    renderRibbon();

    fireEvent.click(screen.getByTestId("ribbon-allergies-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("ribbon-allergies-popover")).toBeInTheDocument();
      expect(screen.getByTestId("mock-allergies-section")).toBeInTheDocument();
    });
  });

  it("lists active chart medications in the meds popover", async () => {
    mockRibbonData.activeMeds = [
      { id: "m1", name: "Atorvastatin", detail: "10 mg" },
      { id: "m2", name: "Telmisartan", detail: "40 mg" },
    ];
    mockRibbonData.activeMedsCount = 2;
    renderRibbon();

    fireEvent.click(screen.getByTestId("ribbon-meds-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("ribbon-meds-popover")).toBeInTheDocument();
      expect(screen.getByTestId("ribbon-meds-list")).toBeInTheDocument();
      expect(screen.getByText("Atorvastatin")).toBeInTheDocument();
      expect(screen.getByText("Telmisartan")).toBeInTheDocument();
    });
  });

  it("keeps allergy severity chips visible in the glance strip", () => {
    mockRibbonData.allergies = [
      {
        id: "a1",
        name: "Penicillin",
        severity: "severe",
        reaction: "Anaphylaxis",
      },
    ];
    renderRibbon();
    expect(screen.getByLabelText(/allergy: penicillin/i)).toBeInTheDocument();
  });
});
