/**
 * Parse / serialize helpers for `examination_findings` per DL-6 / DL-9.
 *
 * The DB column is a single `examination_findings` text field (cv2-04 migration
 * 103). The R-HISTORY UI presents two textareas (General + Systemic). This helper
 * pair handles the round-trip via a delimiter.
 *
 * Format:
 *   {general text}\n--- SYSTEMIC ---\n{systemic text}
 *
 * Legacy data (no delimiter) populates `general` and leaves `systemic` empty.
 */

export interface ExamSections {
  general: string;
  systemic: string;
}

export const EXAM_DELIMITER = "\n--- SYSTEMIC ---\n";

/**
 * Parse a combined examination_findings string into general + systemic sections.
 * Tolerates absence of the delimiter (treats everything as general — legacy data).
 */
export function parseExam(combined: string): ExamSections {
  if (!combined) return { general: "", systemic: "" };

  const idx = combined.indexOf(EXAM_DELIMITER);
  if (idx === -1) {
    return { general: combined, systemic: "" };
  }
  return {
    general: combined.slice(0, idx),
    systemic: combined.slice(idx + EXAM_DELIMITER.length),
  };
}

/**
 * Serialize general + systemic into a single examination_findings string.
 * Returns "" when both sections are empty (so the column stores null per the
 * existing `.trim() || null` rule in RxFormContext.serialize).
 *
 * Escapes any literal `--- SYSTEMIC ---` in the general section by prepending
 * a zero-width-joiner to the second hyphen, preserving the doctor's intent.
 */
export function serializeExam(general: string, systemic: string): string {
  const safeGeneral = general.replaceAll(
    EXAM_DELIMITER,
    "\n--\u200d- SYSTEMIC ---\n",
  );
  if (!safeGeneral && !systemic) return "";
  if (!systemic) return safeGeneral;
  return `${safeGeneral}${EXAM_DELIMITER}${systemic}`;
}
