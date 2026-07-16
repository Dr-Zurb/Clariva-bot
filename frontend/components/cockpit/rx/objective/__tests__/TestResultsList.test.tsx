import type { ReactElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  type TestResultRow,
} from "@/components/cockpit/rx/RxFormContext";
import { TestResultsList } from "@/components/cockpit/rx/objective/TestResultsList";
import { deriveTestResults } from "@/lib/cockpit/test-results";

const HBA1C: TestResultRow = {
  id: "r1",
  source: "patient_report",
  name: "HbA1c",
  value: "7.8",
  unit: "%",
  interpretation: "high",
  date: null,
  notes: null,
  reportId: null,
  refLow: null,
  refHigh: null,
  refText: null,
};

const RBS: TestResultRow = {
  id: "r2",
  source: "in_clinic_poc",
  name: "RBS / Glucometer",
  value: "180",
  unit: "mg/dL",
  interpretation: null,
  date: null,
  notes: null,
  reportId: null,
  refLow: null,
  refHigh: null,
  refText: null,
};

function renderWithRxForm(
  ui: ReactElement,
  initialFields = createEmptyRxFormFields(),
) {
  const prescriptionIdRef = { current: null as string | null };
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

describe("TestResultsList (obj-21 / rpt-01)", () => {
  it("renders all sources in one list and adds a patient_report row by default", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C, RBS];
    renderWithRxForm(<TestResultsList showLegacyTextarea />, fields);

    expect(screen.getByTestId("test-results-list")).toBeInTheDocument();
    expect(screen.getByTestId(`test-result-row-${HBA1C.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`test-result-row-${RBS.id}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("test-results-add"));
    const cards = screen.getAllByTestId(/^test-result-row-/);
    expect(cards.length).toBe(3);
  });

  it("updates interpretation and source via reducer actions", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [{ ...HBA1C, interpretation: null }];
    renderWithRxForm(<TestResultsList />, fields);

    fireEvent.click(screen.getByTestId(`test-result-interpretation-${HBA1C.id}-high`));
    expect(screen.getByTestId(`test-result-interpretation-${HBA1C.id}-high`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByTestId(`test-result-source-${HBA1C.id}-in_clinic_poc`));
    expect(screen.getByTestId(`test-result-source-${HBA1C.id}-in_clinic_poc`)).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("removes a row via REMOVE_TEST_RESULT", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C];
    renderWithRxForm(<TestResultsList />, fields);

    fireEvent.click(screen.getByTestId(`test-result-remove-${HBA1C.id}`));
    expect(screen.queryByTestId(`test-result-row-${HBA1C.id}`)).not.toBeInTheDocument();
  });

  it("derives test_results from structured rows through buildRxPayload (obj-20 contract)", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C, RBS];
    const payload = buildRxPayload(fields);
    expect(payload.testResults).toBe(deriveTestResults([HBA1C, RBS]));
    expect(payload.testResultsJson).toEqual([HBA1C, RBS]);
  });

  it("keeps the legacy textarea as the escape hatch", () => {
    renderWithRxForm(<TestResultsList showLegacyTextarea />);
    expect(screen.getByTestId("test-results-legacy-textarea")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Test results (free-text — legacy escape hatch)"),
    ).toBeInTheDocument();
  });

  it("renders read-only summaries without edit inputs when disabled", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C];
    renderWithRxForm(<TestResultsList disabled />, fields);

    const card = screen.getByTestId(`test-result-row-${HBA1C.id}`);
    expect(within(card).getByText("HbA1c: 7.8 % (High)")).toBeInTheDocument();
    expect(screen.queryByTestId(`test-result-name-${HBA1C.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-results-add")).not.toBeInTheDocument();
  });

  it("scaffolds a CBC panel under a report header from the library picker", () => {
    renderWithRxForm(<TestResultsList />);

    fireEvent.click(screen.getByTestId("test-results-library"));
    fireEvent.click(screen.getByTestId("test-results-panel-cbc"));

    const groups = screen.getAllByTestId(/^test-results-group-/);
    expect(groups.length).toBe(1);
    expect(groups[0]).toHaveTextContent("CBC");
    expect(screen.getAllByTestId(/^test-result-row-/).length).toBeGreaterThanOrEqual(5);
    expect(screen.getByDisplayValue("Haemoglobin")).toBeInTheDocument();
  });

  it("adds a blank custom test row", () => {
    renderWithRxForm(<TestResultsList />);
    fireEvent.click(screen.getByTestId("test-results-add"));
    expect(screen.getByTestId("test-results-add")).toHaveTextContent("Add custom test");
    expect(screen.getAllByTestId(/^test-result-row-/)).toHaveLength(1);
  });
});
