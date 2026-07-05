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

describe("TestResultsList (obj-21)", () => {
  it("filters rows by source and dispatches ADD_TEST_RESULT with the section source", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C, RBS];
    renderWithRxForm(
      <TestResultsList source="patient_report" showLegacyTextarea />,
      fields,
    );

    expect(screen.getByTestId("test-results-list-patient_report")).toBeInTheDocument();
    expect(screen.getByTestId(`test-result-row-${HBA1C.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`test-result-row-${RBS.id}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("test-results-add-patient_report"));
    const cards = screen.getAllByTestId(/^test-result-row-/);
    expect(cards.length).toBe(2);
  });

  it("updates interpretation and source via reducer actions", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [{ ...HBA1C, interpretation: null }];
    renderWithRxForm(<TestResultsList source="patient_report" />, fields);

    fireEvent.click(screen.getByTestId(`test-result-interpretation-${HBA1C.id}-high`));
    expect(screen.getByTestId(`test-result-interpretation-${HBA1C.id}-high`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByTestId(`test-result-source-${HBA1C.id}-in_clinic_poc`));
    expect(screen.queryByTestId(`test-result-row-${HBA1C.id}`)).not.toBeInTheDocument();
  });

  it("removes a row via REMOVE_TEST_RESULT", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C];
    renderWithRxForm(<TestResultsList source="patient_report" />, fields);

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

  it("keeps the legacy textarea as the escape hatch in the patient-brought section", () => {
    renderWithRxForm(<TestResultsList source="patient_report" showLegacyTextarea />);
    expect(screen.getByTestId("test-results-legacy-textarea")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Test results (free-text — legacy escape hatch)"),
    ).toBeInTheDocument();
  });

  it("renders read-only summaries without edit inputs when disabled", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C];
    renderWithRxForm(<TestResultsList source="patient_report" disabled />, fields);

    const card = screen.getByTestId(`test-result-row-${HBA1C.id}`);
    expect(within(card).getByText("HbA1c: 7.8 % (High)")).toBeInTheDocument();
    expect(screen.queryByTestId(`test-result-name-${HBA1C.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-results-add-patient_report")).not.toBeInTheDocument();
  });
});
