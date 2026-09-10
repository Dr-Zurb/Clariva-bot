"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChartCatalogCombobox,
  type ChartCatalogCommit,
} from "@/components/ehr/chart/ChartCatalogCombobox";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import { ResultsFlowsheet } from "@/components/cockpit/rx/objective/ResultsFlowsheet";
import {
  RESULTS_TABLE_GRID_CLASS,
  TestResultTableRow,
} from "@/components/cockpit/rx/objective/TestResultTableRow";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import {
  CHART_COMPACT_INPUT_CLASS,
  chartOptionChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  createCustomTestResultRow,
  LAB_RANGE_VARIES_MICROCOPY,
  lookupLabAnalyteByAlias,
  scaffoldLabAnalyteRow,
  scaffoldLabPanel,
} from "@/lib/cockpit/lab-test-library";
import {
  filterResultsAddCatalog,
  parseResultsAddValue,
  resolveResultsAddCatalog,
  RESULTS_ADD_CATALOG_OPTIONS,
} from "@/lib/cockpit/results-add-catalog";
import {
  buildAnalyteTrendByKey,
  buildResultsFlowsheet,
  resultsFlowsheetAnalyteKey,
} from "@/lib/cockpit/results-flowsheet";
import {
  POC_TEST_CHIPS,
  type TestResultCatalogEntry,
} from "@/lib/cockpit/test-result-catalog";
import type { LabReport, TestResultRow, TestResultSource } from "@/types/prescription";
import { cn } from "@/lib/utils";

const UNDATED_KEY = "";

export function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatResultsDateHeading(iso: string, today: string): string {
  if (!iso) return "No date";
  if (iso === today) return "Today";
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dateKeyForRow(row: TestResultRow, reports: readonly LabReport[]): string {
  const own = row.date?.trim();
  if (own) return own;
  const report = reports.find((item) => item.id === row.reportId);
  return report?.reportDate?.trim() ?? UNDATED_KEY;
}

function sortDateKeys(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
}

function sectionIdForDateKey(dateKey: string): string {
  return dateKey || "undated";
}

function pickInitialResultsView(
  rows: readonly TestResultRow[],
  reports: readonly LabReport[],
  today: string,
): { entryDate: string; viewKey: string } {
  const keys = new Set<string>();
  for (const row of rows) keys.add(dateKeyForRow(row, reports));
  if (keys.has(today)) return { entryDate: today, viewKey: today };
  const newestDated = Array.from(keys)
    .filter((key) => Boolean(key))
    .sort(sortDateKeys)[0];
  if (newestDated) return { entryDate: newestDated, viewKey: newestDated };
  if (keys.has(UNDATED_KEY)) return { entryDate: today, viewKey: UNDATED_KEY };
  return { entryDate: today, viewKey: today };
}

function createDateReport(reportDate: string, title?: string): LabReport {
  return {
    id: crypto.randomUUID(),
    kind: "lab",
    title: title?.trim() || formatResultsDateHeading(reportDate, todayIsoDate()),
    reportDate,
    labName: null,
    attachmentIds: [],
    findings: null,
    entryMethod: "manual",
  };
}

export interface TestResultsListProps {
  disabled?: boolean;
  /** Default `source` stamped on newly-added rows (field is not shown). */
  defaultSource?: TestResultSource;
}

export function TestResultsList({
  disabled = false,
  defaultSource = "patient_report",
}: TestResultsListProps) {
  const { state, dispatch } = useRxForm();
  const rows = useMemo(
    () => state.fields.testResultsStructured,
    [state.fields.testResultsStructured],
  );
  const reports = useMemo(() => state.fields.labReports, [state.fields.labReports]);
  const today = useMemo(() => todayIsoDate(), []);
  const [entryDate, setEntryDate] = useState(
    () =>
      pickInitialResultsView(
        state.fields.testResultsStructured,
        state.fields.labReports,
        today,
      ).entryDate,
  );
  const [viewKey, setViewKey] = useState(
    () =>
      pickInitialResultsView(
        state.fields.testResultsStructured,
        state.fields.labReports,
        today,
      ).viewKey,
  );
  const [focusValueId, setFocusValueId] = useState<string | null>(null);
  const [searchFocus, setSearchFocus] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const catalogOptions = useMemo(() => [...RESULTS_ADD_CATALOG_OPTIONS], []);

  const dateGroups = useMemo(() => {
    const byDate = new Map<string, TestResultRow[]>();
    for (const row of rows) {
      const key = dateKeyForRow(row, reports);
      const list = byDate.get(key) ?? [];
      list.push(row);
      byDate.set(key, list);
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => sortDateKeys(a, b));
  }, [rows, reports]);

  const visibleRows = useMemo(() => {
    const match = dateGroups.find(([key]) => key === viewKey);
    return match?.[1] ?? [];
  }, [dateGroups, viewKey]);

  const canCompare = dateGroups.length >= 2;
  const showCompare = compareOpen && canCompare;
  const flowsheet = useMemo(
    () => (showCompare ? buildResultsFlowsheet(dateGroups) : null),
    [dateGroups, showCompare],
  );
  const trendByKey = useMemo(() => buildAnalyteTrendByKey(dateGroups), [dateGroups]);

  useEffect(() => {
    if (!canCompare && compareOpen) setCompareOpen(false);
  }, [canCompare, compareOpen]);

  const hasAnyRange = useMemo(
    () =>
      visibleRows.some(
        (row) =>
          row.refLow != null || row.refHigh != null || Boolean(row.refText?.trim()),
      ),
    [visibleRows],
  );

  const selectDate = useCallback((date: string) => {
    setEntryDate(date);
    setViewKey(date);
  }, []);

  const selectUndated = useCallback(() => {
    setViewKey(UNDATED_KEY);
  }, []);

  const reportForDate = useCallback(
    (date: string, preferredTitle?: string): LabReport => {
      const existing = reports.find((report) => report.reportDate === date);
      if (existing) return existing;
      const report = createDateReport(date, preferredTitle);
      dispatch({ type: "ADD_LAB_REPORT", report });
      return report;
    },
    [dispatch, reports],
  );

  const stamp = useCallback(
    (row: TestResultRow, report: LabReport): TestResultRow => ({
      ...row,
      reportId: report.id,
      date: entryDate,
    }),
    [entryDate],
  );

  const addAnalyte = useCallback(
    (analyteId: string) => {
      if (disabled) return;
      const row = scaffoldLabAnalyteRow(analyteId, { source: defaultSource });
      if (!row) return;
      const report = reportForDate(entryDate);
      const attached = stamp(row, report);
      dispatch({ type: "ADD_TEST_RESULT", row: attached });
      setViewKey(entryDate);
      setFocusValueId(attached.id);
    },
    [defaultSource, disabled, dispatch, entryDate, reportForDate, stamp],
  );

  const addPanel = useCallback(
    (panelId: string) => {
      if (disabled) return;
      const scaffolded = scaffoldLabPanel(panelId, { source: defaultSource });
      if (!scaffolded) return;
      const existing = reports.find((report) => report.reportDate === entryDate);
      if (!existing) {
        const next = { ...scaffolded.report, reportDate: entryDate };
        dispatch({
          type: "ADD_LAB_PANEL",
          report: next,
          rows: scaffolded.rows.map((row) => stamp(row, next)),
        });
        setViewKey(entryDate);
        setFocusValueId(scaffolded.rows[0]?.id ?? null);
        return;
      }
      for (const row of [...scaffolded.rows].reverse()) {
        dispatch({ type: "ADD_TEST_RESULT", row: stamp(row, existing) });
      }
      setViewKey(entryDate);
      setFocusValueId(scaffolded.rows[0]?.id ?? null);
    },
    [defaultSource, disabled, dispatch, entryDate, reports, stamp],
  );

  const addCustom = useCallback(
    (name: string, unit?: string | null) => {
      if (disabled) return;
      const report = reportForDate(entryDate);
      const row = stamp(
        {
          ...createCustomTestResultRow(defaultSource),
          name,
          unit: unit ?? null,
        },
        report,
      );
      dispatch({ type: "ADD_TEST_RESULT", row });
      setViewKey(entryDate);
      setFocusValueId(row.id);
    },
    [defaultSource, disabled, dispatch, entryDate, reportForDate, stamp],
  );

  const handleSearchCommit = useCallback(
    (payload: ChartCatalogCommit) => {
      if (payload.kind === "custom") {
        addCustom(payload.text);
        return;
      }
      const parsed = parseResultsAddValue(payload.value);
      if (!parsed) {
        addCustom(payload.label);
        return;
      }
      if (parsed.kind === "panel") addPanel(parsed.id);
      else addAnalyte(parsed.id);
    },
    [addAnalyte, addCustom, addPanel],
  );

  const addPocChip = useCallback(
    (entry: TestResultCatalogEntry) => {
      if (disabled) return;
      const analyte = lookupLabAnalyteByAlias(entry.name);
      if (analyte) {
        addAnalyte(analyte.id);
        return;
      }
      addCustom(entry.name, entry.defaultUnit);
    },
    [addAnalyte, addCustom, disabled],
  );

  const requestSearchFocus = useCallback(() => {
    setSearchFocus(true);
  }, []);

  return (
    <div className="@container/results space-y-2" data-testid="test-results-list">
      {!disabled ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="test-results-search" className={RX_FIELD_LABEL_CLASS}>
                Add result
              </label>
              <ChartCatalogCombobox
                inputId="test-results-search"
                testId="test-results-search"
                placeholder="Search a test or panel…"
                ariaLabel="Search a test or panel"
                catalogOptions={catalogOptions}
                filterCatalog={filterResultsAddCatalog}
                resolveCatalog={resolveResultsAddCatalog}
                customLabel={(text) => `Add “${text}”`}
                onCommit={handleSearchCommit}
                focusRequest={searchFocus}
                onFocusRequestHandled={() => setSearchFocus(false)}
              />
            </div>
            <div className="shrink-0">
              <label htmlFor="test-results-entry-date" className={RX_FIELD_LABEL_CLASS}>
                Date
              </label>
              <input
                id="test-results-entry-date"
                type="date"
                value={entryDate}
                onChange={(event) => selectDate(event.target.value || today)}
                className={cn(CHART_COMPACT_INPUT_CLASS, "mt-1 w-[10.5rem]")}
                aria-label="Result date"
                data-testid="test-results-entry-date"
              />
            </div>
          </div>
          <ChartQuickAddChips
            groupLabel="Quick add"
            testId="test-results-poc-chips"
            items={POC_TEST_CHIPS.map((chip) => ({
              id: chip.name,
              label: chip.name,
            }))}
            onAddItem={(item) => {
              const chip = POC_TEST_CHIPS.find((entry) => entry.name === item.label);
              if (chip) addPocChip(chip);
            }}
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
          data-testid="test-results-empty"
        >
          {disabled
            ? "No structured results recorded."
            : "No results yet — search to add a test or panel."}
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-md border border-border/70"
          data-testid="test-results-table"
        >
          {dateGroups.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
              <div
                role="tablist"
                aria-label="Result dates"
                className="flex flex-wrap gap-1.5"
                data-testid="test-results-date-tabs"
              >
                {dateGroups.map(([dateKey]) => {
                  const heading = formatResultsDateHeading(dateKey, today);
                  const sectionId = sectionIdForDateKey(dateKey);
                  const selected = viewKey === dateKey;
                  return (
                    <button
                      key={sectionId}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-label={
                        dateKey ? `Show results for ${heading}` : heading
                      }
                      onClick={() => {
                        if (dateKey) selectDate(dateKey);
                        else selectUndated();
                      }}
                      className={chartOptionChipClass(selected)}
                      data-testid={`test-results-date-tab-${sectionId}`}
                    >
                      {heading}
                    </button>
                  );
                })}
              </div>
              {canCompare ? (
                <button
                  type="button"
                  aria-pressed={showCompare}
                  onClick={() => setCompareOpen((open) => !open)}
                  className="ml-auto text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  data-testid="test-results-compare-toggle"
                >
                  {showCompare ? "By date" : "Compare"}
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            className="max-h-[30rem] overflow-auto"
            data-testid="test-results-table-scroll"
          >
            {showCompare && flowsheet ? (
              <ResultsFlowsheet
                sheet={flowsheet}
                selectedDateKey={viewKey}
                formatDateHeading={(dateKey) =>
                  formatResultsDateHeading(dateKey, today)
                }
                onSelectDate={(dateKey) => {
                  if (dateKey) selectDate(dateKey);
                  else selectUndated();
                }}
                onOpenCell={(dateKey, rowId) => {
                  if (dateKey) selectDate(dateKey);
                  else selectUndated();
                  if (disabled) return;
                  setCompareOpen(false);
                  if (rowId) setFocusValueId(rowId);
                }}
                disabled={disabled}
                trendByKey={trendByKey}
                trendGroups={dateGroups}
              />
            ) : (
              <>
                {!disabled ? (
                  <div
                    className={cn(
                      RESULTS_TABLE_GRID_CLASS,
                      "sticky top-0 z-10 border-b border-border/60 bg-muted px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    <span>Test</span>
                    <span>Value</span>
                    <span>Unit</span>
                    <span>Range</span>
                    <span>Method</span>
                    <span>Notes</span>
                    <span />
                  </div>
                ) : null}
                <section
                  role="tabpanel"
                  data-testid={`test-results-date-${sectionIdForDateKey(viewKey)}`}
                >
                  {visibleRows.length === 0 ? (
                    <p
                      className="px-3 py-4 text-center text-xs text-muted-foreground"
                      data-testid="test-results-date-empty"
                    >
                      {disabled
                        ? `No structured results for ${formatResultsDateHeading(viewKey, today)}.`
                        : `No results for ${formatResultsDateHeading(viewKey, today)} — search to add a test.`}
                    </p>
                  ) : (
                    visibleRows.map((row) => (
                      <TestResultTableRow
                        key={row.id}
                        row={row}
                        disabled={disabled}
                        autoFocusValue={focusValueId === row.id}
                        onValueCommit={requestSearchFocus}
                        trendSeries={
                          trendByKey.get(resultsFlowsheetAnalyteKey(row.name)) ?? null
                        }
                        trendGroups={dateGroups}
                      />
                    ))
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {hasAnyRange ? (
        <p className="text-[11px] text-muted-foreground" data-testid="test-results-range-hint">
          {LAB_RANGE_VARIES_MICROCOPY}
        </p>
      ) : null}
    </div>
  );
}
