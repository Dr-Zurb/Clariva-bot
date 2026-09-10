/**
 * Patient-facing Rx lines. Keep in lockstep with
 * `backend/src/utils/vitals-format.ts` and `allergy-format.ts`.
 */

export function formatAllergiesForOutput(
  allergies:
    | Array<{
        allergen: string;
        severity?: string | null;
        reaction?: string | null;
      }>
    | null
    | undefined,
  options: { noKnownAllergies?: boolean } = {}
): string | null {
  const parts = (allergies ?? [])
    .map((row) => {
      const allergen = row.allergen?.trim() ?? "";
      if (!allergen) return null;
      const bits: string[] = [];
      const severity = row.severity?.trim() ?? "";
      if (severity && severity !== "unknown") bits.push(severity);
      const reaction = row.reaction?.trim() ?? "";
      if (reaction) bits.push(reaction);
      return bits.length > 0 ? `${allergen} (${bits.join(" — ")})` : allergen;
    })
    .filter((v): v is string => Boolean(v));
  // A recorded allergen outranks the flag, so a stale assertion can never
  // print a false negative over a real allergy.
  if (parts.length > 0) return parts.join(" · ");
  return options.noKnownAllergies ? "No known allergies" : null;
}

export function formatVitalsForOutput(v: {
  vitalsBpSystolic?: number | null;
  vitalsBpDiastolic?: number | null;
  vitalsHr?: number | null;
  vitalsTempC?: number | null;
  vitalsSpo2?: number | null;
  vitalsWtKg?: number | null;
  vitalsHtCm?: number | null;
  vitalsRr?: number | null;
  vitalsPainScore?: number | null;
  vitalsGlucoseMgDl?: number | null;
  vitalsGcsTotal?: number | null;
  vitalsBpPosture?: string | null;
  vitalsBpLimb?: string | null;
  /** Visit-level vitals note (`vitals_json.sectionNote` / desk `patient_vitals.note`). */
  note?: string | null;
}): string | null {
  const postureLabel: Record<string, string> = {
    sitting: "sitting",
    standing: "standing",
    supine: "supine",
  };
  const limbLabel: Record<string, string> = {
    left_arm: "L arm",
    right_arm: "R arm",
    left_leg: "L leg",
    right_leg: "R leg",
  };

  const parts: string[] = [];
  if (v.vitalsBpSystolic != null && v.vitalsBpDiastolic != null) {
    const extras = [
      v.vitalsBpPosture ? postureLabel[v.vitalsBpPosture] : null,
      v.vitalsBpLimb ? limbLabel[v.vitalsBpLimb] : null,
    ].filter(Boolean);
    const core = `BP ${v.vitalsBpSystolic}/${v.vitalsBpDiastolic}`;
    parts.push(extras.length > 0 ? `${core} (${extras.join(", ")})` : core);
  }
  if (v.vitalsHr != null) parts.push(`HR ${v.vitalsHr}`);
  if (v.vitalsTempC != null) parts.push(`Temp ${v.vitalsTempC} °C`);
  if (v.vitalsSpo2 != null) parts.push(`SpO₂ ${v.vitalsSpo2}%`);
  if (v.vitalsWtKg != null) parts.push(`Wt ${v.vitalsWtKg} kg`);
  if (v.vitalsHtCm != null) parts.push(`Ht ${v.vitalsHtCm} cm`);
  if (v.vitalsRr != null) parts.push(`RR ${v.vitalsRr}`);
  if (v.vitalsPainScore != null) parts.push(`Pain ${v.vitalsPainScore}/10`);
  if (v.vitalsGlucoseMgDl != null)
    parts.push(`Glucose ${v.vitalsGlucoseMgDl} mg/dL`);
  if (v.vitalsGcsTotal != null) parts.push(`GCS ${v.vitalsGcsTotal}`);
  const note = v.note?.trim();
  if (note) {
    if (parts.length === 0) return note;
    return `${parts.join(" · ")} — ${note}`;
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
