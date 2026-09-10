/**
 * Match verbatim extracted rows to the lab-test library (rpt-05.3).
 *
 * Shared by both readers — PDF text layer and report photos (rpt-05.6) — so
 * clinical identity is decided the same way regardless of source.
 *
 * Pure. The model / PDF reader never chooses a canonical name, unit, or
 * range — this module does, using aliases already unit-tested in
 * `lab-test-library.ts`. Confidence is derived from those checks, never
 * self-reported. Nothing here writes to the form.
 *
 * Printed values stay verbatim. Unit conversion is not performed: a
 * unit that is not in the accepted set is a flag, not a rewrite.
 */

import type { RawExtractedLabRow } from "@/lib/api/lab-extract";
import {
  lookupLabAnalyteByAlias,
  parseNumericTestValue,
  resolveLabAnalyteRange,
  type LabAnalyteDefinition,
  type LabReferenceRange,
  type PatientSexForRange,
} from "@/lib/cockpit/lab-test-library";
import type { LabReport, TestResultRow, TestResultSource } from "@/types/prescription";

export type LabExtractFlag =
  | "unmatched_name"
  | "non_numeric_value"
  | "unit_mismatch"
  | "range_mismatch"
  | "malformed_value";

export type LabExtractConfidence = "green" | "flagged" | "unmatched";

export interface ParsedPrintedRange {
  low: number | null;
  high: number | null;
  text: string | null;
}

export interface LabExtractCandidate {
  raw: RawExtractedLabRow;
  analyteId: string | null;
  name: string;
  value: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  method: string | null;
  confidence: LabExtractConfidence;
  flags: LabExtractFlag[];
}

export interface MatchExtractedLabRowsOptions {
  sex?: PatientSexForRange;
}

const QUALITATIVE_VALUE_RE =
  /^(negative|positive|reactive|non[-\s]?reactive|nil|absent|present|normal|detected|not\s+detected|trace)$/i;

const PAIRED_RANGE_RE =
  /^([<>]=?)?\s*(\d+(?:[.,]\d+)?)\s*(?:[-–—]|to)\s*([<>]=?)?\s*(\d+(?:[.,]\d+)?)$/i;

const OPEN_RANGE_RE = /^([<>]=?)\s*(\d+(?:[.,]\d+)?)$/;

const RANGE_ABS_TOL = 0.51;
const RANGE_REL_TOL = 0.12;

function trimOrNull(value: string | null | undefined): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t || null;
}

function parseNumberToken(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Parse a printed reference cell. Returns null when the cell is empty. */
export function parsePrintedRange(raw: string | null | undefined): ParsedPrintedRange | null {
  const text = trimOrNull(raw);
  if (!text) return null;

  const paired = text.match(PAIRED_RANGE_RE);
  if (paired) {
    const low = parseNumberToken(paired[2]);
    const high = parseNumberToken(paired[4]);
    if (low == null || high == null) return { low: null, high: null, text };
    return { low, high, text: null };
  }

  const open = text.match(OPEN_RANGE_RE);
  if (open) {
    const bound = parseNumberToken(open[2]);
    if (bound == null) return { low: null, high: null, text };
    if (open[1].startsWith("<")) return { low: null, high: bound, text };
    return { low: bound, high: null, text };
  }

  return { low: null, high: null, text };
}

export function normalizeUnitKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/µ|μ/g, "u")
    .replace(/[×x]/gi, "x")
    .replace(/\s+/g, "")
    .replace(/\^/g, "");
}

function acceptedUnitKeys(analyte: LabAnalyteDefinition): Set<string> {
  const keys = [analyte.unit, ...(analyte.altUnits ?? [])]
    .map((u) => normalizeUnitKey(u))
    .filter((u) => u.length > 0);
  return new Set(keys);
}

function unitMatches(rawUnit: string, analyte: LabAnalyteDefinition): boolean {
  return acceptedUnitKeys(analyte).has(normalizeUnitKey(rawUnit));
}

function boundsClose(a: number, b: number): boolean {
  const tol = Math.max(RANGE_ABS_TOL, RANGE_REL_TOL * Math.max(Math.abs(a), Math.abs(b), 1));
  return Math.abs(a - b) <= tol;
}

function libraryRanges(analyte: LabAnalyteDefinition): LabReferenceRange[] {
  return [analyte.range, analyte.rangeMale, analyte.rangeFemale].filter(
    (r): r is LabReferenceRange => r != null,
  );
}

function printedAgreesWithLibrary(
  printed: ParsedPrintedRange,
  analyte: LabAnalyteDefinition,
): boolean {
  if (printed.low == null && printed.high == null) return true;
  const ranges = libraryRanges(analyte);
  if (ranges.length === 0) return true;
  return ranges.some((lib) => {
    if (printed.low != null && typeof lib.low === "number" && !boundsClose(printed.low, lib.low)) {
      return false;
    }
    if (
      printed.high != null &&
      typeof lib.high === "number" &&
      !boundsClose(printed.high, lib.high)
    ) {
      return false;
    }
    return printed.low != null || printed.high != null;
  });
}

function isQualitativeValue(raw: string): boolean {
  return QUALITATIVE_VALUE_RE.test(raw.trim());
}

/**
 * Two numbers in a cell that should hold one — the signature of a
 * mis-segmented cell ("13.5 17.0" where value and range merged, or "13.5.2").
 *
 * `non_numeric_value` does not catch these: `parseNumericTestValue` takes the
 * FIRST number it finds, so a merged cell silently yields a plausible-looking
 * result. This is worth flagging because the extracted value may belong to a
 * different column than the doctor thinks.
 *
 * Deliberately silent when the cell carries a letter, `^`, `x`, `%`, or `/`:
 * that is a value-with-unit or a scientific count ("7.5 x10^3/uL"), not a
 * merge. Thousands separators are stripped first — Indian reports print
 * platelet counts as "1,50,000".
 */
function hasMergedNumbers(raw: string): boolean {
  const cleaned = raw.replace(/,/g, "").trim();
  if (/[a-z%^/]/i.test(cleaned)) return false;
  const tokens = cleaned.match(/\d+(?:\.\d+)?/g);
  return (tokens?.length ?? 0) > 1;
}

export function isExtractCandidatePrechecked(candidate: LabExtractCandidate): boolean {
  return candidate.confidence === "green";
}

export function matchExtractedLabRow(
  raw: RawExtractedLabRow,
  options: MatchExtractedLabRowsOptions = {},
): LabExtractCandidate {
  const analyte = lookupLabAnalyteByAlias(raw.rawName);
  const flags: LabExtractFlag[] = [];
  const value = trimOrNull(raw.rawValue);
  const printedUnit = trimOrNull(raw.rawUnit);
  const printed = parsePrintedRange(raw.rawRange);
  const method = trimOrNull(raw.rawMethod);

  // Cell-level, so it applies whether or not the name resolved.
  if (value && !isQualitativeValue(value) && hasMergedNumbers(value)) {
    flags.push("malformed_value");
  }

  if (!analyte) {
    return {
      raw,
      analyteId: null,
      name: raw.rawName.trim(),
      value,
      unit: printedUnit,
      refLow: printed?.low ?? null,
      refHigh: printed?.high ?? null,
      refText: printed?.text ?? (printed ? null : trimOrNull(raw.rawRange)),
      method,
      confidence: "unmatched",
      flags: ["unmatched_name", ...flags],
    };
  }

  const libRange = resolveLabAnalyteRange(analyte, options.sex);
  if (printedUnit && !unitMatches(printedUnit, analyte)) {
    flags.push("unit_mismatch");
  }
  if (printed && !printedAgreesWithLibrary(printed, analyte)) {
    flags.push("range_mismatch");
  }
  if (value && parseNumericTestValue(value) == null && !isQualitativeValue(value)) {
    flags.push("non_numeric_value");
  }

  const printedWins = printed != null;
  return {
    raw,
    analyteId: analyte.id,
    name: analyte.name,
    value,
    unit: printedUnit ?? analyte.unit ?? null,
    refLow: printedWins ? printed.low : typeof libRange?.low === "number" ? libRange.low : null,
    refHigh: printedWins ? printed.high : typeof libRange?.high === "number" ? libRange.high : null,
    refText: printedWins
      ? printed.text
      : typeof libRange?.text === "string"
        ? libRange.text
        : null,
    method,
    confidence: flags.length > 0 ? "flagged" : "green",
    flags,
  };
}

export function matchExtractedLabRows(
  rows: readonly RawExtractedLabRow[],
  options: MatchExtractedLabRowsOptions = {},
): LabExtractCandidate[] {
  return rows.map((row) => matchExtractedLabRow(row, options));
}

export interface BuildExtractedLabApplyOptions {
  attachmentId: string;
  reportDate: string;
  title?: string;
  source?: TestResultSource;
  createId?: () => string;
}

/**
 * Build the report header + rows the reducer already knows how to apply.
 * Caller must pass only the doctor-confirmed candidates.
 */
export function buildExtractedLabApply(
  selected: readonly LabExtractCandidate[],
  options: BuildExtractedLabApplyOptions,
): { report: LabReport; rows: TestResultRow[] } {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const reportId = createId();
  const source: TestResultSource = options.source ?? "patient_report";
  const reportDate = options.reportDate.trim();
  const report: LabReport = {
    id: reportId,
    kind: "lab",
    title: options.title?.trim() || "Extracted report",
    reportDate: reportDate || null,
    labName: null,
    attachmentIds: [options.attachmentId],
    findings: null,
    entryMethod: "extracted",
  };
  const rows: TestResultRow[] = selected.map((candidate) => ({
    id: createId(),
    source,
    name: candidate.name.trim(),
    value: candidate.value,
    unit: candidate.unit,
    date: reportDate || null,
    interpretation: null,
    notes: null,
    reportId,
    refLow: candidate.refLow,
    refHigh: candidate.refHigh,
    refText: candidate.refText,
    method: candidate.method,
  }));
  return { report, rows };
}
