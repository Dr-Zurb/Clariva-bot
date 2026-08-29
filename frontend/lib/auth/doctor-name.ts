/**
 * Doctor display-name helpers (auth-password · AP-D13).
 * UI shows a fixed "Dr." prefix; storage always normalizes to `Dr. …`.
 */

/** Strip a leading Dr / Dr. (case-insensitive) for the editable input. */
export function stripDoctorPrefix(raw: string): string {
  return raw.replace(/^\s*dr\.?\s*/i, "").trim();
}

/**
 * Normalize to `Dr. {Name}`. Empty → empty. Idempotent for already-prefixed
 * values (`Dr. Ada` / `dr Ada` → `Dr. Ada`).
 */
export function formatDoctorDisplayName(raw: string): string {
  const bare = stripDoctorPrefix(raw).trim();
  if (!bare) return "";
  return `Dr. ${bare}`;
}
