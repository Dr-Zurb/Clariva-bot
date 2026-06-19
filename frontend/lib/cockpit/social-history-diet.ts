import {
  liftLegacyNestedCaffeine,
  normalizeCaffeineSection,
  parseCaffeineToken,
  type CaffeineSectionInput,
  type LegacyNestedCaffeineFields,
} from "@/lib/cockpit/social-history-caffeine";

export type DietType =
  | "vegetarian"
  | "non-vegetarian"
  | "eggetarian"
  | "vegan"
  | "other";

/** @deprecated Removed from UI — stripped on normalize. */
export type DeprecatedDietType = "regular";

export interface DietSectionInput {
  type?: DietType;
  typeOther?: string;
  notes?: string;
}

export type DietSectionInputWithLegacy = DietSectionInput &
  LegacyNestedCaffeineFields & {
    type?: DietType | DeprecatedDietType;
  };

export const DIET_TYPE_OPTIONS = [
  { value: "vegetarian" as const, label: "Vegetarian" },
  { value: "non-vegetarian" as const, label: "Non-vegetarian" },
  { value: "eggetarian" as const, label: "Eggetarian" },
  { value: "vegan" as const, label: "Vegan" },
  { value: "other" as const, label: "Other" },
] as const;

const DIET_TYPE_LABELS: Record<DietType, string> = {
  vegetarian: "Vegetarian",
  "non-vegetarian": "Non-vegetarian",
  eggetarian: "Eggetarian",
  vegan: "Vegan",
  other: "Other",
};

const DIET_TYPE_FROM_CHIP: Record<string, DietType> = {
  vegetarian: "vegetarian",
  "non-vegetarian": "non-vegetarian",
  eggetarian: "eggetarian",
  vegan: "vegan",
  other: "other",
};

export function dietHasContent(diet: DietSectionInput | null | undefined): boolean {
  if (!diet) return false;
  if (diet.type) return true;
  if (diet.notes?.trim()) return true;
  return false;
}

export function normalizeDietSection(
  input: DietSectionInputWithLegacy | null | undefined,
): DietSectionInput | null {
  if (!input) return null;

  const cleaned: DietSectionInput = {};

  if (input.type && input.type !== "regular") cleaned.type = input.type;

  const typeOther = input.typeOther?.trim();
  if (input.type === "other" && typeOther) cleaned.typeOther = typeOther;

  const notes = input.notes?.trim();
  if (notes) cleaned.notes = notes;

  return dietHasContent(cleaned) ? cleaned : null;
}

export function extractLegacyCaffeineFromDiet(
  input: DietSectionInputWithLegacy | null | undefined,
): CaffeineSectionInput | null {
  return liftLegacyNestedCaffeine(input ?? undefined);
}

function serializeDietType(diet: DietSectionInput): string | null {
  if (!diet.type) return null;
  if (diet.type === "other") {
    const other = diet.typeOther?.trim();
    return other ? `Other (${other})` : "Other";
  }
  return DIET_TYPE_LABELS[diet.type] ?? diet.type;
}

export function serializeDietSection(diet: DietSectionInput): string {
  const parts: string[] = [];
  const typeLabel = serializeDietType(diet);
  if (typeLabel) parts.push(typeLabel);
  if (diet.notes?.trim()) parts.push(`notes: ${diet.notes.trim()}`);
  return parts.length > 0 ? `Diet: ${parts.join(", ")}` : "";
}

function parseOtherTypeToken(token: string): { type: "other"; typeOther?: string } | null {
  const match = token.match(/^other\s*(?:\((.+)\))?$/i);
  if (!match) return null;
  const typeOther = match[1]?.trim();
  return typeOther ? { type: "other", typeOther } : { type: "other" };
}

export interface ParsedDietSectionResult {
  diet: DietSectionInput;
  legacyCaffeine: CaffeineSectionInput | null;
}

export function parseDietTextWithLegacyCaffeine(value: string): ParsedDietSectionResult {
  const diet: DietSectionInput = {};
  let legacyCaffeine: CaffeineSectionInput | null = null;

  for (const part of value.split(/\s*·\s*|\s*,\s*/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const notesMatch = trimmed.match(/^notes:\s*(.+)$/i);
    if (notesMatch) {
      diet.notes = notesMatch[1].trim();
      continue;
    }

    const otherType = parseOtherTypeToken(trimmed);
    if (otherType) {
      diet.type = otherType.type;
      if (otherType.typeOther) diet.typeOther = otherType.typeOther;
      continue;
    }

    const typeKey = Object.entries(DIET_TYPE_LABELS).find(
      ([, label]) => label.toLowerCase() === trimmed.toLowerCase(),
    )?.[0] as DietType | undefined;
    if (typeKey) {
      diet.type = typeKey;
      continue;
    }

    const chipType = DIET_TYPE_FROM_CHIP[trimmed.toLowerCase()];
    if (chipType) {
      diet.type = chipType;
      continue;
    }

    if (/^regular\s*\/\s*mixed$/i.test(trimmed)) {
      continue;
    }

    const caffeinePatch = parseCaffeineToken(trimmed);
    if (caffeinePatch) {
      legacyCaffeine = normalizeCaffeineSection({
        items: [],
        ...legacyCaffeine,
        ...caffeinePatch,
        items: [...(legacyCaffeine?.items ?? []), ...(caffeinePatch.items ?? [])],
      });
      continue;
    }
  }

  return {
    diet: normalizeDietSection(diet) ?? {},
    legacyCaffeine: legacyCaffeine,
  };
}

/** Diet-only parse (no caffeine tokens). */
export function parseDietText(value: string): DietSectionInput {
  return parseDietTextWithLegacyCaffeine(value).diet;
}

export function mapDietChipToStructured(chip: string): DietSectionInput {
  const type = DIET_TYPE_FROM_CHIP[chip.trim().toLowerCase()];
  return type ? { type } : { type: "vegetarian" };
}

export function dietClinicalHints(diet: DietSectionInput | null | undefined): string[] {
  const normalized = normalizeDietSection(diet ?? undefined);
  if (!normalized) return [];

  if (normalized.type === "vegan" || normalized.type === "vegetarian") {
    return [
      "Strict plant-based or vegetarian diet — consider B12/iron if clinically relevant.",
    ];
  }

  return [];
}
