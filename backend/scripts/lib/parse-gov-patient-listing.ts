/**
 * Parse a Punjab gov "Patient Listing Report" PDF into visit rows.
 * Dedup key is the 15-digit CR No. — never log names or phones.
 */
import { inflateRawSync, inflateSync, unzipSync } from 'zlib';

export type GovVisitType = 'New' | 'Revisit';
export type GovGender = 'male' | 'female' | 'other';

export interface GovOpdVisit {
  cr: string;
  name: string;
  fatherName: string | null;
  gender: GovGender;
  ageYears: number;
  mobile: string;
  visitDate: Date;
  visitType: GovVisitType;
}

export interface GovOpdPatient {
  cr: string;
  name: string;
  fatherName: string | null;
  gender: GovGender;
  ageYears: number;
  mobile: string;
  lastVisitDate: Date;
  lastVisitType: GovVisitType;
  visitCount: number;
}

type Col =
  | 'sno'
  | 'cr'
  | 'name'
  | 'father'
  | 'gender'
  | 'age'
  | 'mobile'
  | 'date'
  | 'visit';

const HEADER = new Set([
  'S.No',
  'CR No.',
  'Patient Name',
  'Father',
  'Name',
  'Gender',
  'Age',
  'Mobile NO',
  'Visit Date',
  'Visit',
  'Type',
]);

const CR15 = /^\d{15}$/;
const MOBILE10 = /^\d{10}$/;
const AGE_YR = /^(\d+)Yr$/;
const VISIT_DATE = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/;
const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function inflatePdfStream(raw: Buffer): Buffer | null {
  try {
    return unzipSync(raw);
  } catch {
    /* try next */
  }
  try {
    return inflateSync(raw);
  } catch {
    /* try next */
  }
  try {
    return inflateRawSync(raw);
  } catch {
    return null;
  }
}

function unescapePdfLiteral(raw: string): string {
  return raw
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');
}

function extractStreams(pdf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdf.toString('latin1'))) !== null) {
    const raw = Buffer.from(m[1], 'latin1');
    const inflated = inflatePdfStream(raw);
    if (inflated) out.push(inflated);
  }
  return out;
}

function positionedText(blob: Buffer): Array<{ x: number; y: number; text: string }> {
  const src = blob.toString('latin1');
  const items: Array<{ x: number; y: number; text: string }> = [];
  let x = 0;
  let y = 0;
  const re = /([\d.\-]+)\s+([\d.\-]+)\s+Td|\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[0].endsWith('Td')) {
      x = Number(m[1]);
      y = Number(m[2]);
      continue;
    }
    const text = unescapePdfLiteral(m[3] ?? '').trim();
    if (text) items.push({ x, y, text });
  }
  return items;
}

function columnForX(x: number): Col {
  if (x < 60) return 'sno';
  if (x < 140) return 'cr';
  if (x < 215) return 'name';
  if (x < 290) return 'father';
  if (x < 355) return 'gender';
  if (x < 420) return 'age';
  if (x < 478) return 'mobile';
  if (x < 540) return 'date';
  return 'visit';
}

function parseVisitDate(raw: string): Date | null {
  const m = raw.match(VISIT_DATE);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}

function mapGender(raw: string): GovGender | null {
  if (raw === 'M') return 'male';
  if (raw === 'F') return 'female';
  if (raw === 'O') return 'other';
  return null;
}

function collapse(parts: string[] | undefined): string {
  return (parts ?? []).join(' ').replace(/\s+/g, ' ').trim();
}

function parsePageVisits(blob: Buffer): Array<Record<string, string>> {
  const items = positionedText(blob);
  const byY = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    const key = Math.round(item.y * 10) / 10;
    const row = byY.get(key) ?? [];
    row.push({ x: item.x, text: item.text });
    byY.set(key, row);
  }

  const ys = [...byY.keys()].sort((a, b) => b - a);
  const visits: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;

  for (const y of ys) {
    const cells = (byY.get(y) ?? []).slice().sort((a, b) => a.x - b.x);
    const texts = cells.map((c) => c.text);
    if (
      texts.includes('S.No') ||
      texts.some((t) => t === 'Patient Listing Report' || t.startsWith('From Date'))
    ) {
      continue;
    }

    const mapped: Partial<Record<Col, string[]>> = {};
    for (const cell of cells) {
      if (HEADER.has(cell.text)) continue;
      const col = columnForX(cell.x);
      mapped[col] = [...(mapped[col] ?? []), cell.text];
    }

    const isNew = Boolean(mapped.sno || mapped.cr || mapped.mobile || mapped.date);
    if (isNew) {
      if (current) visits.push(current);
      current = {};
      (Object.keys(mapped) as Col[]).forEach((col) => {
        const value = collapse(mapped[col]);
        if (value) current![col] = value;
      });
    } else if (current) {
      (Object.keys(mapped) as Col[]).forEach((col) => {
        const extra = collapse(mapped[col]);
        if (!extra) return;
        current![col] = current![col] ? `${current![col]} ${extra}` : extra;
      });
    }
  }
  if (current) visits.push(current);
  return visits;
}

export function parseGovPatientListing(pdf: Buffer): GovOpdVisit[] {
  const visits: GovOpdVisit[] = [];
  for (const stream of extractStreams(pdf)) {
    for (const raw of parsePageVisits(stream)) {
      const cr = raw.cr ?? '';
      if (!CR15.test(cr)) continue;
      const mobile = raw.mobile ?? '';
      if (!MOBILE10.test(mobile)) continue;
      const name = (raw.name ?? '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const gender = mapGender(raw.gender ?? '');
      const ageMatch = (raw.age ?? '').match(AGE_YR);
      const visitDate = parseVisitDate(raw.date ?? '');
      const visitType = raw.visit;
      if (!gender || !ageMatch || !visitDate) continue;
      if (visitType !== 'New' && visitType !== 'Revisit') continue;
      const fatherRaw = (raw.father ?? '').replace(/\s+/g, ' ').trim();
      visits.push({
        cr,
        name,
        fatherName: fatherRaw && fatherRaw !== '-' ? fatherRaw : null,
        gender,
        ageYears: Number(ageMatch[1]),
        mobile,
        visitDate,
        visitType,
      });
    }
  }
  return visits;
}

/** One row per CR. Latest visit wins for demographics. */
export function uniquePatientsFromVisits(visits: GovOpdVisit[]): GovOpdPatient[] {
  const byCr = new Map<string, GovOpdPatient>();
  for (const visit of visits) {
    const prev = byCr.get(visit.cr);
    if (!prev) {
      byCr.set(visit.cr, {
        cr: visit.cr,
        name: visit.name,
        fatherName: visit.fatherName,
        gender: visit.gender,
        ageYears: visit.ageYears,
        mobile: visit.mobile,
        lastVisitDate: visit.visitDate,
        lastVisitType: visit.visitType,
        visitCount: 1,
      });
      continue;
    }
    prev.visitCount += 1;
    if (visit.visitDate >= prev.lastVisitDate) {
      prev.name = visit.name;
      prev.fatherName = visit.fatherName;
      prev.gender = visit.gender;
      prev.ageYears = visit.ageYears;
      prev.mobile = visit.mobile;
      prev.lastVisitDate = visit.visitDate;
      prev.lastVisitType = visit.visitType;
    }
  }
  return [...byCr.values()];
}
