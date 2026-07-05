"use client";

import { useMemo } from "react";
import { TestResultRowCard } from "@/components/cockpit/rx/objective/TestResultRow";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { RX_FIELD_INPUT_CLASS, RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import type { TestResultRow, TestResultSource } from "@/types/prescription";

export interface TestResultsListProps {
  source: TestResultSource;
  disabled?: boolean;
  /** OBJ-D7 — legacy free-text escape hatch (patient-brought section only). */
  showLegacyTextarea?: boolean;
}

function createEmptyTestResultRow(source: TestResultSource): TestResultRow {
  return {
    id: crypto.randomUUID(),
    source,
    name: "",
    value: null,
    unit: null,
    date: null,
    interpretation: null,
    notes: null,
  };
}

export function TestResultsList({
  source,
  disabled = false,
  showLegacyTextarea = false,
}: TestResultsListProps) {
  const { state, dispatch, setField } = useRxForm();
  const rows = useMemo(
    () => state.fields.testResultsStructured.filter((row) => row.source === source),
    [source, state.fields.testResultsStructured],
  );

  function addRow() {
    if (disabled) return;
    dispatch({ type: "ADD_TEST_RESULT", row: createEmptyTestResultRow(source) });
  }

  const sectionLabel =
    source === "patient_report" ? "Patient-brought reports" : "In-clinic point-of-care";

  return (
    <div className="space-y-2" data-testid={`test-results-list-${source}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={RX_FIELD_LABEL_CLASS}>{sectionLabel}</span>
        {!disabled ? (
          <button
            type="button"
            onClick={addRow}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/60 hover:bg-muted/40"
            data-testid={`test-results-add-${source}`}
          >
            Add result
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
          data-testid={`test-results-empty-${source}`}
        >
          {disabled
            ? "No structured results recorded."
            : "No results yet — add a row or use the chips on a new card."}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <TestResultRowCard key={row.id} row={row} disabled={disabled} />
          ))}
        </div>
      )}

      {showLegacyTextarea ? (
        <div className="space-y-1 border-t border-border pt-3">
          <label htmlFor="testResults" className={RX_FIELD_LABEL_CLASS}>
            Test results (free-text — legacy escape hatch)
          </label>
          <textarea
            id="testResults"
            rows={3}
            value={state.fields.testResults}
            onChange={(e) => setField("testResults", e.target.value)}
            className={RX_FIELD_INPUT_CLASS}
            placeholder="Unstructured reports / labs when structured rows are not used"
            maxLength={3000}
            disabled={disabled}
            data-testid="test-results-legacy-textarea"
          />
        </div>
      ) : null}
    </div>
  );
}
