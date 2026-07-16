/**
 * Plan follow-up output helpers (plan-p1 / follow-up polish).
 *
 * Structured `follow_up_value` + `follow_up_unit` is the interval ("when").
 * Free-text `follow_up` is notes only ("extra on Rx"). Patient-facing output
 * merges them. Keep in sync with `backend/src/utils/follow-up-format.ts`.
 */

export type FollowUpUnit = "days" | "weeks" | "months" | "as_needed";

const NOTES_JOIN = " — ";

/** Format structured follow-up only (no free-text). */
export function formatStructuredFollowUp(
  value: number | null | undefined,
  unit: FollowUpUnit | null | undefined,
): string | null {
  if (unit === "as_needed") return "as needed";
  if (value == null || unit == null) return null;
  if (unit !== "days" && unit !== "weeks" && unit !== "months") return null;
  if (value <= 0) return null;
  const unitLabel = value === 1 ? unit.replace(/s$/, "") : unit;
  return `in ${value} ${unitLabel}`;
}

/**
 * Resolve the patient-facing follow-up string.
 * Structured interval + notes merge; either alone is fine.
 * Dedupes when `follow_up` TEXT still holds a persisted output echo.
 */
export function resolveFollowUpForOutput(
  freeText: string | null | undefined,
  value: number | null | undefined,
  unit: FollowUpUnit | null | undefined,
): string | null {
  const structured = formatStructuredFollowUp(value, unit);
  const notes = hydrateFollowUpNotes(freeText, value, unit);
  if (structured && notes) return `${structured}${NOTES_JOIN}${notes}`;
  if (structured) return structured;
  if (notes) return notes;
  return null;
}

/**
 * Normalize persisted `follow_up` TEXT into UI notes.
 * Strips structured-only echoes and `structured — notes` prefixes from
 * older saves that wrote the resolved patient-facing string back to the column.
 */
export function hydrateFollowUpNotes(
  freeText: string | null | undefined,
  value: number | null | undefined,
  unit: FollowUpUnit | null | undefined,
): string {
  const trimmed = freeText?.trim() ?? "";
  if (!trimmed) return "";
  const structured = formatStructuredFollowUp(value, unit);
  if (!structured) return trimmed;
  if (trimmed === structured) return "";
  const prefix = `${structured}${NOTES_JOIN}`;
  if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length).trim();
  return trimmed;
}
