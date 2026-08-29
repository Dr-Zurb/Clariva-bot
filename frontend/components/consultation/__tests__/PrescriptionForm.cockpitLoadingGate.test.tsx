/**
 * Cockpit Plan must not wait on draft `loading` — S/O/A already paint under
 * the shared provider; Plan should soft-RESET with them.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";

vi.mock("@/components/cockpit/rx/PrescriptionFormCompositionRoot", () => ({
  PrescriptionFormCompositionRoot: () => (
    <div data-testid="rx-composition-root">plan body</div>
  ),
}));

vi.mock("@/components/cockpit/rx/RxSafetyContext", () => ({
  RxSafetyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRxSafety: () => ({
    allergies: [],
    ddiInteractions: [],
    isAcked: () => false,
    onAcknowledge: () => undefined,
    onAckDdi: () => undefined,
    drugMasterIndex: new Map(),
    setDrugMasterIndex: () => undefined,
  }),
}));

vi.mock("@/components/cockpit/rx/useRxFormProviderSetup", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/cockpit/rx/useRxFormProviderSetup")
  >("@/components/cockpit/rx/useRxFormProviderSetup");
  return {
    ...actual,
    useRxFormProviderSetup: vi.fn(),
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: vi.fn().mockResolvedValue({ data: { settings: {} } }),
    getAppointmentDeskVitals: vi.fn().mockResolvedValue({ data: { vitals: null } }),
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
  };
});

import PrescriptionForm from "@/components/consultation/PrescriptionForm";
import { useRxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";

const mockSetup = useRxFormProviderSetup as unknown as ReturnType<typeof vi.fn>;

function makeShell(loading: boolean): RxFormProviderSetup {
  return {
    loading,
    initialFields: createEmptyRxFormFields(),
    entryMode: "structured",
    setEntryMode: vi.fn(),
    prescription: null,
    setPrescription: vi.fn(),
    prescriptionIdRef: { current: null },
    attachments: [],
    setAttachments: vi.fn(),
    setInitialFields: vi.fn(),
    generateInstanceIds: (n: number) => Array.from({ length: n }, (_, i) => `m-${i}`),
    instanceIdSeqRef: { current: 0 },
    medicineInstanceIds: ["m-1"],
    setMedicineInstanceIds: vi.fn(),
    subjectiveSectionOrder: null,
    setSubjectiveSectionOrder: vi.fn(),
    subjectiveSectionCollapsed: null,
    setSubjectiveSectionCollapsed: vi.fn(),
    subjectiveSectionHidden: null,
    setSubjectiveSectionHidden: vi.fn(),
    objectiveDefaults: null,
    setObjectiveDefaults: vi.fn(),
    planDefaults: null,
    setPlanDefaults: vi.fn(),
    assessmentDefaults: null,
    setAssessmentDefaults: vi.fn(),
    objectiveSeed: null,
    providerProps: {
      key: "appt-1",
      appointmentId: "appt-1",
      patientId: "pat-1",
      token: "tok",
      entryMode: "structured",
      initialFields: createEmptyRxFormFields(),
      consultationType: null,
      autosaveEnabled: !loading,
      prescriptionIdRef: { current: null },
      onPrescriptionCreated: vi.fn(),
    },
  } as unknown as RxFormProviderSetup;
}

describe("PrescriptionForm cockpit loading gate", () => {
  beforeEach(() => {
    mockSetup.mockReset();
  });

  it("renders Plan body under shell while draft is still loading", () => {
    const shell = makeShell(true);
    // Mimic setup before draft resolves: loading + null initialFields.
    shell.initialFields = null;
    mockSetup.mockReturnValue(shell);

    render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="tok"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: null }}
      >
        <PrescriptionFormShellProvider value={shell}>
          <PrescriptionForm
            appointmentId="appt-1"
            patientId="pat-1"
            token="tok"
            subjectiveLifted
            objectiveLifted
            entryModeLifted
            photoLifted
            actionsInFooter
          />
        </PrescriptionFormShellProvider>
      </RxFormProvider>,
    );

    expect(screen.queryByTestId("prescription-form-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("rx-composition-root")).toBeInTheDocument();
  });

  it("shows skeleton loading when standalone and draft is loading", () => {
    const shell = makeShell(true);
    mockSetup.mockReturnValue(shell);

    render(
      <PrescriptionForm
        appointmentId="appt-1"
        patientId="pat-1"
        token="tok"
      />,
    );

    expect(screen.getByTestId("prescription-form-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("rx-composition-root")).not.toBeInTheDocument();
  });
});
