export const DESK_GUARDIAN_RELATIONS = [
  { value: "father", label: "Father" },
  { value: "spouse", label: "Spouse" },
  { value: "mother", label: "Mother" },
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
] as const;

export type DeskGuardianRelation = (typeof DESK_GUARDIAN_RELATIONS)[number]["value"];

const GUARDIAN_NAME_LABEL: Record<DeskGuardianRelation, string> = {
  father: "Father's name",
  spouse: "Spouse's name",
  mother: "Mother's name",
  son: "Son's name",
  daughter: "Daughter's name",
};

export function deskGuardianNameLabel(relation: DeskGuardianRelation): string {
  return GUARDIAN_NAME_LABEL[relation];
}

/** Compact Indian-register form: s/o, d/o, w/o, c/o. */
export function formatDeskGuardian(
  name?: string | null,
  relation?: string | null,
  gender?: string | null
): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  const rel = (relation ?? "").trim().toLowerCase();
  const sex = (gender ?? "").trim().toLowerCase();
  if (rel === "father") {
    return sex === "female" || sex === "f" ? `d/o ${trimmed}` : `s/o ${trimmed}`;
  }
  if (rel === "spouse") return `w/o ${trimmed}`;
  if (rel === "mother" || rel === "son" || rel === "daughter") return `c/o ${trimmed}`;
  return trimmed;
}
