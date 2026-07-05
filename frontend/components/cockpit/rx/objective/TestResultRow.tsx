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

export function TestResultRowCard({ row, disabled = false }: TestResultRowCardProps) {
  const { dispatch } = useRxForm();
  const testChips = testChipsForSource(row.source);

  function patch(updates: Partial<TestResultRow>) {
    if (disabled) return;
    dispatch({ type: "UPDATE_TEST_RESULT", id: row.id, patch: updates });
  }

  function removeRow() {
    if (disabled) return;
    dispatch({ type: "REMOVE_TEST_RESULT", id: row.id });
  }

  function applyTestChip(entry: TestResultCatalogEntry) {
    patch({
      name: entry.name,
      unit: entry.defaultUnit ?? row.unit ?? null,
    });
  }

  function setInterpretation(next: TestResultInterpretation | null) {
    patch({ interpretation: row.interpretation === next ? null : next });
  }

  function setSource(next: TestResultSource) {
    if (next === row.source) return;
    patch({ source: next });
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
              onChange={(event) => patch({ value: event.target.value || null })}
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

        <div>
          <span className={RX_FIELD_LABEL_CLASS}>Interpretation</span>
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
