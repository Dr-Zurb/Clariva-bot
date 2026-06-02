/**
 * Shared OPD hub search matcher (queue + slot dense lists).
 *
 * @see docs/Work/Daily-plans/May 2026/15-05-2026/opd-slot-hub/Tasks/task-sl-04-slot-session-list-and-row-actions.md
 */

export interface OpdSearchMatchable {
  patientName: string;
  medicalRecordNumber: string | null;
  patientPhone: string;
  reasonForVisit: string | null;
  serviceLabel: string | null;
}

function hashMatchNumber(row: OpdSearchMatchable): number | undefined {
  if (
    "tokenNumber" in row &&
    typeof (row as { tokenNumber?: number }).tokenNumber === "number"
  ) {
    return (row as { tokenNumber: number }).tokenNumber;
  }
  if (
    "position" in row &&
    typeof (row as { position?: number }).position === "number"
  ) {
    return (row as { position: number }).position;
  }
  return undefined;
}

/**
 * Returns true when `row` matches the search query.
 *
 * Match rules (any of):
 *  1. `q` starts with `#` and the suffix is digits → exact hash number match
 *     (queue: `tokenNumber`, slot: `position` when `tokenNumber` absent).
 *  2. `q` is digits-only (≥3 chars) → match against `patientPhone` after stripping
 *     non-digits from both sides.
 *  3. Otherwise → case-insensitive substring match against name, MRN, reason, service.
 *
 * Empty `q` returns `true` (no filter).
 */
export function matchesOpdSearch<T extends OpdSearchMatchable>(
  row: T,
  query: string
): boolean {
  const trimmed = query.trim();
  if (trimmed === "") return true;

  if (trimmed.startsWith("#") && /^\d+$/.test(trimmed.slice(1))) {
    const n = Number(trimmed.slice(1));
    const hashN = hashMatchNumber(row);
    return hashN !== undefined && hashN === n;
  }

  const normalizedQ = trimmed.replace(/\D/g, "");
  if (normalizedQ.length >= 3 && !/[a-zA-Z]/.test(trimmed)) {
    const normalizedPhone = row.patientPhone.replace(/\D/g, "");
    return normalizedPhone.includes(normalizedQ);
  }

  const haystack = (
    row.patientName +
    " " +
    (row.medicalRecordNumber ?? "") +
    " " +
    (row.reasonForVisit ?? "") +
    " " +
    (row.serviceLabel ?? "")
  ).toLowerCase();
  return haystack.includes(trimmed.toLowerCase());
}

/** @deprecated Use `matchesOpdSearch` — retained for call-site brevity. */
export const matchesOpdQueueSearch = matchesOpdSearch;
