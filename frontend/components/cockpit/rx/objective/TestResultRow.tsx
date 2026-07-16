"use client";

import { type KeyboardEvent } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  analyteToRowPrefill,
  isLabRangeProvisional,
  LAB_RANGE_VARIES_MICROCOPY,
  lookupLabAnalyteByAlias,
  resolveLabAnalyteRange,
  suggestInterpretationFromRange,
} from "@/lib/cockpit/lab-test-library";
import {
  TEST_RESULT_INTERPRETATION_OPTIONS,
  TEST_RESULT_SOURCE_OPTIONS,
  testChipsForSource,
  type TestResultCatalogEntry,
} from "@/lib/cockpit/test-result-catalog";
import { formatTestResultRow } from "@/lib/cockpit/test-results";
import type {
  TestResultInterpretation,
  TestResultRow,
  TestResultSource,
} from "@/types/prescription";
import { cn } from "@/lib/utils";

export interface TestResultRowCardProps {
  row: TestResultRow;
  disabled?: boolean;
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function TestResultRowCard({ row, disabled = false }: TestResultRowCardProps) {
  const { dispatch } = useRxForm();
  const testChips = testChipsForSource(row.source);
  const libraryMatch = lookupLabAnalyteByAlias(row.name);
  const libraryRange = libraryMatch ? resolveLabAnalyteRange(libraryMatch) : null;
  const rangeIsProvisional = isLabRangeProvisional(libraryRange);
  const autoSuggestion = suggestInterpretationFromRange({
    value: row.value,
    refLow: row.refLow,
    refHigh: row.refHigh,
    refText: row.refText,
  });

  function patch(updates: Partial<TestResultRow>) {
    if (disabled) return;
    dispatch({ type: "UPDATE_TEST_RESULT", id: row.id, patch: updates });
  }

  function removeRow() {
    if (disabled) return;
    dispatch({ type: "REMOVE_TEST_RESULT", id: row.id });
  }

  function applyTestChip(entry: TestResultCatalogEntry) {
    const analyte = lookupLabAnalyteByAlias(entry.name);
    if (analyte) {
      const prefill = analyteToRowPrefill(analyte);
      patch({
        name: prefill.name,
        unit: prefill.unit,
        refLow: prefill.refLow,
        refHigh: prefill.refHigh,
        refText: prefill.refText,
      });
      return;
    }
    patch({
      name: entry.name,
      unit: entry.defaultUnit ?? row.unit ?? null,
    });
  }

  function setInterpretation(next: TestResultInterpretation | null) {
    patch({ interpretation: row.interpretation === next ? null : next });
  }

  function applyAutoSuggestion() {
    if (!autoSuggestion) return;
    patch({ interpretation: autoSuggestion });
  }

  function setSource(next: TestResultSource) {
    if (next === row.source) return;
    patch({ source: next });
  }

  function handleValueChange(nextValue: string) {
    const value = nextValue || null;
    const updates: Partial<TestResultRow> = { value };
    // Soft auto-suggest only when the doctor has not set an interpretation yet.
    if (row.interpretation == null) {
      const suggested = suggestInterpretationFromRange({
        value,
        refLow: row.refLow,
        refHigh: row.refHigh,
        refText: row.refText,
      });
      if (suggested) updates.interpretation = suggested;
    }
    patch(updates);
  }

  function handleSourceKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    option: TestResultSource,
  ) {
    const idx = TEST_RESULT_SOURCE_OPTIONS.findIndex((o) => o.value === option);
    if (idx === -1) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = TEST_RESULT_SOURCE_OPTIONS[(idx + 1) % TEST_RESULT_SOURCE_OPTIONS.length];
      setSource(next.value);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        TEST_RESULT_SOURCE_OPTIONS[
          (idx - 1 + TEST_RESULT_SOURCE_OPTIONS.length) % TEST_RESULT_SOURCE_OPTIONS.length
        ];
      setSource(next.value);
    }
  }

  if (disabled) {
    const summary = formatTestResultRow(row);
    if (!summary) return null;
    return (
      <article
        className="rounded-md border border-border bg-card px-3 py-2"
        data-testid={`test-result-row-${row.id}`}
        aria-label={summary}
      >
        <p className="text-sm text-foreground">{summary}</p>
      </article>
    );
  }

  const hasNumericRange = row.refLow != null || row.refHigh != null;

  return (
    <article
      className="rounded-md border border-border bg-card"
      data-testid={`test-result-row-${row.id}`}
      aria-label={`Test result ${row.name || "new row"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`test-result-name-${row.id}`} className={RX_FIELD_LABEL_CLASS}>
            Test name
          </label>
          <input
            id={`test-result-name-${row.id}`}
            type="text"
            value={row.name}
            onChange={(event) => patch({ name: event.target.value })}
            className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
            placeholder="e.g. HbA1c, Urine dipstick"
            maxLength={200}
            data-testid={`test-result-name-${row.id}`}
          />
        </div>
        <div
          className="flex shrink-0 gap-0.5"
          role="radiogroup"
          aria-label="Result source"
          data-testid={`test-result-source-${row.id}`}
        >
          {TEST_RESULT_SOURCE_OPTIONS.map((option) => {
            const isSelected = row.source === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={option.label}
                data-testid={`test-result-source-${row.id}-${option.value}`}
                onClick={() => setSource(option.value)}
                onKeyDown={(event) => handleSourceKeyDown(event, option.value)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 px-3 py-2">
        <div>
          <span className={RX_FIELD_LABEL_CLASS}>Common tests</span>
          <div
            className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
            role="group"
            aria-label="Common test names"
            data-testid={`test-result-chips-${row.id}`}
          >
            {testChips.map((entry) => {
              const isSelected = row.name.trim() === entry.name;
              return (
                <button
                  key={entry.name}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={entry.name}
                  data-testid={`test-result-chip-${row.id}-${entry.name.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => applyTestChip(entry)}
                  className={chartSelectChipClass(isSelected)}
                >
                  {entry.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label htmlFor={`test-result-value-${row.id}`} className={RX_FIELD_LABEL_CLASS}>
              Value
            </label>
            <input
              id={`test-result-value-${row.id}`}
              type="text"
              value={row.value ?? ""}
              onChange={(event) => handleValueChange(event.target.value)}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
              placeholder="e.g. 7.8"
              maxLength={200}
              data-testid={`test-result-value-${row.id}`}
            />
          </div>
          <div>
            <label htmlFor={`test-result-unit-${row.id}`} className={RX_FIELD_LABEL_CLASS}>
              Unit
            </label>
            <input
              id={`test-result-unit-${row.id}`}
              type="text"
              value={row.unit ?? ""}
              onChange={(event) => patch({ unit: event.target.value || null })}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
              placeholder="e.g. %, mg/dL"
              maxLength={50}
              data-testid={`test-result-unit-${row.id}`}
            />
          </div>
          <div>
            <label htmlFor={`test-result-date-${row.id}`} className={RX_FIELD_LABEL_CLASS}>
              Date
            </label>
            <input
              id={`test-result-date-${row.id}`}
              type="text"
              value={row.date ?? ""}
              onChange={(event) => patch({ date: event.target.value || null })}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
              placeholder="e.g. 2026-06-10"
              maxLength={40}
              data-testid={`test-result-date-${row.id}`}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label htmlFor={`test-result-ref-low-${row.id}`} className={RX_FIELD_LABEL_CLASS}>
              Ref low
            </label>
            <input
              id={`test-result-ref-low-${row.id}`}
              type="text"
              inputMode="decimal"
              value={row.refLow ?? ""}
              onChange={(event) => patch({ refLow: parseOptionalNumber(event.target.value) })}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
              placeholder="e.g. 12"
              data-testid={`test-result-ref-low-${row.id}`}
            />
          </div>
          <div>
            <label htmlFor={`test-result-ref-high-${row.id}`} className={RX_FIELD_LABEL_CLASS}>
              Ref high
            </label>
            <input
              id={`test-result-ref-high-${row.id}`}
              type="text"
              inputMode="decimal"
              value={row.refHigh ?? ""}
              onChange={(event) => patch({ refHigh: parseOptionalNumber(event.target.value) })}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
              placeholder="e.g. 16"
              data-testid={`test-result-ref-high-${row.id}`}
            />
          </div>
          <div>
            <label htmlFor={`test-result-ref-text-${row.id}`} className={RX_FIELD_LABEL_CLASS}>
              Printed range
            </label>
            <input
              id={`test-result-ref-text-${row.id}`}
              type="text"
              value={row.refText ?? ""}
              onChange={(event) => patch({ refText: event.target.value || null })}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
              placeholder="e.g. Negative, 12–16"
              maxLength={100}
              data-testid={`test-result-ref-text-${row.id}`}
            />
          </div>
        </div>

        {(hasNumericRange || row.refText || libraryMatch) && (
          <p
            className="text-[11px] text-muted-foreground"
            data-testid={`test-result-range-hint-${row.id}`}
          >
            {rangeIsProvisional || !libraryMatch ? (
              <>
                {LAB_RANGE_VARIES_MICROCOPY}
                {rangeIsProvisional ? " (provisional — pending clinical review)" : null}
              </>
            ) : (
              LAB_RANGE_VARIES_MICROCOPY
            )}
          </p>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={RX_FIELD_LABEL_CLASS}>Interpretation</span>
            {autoSuggestion && row.interpretation !== autoSuggestion ? (
              <button
                type="button"
                onClick={applyAutoSuggestion}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-primary/60 hover:text-foreground"
                data-testid={`test-result-auto-flag-${row.id}`}
              >
                Suggest: {autoSuggestion}
              </button>
            ) : null}
          </div>
          <div
            className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
            role="group"
            aria-label="Result interpretation"
            data-testid={`test-result-interpretation-${row.id}`}
          >
            {TEST_RESULT_INTERPRETATION_OPTIONS.map((option) => {
              const isSelected = row.interpretation === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={option.label}
                  data-testid={`test-result-interpretation-${row.id}-${option.value}`}
                  onClick={() => setInterpretation(option.value)}
                  className={chartSelectChipClass(isSelected)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor={`test-result-notes-${row.id}`} className={RX_FIELD_LABEL_CLASS}>
            Notes
          </label>
          <input
            id={`test-result-notes-${row.id}`}
            type="text"
            value={row.notes ?? ""}
            onChange={(event) => patch({ notes: event.target.value || null })}
            className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
            placeholder="Additional detail (optional)"
            maxLength={1000}
            data-testid={`test-result-notes-${row.id}`}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={removeRow}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-destructive/60 hover:text-destructive"
            data-testid={`test-result-remove-${row.id}`}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}
