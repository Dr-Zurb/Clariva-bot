import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  type TestResultRow,
} from "@/components/cockpit/rx/RxFormContext";
import {
  TestResultsList,
  todayIsoDate,
} from "@/components/cockpit/rx/objective/TestResultsList";
import { deriveTestResults } from "@/lib/cockpit/test-results";
import { resultsFlowsheetAnalyteKey } from "@/lib/cockpit/results-flowsheet";

vi.mock("@/lib/api/patient-chart", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/patient-chart")>();
  return {
    ...actual,
    getPatientResultsTimeline: vi.fn().mockResolvedValue({
      data: { results: [] },
    }),
  };
});

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
  method: null,
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
  method: null,
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

function resultRows() {
  return screen.getAllByTestId(/^test-result-row-/).filter((el) => {
    const id = el.getAttribute("data-testid") ?? "";
    return !id.endsWith("-remove");
  });
}

function searchAndPick(label: string, query?: string) {
  const search = screen.getByTestId("test-results-search");
  fireEvent.focus(search);
  if (query != null) {
    fireEvent.change(search, { target: { value: query } });
  }
  fireEvent.click(
    screen.getByRole("option", { name: (accessibleName) => accessibleName === label }),
  );
}

describe("TestResultsList (reports table)", () => {
  it("defaults the date picker to today and groups new adds on that date", () => {
    renderWithRxForm(<TestResultsList />);

    const picker = screen.getByTestId("test-results-entry-date");
    expect(picker).toHaveValue(todayIsoDate());
    expect(screen.queryByTestId("test-results-new-report")).not.toBeInTheDocument();

    searchAndPick("CBC");
    expect(screen.getByTestId(`test-results-date-tab-${todayIsoDate()}`)).toBeInTheDocument();
    expect(screen.getByTestId(`test-results-date-${todayIsoDate()}`)).toBeInTheDocument();
    expect(resultRows().length).toBeGreaterThanOrEqual(5);
    expect(screen.getByDisplayValue("Haemoglobin")).toBeInTheDocument();
    expect(screen.getByTestId("test-results-table-scroll")).toHaveClass(
      "max-h-[30rem]",
      "overflow-auto",
    );
  });

  it("renders undated rows and adds a new test under today", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C, RBS];
    renderWithRxForm(<TestResultsList />, fields);

    expect(screen.getByTestId(`test-result-row-${HBA1C.id}`)).toBeInTheDocument();
    expect(screen.getByTestId("test-results-date-tab-undated")).toBeInTheDocument();

    searchAndPick("Haemoglobin", "hb");
    expect(screen.getByTestId(`test-results-date-${todayIsoDate()}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`test-result-row-${HBA1C.id}`)).not.toBeInTheDocument();
    expect(resultRows()).toHaveLength(1);
    expect(screen.getByDisplayValue("Haemoglobin")).toBeInTheDocument();
  });

  it("keeps notes on the row and hides source / interpretation", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C];
    renderWithRxForm(<TestResultsList />, fields);

    expect(screen.getByTestId(`test-result-notes-${HBA1C.id}`)).toBeInTheDocument();
    expect(
      screen.queryByTestId(`test-result-source-${HBA1C.id}-in_clinic_poc`),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`test-result-interpretation-${HBA1C.id}-high`),
    ).not.toBeInTheDocument();
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

  it("does not render the retired free-text results field", () => {
    renderWithRxForm(<TestResultsList />);
    expect(screen.queryByTestId("test-results-legacy-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-results-legacy-textarea")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/free-text/i)).not.toBeInTheDocument();
  });

  it("renders read-only summaries without edit inputs when disabled", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [HBA1C];
    renderWithRxForm(<TestResultsList disabled />, fields);

    const card = screen.getByTestId(`test-result-row-${HBA1C.id}`);
    expect(within(card).getByText("HbA1c: 7.8 % (High)")).toBeInTheDocument();
    expect(screen.queryByTestId(`test-result-name-${HBA1C.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-results-search")).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-results-entry-date")).not.toBeInTheDocument();
  });

  it("adds a custom test from free-text search", () => {
    renderWithRxForm(<TestResultsList />);
    const search = screen.getByTestId("test-results-search");
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "My special test" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(resultRows()).toHaveLength(1);
    expect(screen.getByDisplayValue("My special test")).toBeInTheDocument();
  });

  it("parses an editable range and keeps method and notes on the row", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [
      { ...HBA1C, refLow: 4, refHigh: 5.6, refText: null },
    ];
    renderWithRxForm(<TestResultsList />, fields);

    const range = screen.getByTestId(`test-result-range-${HBA1C.id}`);
    fireEvent.change(range, { target: { value: "12-17" } });
    fireEvent.blur(range);
    expect(range).toHaveValue("12–17");

    fireEvent.change(screen.getByTestId(`test-result-method-${HBA1C.id}`), {
      target: { value: "HPLC" },
    });
    expect(screen.getByTestId(`test-result-method-${HBA1C.id}`)).toHaveValue("HPLC");
  });

  it("keeps a different picker date on its own tab and shows only that date", () => {
    renderWithRxForm(<TestResultsList />);
    searchAndPick("CBC");

    const picker = screen.getByTestId("test-results-entry-date");
    fireEvent.change(picker, { target: { value: "2026-06-02" } });
    expect(screen.getByTestId("test-results-date-empty")).toBeInTheDocument();
    expect(screen.getByTestId(`test-results-date-tab-${todayIsoDate()}`)).toBeInTheDocument();

    searchAndPick("Haemoglobin", "hb");
    expect(screen.getByTestId("test-results-date-2026-06-02")).toBeInTheDocument();
    expect(screen.getByTestId("test-results-date-tab-2026-06-02")).toBeInTheDocument();
    expect(screen.queryByTestId(`test-results-date-${todayIsoDate()}`)).not.toBeInTheDocument();
    expect(resultRows()).toHaveLength(1);
    expect(screen.getByDisplayValue("Haemoglobin")).toBeInTheDocument();
  });

  it("clicking a date tab shows that date and sets the picker", () => {
    const today = todayIsoDate();
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [
      { ...HBA1C, date: today },
      { ...RBS, date: "2026-06-02" },
    ];
    renderWithRxForm(<TestResultsList />, fields);

    expect(screen.getByTestId(`test-result-row-${HBA1C.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`test-result-row-${RBS.id}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("test-results-date-tab-2026-06-02"));
    expect(screen.getByTestId("test-results-entry-date")).toHaveValue("2026-06-02");
    expect(screen.getByTestId(`test-result-row-${RBS.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`test-result-row-${HBA1C.id}`)).not.toBeInTheDocument();
  });

  it("hides Compare until two dates exist", () => {
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [{ ...HBA1C, date: todayIsoDate() }];
    renderWithRxForm(<TestResultsList />, fields);
    expect(screen.queryByTestId("test-results-compare-toggle")).not.toBeInTheDocument();
  });

  it("Compare shows a flowsheet and a cell opens that date for edit", () => {
    const today = todayIsoDate();
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [
      { ...HBA1C, date: today },
      { ...RBS, date: "2026-06-02" },
    ];
    renderWithRxForm(<TestResultsList />, fields);

    fireEvent.click(screen.getByTestId("test-results-compare-toggle"));
    expect(screen.getByTestId("test-results-flowsheet")).toBeInTheDocument();
    expect(screen.queryByTestId(`test-result-row-${HBA1C.id}`)).not.toBeInTheDocument();
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("180")).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("test-results-flowsheet-cell-2026-06-02-analyte:rbs"),
    );
    expect(screen.queryByTestId("test-results-flowsheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("test-results-entry-date")).toHaveValue("2026-06-02");
    expect(screen.getByTestId(`test-result-row-${RBS.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`test-result-value-${RBS.id}`)).toHaveFocus();
  });

  it("opens an analyte trend popover for a numeric test", async () => {
    const today = todayIsoDate();
    const fields = createEmptyRxFormFields();
    fields.testResultsStructured = [
      { ...HBA1C, date: today, value: "7.8" },
      { ...HBA1C, id: "r1b", date: "2026-06-02", value: "6.9" },
    ];
    renderWithRxForm(<TestResultsList />, fields);

    fireEvent.click(
      screen.getByTestId(`analyte-trend-button-${resultsFlowsheetAnalyteKey("HbA1c")}`),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`analyte-trend-popover-${resultsFlowsheetAnalyteKey("HbA1c")}`),
      ).toBeInTheDocument(),
    );
  });
});
