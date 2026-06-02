import type { SnapshotVitalsDisplay } from "./snapshot-vitals-merge";

export function formatCountSummary(
  count: number | null,
  singular: string,
  plural: string,
  emptyLabel: string,
): string {
  if (count == null) return emptyLabel;
  if (count === 0) return emptyLabel;
  return `${count} ${count === 1 ? singular : plural}`;
}

export function summarizeSnapshotVitals(
  displayed: Pick<SnapshotVitalsDisplay, "heightCm" | "weightKg">,
): string {
  const parts: string[] = [];
  if (displayed.heightCm != null) {
    parts.push(`${displayed.heightCm.replace(/\.0$/, "")}cm`);
  }
  if (displayed.weightKg != null) {
    parts.push(`${displayed.weightKg.replace(/\.0$/, "")}kg`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No vitals on file";
}

export function summarizeSnapshotPane(
  allergyCount: number | null,
  conditionCount: number | null,
  problemCount: number | null,
  medicationsCount: number | null,
  vitalsSummary: string,
): string {
  const parts: string[] = [];
  if (allergyCount != null && allergyCount > 0) {
    parts.push(formatCountSummary(allergyCount, "allergy", "allergies", ""));
  }
  if (conditionCount != null && conditionCount > 0) {
    parts.push(formatCountSummary(conditionCount, "condition", "conditions", ""));
  }
  if (problemCount != null && problemCount > 0) {
    parts.push(formatCountSummary(problemCount, "problem", "problems", ""));
  }
  if (vitalsSummary !== "No vitals on file") {
    parts.push(vitalsSummary);
  }
  if (medicationsCount != null && medicationsCount > 0) {
    parts.push(formatCountSummary(medicationsCount, "medication", "medications", ""));
  }
  return parts.length > 0 ? parts.join(" · ") : "No patient context on file";
}
