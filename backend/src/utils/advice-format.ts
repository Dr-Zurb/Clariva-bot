/**
 * Plan advice output helpers.
 *
 * Single patient-facing "Advice" bucket. Legacy `patient_education` may still
 * hold text on older rows — merge into advice at read/output time.
 * Keep in sync with `frontend/lib/cockpit/advice-format.ts`.
 */

/** Merge advice + legacy patient_education into one patient-facing string. */
export function resolveAdviceForOutput(
  advice: string | null | undefined,
  patientEducation: string | null | undefined,
): string | null {
  const a = advice?.trim() ?? '';
  const e = patientEducation?.trim() ?? '';
  if (a && e) {
    if (a.toLowerCase().includes(e.toLowerCase())) return a;
    return `${a}\n${e}`;
  }
  if (a) return a;
  if (e) return e;
  return null;
}
