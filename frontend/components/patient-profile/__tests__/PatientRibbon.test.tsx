import React from "react";
import { render, screen } from "@testing-library/react";
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
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PatientRibbon } from "@/components/patient-profile/PatientRibbon";

const prescriptionIdRef = { current: null as string | null };

const mockRibbonData = {
  identity: { ageYears: 42, sex: "M" as const, weightKg: 68 },
  allergies: [],
  chronicConditions: [],
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
      <PatientRibbon appointment={makeAppointment()} token="test-token" />
    </RxFormProvider>,
  );
}

describe("PatientRibbon indicator labels (cnc-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOptionalRxSafetyMock.mockReturnValue(null);
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
        <PatientRibbon
          appointment={makeAppointment({ patient_id: null })}
          token="test-token"
        />
      </RxFormProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
