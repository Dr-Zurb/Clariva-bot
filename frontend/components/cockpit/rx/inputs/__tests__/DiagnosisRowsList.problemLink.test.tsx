import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { DiagnosisRowsList } from "@/components/cockpit/rx/inputs/DiagnosisRowsList";
import type { DiagnosisRow } from "@/types/prescription";
import type { PatientChronicCondition } from "@/types/patient-chart";
import { usePatientConditionsQuery } from "@/hooks/queries/usePatientConditionsQuery";

// asmt-06: capture is now the ICD catalog autocomplete — stub the search so
// no real network fires (empty results → free-text commit path).
vi.mock("@/lib/api/diagnosis-catalog", () => ({
  searchDiagnoses: vi.fn().mockResolvedValue({
    success: true,
    data: { results: [] },
    meta: { timestamp: "", requestId: "" },
  }),
}));

// asmt-07: the free-text (no-match) path routes through the gated AI resolver —
// stub it to "no suggestions" so it degrades to an uncoded card (today's path).
vi.mock("@/lib/api/diagnosis-parse", () => ({
  resolveDiagnosisWithAI: vi.fn().mockResolvedValue({
    success: true,
    data: { suggestions: [] },
    meta: { timestamp: "", requestId: "" },
  }),
}));

vi.mock("@/hooks/queries/usePatientConditionsQuery", () => ({
  usePatientConditionsQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
}));

const prescriptionIdRef = { current: null as string | null };

const PRIMARY: DiagnosisRow = {
  id: "dx-1",
  label: "Hypertension",
  kind: "primary",
  certainty: "provisional",
  status: "new",
  note: null,
  acuity: null,
  conditionId: null,
};

const HTN_CONDITION: PatientChronicCondition = {
  id: "cond-htn-1",
  doctor_id: "doc-1",
  patient_id: "pat-1",
  condition: "Hypertension",
  status: "active",
  diagnosed_on: null,
  diagnosed_ago_value: null,
  diagnosed_ago_unit: null,
  resolved_ago_value: null,
  resolved_ago_unit: null,
  on_treatment: null,
  acuity: null,
  code: "BA00",
  code_title: "Essential hypertension",
  note: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderList(
  ui: ReactElement,
  initialFields = {
    ...createEmptyRxFormFields(),
    diagnoses: [PRIMARY],
    provisionalDiagnosis: "Hypertension",
  },
) {
  return render(
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
      {ui}
    </RxFormProvider>,
  );
}

describe("DiagnosisRowsList (soft reconcile / no promote UI)", () => {
  beforeEach(() => {
    vi.mocked(usePatientConditionsQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePatientConditionsQuery>);
  });

  it("does not render problem-list promote UI", () => {
    renderList(<DiagnosisRowsList />);
    expect(screen.queryByTestId("active-problems-quick-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-problems-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("diagnosis-problem-link-dx-1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add to problem list/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Known badge when conditionId is already set", () => {
    vi.mocked(usePatientConditionsQuery).mockReturnValue({
      data: [HTN_CONDITION],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePatientConditionsQuery>);
    renderList(<DiagnosisRowsList />, {
      ...createEmptyRxFormFields(),
      diagnoses: [{ ...PRIMARY, conditionId: "cond-htn-1" }],
      provisionalDiagnosis: "Hypertension",
    });
    expect(screen.getByTestId("diagnosis-known-badge-dx-1")).toHaveTextContent(
      "Known",
    );
  });

  it("soft-links an unlinked diagnosis when a matching known condition loads", async () => {
    vi.mocked(usePatientConditionsQuery).mockReturnValue({
      data: [HTN_CONDITION],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePatientConditionsQuery>);
    renderList(<DiagnosisRowsList />);
    await waitFor(() => {
      expect(screen.getByTestId("diagnosis-known-badge-dx-1")).toBeInTheDocument();
    });
  });

  it("clears Known badge when the linked known condition is no longer active", async () => {
    // Stale stamp: Dx still has conditionId but chart list no longer has that row.
    renderList(<DiagnosisRowsList />, {
      ...createEmptyRxFormFields(),
      diagnoses: [{ ...PRIMARY, conditionId: "cond-htn-1" }],
      provisionalDiagnosis: "Hypertension",
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("diagnosis-known-badge-dx-1"),
      ).not.toBeInTheDocument();
    });
  });

  it("does not show Known badge on differentials even with a matching condition", () => {
    vi.mocked(usePatientConditionsQuery).mockReturnValue({
      data: [HTN_CONDITION],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePatientConditionsQuery>);
    renderList(<DiagnosisRowsList />, {
      ...createEmptyRxFormFields(),
      diagnoses: [
        {
          ...PRIMARY,
          id: "ddx-1",
          label: "Hypertension",
          kind: "differential",
          conditionId: null,
        },
      ],
      provisionalDiagnosis: "",
      differentialDiagnosis: ["Hypertension"],
    });
    expect(
      screen.queryByTestId("diagnosis-known-badge-ddx-1"),
    ).not.toBeInTheDocument();
  });

  it("disables Secondary with strikethrough when the only card is a differential", () => {
    renderList(<DiagnosisRowsList />, {
      ...createEmptyRxFormFields(),
      diagnoses: [
        {
          ...PRIMARY,
          id: "ddx-1",
          label: "hypothyroidism",
          kind: "differential",
        },
      ],
      provisionalDiagnosis: "",
      differentialDiagnosis: ["hypothyroidism"],
    });
    const secondary = screen.getByRole("button", { name: "Secondary" });
    expect(secondary).toHaveAttribute("aria-disabled", "true");
    expect(secondary.className).toMatch(/line-through/);
  });

  it("disables Secondary with strikethrough when it is the only committed card", () => {
    renderList(<DiagnosisRowsList />);
    const secondary = screen.getByRole("button", { name: "Secondary" });
    expect(secondary).toHaveAttribute("aria-disabled", "true");
    expect(secondary).toHaveAttribute(
      "title",
      expect.stringMatching(/add another diagnosis/i),
    );
    expect(secondary.className).toMatch(/line-through/);
    fireEvent.click(secondary);
    expect(screen.getByRole("button", { name: "Primary" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("allows Secondary once a second committed diagnosis exists", () => {
    renderList(<DiagnosisRowsList />, {
      ...createEmptyRxFormFields(),
      diagnoses: [
        PRIMARY,
        {
          ...PRIMARY,
          id: "dx-2",
          label: "GERD",
          kind: "secondary",
        },
      ],
      provisionalDiagnosis: "Hypertension",
    });
    const secondaryButtons = screen.getAllByRole("button", { name: "Secondary" });
    expect(
      secondaryButtons.every(
        (btn) => btn.getAttribute("aria-disabled") !== "true",
      ),
    ).toBe(true);
  });

  it("puts Confirmed/Provisional certainty chips on committed cards (no Rule out)", () => {
    renderList(<DiagnosisRowsList />);
    expect(screen.getByTestId("diagnosis-certainty-dx-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmed" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Provisional" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rule out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Working" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Provisional/Working" }),
    ).not.toBeInTheDocument();
  });

  it("puts acuity chips on committed cards", () => {
    renderList(<DiagnosisRowsList />);
    expect(screen.getByTestId("diagnosis-acuity-dx-1")).toBeInTheDocument();
    const improving = screen.getByRole("button", { name: "Improving" });
    fireEvent.click(improving);
    expect(improving).toHaveAttribute("aria-pressed", "true");
  });

  it("hides acuity on differential cards", () => {
    renderList(<DiagnosisRowsList />, {
      ...createEmptyRxFormFields(),
      diagnoses: [
        {
          ...PRIMARY,
          id: "ddx-1",
          label: "Pneumonia",
          kind: "differential",
        },
      ],
      provisionalDiagnosis: "",
      differentialDiagnosis: ["Pneumonia"],
    });
    expect(screen.getByTestId("diagnosis-row-ddx-1")).toBeInTheDocument();
    expect(screen.getByTestId("diagnosis-ddx-toggle-ddx-1")).toBeInTheDocument();
    expect(screen.queryByTestId("diagnosis-acuity-ddx-1")).not.toBeInTheDocument();
  });

  it("does not show New/Ongoing/Resolved status chips on primary cards", () => {
    renderList(<DiagnosisRowsList />);
    expect(screen.queryByTestId("diagnosis-status-dx-1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ongoing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolved" })).not.toBeInTheDocument();
  });

  it("type-Enter commits a primary card", async () => {
    renderList(<DiagnosisRowsList />, {
      ...createEmptyRxFormFields(),
      diagnoses: [],
      provisionalDiagnosis: "",
    });
    const capture = screen.getByTestId("diagnosis-capture-input");
    fireEvent.change(capture, { target: { value: "Viral URI" } });
    fireEvent.keyDown(capture, { key: "Enter" });
    // Enter resolves against the catalog (async) then commits free text.
    expect(await screen.findByDisplayValue("Viral URI")).toBeInTheDocument();
    // Newly added cards stay collapsed until the user opens them.
    const toggles = screen.getAllByTestId(/diagnosis-row-.*-toggle$/);
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
  });

  it("type-Enter auto-stamps conditionId when a matching known condition exists", async () => {
    vi.mocked(usePatientConditionsQuery).mockReturnValue({
      data: [HTN_CONDITION],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof usePatientConditionsQuery>);
    renderList(<DiagnosisRowsList />, {
      ...createEmptyRxFormFields(),
      diagnoses: [],
      provisionalDiagnosis: "",
    });
    const capture = screen.getByTestId("diagnosis-capture-input");
    fireEvent.change(capture, { target: { value: "Hypertension" } });
    fireEvent.keyDown(capture, { key: "Enter" });
    expect(await screen.findByDisplayValue("Hypertension")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId(/^diagnosis-known-badge-/)).toBeInTheDocument();
    });
  });
});
