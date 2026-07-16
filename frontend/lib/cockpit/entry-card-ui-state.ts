/**
 * Per-visit / per-patient session UI for leaf entry-card open state.
 *
 * Section-level collapse already persists via doctor settings. These innermost
 * cards (medicines, known conditions, diagnoses, complaints, PMH) used bare
 * useState and reset on tab-strip switches + refresh. sessionStorage keeps them
 * for the lifetime of the browser tab (clinical privacy — cleared on tab close).
 */

export const ENTRY_CARD_UI_PREFIX = "clariva:entry-card-ui:";

export type EntryCardSingleSurface =
  | "medicines"
  | "knownConditions"
  | "diagnoses"
  | "complaints";

export interface EntryCardUiBucket {
  medicines?: string | null;
  /** Row index fallback — medicine instance ids regenerate on full reload. */
  medicinesIndex?: number | null;
  knownConditions?: string | null;
  diagnoses?: string | null;
  complaints?: string | null;
  /** parentComplaintId → active associated-complaint id */
  complaintChildren?: Record<string, string | null>;
  /** Open PMH condition card ids (multi-open). */
  pmhConditions?: string[];
}

export function entryCardUiStorageKey(scopeId: string): string {
  return `${ENTRY_CARD_UI_PREFIX}${scopeId}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseEntryCardUiBucket(raw: unknown): EntryCardUiBucket {
  if (!isPlainObject(raw)) return {};
  const out: EntryCardUiBucket = {};
  for (const key of [
    "medicines",
    "knownConditions",
    "diagnoses",
    "complaints",
  ] as const) {
    const v = raw[key];
    if (v === null || typeof v === "string") out[key] = v;
  }
  if (raw.medicinesIndex === null || typeof raw.medicinesIndex === "number") {
    out.medicinesIndex = raw.medicinesIndex;
  }
  if (isPlainObject(raw.complaintChildren)) {
    const children: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(raw.complaintChildren)) {
      if (v === null || typeof v === "string") children[k] = v;
    }
    out.complaintChildren = children;
  }
  if (Array.isArray(raw.pmhConditions)) {
    out.pmhConditions = raw.pmhConditions.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
  }
  return out;
}

export function readEntryCardUi(scopeId: string): EntryCardUiBucket {
  if (typeof window === "undefined" || !scopeId) return {};
  try {
    const raw = sessionStorage.getItem(entryCardUiStorageKey(scopeId));
    if (!raw) return {};
    return parseEntryCardUiBucket(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function writeEntryCardUi(
  scopeId: string,
  bucket: EntryCardUiBucket,
): void {
  if (typeof window === "undefined" || !scopeId) return;
  try {
    const key = entryCardUiStorageKey(scopeId);
    // Keep explicit nulls (user closed every card) so remount doesn't re-seed.
    const hasAnyKey =
      "medicines" in bucket ||
      "medicinesIndex" in bucket ||
      "knownConditions" in bucket ||
      "diagnoses" in bucket ||
      "complaints" in bucket ||
      (bucket.complaintChildren != null &&
        Object.keys(bucket.complaintChildren).length > 0) ||
      (bucket.pmhConditions != null && bucket.pmhConditions.length > 0);
    if (!hasAnyKey) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(bucket));
  } catch {
    // Quota / private mode — non-fatal.
  }
}

export function patchEntryCardUi(
  scopeId: string,
  patch: Partial<EntryCardUiBucket>,
): EntryCardUiBucket {
  const next = { ...readEntryCardUi(scopeId), ...patch };
  writeEntryCardUi(scopeId, next);
  return next;
}

/** True when this surface has ever been written for the scope (incl. explicit null). */
export function hasEntryCardSurface(
  scopeId: string,
  surface: EntryCardSingleSurface,
): boolean {
  if (!scopeId) return false;
  return Object.prototype.hasOwnProperty.call(readEntryCardUi(scopeId), surface);
}
