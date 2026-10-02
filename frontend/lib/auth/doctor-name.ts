/**
 * Doctor display-name helpers (auth-password · AP-D13).
 * UI shows a fixed "Dr." prefix; storage always normalizes to `Dr. …`.
 */

/**
 * Strip a leading Dr / Dr. (case-insensitive) for the editable input.
 * Trailing spaces stay so a first and last name can be typed.
 * Callers that persist the name trim via `formatDoctorDisplayName`.
 */
export function stripDoctorPrefix(raw: string): string {
  return raw.replace(/^\s*dr\.?\s*/i, "").replace(/^\s+/, "");
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
