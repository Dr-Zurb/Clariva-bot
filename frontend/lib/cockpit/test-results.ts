/**
 * Normalize / derive helpers for structured test results (obj-20).
 *
 * The DB source of truth is `prescriptions.test_results_json` (JSONB array,
 * migration 154). The legacy `test_results` TEXT column (migration 103) STAYS
 * and is DERIVED from the structured rows on save (OBJ-D2 / P5-D3) so PDF, SMS
 * summary, and snapshot readers stay byte-unchanged. An empty structured set
 * leaves the legacy free-text `test_results` untouched (passthrough contract).
 *
 * Direct analog of the `examination_json` derive path in
 * `RxFormContext.deriveExaminationFindingsFromExam`, applied to Zone C. Unlike
 * exam findings (registry-ordered), result rows derive in array order — the
 * order the doctor entered them.
 */

import type {
  LabReport,
  LabReportEntryMethod,
  LabReportKind,
  TestResultInterpretation,
  TestResultRow,
  TestResultSource,
} from "@/types/prescription";

const TEST_RESULT_SOURCES: readonly TestResultSource[] = [
  "patient_report",
  "in_clinic_poc",
];

const TEST_RESULT_INTERPRETATIONS: readonly TestResultInterpretation[] = [
  "normal",
  "high",
  "low",
  "abnormal",
];

/** Human labels for the derived `test_results` text (OBJ-D2). */
const INTERPRETATION_LABELS: Record<TestResultInterpretation, string> = {
  normal: "Normal",
  high: "High",
  low: "Low",
  abnormal: "Abnormal",
};

function trimToNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Hydrate / sanitize `test_results_json` rows, dropping malformed entries.
 * Mirrors `normalizeExamFindings`: a missing/empty `id` or `name`, or a bad
 * `source`, drops the row; empty optional strings collapse to null. Row order
 * is preserved. A missing `id` is regenerated so the row stays UI-addressable.
 */
export function normalizeTestResults(
  json: TestResultRow[] | null | undefined,
): TestResultRow[] {
  if (!Array.isArray(json)) return [];
  const out: TestResultRow[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    if (!TEST_RESULT_SOURCES.includes(row.source)) continue;
    const id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : crypto.randomUUID();
    const interpretation =
      row.interpretation && TEST_RESULT_INTERPRETATIONS.includes(row.interpretation)
        ? row.interpretation
        : null;
    // rpt-02/03 — grouping + reference-range fields. Malformed reportId collapses
    // to null (ungrouped); non-finite bounds collapse to null. These never leak
    // into the derived `test_results` TEXT (OBJ-D2 byte-identical).
    const reportId = trimToNull(
      typeof row.reportId === "string" ? row.reportId : null,
    );
    const refLow =
      typeof row.refLow === "number" && Number.isFinite(row.refLow) ? row.refLow : null;
    const refHigh =
      typeof row.refHigh === "number" && Number.isFinite(row.refHigh) ? row.refHigh : null;
    out.push({
      id,
      source: row.source,
      name,
      value: trimToNull(row.value),
      unit: trimToNull(row.unit),
      date: trimToNull(row.date),
      interpretation,
      notes: trimToNull(row.notes),
      reportId,
      refLow,
      refHigh,
      refText: trimToNull(row.refText),
    });
  }
  return out;
}

const LAB_REPORT_KINDS: readonly LabReportKind[] = ["lab", "imaging"];
const LAB_REPORT_ENTRY_METHODS: readonly LabReportEntryMethod[] = [
  "manual",
  "extracted",
];

/**
 * Hydrate / sanitize `lab_reports_json` headers (rpt-02/03). Malformed headers
 * drop; empty optional strings collapse to null. Order preserved.
 */
export function normalizeLabReports(
  json: LabReport[] | null | undefined,
): LabReport[] {
  if (!Array.isArray(json)) return [];
  const out: LabReport[] = [];
  for (const header of json) {
    if (!header || typeof header !== "object") continue;
    const title = typeof header.title === "string" ? header.title.trim() : "";
    if (!title) continue;
    if (!LAB_REPORT_KINDS.includes(header.kind)) continue;
    const id =
      typeof header.id === "string" && header.id.trim()
        ? header.id.trim()
        : crypto.randomUUID();
    const entryMethod =
      header.entryMethod && LAB_REPORT_ENTRY_METHODS.includes(header.entryMethod)
        ? header.entryMethod
        : "manual";
    const attachmentIds = Array.isArray(header.attachmentIds)
      ? header.attachmentIds
          .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
          .map((a) => a.trim())
      : [];
    out.push({
      id,
      kind: header.kind,
      title,
      reportDate: trimToNull(header.reportDate),
      labName: trimToNull(header.labName),
      attachmentIds,
      findings: trimToNull(header.findings),
      entryMethod,
    });
  }
  return out;
}

/** Render one normalized row into a derived `test_results` line. */
function renderTestResultLine(row: TestResultRow): string {
  const measurement = [row.value, row.unit]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ");
  let line = measurement ? `${row.name}: ${measurement}` : row.name;
  if (row.interpretation) {
    line += ` (${INTERPRETATION_LABELS[row.interpretation]})`;
  }
  const date = row.date?.trim();
  if (date) line += ` [${date}]`;
  const notes = row.notes?.trim();
  if (notes) line += ` — ${notes}`;
  return line;
}

/**
 * Derive the legacy `test_results` text from structured rows (OBJ-D2). Pure +
 * stable (array order, no `Date.now`). An empty / all-dropped list returns ""
 * so the caller can fall back to the legacy free-text passthrough.
 */
export function deriveTestResults(rows: TestResultRow[]): string {
  const normalized = normalizeTestResults(rows);
  if (normalized.length === 0) return "";
  return normalized.map(renderTestResultLine).join("\n");
}

/** Format one row for read-only display (card summary / disabled mode). */
export function formatTestResultRow(row: TestResultRow): string {
  const [normalized] = normalizeTestResults([row]);
  if (!normalized) return "";
  return renderTestResultLine(normalized);
}
