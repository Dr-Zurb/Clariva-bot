"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AnalyteTrendButton } from "@/components/cockpit/rx/objective/AnalyteTrendButton";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { CHART_COMPACT_INPUT_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import type {
  AnalyteTrendSeries,
  ResultsDateGroup,
} from "@/lib/cockpit/results-flowsheet";
import {
  formatTestResultRefRange,
  formatTestResultRow,
  parseTestResultRefRange,
} from "@/lib/cockpit/test-results";
import type { TestResultRow } from "@/types/prescription";
import { cn } from "@/lib/utils";

export const RESULTS_TABLE_GRID_CLASS =
  "grid grid-cols-[minmax(6.5rem,1.2fr)_4.25rem_3.25rem_5.25rem_5.25rem_minmax(4.5rem,1fr)_1.75rem] items-center gap-x-1.5";

export interface TestResultTableRowProps {
  row: TestResultRow;
  disabled?: boolean;
  autoFocusValue?: boolean;
  onValueCommit?: () => void;
  trendSeries?: AnalyteTrendSeries | null;
  trendGroups?: readonly ResultsDateGroup[];
}

export { formatTestResultRefRange };

export function TestResultTableRow({
  row,
  disabled = false,
  autoFocusValue = false,
  onValueCommit,
  trendSeries = null,
  trendGroups = [],
}: TestResultTableRowProps) {
  const { dispatch } = useRxForm();
  const valueRef = useRef<HTMLInputElement>(null);
  const [rangeDraft, setRangeDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!autoFocusValue || disabled) return;
    valueRef.current?.focus();
    valueRef.current?.select();
  }, [autoFocusValue, disabled]);

  function patch(updates: Partial<TestResultRow>) {
    if (disabled) return;
    dispatch({ type: "UPDATE_TEST_RESULT", id: row.id, patch: updates });
  }

  function removeRow() {
    if (disabled) return;
    dispatch({ type: "REMOVE_TEST_RESULT", id: row.id });
  }

  function applyRange(raw: string) {
    patch(parseTestResultRefRange(raw));
    setRangeDraft(null);
  }

  if (disabled) {
    const summary = formatTestResultRow(row);
    if (!summary) return null;
    return (
      <div
        className="flex items-center gap-1.5 border-b border-border/50 px-2 py-1.5 text-sm text-foreground"
        data-testid={`test-result-row-${row.id}`}
        aria-label={summary}
      >
        {trendSeries ? (
          <AnalyteTrendButton series={trendSeries} currentGroups={trendGroups} />
        ) : null}
        <span>{summary}</span>
      </div>
    );
  }

  const rangeValue = rangeDraft ?? formatTestResultRefRange(row);
  const inputClass = cn(CHART_COMPACT_INPUT_CLASS, "mt-0");

  return (
    <div
      className={cn(
        RESULTS_TABLE_GRID_CLASS,
        "border-b border-border/40 px-2 py-1"
      )}
      data-testid={`test-result-row-${row.id}`}
      role="row"
      aria-label={`Test result ${row.name || "new row"}`}
    >
      <div className="flex min-w-0 items-center gap-0.5">
        {trendSeries ? (
          <AnalyteTrendButton series={trendSeries} currentGroups={trendGroups} />
        ) : null}
        <input
          id={`test-result-name-${row.id}`}
          type="text"
          value={row.name}
          onChange={(event) => patch({ name: event.target.value })}
          className={cn(inputClass, "min-w-0 flex-1")}
          placeholder="Test"
          maxLength={200}
          aria-label="Test name"
          data-testid={`test-result-name-${row.id}`}
        />
      </div>
      <input
        ref={valueRef}
        id={`test-result-value-${row.id}`}
        type="text"
        value={row.value ?? ""}
        onChange={(event) => patch({ value: event.target.value || null })}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onValueCommit?.();
        }}
        className={inputClass}
        placeholder="Value"
        maxLength={200}
        aria-label="Value"
        data-testid={`test-result-value-${row.id}`}
      />
      <input
        id={`test-result-unit-${row.id}`}
        type="text"
        value={row.unit ?? ""}
        onChange={(event) => patch({ unit: event.target.value || null })}
        className={inputClass}
        placeholder="Unit"
        maxLength={50}
        aria-label="Unit"
        data-testid={`test-result-unit-${row.id}`}
      />
      <input
        id={`test-result-range-${row.id}`}
        type="text"
        value={rangeValue}
        onChange={(event) => setRangeDraft(event.target.value)}
        onBlur={() => {
          if (rangeDraft == null) return;
          applyRange(rangeDraft);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          applyRange(event.currentTarget.value);
        }}
        className={inputClass}
        placeholder="Range"
        maxLength={100}
        aria-label="Reference range"
        data-testid={`test-result-range-${row.id}`}
      />
      <input
        id={`test-result-method-${row.id}`}
        type="text"
        value={row.method ?? ""}
        onChange={(event) => patch({ method: event.target.value || null })}
        className={inputClass}
        placeholder="Method"
        maxLength={80}
        aria-label="Method"
        data-testid={`test-result-method-${row.id}`}
      />
      <input
        id={`test-result-notes-${row.id}`}
        type="text"
        value={row.notes ?? ""}
        onChange={(event) => patch({ notes: event.target.value || null })}
        className={inputClass}
        placeholder="Notes"
        maxLength={1000}
        aria-label="Notes"
        data-testid={`test-result-notes-${row.id}`}
      />
      <button
        type="button"
        aria-label="Remove test"
        onClick={removeRow}
        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        data-testid={`test-result-remove-${row.id}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
