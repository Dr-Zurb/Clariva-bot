"use client";

import { useMemo, useState } from "react";
import { TestResultRowCard } from "@/components/cockpit/rx/objective/TestResultRow";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { RX_FIELD_INPUT_CLASS, RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import {
  createCustomTestResultRow,
  LAB_ANALYTES,
  LAB_PANELS,
  scaffoldLabAnalyteRow,
  scaffoldLabPanel,
} from "@/lib/cockpit/lab-test-library";
import type { TestResultRow, TestResultSource } from "@/types/prescription";
import { cn } from "@/lib/utils";

export interface TestResultsListProps {
  disabled?: boolean;
  /** Default `source` stamped on newly-added rows (row still toggles). */
  defaultSource?: TestResultSource;
  /** OBJ-D7 — legacy free-text escape hatch. */
  showLegacyTextarea?: boolean;
}

export function TestResultsList({
  disabled = false,
  defaultSource = "patient_report",
  showLegacyTextarea = false,
}: TestResultsListProps) {
  const { state, dispatch, setField } = useRxForm();
  const rows = useMemo(
    () => state.fields.testResultsStructured,
    [state.fields.testResultsStructured],
  );
  const reports = useMemo(() => state.fields.labReports, [state.fields.labReports]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const reportTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const report of reports) map.set(report.id, report.title);
    return map;
  }, [reports]);

  const grouped = useMemo(() => {
    const byReport = new Map<string, TestResultRow[]>();
    const ungrouped: TestResultRow[] = [];
    for (const row of rows) {
      const rid = row.reportId?.trim();
      if (rid && reportTitleById.has(rid)) {
        const list = byReport.get(rid) ?? [];
        list.push(row);
        byReport.set(rid, list);
      } else {
        ungrouped.push(row);
      }
    }
    return { byReport, ungrouped };
  }, [rows, reportTitleById]);

  function addCustomRow() {
    if (disabled) return;
    dispatch({ type: "ADD_TEST_RESULT", row: createCustomTestResultRow(defaultSource) });
  }

  function addPanel(panelId: string) {
    if (disabled) return;
    const scaffolded = scaffoldLabPanel(panelId, { source: defaultSource });
    if (!scaffolded) return;
    dispatch({
      type: "ADD_LAB_PANEL",
      report: scaffolded.report,
      rows: scaffolded.rows,
    });
    setPickerOpen(false);
  }

  function addAnalyte(analyteId: string) {
    if (disabled) return;
    const row = scaffoldLabAnalyteRow(analyteId, { source: defaultSource });
    if (!row) return;
    dispatch({ type: "ADD_TEST_RESULT", row });
    setPickerOpen(false);
  }

  return (
    <div className="space-y-2" data-testid="test-results-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={RX_FIELD_LABEL_CLASS}>Structured results</span>
        {!disabled ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/60 hover:bg-muted/40"
              aria-expanded={pickerOpen}
              data-testid="test-results-library"
            >
              {pickerOpen ? "Hide library" : "Add from library"}
            </button>
            <button
              type="button"
              onClick={addCustomRow}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/60 hover:bg-muted/40"
              data-testid="test-results-add"
            >
              Add custom test
            </button>
          </div>
        ) : null}
      </div>

      {pickerOpen && !disabled ? (
        <div
          className="space-y-3 rounded-md border border-border bg-muted/20 p-3"
          data-testid="test-results-library-panel"
        >
          <div>
            <span className={RX_FIELD_LABEL_CLASS}>Panels</span>
            <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Lab panels">
              {LAB_PANELS.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => addPanel(panel.id)}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:border-primary/60"
                  data-testid={`test-results-panel-${panel.id}`}
                >
                  {panel.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={RX_FIELD_LABEL_CLASS}>Single tests</span>
            <div
              className="mt-1 max-h-36 overflow-y-auto rounded-md border border-border bg-card p-2"
              role="group"
              aria-label="Lab analytes"
              data-testid="test-results-analyte-list"
            >
              <div className="flex flex-wrap gap-1.5">
                {LAB_ANALYTES.map((analyte) => (
                  <button
                    key={analyte.id}
                    type="button"
                    onClick={() => addAnalyte(analyte.id)}
                    className="rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:border-primary/60"
                    data-testid={`test-results-analyte-${analyte.id}`}
                  >
                    {analyte.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
          data-testid="test-results-empty"
        >
          {disabled
            ? "No structured results recorded."
            : "No results yet — add a panel, a library test, or a custom row."}
        </p>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.byReport.entries()).map(([reportId, reportRows]) => (
            <section
              key={reportId}
              className="space-y-2"
              data-testid={`test-results-group-${reportId}`}
            >
              <h4
                className={cn(
                  RX_FIELD_LABEL_CLASS,
                  "rounded-md border border-border/60 bg-muted/30 px-2 py-1",
                )}
              >
                {reportTitleById.get(reportId) ?? "Report"}
              </h4>
              {reportRows.map((row) => (
                <TestResultRowCard key={row.id} row={row} disabled={disabled} />
              ))}
            </section>
          ))}
          {grouped.ungrouped.length > 0 ? (
            <section className="space-y-2" data-testid="test-results-ungrouped">
              {grouped.byReport.size > 0 ? (
                <h4
                  className={cn(
                    RX_FIELD_LABEL_CLASS,
                    "rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground",
                  )}
                >
                  Other results
                </h4>
              ) : null}
              {grouped.ungrouped.map((row) => (
                <TestResultRowCard key={row.id} row={row} disabled={disabled} />
              ))}
            </section>
          ) : null}
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
