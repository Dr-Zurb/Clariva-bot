export interface ClubbingGradeReferenceRow {
  grade: string;
  description: string;
}

export const CLUBBING_GRADE_REFERENCE: readonly ClubbingGradeReferenceRow[] = [
  { grade: "Present", description: "Clubbing noted; grade not specified" },
  { grade: "G1", description: "Softening of nail bed" },
  { grade: "G2", description: "Hyponychial (Lovibond) angle >180°" },
  { grade: "G3", description: "Parrot-beak / increased AP diameter" },
  { grade: "G4", description: "Drumstick appearance" },
] as const;

const LEGACY_GRADE_MAP: Record<string, string> = {
  "grade 1": "G1",
  "grade 2": "G2",
  "grade 3": "G3",
  "grade 4": "G4",
};

/** Migrate legacy clubbing grade labels (`Grade 1` → `G1`). */
export function migrateClubbingAttributes(
  attributes: Record<string, string>,
): Record<string, string> {
  const grade = attributes.grade?.trim();
  if (!grade) return attributes;
  const mapped = LEGACY_GRADE_MAP[grade.toLowerCase()];
  if (!mapped) return attributes;
  return { ...attributes, grade: mapped };
}
