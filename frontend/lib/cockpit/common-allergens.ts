export interface CommonAllergenDef {
  value: string;
  label: string;
  searchTerms: readonly string[];
}

export const COMMON_ALLERGEN_CATALOG: readonly CommonAllergenDef[] = [
  { value: "penicillin", label: "Penicillin", searchTerms: ["penicillin", "pcn"] },
  { value: "sulfa", label: "Sulfa drugs", searchTerms: ["sulfa", "sulfonamide", "sulphonamide"] },
  { value: "nsaids", label: "NSAIDs", searchTerms: ["nsaid", "nsaids", "ibuprofen", "aspirin"] },
  { value: "cephalosporins", label: "Cephalosporins", searchTerms: ["cephalosporin", "cephalexin"] },
  { value: "peanuts", label: "Peanuts", searchTerms: ["peanut", "peanuts", "groundnut"] },
  { value: "shellfish", label: "Shellfish", searchTerms: ["shellfish", "seafood"] },
  { value: "latex", label: "Latex", searchTerms: ["latex"] },
  { value: "dust", label: "Dust", searchTerms: ["dust", "house dust"] },
  { value: "pollen", label: "Pollen", searchTerms: ["pollen", "hay fever"] },
  { value: "contrast", label: "Contrast dye", searchTerms: ["contrast", "iodine contrast", "dye"] },
] as const;

export const COMMON_ALLERGEN_QUICK_ADD = [
  "penicillin",
  "sulfa",
  "nsaids",
  "peanuts",
  "shellfish",
] as const;

/** Quick-add reaction labels for allergy cards (Subjective tab). */
export const COMMON_ALLERGY_REACTION_QUICK_ADD = [
  "Rash",
  "Itching",
  "Hives",
  "Swelling",
  "Anaphylaxis",
  "Breathing difficulty",
  "GI upset",
  "Vomiting",
] as const;

function reactionParts(reaction: string): string[] {
  return reaction
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function reactionContains(reaction: string | null | undefined, label: string): boolean {
  const key = label.trim().toLowerCase();
  return reactionParts(reaction ?? "").some((part) => part.toLowerCase() === key);
}

/** Append a quick-add reaction label; no-op if already present. */
export function appendAllergyReaction(
  current: string | null | undefined,
  label: string,
): string {
  if (reactionContains(current, label)) return (current ?? "").trim();
  const trimmed = (current ?? "").trim();
  if (!trimmed) return label;
  return `${trimmed}, ${label}`;
}

export function availableAllergyReactionQuickAdd(
  reaction: string | null | undefined,
): string[] {
  return COMMON_ALLERGY_REACTION_QUICK_ADD.filter((label) => !reactionContains(reaction, label));
}

const ALLERGEN_BY_VALUE = new Map(
  COMMON_ALLERGEN_CATALOG.map((def) => [def.value, def] as const),
);

const ALIAS_TO_ALLERGEN = new Map<string, string>();
for (const def of COMMON_ALLERGEN_CATALOG) {
  for (const term of def.searchTerms) {
    ALIAS_TO_ALLERGEN.set(term.trim().toLowerCase(), def.value);
  }
  ALIAS_TO_ALLERGEN.set(def.value, def.value);
  ALIAS_TO_ALLERGEN.set(def.label.trim().toLowerCase(), def.value);
}

export function commonAllergenLabel(value: string): string {
  return ALLERGEN_BY_VALUE.get(value)?.label ?? value;
}

export function commonAllergenMatchesQuery(def: CommonAllergenDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (def.label.toLowerCase().includes(q)) return true;
  if (def.value.includes(q)) return true;
  return def.searchTerms.some((term) => term.toLowerCase().includes(q));
}

export function resolveCommonAllergen(query: string): string | undefined {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return undefined;

  const direct = ALIAS_TO_ALLERGEN.get(trimmed);
  if (direct) return direct;

  for (const def of COMMON_ALLERGEN_CATALOG) {
    if (commonAllergenMatchesQuery(def, trimmed)) {
      const exact = def.searchTerms.some((term) => term.toLowerCase() === trimmed);
      const exactLabel = def.label.toLowerCase() === trimmed;
      if (exact || exactLabel || def.label.toLowerCase().startsWith(trimmed)) {
        return def.value;
      }
    }
  }

  const singleMatch = COMMON_ALLERGEN_CATALOG.filter((def) =>
    commonAllergenMatchesQuery(def, trimmed),
  );
  if (singleMatch.length === 1) return singleMatch[0]!.value;

  return undefined;
}

function sortByLabel<T extends { label: string }>(defs: T[]): T[] {
  return [...defs].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function filterCommonAllergenCatalog(
  options: readonly CommonAllergenDef[],
  query: string,
): CommonAllergenDef[] {
  const q = query.trim();
  if (!q) return sortByLabel(options);
  return sortByLabel(options.filter((def) => commonAllergenMatchesQuery(def, q)));
}
