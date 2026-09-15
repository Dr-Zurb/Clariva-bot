/**
 * Deterministic lab-table reconstruction from positioned PDF text (rpt-05.1).
 *
 * The model / OCR never enters this file. Input is verbatim text runs with
 * page-relative x/y. Output is verbatim cell strings. Clinical mapping
 * (aliases, units, physiologic bounds) stays on the frontend library.
 *
 * Fail-closed: a page with no name+value header, or with value/range columns
 * too close to tell apart, is skipped entirely. A row whose value vs range
 * assignment is ambiguous is dropped. Guessing a number into the wrong
 * column is the only unacceptable outcome.
 */

export interface PositionedTextItem {
  text: string;
  /** Left edge. Same unit for the page. */
  x: number;
  /** Baseline; larger y = further down the page. */
  y: number;
  width: number;
  pageIndex: number;
}

export interface RawExtractedRow {
  rawName: string;
  rawValue: string | null;
  rawUnit: string | null;
  rawRange: string | null;
  rawMethod: string | null;
  pageIndex: number;
  lineText: string;
}

export interface LabPdfPageExtract {
  pageIndex: number;
  rows: RawExtractedRow[];
  /** True when the page had text but we refused to guess columns. */
  skipped: boolean;
  skipReason: LabPdfPageSkipReason | null;
}

export type LabPdfPageSkipReason = 'no_text' | 'no_header' | 'ambiguous_columns';

export interface LabPdfTableExtract {
  rows: RawExtractedRow[];
  pages: LabPdfPageExtract[];
  skippedPageIndexes: number[];
}

type ColumnRole = 'name' | 'value' | 'unit' | 'range' | 'method' | 'ignore';

interface JoinedCell {
  text: string;
  x: number;
  y: number;
  width: number;
}

interface Column {
  role: ColumnRole;
  xStart: number;
}

const NAME_HEADERS = new Set([
  'test',
  'test name',
  'test description',
  'investigation',
  'investigations',
  'parameter',
  'parameters',
  'analyte',
  'examination',
  'particulars',
  'description',
]);

const VALUE_HEADERS = new Set([
  'result',
  'results',
  'value',
  'observed',
  'observed value',
  'observed result',
  'finding',
  'findings',
]);

const UNIT_HEADERS = new Set(['unit', 'units']);

const RANGE_HEADERS = new Set([
  'reference',
  'reference range',
  'reference interval',
  'ref range',
  'ref. range',
  'ref interval',
  'biological reference interval',
  'biological ref interval',
  'biological ref. interval',
  'bio ref interval',
  'bio. ref. interval',
  'normal',
  'normal range',
  'range',
  'biological reference range',
]);

const METHOD_HEADERS = new Set(['method', 'methodology', 'technique']);

const IGNORE_HEADERS = new Set([
  's. no',
  's no',
  'sr no',
  'sr. no',
  'sl no',
  'sl. no',
  'sno',
  '#',
  'no',
  'flag',
  'status',
  'remark',
  'remarks',
  'notes',
]);

/** Looks like "12.0 - 15.0" / "12.0–15.0" / "12.0 to 15.0". */
const RANGE_VALUE_RE = /^[<>]?\s*\d+(?:[.,]\d+)?\s*(?:[-–—]|to)\s*[<>]?\s*\d+(?:[.,]\d+)?$/i;

const VALUE_THEN_UNIT_RE = /^((?:[<>]=?)?\s*[+-]?\d+(?:[.,]\d+)?)\s+([^\s].*)$/;

const MIN_TEXT_ITEMS_FOR_TABLE = 3;
/** Value and range column starts must be at least this many char-widths apart. */
const MIN_VALUE_RANGE_GAP_CHARS = 3;
/** Cell center within this fraction of the boundary → ambiguous. */
const BOUNDARY_AMBIGUITY_FRAC = 0.18;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_./]+/g, ' ')
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerRole(text: string): ColumnRole | null {
  const n = normalizeHeader(text);
  if (!n) return null;
  if (IGNORE_HEADERS.has(n)) return 'ignore';
  if (NAME_HEADERS.has(n)) return 'name';
  if (VALUE_HEADERS.has(n)) return 'value';
  if (UNIT_HEADERS.has(n)) return 'unit';
  if (RANGE_HEADERS.has(n)) return 'range';
  if (METHOD_HEADERS.has(n)) return 'method';
  return null;
}

function charWidth(items: PositionedTextItem[]): number {
  const widths = items
    .map((item) => {
      const len = item.text.replace(/\s+/g, '').length;
      return len > 0 && item.width > 0 ? item.width / len : 0;
    })
    .filter((w) => w > 0);
  return median(widths) || 6;
}

function inferRowTolerance(items: PositionedTextItem[]): number {
  // Same-line runs share a baseline (typically < 0.5 em). Do not use cell
  // *width* — wide headers would collapse the next row into the header.
  const em = charWidth(items);
  return Math.max(0.35, em * 0.5);
}

function clusterRows(items: PositionedTextItem[], tolerance: number): PositionedTextItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PositionedTextItem[][] = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (!last) {
      rows.push([item]);
      continue;
    }
    const rowY = last.reduce((sum, it) => sum + it.y, 0) / last.length;
    if (Math.abs(item.y - rowY) <= tolerance) {
      last.push(item);
    } else {
      rows.push([item]);
    }
  }
  return rows.map((row) => [...row].sort((a, b) => a.x - b.x));
}

function joinRowCells(row: PositionedTextItem[], gapTol: number): JoinedCell[] {
  if (row.length === 0) return [];
  const cells: JoinedCell[] = [];
  let current: JoinedCell = {
    text: row[0].text,
    x: row[0].x,
    y: row[0].y,
    width: row[0].width,
  };
  for (let i = 1; i < row.length; i += 1) {
    const item = row[i];
    const gap = item.x - (current.x + current.width);
    if (gap <= gapTol) {
      const spacer = gap > gapTol * 0.15 ? ' ' : '';
      current.text = `${current.text}${spacer}${item.text}`;
      current.width = item.x + item.width - current.x;
      current.y = (current.y + item.y) / 2;
    } else {
      cells.push({ ...current, text: current.text.replace(/\s+/g, ' ').trim() });
      current = { text: item.text, x: item.x, y: item.y, width: item.width };
    }
  }
  cells.push({ ...current, text: current.text.replace(/\s+/g, ' ').trim() });
  return cells.filter((cell) => cell.text.length > 0);
}

function looksLikeHeader(cells: JoinedCell[]): boolean {
  const roles = cells
    .map((cell) => headerRole(cell.text))
    .filter((role): role is ColumnRole => role != null);
  return roles.includes('name') && roles.includes('value');
}

/** Raw items — catches overlapping Result/Range before join merges them. */
function rawItemsHaveNameAndValue(row: PositionedTextItem[]): boolean {
  const roles = row
    .map((item) => headerRole(item.text))
    .filter((role): role is ColumnRole => role != null);
  return roles.includes('name') && roles.includes('value');
}

function valueRangeTooClose(row: PositionedTextItem[], minGap: number): boolean {
  const valueXs = row.filter((item) => headerRole(item.text) === 'value').map((item) => item.x);
  const rangeXs = row.filter((item) => headerRole(item.text) === 'range').map((item) => item.x);
  for (const vx of valueXs) {
    for (const rx of rangeXs) {
      if (Math.abs(rx - vx) < minGap) return true;
    }
  }
  return false;
}

function columnsFromHeader(cells: JoinedCell[], minValueRangeGap: number): Column[] | null {
  const labeled: Array<{ role: ColumnRole; x: number }> = [];
  for (const cell of cells) {
    const role = headerRole(cell.text);
    if (!role || role === 'ignore') continue;
    if (labeled.some((c) => c.role === role)) continue;
    labeled.push({ role, x: cell.x });
  }
  const hasName = labeled.some((c) => c.role === 'name');
  const hasValue = labeled.some((c) => c.role === 'value');
  if (!hasName || !hasValue) return null;

  labeled.sort((a, b) => a.x - b.x);
  const valueCol = labeled.find((c) => c.role === 'value');
  const rangeCol = labeled.find((c) => c.role === 'range');
  if (valueCol && rangeCol && Math.abs(rangeCol.x - valueCol.x) < minValueRangeGap) {
    return null;
  }
  return labeled.map((c) => ({ role: c.role, xStart: c.x }));
}

function assignCellColumn(
  cell: JoinedCell,
  columns: Column[],
  charW: number
): { role: ColumnRole; ambiguous: boolean } | null {
  if (columns.length === 0) return null;
  const center = cell.x + cell.width / 2;
  let bestIdx = 0;
  let bestDist = Math.abs(center - columns[0].xStart);
  for (let i = 1; i < columns.length; i += 1) {
    const dist = Math.abs(center - columns[i].xStart);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  const prev = columns[bestIdx - 1];
  const next = columns[bestIdx + 1];
  const leftBound = prev ? (prev.xStart + columns[bestIdx].xStart) / 2 : -Infinity;
  const rightBound = next ? (next.xStart + columns[bestIdx].xStart) / 2 : Infinity;
  if (center < leftBound || center > rightBound) {
    return null;
  }

  const band = Math.max(charW * 2, 8);
  const nearLeft =
    Number.isFinite(leftBound) && Math.abs(center - leftBound) < band * BOUNDARY_AMBIGUITY_FRAC;
  const nearRight =
    Number.isFinite(rightBound) && Math.abs(center - rightBound) < band * BOUNDARY_AMBIGUITY_FRAC;
  if ((nearLeft || nearRight) && (prev || next)) {
    const neighbor = nearLeft ? prev : next;
    if (
      neighbor &&
      (columns[bestIdx].role === 'value' || columns[bestIdx].role === 'range') &&
      (neighbor.role === 'value' || neighbor.role === 'range')
    ) {
      return { role: columns[bestIdx].role, ambiguous: true };
    }
  }
  return { role: columns[bestIdx].role, ambiguous: false };
}

function splitValueAndUnit(
  rawValue: string,
  rawUnit: string | null
): { value: string; unit: string | null } {
  if (rawUnit) return { value: rawValue, unit: rawUnit };
  const match = rawValue.match(VALUE_THEN_UNIT_RE);
  if (!match) return { value: rawValue, unit: null };
  return { value: match[1].replace(/\s+/g, ' ').trim(), unit: match[2].trim() };
}

function isRangeShaped(value: string): boolean {
  return RANGE_VALUE_RE.test(value.trim());
}

function rowFromCells(
  cells: JoinedCell[],
  columns: Column[],
  charW: number,
  pageIndex: number
): RawExtractedRow | 'ambiguous' | null {
  const bucket: Record<ColumnRole, string[]> = {
    name: [],
    value: [],
    unit: [],
    range: [],
    method: [],
    ignore: [],
  };
  let ambiguousValueRange = false;
  for (const cell of cells) {
    const assigned = assignCellColumn(cell, columns, charW);
    if (!assigned) continue;
    if (assigned.ambiguous) {
      ambiguousValueRange = true;
      continue;
    }
    bucket[assigned.role].push(cell.text);
  }
  if (ambiguousValueRange) return 'ambiguous';

  const rawName = bucket.name.join(' ').replace(/\s+/g, ' ').trim();
  if (!rawName) return null;

  const joinedValue = bucket.value.join(' ').replace(/\s+/g, ' ').trim();
  const joinedUnit = bucket.unit.join(' ').replace(/\s+/g, ' ').trim() || null;
  const rawRange = bucket.range.join(' ').replace(/\s+/g, ' ').trim() || null;
  const rawMethod = bucket.method.join(' ').replace(/\s+/g, ' ').trim() || null;

  if (!joinedValue) return null;
  if (isRangeShaped(joinedValue) && !rawRange) return null;

  const { value, unit } = splitValueAndUnit(joinedValue, joinedUnit);
  if (isRangeShaped(value) && !rawRange) return null;

  const lineText = cells
    .map((c) => c.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    rawName,
    rawValue: value,
    rawUnit: unit,
    rawRange,
    rawMethod,
    pageIndex,
    lineText,
  };
}

function extractPage(items: PositionedTextItem[], pageIndex: number): LabPdfPageExtract {
  const pageItems = items.filter(
    (item) => item.pageIndex === pageIndex && item.text.trim().length > 0
  );
  if (pageItems.length < MIN_TEXT_ITEMS_FOR_TABLE) {
    return { pageIndex, rows: [], skipped: true, skipReason: 'no_text' };
  }

  const charW = charWidth(pageItems);
  const rowTol = inferRowTolerance(pageItems);
  const gapTol = charW * 1.6;
  const minValueRangeGap = charW * MIN_VALUE_RANGE_GAP_CHARS;
  const clustered = clusterRows(pageItems, rowTol);

  const rows: RawExtractedRow[] = [];
  let columns: Column[] | null = null;
  let sawHeader = false;
  let headerRejected = false;

  for (const rawRow of clustered) {
    const cells = joinRowCells(rawRow, gapTol);
    if (cells.length === 0) continue;

    const rawHeader = rawItemsHaveNameAndValue(rawRow);
    const joinedHeader = looksLikeHeader(cells);
    if (rawHeader || joinedHeader) {
      if (valueRangeTooClose(rawRow, minValueRangeGap)) {
        headerRejected = true;
        columns = null;
        sawHeader = true;
        continue;
      }
      const next = columnsFromHeader(cells, minValueRangeGap);
      if (!next) {
        headerRejected = true;
        columns = null;
        sawHeader = true;
        continue;
      }
      columns = next;
      sawHeader = true;
      headerRejected = false;
      continue;
    }

    if (!columns) continue;
    const extracted = rowFromCells(cells, columns, charW, pageIndex);
    if (extracted === 'ambiguous' || extracted == null) continue;
    rows.push(extracted);
  }

  if (!sawHeader) {
    return { pageIndex, rows: [], skipped: true, skipReason: 'no_header' };
  }
  if (headerRejected && rows.length === 0) {
    return { pageIndex, rows: [], skipped: true, skipReason: 'ambiguous_columns' };
  }
  return { pageIndex, rows, skipped: false, skipReason: null };
}

/**
 * Reconstruct lab rows from positioned text items. Items may span pages;
 * grouping is by `pageIndex`. Never invents cell values.
 */
export function reconstructLabTable(items: readonly PositionedTextItem[]): LabPdfTableExtract {
  const pageIndexes = [...new Set(items.map((item) => item.pageIndex))].sort((a, b) => a - b);
  const pages = pageIndexes.map((pageIndex) =>
    extractPage(
      items.filter((item) => item.pageIndex === pageIndex),
      pageIndex
    )
  );
  const rows = pages.flatMap((page) => page.rows);
  const skippedPageIndexes = pages.filter((page) => page.skipped).map((page) => page.pageIndex);
  return { rows, pages, skippedPageIndexes };
}
