import { digitsLast10, isCompleteDeskPhone } from "@/lib/desk/phone";

const MIN_PHONE_LENGTH = 2;
const MIN_NAME_LENGTH = 3;

/** Stored MRNs are `P-00001`. Accept `P-00001` / `p00001` / `P 00001`. */
const MRN_QUERY = /^p-?(\d{3,})$/i;

/** Incomplete MRN attempt — do not treat as a name. */
const MRN_PREFIX = /^p-?\d*$/i;

export type DeskSearchKind = "phone" | "mrn" | "name";

/**
 * Normalize desk search. Mobile (complete or digit fragment), MRN, or name (3+ characters).
 */
export function deskSearchQuery(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (isCompleteDeskPhone(trimmed)) return digitsLast10(trimmed);

  const digits = trimmed.replace(/\D/g, "");
  const withoutPhonePunct = trimmed.replace(/[\s+\-().]/g, "");
  if (digits.length >= MIN_PHONE_LENGTH && /^\d+$/.test(withoutPhonePunct)) {
    return digits;
  }

  const compact = trimmed.replace(/\s+/g, "");
  const mrn = compact.match(MRN_QUERY);
  if (mrn) return `P-${mrn[1]}`;
  if (MRN_PREFIX.test(compact)) return "";

  const name = trimmed.replace(/\s+/g, " ");
  if (name.length >= MIN_NAME_LENGTH) return name;

  return "";
}

export function isSearchableDeskQuery(raw: string): boolean {
  return deskSearchQuery(raw).length > 0;
}

export function deskSearchKind(raw: string): DeskSearchKind | null {
  const q = deskSearchQuery(raw);
  if (!q) return null;
  if (/^\d+$/.test(q)) return "phone";
  if (/^P-\d+$/.test(q)) return "mrn";
  return "name";
}

/** Form name no longer matches the Find-a-patient name search — drop that search so live form results can show. */
export function deskFormNameOverridesSearch(formName: string, searchQuery: string): boolean {
  if (deskSearchKind(searchQuery) !== "name") return false;
  const form = deskSearchQuery(formName);
  if (!form) return false;
  return form.toLocaleLowerCase() !== deskSearchQuery(searchQuery).toLocaleLowerCase();
}
