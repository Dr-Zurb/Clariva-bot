/**
 * In-visit results flowsheet — analytes as rows, dates as columns.
 * Matches catalog aliases so "Hb" and "Haemoglobin" share a row.
 * Also builds numeric analyte trend series for TrendChart.
 */

import { lookupLabAnalyteByAlias } from "@/lib/cockpit/lab-test-library";
import type { ResultsTimelineEntry } from "@/types/patient-chart";
import type { TestResultRow } from "@/types/prescription";

export type ResultsDateGroup = readonly [dateKey: string, rows: readonly TestResultRow[]];

export interface ResultsFlowsheetCell {
  rowId: string;
  value: string | null;
}

export interface ResultsFlowsheetAnalyte {
  key: string;
  name: string;
  unit: string | null;
  cells: Array<ResultsFlowsheetCell | null>;
}

export interface ResultsFlowsheet {
  dateKeys: string[];
  rows: ResultsFlowsheetAnalyte[];
}

export function resultsFlowsheetAnalyteKey(name: string): string {
  const analyte = lookupLabAnalyteByAlias(name);
  if (analyte) return `analyte:${analyte.id}`;
  return `name:${name.trim().toLowerCase()}`;
}

export function resultsFlowsheetAnalyteName(name: string): string {
  return lookupLabAnalyteByAlias(name)?.name ?? name.trim();
}

export function buildResultsFlowsheet(
  dateGroups: readonly ResultsDateGroup[],
): ResultsFlowsheet {
  const dateKeys = dateGroups.map(([dateKey]) => dateKey);
  const order: string[] = [];
  const byKey = new Map<
    string,
    { name: string; unit: string | null; cellsByDate: Record<string, ResultsFlowsheetCell> }
  >();

  for (const [dateKey, groupRows] of dateGroups) {
    const seen = new Set<string>();
    for (const row of groupRows) {
      const key = resultsFlowsheetAnalyteKey(row.name);
      if (seen.has(key)) continue;
      seen.add(key);
      let analyte = byKey.get(key);
      if (!analyte) {
        analyte = {
          name: resultsFlowsheetAnalyteName(row.name),
          unit: row.unit?.trim() || null,
          cellsByDate: {},
        };
        byKey.set(key, analyte);
        order.push(key);
      } else if (!analyte.unit && row.unit?.trim()) {
        analyte.unit = row.unit.trim();
      }
      analyte.cellsByDate[dateKey] = {
        rowId: row.id,
        value: row.value?.trim() || null,
      };
    }
  }

  return {
    dateKeys,
    rows: order.map((key) => {
      const analyte = byKey.get(key)!;
      return {
        key,
        name: analyte.name,
        unit: analyte.unit,
        cells: dateKeys.map((dateKey) => analyte.cellsByDate[dateKey] ?? null),
      };
    }),
  };
}

export interface AnalyteTrendPoint {
  at: string;
  value: number;
}

export interface AnalyteTrendSeries {
  key: string;
  name: string;
  unit: string;
  points: AnalyteTrendPoint[];
  refLow: number | null;
  refHigh: number | null;
}

/** Strict numeric values only — skips "Negative", "<200", "7.8 %". */
export function parseResultNumericValue(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/,/g, "");
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function sortDateKeys(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
}

export function dateKeyFromTimelineEntry(
  row: TestResultRow,
  visitDate: string,
): string {
  const own = row.date?.trim();
  if (own) return own;
  const visit = visitDate.trim();
  return visit.length >= 10 ? visit.slice(0, 10) : visit;
}

export function resultsTimelineToDateGroups(
  entries: readonly ResultsTimelineEntry[],
): ResultsDateGroup[] {
  const byDate = new Map<string, TestResultRow[]>();
  for (const entry of entries) {
    for (const row of entry.resulted) {
      const dateKey = dateKeyFromTimelineEntry(row, entry.visitDate);
      if (!dateKey) continue;
      const list = byDate.get(dateKey) ?? [];
      list.push(row);
      byDate.set(dateKey, list);
    }
  }
  return Array.from(byDate.entries()).sort(([a], [b]) => sortDateKeys(a, b));
}

/** Current visit dates replace the same dates from prior visits. */
export function mergeResultsDateGroups(
  current: readonly ResultsDateGroup[],
  prior: readonly ResultsDateGroup[],
): ResultsDateGroup[] {
  const currentDates = new Set(current.map(([dateKey]) => dateKey));
  const merged = [
    ...prior.filter(([dateKey]) => dateKey && !currentDates.has(dateKey)),
    ...current,
  ];
  return merged.sort(([a], [b]) => sortDateKeys(a, b));
}

export function buildAnalyteTrendByKey(
  dateGroups: readonly ResultsDateGroup[],
): Map<string, AnalyteTrendSeries> {
  const byKey = new Map<
    string,
    {
      name: string;
      unit: string;
      refLow: number | null;
      refHigh: number | null;
      pointsByDate: Map<string, AnalyteTrendPoint>;
    }
  >();

  for (const [dateKey, groupRows] of dateGroups) {
    if (!dateKey) continue;
    const seen = new Set<string>();
    for (const row of groupRows) {
      const value = parseResultNumericValue(row.value ?? null);
      if (value == null) continue;
      const key = resultsFlowsheetAnalyteKey(row.name);
      if (seen.has(key)) continue;
      seen.add(key);
      let series = byKey.get(key);
      if (!series) {
        series = {
          name: resultsFlowsheetAnalyteName(row.name),
          unit: row.unit?.trim() || "",
          refLow: row.refLow ?? null,
          refHigh: row.refHigh ?? null,
          pointsByDate: new Map(),
        };
        byKey.set(key, series);
      } else {
        if (!series.unit && row.unit?.trim()) series.unit = row.unit.trim();
        if (series.refLow == null && row.refLow != null) series.refLow = row.refLow;
        if (series.refHigh == null && row.refHigh != null) series.refHigh = row.refHigh;
      }
      series.pointsByDate.set(dateKey, {
        at: `${dateKey}T12:00:00`,
        value,
      });
    }
  }

  const out = new Map<string, AnalyteTrendSeries>();
  for (const [key, series] of Array.from(byKey.entries())) {
    const points = Array.from(series.pointsByDate.values()).sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    if (points.length === 0) continue;
    out.set(key, {
      key,
      name: series.name,
      unit: series.unit,
      points,
      refLow: series.refLow,
      refHigh: series.refHigh,
    });
  }
  return out;
}
