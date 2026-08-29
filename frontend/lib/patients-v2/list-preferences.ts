/**
 * Patients v2 list — column ids, defaults, and localStorage helpers (pr-06).
 */

export type PatientsListDensity = "compact" | "comfortable";

export const PATIENTS_LIST_DENSITY_KEY = "patients-v2/list-density";

export const PATIENT_LIST_COLUMN_DEFS = [
  { id: "avatar", label: "Avatar", defaultVisible: true },
  { id: "risk-pills", label: "Risk pills", defaultVisible: true },
  { id: "demographics", label: "Demographics", defaultVisible: true },
  { id: "mrn", label: "MRN", defaultVisible: true },
  { id: "phone", label: "Phone", defaultVisible: true },
  { id: "last-visit", label: "Last visit", defaultVisible: true },
  { id: "next-visit", label: "Next visit", defaultVisible: false },
  { id: "source-channel", label: "Source channel", defaultVisible: false },
] as const;

export type PatientListColumnId = (typeof PATIENT_LIST_COLUMN_DEFS)[number]["id"];

export const DEFAULT_VISIBLE_COLUMNS: PatientListColumnId[] = PATIENT_LIST_COLUMN_DEFS.filter(
  (c) => c.defaultVisible,
).map((c) => c.id);

function columnsStorageKey(userId: string): string {
  return `patients-v2/list-columns:${userId}`;
}

/** Always compact on Patients list (density toggle removed 2026-08-06). */
export const DEFAULT_LIST_DENSITY: PatientsListDensity = "compact";

/** @deprecated Density is fixed to compact; kept for older tests/callers. */
export function readDensityFromStorage(): PatientsListDensity {
  return DEFAULT_LIST_DENSITY;
}

/** @deprecated No-op — density toggle removed. */
export function writeDensityToStorage(_density: PatientsListDensity): void {
  // intentionally empty
}

export function readColumnsFromStorage(userId: string): PatientListColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_VISIBLE_COLUMNS];
  try {
    const raw = window.localStorage.getItem(columnsStorageKey(userId));
    if (!raw) return [...DEFAULT_VISIBLE_COLUMNS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_VISIBLE_COLUMNS];
    const valid = new Set(PATIENT_LIST_COLUMN_DEFS.map((c) => c.id));
    const cols = parsed.filter((c): c is PatientListColumnId => typeof c === "string" && valid.has(c as PatientListColumnId));
    return cols.length > 0 ? cols : [...DEFAULT_VISIBLE_COLUMNS];
  } catch {
    return [...DEFAULT_VISIBLE_COLUMNS];
  }
}

export function writeColumnsToStorage(userId: string, columns: PatientListColumnId[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(columnsStorageKey(userId), JSON.stringify(columns));
}
