import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import {
  ASSESSMENT_TAB_DX_INPUT_ID,
  AssessmentSection,
} from "@/components/cockpit/rx/sections/AssessmentSection";
import type { DiagnosisRow } from "@/types/prescription";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listPatientConditions: vi.fn().mockResolvedValue({
      success: true,
      data: { conditions: [] },
    }),
    updatePatientCondition: vi.fn(),
    archivePatientCondition: vi.fn(),
    getDoctorSettings: vi.fn().mockResolvedValue({
      success: true,
      data: {
        settings: {
          assessment_section_order: [],
          assessment_section_collapsed: {},
          assessment_section_hidden: [],
        },
      },
    }),
    patchDoctorSettings: vi.fn().mockResolvedValue({
      success: true,
      data: {
        settings: {
          assessment_section_order: [],
          assessment_section_collapsed: {},
          assessment_section_hidden: [],
        },
      },
    }),
  };
});

// asmt-06: the capture is now the ICD catalog autocomplete — stub the search
// so no real network fires (empty results → free-text commit path).
vi.mock("@/lib/api/diagnosis-catalog", () => ({
  searchDiagnoses: vi.fn().mockResolvedValue({
    success: true,
    data: { results: [] },
    meta: { timestamp: "", requestId: "" },
  }),
}));

// asmt-07: the free-text (no-match) path now routes through the gated AI
// resolver — stub it to "no suggestions" so it degrades to an uncoded card.
vi.mock("@/lib/api/diagnosis-parse", () => ({
  resolveDiagnosisWithAI: vi.fn().mockResolvedValue({
    success: true,
    data: { suggestions: [] },
    meta: { timestamp: "", requestId: "" },
  }),
}));

const prescriptionIdRef = { current: null as string | null };

const PRIMARY: DiagnosisRow = {
  id: "dx-1",
  label: "Viral URI",
  kind: "primary",
  certainty: "provisional",
  status: "new",
  note: null,
  acuity: null,
};

function renderWithRxForm(
  ui: ReactElement,
  initialFields = createEmptyRxFormFields(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const shell = {
    loading: false,
    initialFields,
    entryMode: "structured" as const,
    setEntryMode: vi.fn(),
    prescription: null,
    setPrescription: vi.fn(),
    prescriptionIdRef,
    attachments: [],
    setAttachments: vi.fn(),
    setInitialFields: vi.fn(),
    generateInstanceIds: () => ["m-1"],
    instanceIdSeqRef: { current: 1 },
    medicineInstanceIds: ["m-1"],
    setMedicineInstanceIds: vi.fn(),
    subjectiveSectionOrder: [],
    setSubjectiveSectionOrder: vi.fn(),
    subjectiveSectionCollapsed: {},
    setSubjectiveSectionCollapsed: vi.fn(),
    subjectiveSectionHidden: [],
    setSubjectiveSectionHidden: vi.fn(),
    objectiveDefaults: null,
    setObjectiveDefaults: vi.fn(),
    planDefaults: null,
    setPlanDefaults: vi.fn(),
    assessmentDefaults: {
      sectionOrder: [],
      sectionCollapsed: {},
      sectionHidden: [],
    },
    setAssessmentDefaults: vi.fn(),
    providerProps: {
      key: "test",
      appointmentId: "appt-1",
      patientId: "pat-1",
      token: "test-token",
      entryMode: "structured" as const,
      initialFields,
      autosaveEnabled: false,
      prescriptionIdRef,
      onPrescriptionCreated: vi.fn(),
    },
  } satisfies RxFormProviderSetup;

  return render(
    <QueryClientProvider client={queryClient}>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={initialFields}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <PrescriptionFormShellProvider value={shell}>{ui}</PrescriptionFormShellProvider>
      </RxFormProvider>
    </QueryClientProvider>,
  );
}

describe("AssessmentSection", () => {
  it("renders diagnosis rows editor with non-diagnosis primary input id", () => {
    renderWithRxForm(<AssessmentSection />, {
      ...createEmptyRxFormFields(),
      diagnoses: [PRIMARY],
      provisionalDiagnosis: "Viral URI",
    });
    const input = document.getElementById(ASSESSMENT_TAB_DX_INPUT_ID);
    expect(input).not.toBeNull();
    expect(input).toHaveValue("Viral URI");
    expect(input).not.toHaveAttribute("id", "diagnosis");
    expect(screen.getByTestId("diagnosis-rows-list")).toBeInTheDocument();
    expect(screen.getByTestId("diagnosis-capture-input")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^differential diagnosis$/i)).not.toBeInTheDocument();
  });

  it("omits Dx editor when dxLifted is true (Plan pane hide flag)", () => {
    renderWithRxForm(
      <AssessmentSection dxLifted />,
      {
        ...createEmptyRxFormFields(),
        diagnoses: [PRIMARY],
        provisionalDiagnosis: "Asthma",
      },
    );
    expect(screen.queryByTestId("diagnosis-rows-list")).not.toBeInTheDocument();
    expect(document.getElementById(ASSESSMENT_TAB_DX_INPUT_ID)).toBeNull();
    expect(screen.queryByTestId("diagnosis-capture-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ongoing-problems-zone")).not.toBeInTheDocument();
  });

  it("updates the primary diagnosis label via the rows editor", () => {
    renderWithRxForm(<AssessmentSection />, {
      ...createEmptyRxFormFields(),
      diagnoses: [PRIMARY],
      provisionalDiagnosis: "Viral URI",
    });
    const input = document.getElementById(ASSESSMENT_TAB_DX_INPUT_ID)!;
    fireEvent.change(input, { target: { value: "Asthma" } });
    expect(input).toHaveValue("Asthma");
  });

  it("adds a diagnosis card via type-to-card Enter (asmt-05)", async () => {
    renderWithRxForm(<AssessmentSection />);
    const capture = screen.getByTestId("diagnosis-capture-input");
    fireEvent.change(capture, { target: { value: "Viral URI" } });
    fireEvent.keyDown(capture, { key: "Enter" });
    // Enter resolves against the catalog (async) then commits free text.
    expect(await screen.findByDisplayValue("Viral URI")).toBeInTheDocument();
  });

  it("does not render a standalone clinical impression section", () => {
    renderWithRxForm(<AssessmentSection />);
    expect(screen.queryByTestId("clinical-impression-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assessment-acuity-toggle")).not.toBeInTheDocument();
  });

  it("puts acuity chips on committed diagnosis cards", () => {
    renderWithRxForm(<AssessmentSection />, {
      ...createEmptyRxFormFields(),
      diagnoses: [PRIMARY],
      provisionalDiagnosis: "Viral URI",
    });
    expect(screen.getByTestId("diagnosis-acuity-dx-1")).toBeInTheDocument();
    const stable = screen.getByRole("button", { name: "Stable" });
    fireEvent.click(stable);
    expect(stable).toHaveAttribute("aria-pressed", "true");
  });

  it("renders Diagnoses and Known conditions zone headings", () => {
    renderWithRxForm(<AssessmentSection />);
    expect(screen.getByTestId("assessment-scroll-top")).toBeInTheDocument();
    expect(screen.getByTestId("assessment-diagnoses-zone")).toBeInTheDocument();
    expect(screen.getByTestId("diagnosis-rows-list")).toBeInTheDocument();
    expect(screen.getByTestId("assessment-known-conditions-zone")).toBeInTheDocument();
    expect(screen.getByTestId("ongoing-problems-zone")).toBeInTheDocument();
    expect(screen.getByTestId("assessment-notes-zone")).toBeInTheDocument();
    expect(screen.getByLabelText("Additional notes (private)")).toBeInTheDocument();
    expect(screen.getByTestId("assessment-expand-all")).toBeInTheDocument();
    expect(screen.getByTestId("assessment-clear-all")).toBeInTheDocument();
    expect(screen.getByTestId("assessment-template-trigger")).toBeInTheDocument();
  });
});
