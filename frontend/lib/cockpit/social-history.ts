/**
 * Social / personal history v2 — structured smoking / smokeless / alcohol with
 * derived pack-years + CAGE indices. JSONB object is the preferred input;
 * legacy v1 TEXT tokens remain supported for hydration and the existing chip UI.
 */

import {
  auditCScore,
  auditFullAnswerVector,
  auditFullScore,
  AUDIT_FULL_SEVERITY_LABELS,
  cageScore,
  type SocialHistoryDurationUnit,
  formatSocialHistoryDurationSuffix,
  normalizeStoredDurationUnit,
  parseDurationToken,
  parseSocialHistoryDurationSuffix,
} from "@/lib/cockpit/social-history-indices";
import {
  formatTobaccoProductClause,
  normalizeTobaccoSection,
  parseLegacySmokingAmountParts,
  parseLegacySmokelessAmountParts,
  splitTobaccoDetailClauseParts,
  parseTobaccoProductClause,
  smokingPackYearsFromProducts,
  createTobaccoProduct,
  SMOKING_TYPE_LABELS,
  SMOKELESS_TYPE_LABELS,
  type LegacyTobaccoFlatFields,
  type TobaccoProductRow,
  type TobaccoUseSection,
} from "@/lib/cockpit/social-history-tobacco-products";
import {
  formatAlcoholDrinkClause,
  formatMaxPerSessionClause,
  normalizeAlcoholSection,
  parseAlcoholDrinkClause,
  parseMaxPerSessionClause,
  splitAlcoholDetailClauseParts,
  standardUnitsPerWeekFromDrinks,
  createAlcoholDrink,
  ALCOHOL_TYPE_LABELS,
  type AlcoholDrinkRow,
  type AlcoholUseSection,
  type LegacyAlcoholFlatFields,
} from "@/lib/cockpit/social-history-alcohol-drinks";
import {
  normalizeSubstancesSection,
  parseSubstancesText,
  serializeSubstancesSection,
  substancesHasContent,
  type SubstancesSectionInput,
} from "@/lib/cockpit/social-history-substances";
import {
  dietHasContent,
  extractLegacyCaffeineFromDiet,
  mapDietChipToStructured,
  normalizeDietSection,
  parseDietTextWithLegacyCaffeine,
  serializeDietSection,
  type DietSectionInput,
  type DietSectionInputWithLegacy,
} from "@/lib/cockpit/social-history-diet";
import {
  activityHasContent,
  mapActivityChipToStructured,
  normalizeActivitySection,
  parseActivityText,
  serializeActivitySection,
  type ActivitySectionInput,
} from "@/lib/cockpit/social-history-activity";
import {
  caffeineHasContent,
  mergeCaffeineSections,
  normalizeCaffeineSection,
  parseCaffeineText,
  serializeCaffeineSection,
  type CaffeineSectionInput,
} from "@/lib/cockpit/social-history-caffeine";
import {
  normalizeSleepSection,
  normalizeStressSection,
  parseSleepText,
  parseStressText,
  serializeSleepSection,
  serializeStressSection,
  sleepHasContent,
  stressHasContent,
  type SleepSectionInput,
  type StressSectionInput,
} from "@/lib/cockpit/social-history-wellbeing";
import {
  normalizeSickContactSection,
  parseSickContactText,
  serializeSickContactSection,
  sickContactHasContent,
  sickContactInputPromotesVectorRisk,
  type SickContactSectionInput,
} from "@/lib/cockpit/social-history-sick-contact";

export type { SleepSectionInput, StressSectionInput } from "@/lib/cockpit/social-history-wellbeing";

export type { SocialHistoryDurationUnit, TobaccoProductRow, TobaccoUseSection, AlcoholDrinkRow, AlcoholUseSection };
export type { SubstancesSectionInput, SubstanceUseItem } from "@/lib/cockpit/social-history-substances";
export type { DietSectionInput } from "@/lib/cockpit/social-history-diet";
export type { CaffeineSectionInput } from "@/lib/cockpit/social-history-caffeine";
export type { ActivitySectionInput } from "@/lib/cockpit/social-history-activity";
export type { SickContactSectionInput } from "@/lib/cockpit/social-history-sick-contact";

export type AlcoholUseSectionInput = AlcoholUseSection & LegacyAlcoholFlatFields;

export type SmokelessAmountUnit = "packets" | "times" | "other";

export type SmokingStatus = "never" | "current" | "ex";

export type TobaccoUseSectionInput = TobaccoUseSection & LegacyTobaccoFlatFields;

export interface SocialHistoryStructured {
  smoking?: TobaccoUseSectionInput;
  smokeless?: TobaccoUseSectionInput;
  alcohol?: AlcoholUseSectionInput;
  notes?: string;
  /** Phase 2 — substances / lifestyle / context / wellbeing (sh-05). */
  substances?: SubstancesSectionInput;
  diet?: DietSectionInputWithLegacy;
  caffeine?: CaffeineSectionInput;
  activity?: ActivitySectionInput;
  occupation?: {
    text?: string;
    exposures: string[];
  };
  living?: {
    situation?: "alone" | "with-family" | "institutional";
    notes?: string;
  };
  travel?: {
    recent?: boolean;
    place?: string;
    vectorRisk?: boolean;
    /** @deprecated Migrated to sickContact on normalize. */
    sickContacts?: boolean;
  };
  sickContact?: SickContactSectionInput;
  sleep?: SleepSectionInput;
  stress?: StressSectionInput;
  sexual?: {
    enabled: boolean;
    active?: boolean;
    partners?: "single" | "multiple";
    protection?: "always" | "sometimes" | "never";
    notes?: string;
  };
}

// ── v1 dimension model (legacy chip UI until sh-03) ─────────────────────────

export type SocialHistoryDimensionKey =
  | "smoking"
  | "tobacco"
  | "alcohol"
  | "diet"
  | "activity"
  | "occupation";

export interface SocialHistoryDimensionDef {
  key: SocialHistoryDimensionKey;
  label: string;
  chips: readonly string[];
}

export const SOCIAL_HISTORY_DIMENSIONS: readonly SocialHistoryDimensionDef[] = [
  {
    key: "smoking",
    label: "Smoking",
    chips: ["Non-smoker", "Smoker", "Ex-smoker", "Beedi"],
  },
  {
    key: "tobacco",
    label: "Tobacco (chew)",
    chips: ["No tobacco", "Gutka/Khaini", "Paan/Supari"],
  },
  {
    key: "alcohol",
    label: "Alcohol",
    chips: ["No alcohol", "Occasional alcohol", "Regular alcohol", "Ex-drinker"],
  },
  {
    key: "diet",
    label: "Diet",
    chips: ["Vegetarian", "Non-vegetarian", "Eggetarian"],
  },
  {
    key: "activity",
    label: "Activity",
    chips: ["Sedentary", "Moderately active", "Active"],
  },
  {
    key: "occupation",
    label: "Occupation",
    chips: [],
  },
] as const;

export interface ParsedSocialHistory {
  dimensions: Partial<Record<SocialHistoryDimensionKey, string>>;
  remainder: string;
}

const DIMENSION_BY_LABEL = new Map(
  SOCIAL_HISTORY_DIMENSIONS.map((dim) => [dim.label.toLowerCase(), dim.key]),
);

const CHIP_TO_DIMENSION = new Map<string, SocialHistoryDimensionKey>();
for (const dim of SOCIAL_HISTORY_DIMENSIONS) {
  for (const chip of dim.chips) {
    CHIP_TO_DIMENSION.set(chip.toLowerCase(), dim.key);
  }
}

const LEGACY_CHIP_ALIASES: Record<string, string> = {
  "non-smoker": "Non-smoker",
  "ex-smoker": "Ex-smoker",
  "occasional alcohol": "Occasional alcohol",
  "no alcohol": "No alcohol",
  "sedentary occupation": "Sedentary",
  vegetarian: "Vegetarian",
};

const SMOKING_TYPE_LABELS_LEGACY = SMOKING_TYPE_LABELS;
const SMOKELESS_TYPE_LABELS_LEGACY = SMOKELESS_TYPE_LABELS;

const ALCOHOL_TYPE_LABELS_LEGACY = ALCOHOL_TYPE_LABELS;

const OCCUPATION_EXPOSURE_LABELS: Record<string, string> = {
  dust: "dust",
  silica: "silica",
  "dust/silica": "dust/silica",
  chemicals: "chemicals",
  heat: "heat",
  "heavy-lifting": "heavy-lifting",
  screen: "screen",
};

const ACTIVITY_LEVEL_FROM_CHIP: Record<string, ActivitySectionInput["level"]> = {
  sedentary: "sedentary",
  "moderately active": "moderate",
  active: "vigorous",
};

function mapActivityChipFromLegacy(chip: string): ActivitySectionInput {
  const level = ACTIVITY_LEVEL_FROM_CHIP[chip.trim().toLowerCase()];
  return mapActivityChipToStructured(level ?? chip);
}


function isStructuredInput(
  input: string | SocialHistoryStructured | null | undefined,
): input is SocialHistoryStructured {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function emptyStructured(): SocialHistoryStructured {
  return {};
}

export function hasSocialHistoryStructuredContent(
  structured: SocialHistoryStructured,
): boolean {
  if (structured.notes?.trim()) return true;
  if (structured.smoking) return true;
  if (structured.smokeless) return true;
  if (structured.alcohol) return true;
  if (substancesHasContent(structured.substances)) return true;
  if (dietHasContent(structured.diet)) return true;
  if (caffeineHasContent(structured.caffeine)) return true;
  if (activityHasContent(structured.activity)) return true;
  if (structured.occupation?.text?.trim() || (structured.occupation?.exposures.length ?? 0) > 0) {
    return true;
  }
  if (structured.living?.situation || structured.living?.notes?.trim()) return true;
  if (
    structured.travel?.recent ||
    structured.travel?.place?.trim() ||
    structured.travel?.vectorRisk
  ) {
    return true;
  }
  if (sickContactHasContent(structured.sickContact)) return true;
  if (sleepHasContent(structured.sleep)) return true;
  if (stressHasContent(structured.stress)) return true;
  if (sexualShouldSerialize(structured.sexual)) return true;
  return false;
}

function sexualShouldSerialize(sexual?: SocialHistoryStructured["sexual"]): boolean {
  if (!sexual?.enabled) return false;
  return (
    sexual.active != null ||
    sexual.partners != null ||
    sexual.protection != null ||
    Boolean(sexual.notes?.trim())
  );
}

/** SHv2-D7 — lift recognised Diet/Activity/Occupation tokens out of notes. */
function promoteLegacyNotesToStructured(structured: SocialHistoryStructured): SocialHistoryStructured {
  if (!structured.notes?.trim()) return structured;

  const noteParts = structured.notes.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
  const remaining: string[] = [];
  const next: SocialHistoryStructured = { ...structured };

  for (const part of noteParts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx <= 0) {
      remaining.push(part);
      continue;
    }

    const label = part.slice(0, colonIdx).trim().toLowerCase();
    const value = part.slice(colonIdx + 1).trim();

    if (label === "diet" && !next.diet) {
      next.diet = mapDietChipToStructured(value);
      continue;
    }
    if (label === "activity" && !next.activity) {
      next.activity = mapActivityChipFromLegacy(value);
      continue;
    }
    if (label === "occupation" && !next.occupation) {
      next.occupation = { text: value, exposures: [] };
      continue;
    }
    remaining.push(part);
  }

  if (remaining.length > 0) next.notes = remaining.join(" · ");
  else delete next.notes;

  return next;
}

export const EMPTY_SOCIAL_HISTORY_STRUCTURED: SocialHistoryStructured = {};

export function normalizeSocialHistoryStructured(
  input: SocialHistoryStructured,
): SocialHistoryStructured {
  const next: SocialHistoryStructured = {};

  if (input.smoking) {
    const normalized = normalizeTobaccoSection(input.smoking, "smoking");
    if (normalized) next.smoking = normalized;
  }

  if (input.smokeless) {
    const normalized = normalizeTobaccoSection(input.smokeless, "smokeless");
    if (normalized) next.smokeless = normalized;
  }

  if (input.alcohol) {
    const normalized = normalizeAlcoholSection(input.alcohol);
    if (normalized) {
      next.alcohol = { ...normalized, drinks: [...normalized.drinks] };
    }
  }

  const notes = input.notes?.trim();
  if (notes) next.notes = notes;

  if (input.substances) {
    const normalizedSubstances = normalizeSubstancesSection(input.substances);
    if (normalizedSubstances) next.substances = normalizedSubstances;
  }

  if (input.diet) {
    const normalizedDiet = normalizeDietSection(input.diet);
    if (normalizedDiet) next.diet = normalizedDiet;
  }

  const liftedCaffeine = extractLegacyCaffeineFromDiet(input.diet);
  const normalizedCaffeine = mergeCaffeineSections(liftedCaffeine, input.caffeine);
  if (normalizedCaffeine) next.caffeine = normalizedCaffeine;

  if (input.activity) {
    const normalizedActivity = normalizeActivitySection(input.activity);
    if (normalizedActivity) next.activity = normalizedActivity;
  }

  if (input.occupation) {
    const exposures = [...(input.occupation.exposures ?? [])].filter(Boolean);
    const text = input.occupation.text?.trim();
    if (text || exposures.length > 0) {
      next.occupation = { ...(text ? { text } : {}), exposures };
    }
  }

  if (input.living) {
    const living: NonNullable<SocialHistoryStructured["living"]> = {};
    if (input.living.situation) living.situation = input.living.situation;
    const livingNotes = input.living.notes?.trim();
    if (livingNotes) living.notes = livingNotes;
    if (living.situation || livingNotes) next.living = living;
  }

  if (input.travel) {
    const travel: NonNullable<SocialHistoryStructured["travel"]> = {};
    if (input.travel.recent != null) travel.recent = input.travel.recent;
    const place = input.travel.place?.trim();
    if (place) travel.place = place;
    if (input.travel.vectorRisk === true) travel.vectorRisk = true;
    if (travel.recent != null || place || travel.vectorRisk) {
      next.travel = travel;
    }
  }

  const legacySickFromTravel = input.travel?.sickContacts === true;
  const promoteVectorFromSickContact = sickContactInputPromotesVectorRisk(input.sickContact);
  const sickContactInput =
    input.sickContact ??
    (legacySickFromTravel ? ({ present: true } satisfies SickContactSectionInput) : undefined);
  if (sickContactInput) {
    const normalizedSickContact = normalizeSickContactSection(sickContactInput);
    if (normalizedSickContact) next.sickContact = normalizedSickContact;
  }
  if (promoteVectorFromSickContact) {
    next.travel = {
      ...(next.travel ?? {}),
      recent: next.travel?.recent ?? true,
      vectorRisk: true,
    };
  }

  if (input.sleep) {
    const normalizedSleep = normalizeSleepSection(input.sleep);
    if (normalizedSleep) next.sleep = normalizedSleep;
  }

  if (input.stress) {
    const normalizedStress = normalizeStressSection(input.stress);
    if (normalizedStress) next.stress = normalizedStress;
  }

  if (input.sexual) {
    next.sexual = {
      enabled: input.sexual.enabled,
      ...(input.sexual.active != null ? { active: input.sexual.active } : {}),
      ...(input.sexual.partners ? { partners: input.sexual.partners } : {}),
      ...(input.sexual.protection ? { protection: input.sexual.protection } : {}),
      ...(input.sexual.notes?.trim() ? { notes: input.sexual.notes.trim() } : {}),
    };
  }

  return promoteLegacyNotesToStructured(next);
}

function isLegacyV1SocialHistoryText(text: string): boolean {
  if (/\b(Tobacco \(chew\)|Diet|Activity|Occupation):/i.test(text)) return true;
  if (/Alcohol:\s*(Occasional alcohol|Regular alcohol)/i.test(text)) return true;
  if (/Smoking:\s*Beedi/i.test(text)) return true;
  if (!text.includes(":") && text.includes(",")) return true;
  return false;
}

/** Preferred v2 entry: JSONB object or legacy / derived TEXT → structured. */
export function parseSocialHistoryAsStructured(
  input: string | SocialHistoryStructured | null | undefined,
): SocialHistoryStructured {
  if (isStructuredInput(input)) {
    return normalizeSocialHistoryStructured(input);
  }

  const text = (input ?? "").trim();
  if (!text) return emptyStructured();

  const structuredFromV2Text = parseStructuredSocialHistoryText(text);
  if (structuredFromV2Text) {
    return normalizeSocialHistoryStructured(structuredFromV2Text);
  }

  if (isLegacyV1SocialHistoryText(text)) {
    return normalizeSocialHistoryStructured(
      hydrateStructuredFromV1(parseV1SocialHistory(text)),
    );
  }

  return normalizeSocialHistoryStructured(
    hydrateStructuredFromV1(parseV1SocialHistory(text)),
  );
}

export function parseSocialHistory(input: SocialHistoryStructured): SocialHistoryStructured;
export function parseSocialHistory(text: string | null | undefined): ParsedSocialHistory;
export function parseSocialHistory(
  input: string | SocialHistoryStructured | null | undefined,
): ParsedSocialHistory | SocialHistoryStructured {
  if (isStructuredInput(input)) {
    return normalizeSocialHistoryStructured(input);
  }
  return parseV1SocialHistory(input);
}

function parseV1SocialHistory(text: string | null | undefined): ParsedSocialHistory {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { dimensions: {}, remainder: "" };
  }

  const dimensions: Partial<Record<SocialHistoryDimensionKey, string>> = {};
  const remainderParts: string[] = [];
  let parsedLabeled = false;

  for (const segment of trimmed.split(/\s*·\s*/)) {
    const part = segment.trim();
    if (!part) continue;

    const colonIdx = part.indexOf(":");
    if (colonIdx > 0) {
      const label = part.slice(0, colonIdx).trim().toLowerCase();
      const value = part.slice(colonIdx + 1).trim();
      const key = DIMENSION_BY_LABEL.get(label);
      if (key && value) {
        dimensions[key] = canonicalizeDimensionValue(key, value);
        parsedLabeled = true;
        continue;
      }
    }
    remainderParts.push(part);
  }

  if (parsedLabeled) {
    return { dimensions, remainder: remainderParts.join(" · ").trim() };
  }

  return parseLegacyCommaSocialHistory(trimmed);
}

function parseLegacyCommaSocialHistory(text: string): ParsedSocialHistory {
  const dimensions: Partial<Record<SocialHistoryDimensionKey, string>> = {};
  const unmatched: string[] = [];

  for (const rawPart of text.split(",").map((part) => part.trim()).filter(Boolean)) {
    const alias = LEGACY_CHIP_ALIASES[rawPart.toLowerCase()];
    const part = alias ?? rawPart;
    const key = CHIP_TO_DIMENSION.get(part.toLowerCase());
    if (key && !dimensions[key]) {
      dimensions[key] = canonicalizeDimensionValue(key, part);
    } else {
      unmatched.push(rawPart);
    }
  }

  return { dimensions, remainder: unmatched.join(", ").trim() };
}

function canonicalizeDimensionValue(key: SocialHistoryDimensionKey, value: string): string {
  const dim = SOCIAL_HISTORY_DIMENSIONS.find((entry) => entry.key === key);
  if (!dim) return value.trim();
  if (key === "occupation") return value.trim();
  const match = dim.chips.find((chip) => chip.toLowerCase() === value.trim().toLowerCase());
  return match ?? value.trim();
}

function hydrateStructuredFromV1(parsed: ParsedSocialHistory): SocialHistoryStructured {
  const structured: SocialHistoryStructured = {};

  const smokingChip = parsed.dimensions.smoking;
  if (smokingChip) {
    structured.smoking = mapSmokingChipToStructured(smokingChip);
  }

  const tobaccoChip = parsed.dimensions.tobacco;
  if (tobaccoChip) {
    structured.smokeless = mapSmokelessChipToStructured(tobaccoChip);
  }

  const alcoholChip = parsed.dimensions.alcohol;
  if (alcoholChip) {
    structured.alcohol = mapAlcoholChipToStructured(alcoholChip);
  }

  const dietChip = parsed.dimensions.diet;
  if (dietChip) {
    structured.diet = mapDietChipToStructured(dietChip);
  }

  const activityChip = parsed.dimensions.activity;
  if (activityChip) {
    structured.activity = mapActivityChipFromLegacy(activityChip);
  }

  const occupationChip = parsed.dimensions.occupation;
  if (occupationChip) {
    structured.occupation = { text: occupationChip, exposures: [] };
  }

  if (parsed.remainder.trim()) {
    structured.notes = parsed.remainder.trim();
  }

  return structured;
}

function mapSmokingChipToStructured(chip: string): NonNullable<SocialHistoryStructured["smoking"]> {
  const lower = chip.toLowerCase();
  if (lower === "non-smoker") return { status: "never", types: [] };
  if (lower === "ex-smoker") return { status: "ex", types: [] };
  if (lower === "beedi") return { status: "current", types: ["beedi"] };
  return { status: "current", types: [] };
}

function mapSmokelessChipToStructured(
  chip: string,
): NonNullable<SocialHistoryStructured["smokeless"]> {
  const lower = chip.toLowerCase();
  if (lower === "no tobacco") return { status: "never", types: [] };
  if (lower === "gutka/khaini") return { status: "current", types: ["gutka/khaini"] };
  if (lower === "paan/supari") return { status: "current", types: ["paan/supari"] };
  return { status: "current", types: [] };
}

function mapAlcoholChipToStructured(chip: string): NonNullable<SocialHistoryStructured["alcohol"]> {
  const lower = chip.toLowerCase();
  if (lower === "no alcohol") return { status: "never", drinks: [] };
  if (lower === "ex-drinker") return { status: "ex", drinks: [] };
  if (lower === "occasional alcohol") {
    return { status: "current", drinks: [] };
  }
  if (lower === "regular alcohol") {
    return { status: "current", drinks: [] };
  }
  return { status: "current", drinks: [] };
}

function formatTypeList(types: string[], labels: Record<string, string>): string {
  return types
    .map((type) => labels[type.toLowerCase()] ?? type)
    .join(", ");
}

function smokingStatusLabel(status: SmokingStatus): string {
  if (status === "never") return "Non-smoker";
  if (status === "ex") return "Ex-smoker";
  return "Smoker";
}

function alcoholStatusLabel(status: SmokingStatus): string {
  if (status === "never") return "No alcohol";
  if (status === "ex") return "Ex-drinker";
  return "Drinks alcohol";
}

function smokelessStatusLabel(status: SmokingStatus): string {
  if (status === "never") return "No tobacco";
  if (status === "ex") return "Former user";
  return "Uses tobacco";
}

function formatDurationSuffix(value: number, unit?: SocialHistoryDurationUnit): string {
  return formatSocialHistoryDurationSuffix(value, unit);
}

function parseDurationSuffix(raw: string): {
  value: number;
  unit: SocialHistoryDurationUnit;
} | null {
  return parseSocialHistoryDurationSuffix(raw);
}

function mergeTobaccoSectionPartial(
  target: TobaccoUseSection,
  partial: Partial<TobaccoUseSection>,
): void {
  if (partial.products?.length) {
    target.products.push(...partial.products);
  }
  if (partial.years != null) target.years = partial.years;
  if (partial.yearsUnit) target.yearsUnit = partial.yearsUnit;
  if (partial.quitYearsAgo != null) target.quitYearsAgo = partial.quitYearsAgo;
  if (partial.quitYearsUnit) target.quitYearsUnit = partial.quitYearsUnit;
}

function serializeSmokingSection(smoking: NonNullable<SocialHistoryStructured["smoking"]>): string {
  const normalized = normalizeTobaccoSection(smoking, "smoking")!;
  const label = smokingStatusLabel(normalized.status);
  if (normalized.status === "never") {
    return `Smoking: ${label}`;
  }

  const detailParts: string[] = [];
  for (const product of normalized.products ?? []) {
    detailParts.push(formatTobaccoProductClause(product, "smoking"));
  }

  const { packYears: py } = smokingPackYearsFromProducts(normalized.products ?? []);
  if (py != null) detailParts.push(`≈ ${py} pack-yrs`);

  const details = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
  return `Smoking: ${label}${details}`;
}

function serializeSmokelessSection(
  smokeless: NonNullable<SocialHistoryStructured["smokeless"]>,
): string {
  const normalized = normalizeTobaccoSection(smokeless, "smokeless")!;
  if (normalized.status === "never") {
    return "Smokeless: No tobacco";
  }

  const detailParts: string[] = [];
  if (normalized.status === "ex") {
    detailParts.push(smokelessStatusLabel("ex"));
  } else if ((normalized.products ?? []).length === 0) {
    detailParts.push(smokelessStatusLabel("current"));
  }

  for (const product of normalized.products ?? []) {
    detailParts.push(formatTobaccoProductClause(product, "smokeless"));
  }

  return `Smokeless: ${detailParts.join(", ")}`;
}

function serializeAlcoholSection(alcohol: NonNullable<SocialHistoryStructured["alcohol"]>): string {
  const normalized = normalizeAlcoholSection(alcohol)!;
  const label = alcoholStatusLabel(normalized.status);
  if (normalized.status === "never") {
    return `Alcohol: ${label}`;
  }

  const detailParts: string[] = [];
  for (const drink of normalized.drinks ?? []) {
    detailParts.push(formatAlcoholDrinkClause(drink));
  }

  const { unitsPerWeek: py } = standardUnitsPerWeekFromDrinks(normalized.drinks ?? []);
  if (py != null) detailParts.push(`≈ ${py} units/wk`);

  if (normalized.maxPerSession) {
    detailParts.push(formatMaxPerSessionClause(normalized.maxPerSession));
  }

  const cage = cageScore(normalized.cage);
  if (cage) {
    detailParts.push(
      cage.positive ? `CAGE ${cage.score}/4 positive` : `CAGE ${cage.score}/4`,
    );
  }

  const auditFullResult = auditFullScore(normalized.auditC, normalized.auditFull);
  const auditFullVector = auditFullAnswerVector(normalized.auditC, normalized.auditFull);
  if (auditFullResult && auditFullVector) {
    const severityLabel = AUDIT_FULL_SEVERITY_LABELS[auditFullResult.severity];
    detailParts.push(
      `AUDIT-10 ${auditFullResult.score}/40 ${severityLabel} (${auditFullVector.join(",")})`,
    );
  } else {
    const auditC = auditCScore(normalized.auditC);
    if (auditC && normalized.auditC) {
      const { frequency, typicalQuantity, bingeFrequency } = normalized.auditC;
      const answersSuffix = `(${frequency},${typicalQuantity},${bingeFrequency})`;
      detailParts.push(
        auditC.positive
          ? `AUDIT-C ${auditC.score}/12 positive ${answersSuffix}`
          : `AUDIT-C ${auditC.score}/12 ${answersSuffix}`,
      );
    }
  }

  const details = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
  return `Alcohol: ${label}${details}`;
}

const LIVING_SITUATION_LABELS: Record<string, string> = {
  alone: "Alone",
  "with-family": "With family",
  institutional: "Care facility",
};

function capitalizeWord(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function serializeSubstancesSectionForHistory(
  substances: NonNullable<SocialHistoryStructured["substances"]>,
): string {
  return serializeSubstancesSection(substances);
}

function serializeOccupationSection(
  occupation: NonNullable<SocialHistoryStructured["occupation"]>,
): string {
  const text = occupation.text?.trim();
  if (!text && occupation.exposures.length === 0) return "";

  const exposures = occupation.exposures
    .map((key) => OCCUPATION_EXPOSURE_LABELS[key] ?? key)
    .join(", ");
  const exposureSuffix = exposures ? ` (${exposures})` : "";
  return `Occupation: ${text ?? ""}${exposureSuffix}`.trim();
}

function serializeLivingSection(living: NonNullable<SocialHistoryStructured["living"]>): string {
  const parts: string[] = [];
  if (living.situation) {
    parts.push(LIVING_SITUATION_LABELS[living.situation] ?? living.situation);
  }
  if (living.notes?.trim()) parts.push(living.notes.trim());
  return parts.length > 0 ? `Living: ${parts.join(", ")}` : "";
}

function serializeTravelSection(travel: NonNullable<SocialHistoryStructured["travel"]>): string {
  const place = travel.place?.trim();
  const vectorSuffix = travel.vectorRisk ? " (vector-borne area)" : "";
  if (!place && !travel.recent && !travel.vectorRisk) return "";
  if (!place && !travel.recent && travel.vectorRisk) {
    return "Travel: vector-borne area";
  }
  return `Travel: ${place ?? "Recent"}${vectorSuffix}`;
}

function serializeSexualSection(sexual: NonNullable<SocialHistoryStructured["sexual"]>): string {
  if (!sexualShouldSerialize(sexual)) return "";

  const parts: string[] = [];
  if (sexual.active != null) {
    parts.push(sexual.active ? "active" : "inactive");
  }
  if (sexual.partners) parts.push(sexual.partners);
  if (sexual.protection) parts.push(`protection ${sexual.protection}`);

  let body = parts.join(", ");
  if (sexual.notes?.trim()) {
    body = body ? `${body} (${sexual.notes.trim()})` : sexual.notes.trim();
  }

  return body ? `Sexual: ${body}` : "";
}

export function serializeSocialHistory(structured: SocialHistoryStructured): string;
export function serializeSocialHistory(parsed: ParsedSocialHistory): string;
export function serializeSocialHistory(
  input: ParsedSocialHistory | SocialHistoryStructured,
): string {
  if ("dimensions" in input) {
    return serializeV1SocialHistory(input);
  }
  return serializeStructuredSocialHistory(normalizeSocialHistoryStructured(input));
}

function serializeV1SocialHistory(parsed: ParsedSocialHistory): string {
  const parts: string[] = [];

  for (const dim of SOCIAL_HISTORY_DIMENSIONS) {
    const value = parsed.dimensions[dim.key]?.trim();
    if (value) {
      parts.push(`${dim.label}: ${value}`);
    }
  }

  if (parsed.remainder.trim()) {
    parts.push(parsed.remainder.trim());
  }

  return parts.join(" · ");
}

function serializeStructuredSocialHistory(structured: SocialHistoryStructured): string {
  const normalized = normalizeSocialHistoryStructured(structured);
  const parts: string[] = [];

  if (normalized.smoking) {
    parts.push(serializeSmokingSection(normalized.smoking));
  }
  if (normalized.smokeless) {
    parts.push(serializeSmokelessSection(normalized.smokeless));
  }
  if (normalized.alcohol) {
    parts.push(serializeAlcoholSection(normalized.alcohol));
  }
  if (normalized.substances) {
    const section = serializeSubstancesSectionForHistory(normalized.substances);
    if (section) parts.push(section);
  }
  if (normalized.diet) {
    const section = serializeDietSection(normalized.diet);
    if (section) parts.push(section);
  }
  if (normalized.caffeine) {
    const section = serializeCaffeineSection(normalized.caffeine);
    if (section) parts.push(section);
  }
  if (normalized.activity) {
    const section = serializeActivitySection(normalized.activity);
    if (section) parts.push(section);
  }
  if (normalized.occupation) {
    const section = serializeOccupationSection(normalized.occupation);
    if (section) parts.push(section);
  }
  if (normalized.living) {
    const section = serializeLivingSection(normalized.living);
    if (section) parts.push(section);
  }
  if (normalized.travel) {
    const section = serializeTravelSection(normalized.travel);
    if (section) parts.push(section);
  }
  if (normalized.sickContact) {
    const section = serializeSickContactSection(normalized.sickContact);
    if (section) parts.push(section);
  }
  if (normalized.sleep) {
    const section = serializeSleepSection(normalized.sleep);
    if (section) parts.push(section);
  }
  if (normalized.stress) {
    const section = serializeStressSection(normalized.stress);
    if (section) parts.push(section);
  }
  if (normalized.sexual) {
    const section = serializeSexualSection(normalized.sexual);
    if (section) parts.push(section);
  }
  if (normalized.notes?.trim()) {
    parts.push(normalized.notes.trim());
  }

  return parts.join(" · ");
}

function truncateSocialHistoryClusterPreview(text: string, maxLen = 96): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function serializeSubstanceUseCluster(structured: SocialHistoryStructured): string {
  const normalized = normalizeSocialHistoryStructured(structured);
  const parts: string[] = [];
  if (normalized.smoking) parts.push(serializeSmokingSection(normalized.smoking));
  if (normalized.smokeless) parts.push(serializeSmokelessSection(normalized.smokeless));
  if (normalized.alcohol) parts.push(serializeAlcoholSection(normalized.alcohol));
  if (normalized.substances) {
    const section = serializeSubstancesSectionForHistory(normalized.substances);
    if (section) parts.push(section);
  }
  return parts.join(" · ");
}

export function serializeLifestyleCluster(structured: SocialHistoryStructured): string {
  const normalized = normalizeSocialHistoryStructured(structured);
  const parts: string[] = [];
  if (normalized.diet) {
    const section = serializeDietSection(normalized.diet);
    if (section) parts.push(section);
  }
  if (normalized.caffeine) {
    const section = serializeCaffeineSection(normalized.caffeine);
    if (section) parts.push(section);
  }
  if (normalized.activity) {
    const section = serializeActivitySection(normalized.activity);
    if (section) parts.push(section);
  }
  return parts.join(" · ");
}

export function serializeContextCluster(structured: SocialHistoryStructured): string {
  const normalized = normalizeSocialHistoryStructured(structured);
  const parts: string[] = [];
  if (normalized.occupation) {
    const section = serializeOccupationSection(normalized.occupation);
    if (section) parts.push(section);
  }
  if (normalized.living) {
    const section = serializeLivingSection(normalized.living);
    if (section) parts.push(section);
  }
  if (normalized.travel) {
    const section = serializeTravelSection(normalized.travel);
    if (section) parts.push(section);
  }
  if (normalized.sickContact) {
    const section = serializeSickContactSection(normalized.sickContact);
    if (section) parts.push(section);
  }
  return parts.join(" · ");
}

export function serializeWellbeingCluster(structured: SocialHistoryStructured): string {
  const normalized = normalizeSocialHistoryStructured(structured);
  const parts: string[] = [];
  if (normalized.sleep) {
    const section = serializeSleepSection(normalized.sleep);
    if (section) parts.push(section);
  }
  if (normalized.stress) {
    const section = serializeStressSection(normalized.stress);
    if (section) parts.push(section);
  }
  return parts.join(" · ");
}

export function substanceUseClusterHasContent(structured: SocialHistoryStructured): boolean {
  return serializeSubstanceUseCluster(structured).length > 0;
}

export function lifestyleClusterHasContent(structured: SocialHistoryStructured): boolean {
  return serializeLifestyleCluster(structured).length > 0;
}

export function contextClusterHasContent(structured: SocialHistoryStructured): boolean {
  return serializeContextCluster(structured).length > 0;
}

export function wellbeingClusterHasContent(structured: SocialHistoryStructured): boolean {
  return serializeWellbeingCluster(structured).length > 0;
}

export function substanceUseClusterFilledCount(structured: SocialHistoryStructured): number {
  const normalized = normalizeSocialHistoryStructured(structured);
  let count = 0;
  if (normalized.smoking) count += 1;
  if (normalized.smokeless) count += 1;
  if (normalized.alcohol) count += 1;
  if (substancesHasContent(normalized.substances)) count += 1;
  return count;
}

export function lifestyleClusterFilledCount(structured: SocialHistoryStructured): number {
  const normalized = normalizeSocialHistoryStructured(structured);
  let count = 0;
  if (dietHasContent(normalized.diet)) count += 1;
  if (caffeineHasContent(normalized.caffeine)) count += 1;
  if (activityHasContent(normalized.activity)) count += 1;
  return count;
}

export function contextClusterFilledCount(structured: SocialHistoryStructured): number {
  const normalized = normalizeSocialHistoryStructured(structured);
  let count = 0;
  if (normalized.occupation?.text?.trim() || (normalized.occupation?.exposures.length ?? 0) > 0) {
    count += 1;
  }
  if (normalized.living?.situation || normalized.living?.notes?.trim()) count += 1;
  if (
    normalized.travel?.recent ||
    normalized.travel?.place?.trim() ||
    normalized.travel?.vectorRisk
  ) {
    count += 1;
  }
  if (sickContactHasContent(normalized.sickContact)) count += 1;
  return count;
}

export function wellbeingClusterFilledCount(structured: SocialHistoryStructured): number {
  const normalized = normalizeSocialHistoryStructured(structured);
  let count = 0;
  if (sleepHasContent(normalized.sleep)) count += 1;
  if (stressHasContent(normalized.stress)) count += 1;
  return count;
}

export function serializeSexualCluster(structured: SocialHistoryStructured): string {
  const normalized = normalizeSocialHistoryStructured(structured);
  if (!normalized.sexual) return "";
  return serializeSexualSection(normalized.sexual);
}

export function sexualClusterHasContent(structured: SocialHistoryStructured): boolean {
  return serializeSexualCluster(structured).length > 0;
}

export function sexualClusterFilledCount(structured: SocialHistoryStructured): number {
  const sexual = normalizeSocialHistoryStructured(structured).sexual;
  if (!sexual) return 0;
  let count = 0;
  if (sexual.active != null) count += 1;
  if (sexual.partners) count += 1;
  if (sexual.protection) count += 1;
  if (sexual.notes?.trim()) count += 1;
  return count;
}

export function formatSocialHistoryClusterPreview(serialized: string): string {
  return truncateSocialHistoryClusterPreview(serialized);
}

function parseOccupationText(value: string): NonNullable<SocialHistoryStructured["occupation"]> {
  const { headline, details } = parseParenDetails(value);
  const occupation: NonNullable<SocialHistoryStructured["occupation"]> = {
    text: headline.trim() || undefined,
    exposures: [],
  };

  if (details) {
    for (const token of details.split(/,\s*/)) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      const exposureKey = Object.entries(OCCUPATION_EXPOSURE_LABELS).find(
        ([, label]) => label.toLowerCase() === trimmed.toLowerCase(),
      )?.[0];
      occupation.exposures.push(exposureKey ?? trimmed);
    }
  }

  return occupation;
}

function parseLivingText(value: string): NonNullable<SocialHistoryStructured["living"]> {
  const living: NonNullable<SocialHistoryStructured["living"]> = {};
  const parts = value.split(/,\s*/).map((part) => part.trim()).filter(Boolean);

  if (parts.length > 0) {
    const head = parts[0].toLowerCase();
    const situationKey =
      (head === "institutional" || head === "care facility / hostel"
        ? "institutional"
        : Object.entries(LIVING_SITUATION_LABELS).find(
            ([, label]) => label.toLowerCase() === head,
          )?.[0]) as NonNullable<SocialHistoryStructured["living"]>["situation"] | undefined;
    if (situationKey) {
      living.situation = situationKey;
      if (parts.length > 1) living.notes = parts.slice(1).join(", ");
    } else {
      living.notes = parts.join(", ");
    }
  }

  return living;
}

function parseTravelText(value: string): NonNullable<SocialHistoryStructured["travel"]> {
  const travel: NonNullable<SocialHistoryStructured["travel"]> = { recent: true };
  let cleaned = value.replace(/\s*\(sick contacts\)\s*$/i, "").trim();
  const vectorMatch = cleaned.match(/^(.+?)\s*\(vector-borne area\)\s*$/i);
  if (vectorMatch) {
    travel.vectorRisk = true;
    cleaned = vectorMatch[1].trim();
  } else if (/^vector-borne area$/i.test(cleaned)) {
    travel.vectorRisk = true;
    return travel;
  }

  if (cleaned.toLowerCase() === "recent") {
    travel.recent = true;
  } else if (cleaned) {
    travel.place = cleaned;
  }
  return travel;
}

function parseSexualText(value: string): NonNullable<SocialHistoryStructured["sexual"]> {
  const sexual: NonNullable<SocialHistoryStructured["sexual"]> = { enabled: true };
  const { headline, details } = parseParenDetails(value);

  for (const part of headline.split(/,\s*/)) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;

    if (trimmed === "active") sexual.active = true;
    else if (trimmed === "inactive") sexual.active = false;
    else if (trimmed === "single" || trimmed === "multiple") sexual.partners = trimmed;
    else if (trimmed.startsWith("protection ")) {
      const protection = trimmed.slice("protection ".length);
      if (
        protection === "always" ||
        protection === "sometimes" ||
        protection === "never"
      ) {
        sexual.protection = protection;
      }
    }
  }

  if (details) sexual.notes = details;
  return sexual;
}

function splitTopLevelBulletSegments(text: string): string[] {
  const segments: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (depth === 0 && ch === "·" && text[i - 1] === " " && text[i + 1] === " ") {
      const piece = current.trim();
      if (piece) segments.push(piece);
      current = "";
      i++;
      continue;
    }
    current += ch;
  }

  const tail = current.trim();
  if (tail) segments.push(tail);
  return segments;
}

function parseStructuredSocialHistoryText(text: string): SocialHistoryStructured | null {
  const segments = splitTopLevelBulletSegments(text).filter(Boolean);
  if (segments.length === 0) return null;

  const structured: SocialHistoryStructured = {};
  const noteParts: string[] = [];
  let matchedV2 = false;

  for (const segment of segments) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx <= 0) {
      noteParts.push(segment);
      continue;
    }

    const label = segment.slice(0, colonIdx).trim().toLowerCase();
    const value = segment.slice(colonIdx + 1).trim();

    if (label === "smoking") {
      structured.smoking = parseSmokingText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "smokeless") {
      structured.smokeless = parseSmokelessText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "alcohol") {
      structured.alcohol = parseAlcoholText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "substances") {
      structured.substances = parseSubstancesText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "diet") {
      const { diet, legacyCaffeine } = parseDietTextWithLegacyCaffeine(value);
      if (dietHasContent(diet)) structured.diet = diet;
      if (legacyCaffeine) {
        const merged = mergeCaffeineSections(legacyCaffeine, structured.caffeine);
        if (merged) structured.caffeine = merged;
      }
      matchedV2 = true;
      continue;
    }
    if (label === "caffeine") {
      const parsedCaffeine = parseCaffeineText(value);
      if (caffeineHasContent(parsedCaffeine)) structured.caffeine = parsedCaffeine;
      matchedV2 = true;
      continue;
    }
    if (label === "activity") {
      structured.activity = parseActivityText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "occupation") {
      structured.occupation = parseOccupationText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "living") {
      structured.living = parseLivingText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "travel") {
      const hadLegacySickContacts = /\(sick contacts\)\s*$/i.test(value);
      structured.travel = parseTravelText(value);
      if (hadLegacySickContacts && !structured.sickContact) {
        structured.sickContact = { present: true };
      }
      matchedV2 = true;
      continue;
    }
    if (label === "sick contact") {
      const hadLegacyVectorLabel = /fever\s*\/\s*dengue\s*\/\s*malaria/i.test(value);
      structured.sickContact = parseSickContactText(value);
      if (
        hadLegacyVectorLabel ||
        sickContactInputPromotesVectorRisk(structured.sickContact)
      ) {
        structured.travel = {
          ...(structured.travel ?? {}),
          recent: structured.travel?.recent ?? true,
          vectorRisk: true,
        };
        structured.sickContact = normalizeSickContactSection(structured.sickContact) ?? undefined;
      }
      matchedV2 = true;
      continue;
    }
    if (label === "sleep") {
      structured.sleep = parseSleepText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "stress") {
      structured.stress = parseStressText(value);
      matchedV2 = true;
      continue;
    }
    if (label === "sexual") {
      structured.sexual = parseSexualText(value);
      matchedV2 = true;
      continue;
    }

    noteParts.push(segment);
  }

  if (!matchedV2) return null;

  if (noteParts.length > 0) {
    structured.notes = noteParts.join(" · ");
  }

  return structured;
}

function parseParenDetails(value: string): { headline: string; details: string } {
  const openIdx = value.indexOf("(");
  if (openIdx === -1) {
    return { headline: value.trim(), details: "" };
  }
  const closeIdx = value.lastIndexOf(")");
  const headline = value.slice(0, openIdx).trim();
  const details =
    closeIdx > openIdx ? value.slice(openIdx + 1, closeIdx).trim() : value.slice(openIdx + 1).trim();
  return { headline, details };
}

function parseSmokingText(value: string): NonNullable<SocialHistoryStructured["smoking"]> {
  const { headline, details } = parseParenDetails(value);
  const lower = headline.toLowerCase();

  let status: SmokingStatus = "current";
  if (lower.includes("non-smoker")) status = "never";
  else if (lower.includes("ex-smoker")) status = "ex";

  const smoking: TobaccoUseSection = {
    status,
    products: [],
  };

  if (!details) return normalizeTobaccoSection(smoking, "smoking")!;

  for (const part of splitTobaccoDetailClauseParts(details)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const legacyAmount = parseLegacySmokingAmountParts(trimmed);
    if (legacyAmount) {
      mergeTobaccoSectionPartial(smoking, legacyAmount);
      continue;
    }

    const yearsOnly = parseDurationSuffix(trimmed);
    if (yearsOnly) {
      smoking.years = yearsOnly.value;
      const storedUnit = normalizeStoredDurationUnit(yearsOnly.unit);
      if (storedUnit) smoking.yearsUnit = storedUnit;
      continue;
    }

    const yearsOnlyLegacy = trimmed.match(/^(\d+(?:\.\d+)?) yr$/i);
    if (yearsOnlyLegacy) {
      smoking.years = Number(yearsOnlyLegacy[1]);
      continue;
    }

    if (trimmed.match(/^≈\s*(\d+(?:\.\d+)?)\s*pack-yrs?$/i)) continue;

    const quitMatch = trimmed.match(/^quit (\d+(?:\.\d+)?) (yr|mo|d) ago$/i);
    if (quitMatch) {
      smoking.quitYearsAgo = Number(quitMatch[1]);
      const storedQuitUnit = normalizeStoredDurationUnit(parseDurationToken(quitMatch[2]));
      if (storedQuitUnit) smoking.quitYearsUnit = storedQuitUnit;
      continue;
    }

    const quitMatchLegacy = trimmed.match(/^quit (\d+(?:\.\d+)?) yr ago$/i);
    if (quitMatchLegacy) {
      smoking.quitYearsAgo = Number(quitMatchLegacy[1]);
      continue;
    }

    const product = parseTobaccoProductClause(trimmed, "smoking");
    if (product) {
      smoking.products.push(product);
      continue;
    }

    const typeTokens = trimmed.includes(",") ? trimmed.split(/,\s*/) : [trimmed];
    for (const token of typeTokens) {
      const typeKey = Object.entries(SMOKING_TYPE_LABELS_LEGACY).find(
        ([, label]) => label.toLowerCase() === token.trim().toLowerCase(),
      )?.[0];
      if (typeKey && !smoking.products.some((p) => p.type === typeKey)) {
        smoking.products.push(createTobaccoProduct(typeKey));
      }
    }
  }

  return normalizeTobaccoSection(smoking, "smoking")!;
}

function parseSmokelessText(value: string): NonNullable<SocialHistoryStructured["smokeless"]> {
  const valueLower = value.toLowerCase();
  if (valueLower === "no tobacco") {
    return { status: "never", products: [] };
  }

  const smokeless: TobaccoUseSection = {
    status: valueLower.includes("former user") ? "ex" : "current",
    products: [],
  };

  const statusTokens = new Set(["current", "uses tobacco", "former user"]);

  for (const part of splitTobaccoDetailClauseParts(value)) {
    const trimmed = part.trim();
    if (!trimmed || statusTokens.has(trimmed.toLowerCase())) continue;

    const legacyAmount = parseLegacySmokelessAmountParts(trimmed);
    if (legacyAmount) {
      mergeTobaccoSectionPartial(smokeless, legacyAmount);
      continue;
    }

    const durationOnly = parseDurationSuffix(trimmed);
    if (durationOnly) {
      smokeless.years = durationOnly.value;
      const storedUnit = normalizeStoredDurationUnit(durationOnly.unit);
      if (storedUnit) smokeless.yearsUnit = storedUnit;
      continue;
    }

    const quitMatch = trimmed.match(/^quit (\d+(?:\.\d+)?) (yr|mo|d) ago$/i);
    if (quitMatch) {
      smokeless.quitYearsAgo = Number(quitMatch[1]);
      const storedQuitUnit = normalizeStoredDurationUnit(parseDurationToken(quitMatch[2]));
      if (storedQuitUnit) smokeless.quitYearsUnit = storedQuitUnit;
      continue;
    }

    const quitMatchLegacy = trimmed.match(/^quit (\d+(?:\.\d+)?) yr ago$/i);
    if (quitMatchLegacy) {
      smokeless.quitYearsAgo = Number(quitMatchLegacy[1]);
      continue;
    }

    const product = parseTobaccoProductClause(trimmed, "smokeless");
    if (product) {
      smokeless.products.push(product);
      continue;
    }

    const typeKey = Object.entries(SMOKELESS_TYPE_LABELS_LEGACY).find(
      ([, label]) => label.toLowerCase() === trimmed.toLowerCase(),
    )?.[0];
    if (typeKey && !smokeless.products.some((p) => p.type === typeKey)) {
      smokeless.products.push(createTobaccoProduct(typeKey));
    }
  }

  if (smokeless.quitYearsAgo != null) {
    smokeless.status = "ex";
  }

  return normalizeTobaccoSection(smokeless, "smokeless")!;
}

function parseAlcoholText(value: string): NonNullable<SocialHistoryStructured["alcohol"]> {
  const { headline, details } = parseParenDetails(value);
  const headlineLower = headline.toLowerCase();
  const legacyAlcoholChips = [
    "no alcohol",
    "ex-drinker",
    "occasional alcohol",
    "regular alcohol",
  ];
  if (!details && legacyAlcoholChips.includes(headlineLower)) {
    return mapAlcoholChipToStructured(headline);
  }

  const lower = headline.toLowerCase();

  let status: SmokingStatus = "current";
  if (lower.includes("no alcohol")) status = "never";
  else if (lower.includes("ex-drinker")) status = "ex";
  else if (lower.includes("drinks alcohol") || lower === "current") status = "current";

  const alcohol: NonNullable<SocialHistoryStructured["alcohol"]> = {
    status,
    drinks: [],
  };

  if (!details) return normalizeAlcoholSection(alcohol)!;

  for (const part of splitAlcoholDetailClauseParts(details)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const unitsMatch = trimmed.match(/^≈\s*(\d+(?:\.\d+)?)\s*units\/wk$/i);
    if (unitsMatch) continue;

    const unitsMatchLegacy = trimmed.match(/^(\d+(?:\.\d+)?)\s*units\/wk$/i);
    if (unitsMatchLegacy) continue;

    const cageMatch = trimmed.match(/^CAGE (\d)\/4(?: positive)?$/i);
    if (cageMatch) continue;

    const auditCMatch = trimmed.match(
      /^AUDIT-C (\d{1,2})\/12(?: positive)?(?: \((\d),(\d),(\d)\))?$/i,
    );
    if (auditCMatch) continue;

    const auditFullMatch = trimmed.match(
      /^AUDIT-10 (\d{1,2})\/40(?: (?:low risk|hazardous|harmful|possible dependence))? \((\d+(?:,\d+){9})\)$/i,
    );
    if (auditFullMatch) continue;

    const maxSessionMatch = trimmed.match(/^max\s+\d+(?:\.\d+)?\s+[a-z][a-z-]*\/session$/i);
    if (maxSessionMatch) continue;

    const quitMatch = trimmed.match(/^quit (\d+(?:\.\d+)?) (yr|mo|d) ago$/i);
    if (quitMatch) {
      alcohol.quitYearsAgo = Number(quitMatch[1]);
      const storedQuitUnit = normalizeStoredDurationUnit(parseDurationToken(quitMatch[2]));
      if (storedQuitUnit) alcohol.quitYearsUnit = storedQuitUnit;
      continue;
    }

    const patternLower = trimmed.toLowerCase();
    if (patternLower === "occasional") alcohol.pattern = "occasional";
    else if (patternLower === "weekend") alcohol.pattern = "weekend";
    else if (patternLower === "daily") alcohol.pattern = "daily";
    else if (patternLower === "binge") alcohol.pattern = "binge";
    else {
      const drink = parseAlcoholDrinkClause(trimmed);
      if (drink) {
        alcohol.drinks.push(drink);
        continue;
      }
      const typeKey = Object.entries(ALCOHOL_TYPE_LABELS).find(
        ([, label]) => label.toLowerCase() === patternLower,
      )?.[0];
      if (typeKey) {
        alcohol.drinks.push(createAlcoholDrink(typeKey));
      }
    }
  }

  const cageInDetails = details.match(/CAGE (\d)\/4(?: positive)?/i);
  if (cageInDetails) {
    const score = Number(cageInDetails[1]);
    alcohol.cage = {
      cutDown: score >= 1,
      annoyed: score >= 2,
      guilty: score >= 3,
      eyeOpener: score >= 4,
    };
  }

  const auditCInDetails = details.match(
    /AUDIT-C (\d{1,2})\/12(?: positive)?(?: \((\d),(\d),(\d)\))?/i,
  );
  if (auditCInDetails && auditCInDetails[2] != null) {
    alcohol.auditC = {
      frequency: Number(auditCInDetails[2]),
      typicalQuantity: Number(auditCInDetails[3]),
      bingeFrequency: Number(auditCInDetails[4]),
      enabled: true,
    };
  }

  const auditFullInDetails = details.match(
    /AUDIT-10 (\d{1,2})\/40(?: (?:low risk|hazardous|harmful|possible dependence))? \((\d+(?:,\d+){9})\)/i,
  );
  if (auditFullInDetails) {
    const answers = auditFullInDetails[2].split(",").map(Number);
    if (answers.length === 10 && answers.every((n) => Number.isInteger(n))) {
      alcohol.auditC = {
        frequency: answers[0],
        typicalQuantity: answers[1],
        bingeFrequency: answers[2],
        enabled: true,
      };
      alcohol.auditFull = {
        unableToStop: answers[3],
        failedExpectations: answers[4],
        morningDrink: answers[5],
        guiltRemorse: answers[6],
        blackout: answers[7],
        injury: answers[8],
        othersConcerned: answers[9],
        enabled: true,
      };
    }
  }

  for (const part of splitAlcoholDetailClauseParts(details)) {
    const maxPerSession = parseMaxPerSessionClause(part.trim());
    if (maxPerSession) {
      alcohol.maxPerSession = maxPerSession;
      break;
    }
  }

  return normalizeAlcoholSection(alcohol)!;
}

export function setSmoking(
  structured: SocialHistoryStructured,
  smoking: SocialHistoryStructured["smoking"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  if (!smoking) {
    delete next.smoking;
  } else {
    const normalized = normalizeTobaccoSection(smoking, "smoking");
    if (normalized) {
      next.smoking = { ...normalized, products: [...normalized.products] };
    } else {
      delete next.smoking;
    }
  }
  return next;
}

export function setSmokeless(
  structured: SocialHistoryStructured,
  smokeless: SocialHistoryStructured["smokeless"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  if (!smokeless) {
    delete next.smokeless;
  } else {
    const normalized = normalizeTobaccoSection(smokeless, "smokeless");
    if (normalized) {
      next.smokeless = { ...normalized, products: [...normalized.products] };
    } else {
      delete next.smokeless;
    }
  }
  return next;
}

export function setAlcohol(
  structured: SocialHistoryStructured,
  alcohol: SocialHistoryStructured["alcohol"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  if (!alcohol) {
    delete next.alcohol;
  } else {
    const normalized = normalizeAlcoholSection(alcohol);
    if (normalized) {
      next.alcohol = {
        ...normalized,
        drinks: [...normalized.drinks],
        ...(normalized.cage ? { cage: { ...normalized.cage } } : {}),
        ...(normalized.auditC ? { auditC: { ...normalized.auditC } } : {}),
        ...(normalized.auditFull ? { auditFull: { ...normalized.auditFull } } : {}),
        ...(normalized.maxPerSession ? { maxPerSession: { ...normalized.maxPerSession } } : {}),
      };
    } else {
      delete next.alcohol;
    }
  }
  return next;
}

function clearIfEmptySubstances(
  substances: SubstancesSectionInput,
): SubstancesSectionInput | null {
  return normalizeSubstancesSection(substances);
}

export function setSubstances(
  structured: SocialHistoryStructured,
  substances: SocialHistoryStructured["substances"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  const cleaned = substances ? normalizeSubstancesSection(substances) : null;
  if (!cleaned) delete next.substances;
  else next.substances = cleaned;
  return next;
}

export function setDiet(
  structured: SocialHistoryStructured,
  diet: SocialHistoryStructured["diet"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  const cleaned = diet ? normalizeDietSection(diet) : null;
  if (!cleaned) delete next.diet;
  else next.diet = cleaned;
  return next;
}

export function setCaffeine(
  structured: SocialHistoryStructured,
  caffeine: SocialHistoryStructured["caffeine"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  const cleaned = caffeine ? normalizeCaffeineSection(caffeine) : null;
  if (!cleaned) delete next.caffeine;
  else next.caffeine = cleaned;
  return next;
}

export function setActivity(
  structured: SocialHistoryStructured,
  activity: SocialHistoryStructured["activity"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  const cleaned = activity ? normalizeActivitySection(activity) : null;
  if (!cleaned) delete next.activity;
  else next.activity = cleaned;
  return next;
}

export function setOccupation(
  structured: SocialHistoryStructured,
  occupation: SocialHistoryStructured["occupation"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  if (!occupation) {
    delete next.occupation;
  } else {
    const text = occupation.text?.trim();
    const exposures = [...(occupation.exposures ?? [])];
    if (!text && exposures.length === 0) {
      delete next.occupation;
    } else {
      next.occupation = { ...(text ? { text } : {}), exposures };
    }
  }
  return next;
}

export function setLiving(
  structured: SocialHistoryStructured,
  living: SocialHistoryStructured["living"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  if (!living) {
    delete next.living;
  } else {
    const notes = living.notes?.trim();
    if (!living.situation && !notes) {
      delete next.living;
    } else {
      next.living = {
        ...(living.situation ? { situation: living.situation } : {}),
        ...(notes ? { notes } : {}),
      };
    }
  }
  return next;
}

export function setTravel(
  structured: SocialHistoryStructured,
  travel: SocialHistoryStructured["travel"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  if (!travel) {
    delete next.travel;
  } else {
    const place = travel.place?.trim();
    const hasContent =
      travel.recent === true || Boolean(place) || travel.vectorRisk === true;
    if (!hasContent) {
      delete next.travel;
    } else {
      next.travel = {
        ...(travel.recent != null ? { recent: travel.recent } : {}),
        ...(place ? { place } : {}),
        ...(travel.vectorRisk === true ? { vectorRisk: true } : {}),
      };
    }
  }
  return next;
}

export function setSickContact(
  structured: SocialHistoryStructured,
  sickContact: SocialHistoryStructured["sickContact"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  const cleaned = sickContact ? normalizeSickContactSection(sickContact) : null;
  if (!cleaned) delete next.sickContact;
  else next.sickContact = cleaned;
  return next;
}

export function setSleep(
  structured: SocialHistoryStructured,
  sleep: SocialHistoryStructured["sleep"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  const cleaned = sleep ? normalizeSleepSection(sleep) : null;
  if (!cleaned) delete next.sleep;
  else next.sleep = cleaned;
  return next;
}

export function setStress(
  structured: SocialHistoryStructured,
  stress: SocialHistoryStructured["stress"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  const cleaned = stress ? normalizeStressSection(stress) : null;
  if (!cleaned) delete next.stress;
  else next.stress = cleaned;
  return next;
}

export function setSexual(
  structured: SocialHistoryStructured,
  sexual: SocialHistoryStructured["sexual"] | null,
): SocialHistoryStructured {
  const next = { ...structured };
  if (!sexual?.enabled) {
    delete next.sexual;
  } else {
    next.sexual = {
      enabled: true,
      ...(sexual.active != null ? { active: sexual.active } : {}),
      ...(sexual.partners ? { partners: sexual.partners } : {}),
      ...(sexual.protection ? { protection: sexual.protection } : {}),
      ...(sexual.notes?.trim() ? { notes: sexual.notes.trim() } : {}),
    };
  }
  return next;
}

export function setSocialHistoryNotes(
  structured: SocialHistoryStructured,
  notes: string,
): SocialHistoryStructured {
  const trimmed = notes.trim();
  const next = { ...structured };
  if (!trimmed) {
    delete next.notes;
  } else {
    next.notes = trimmed;
  }
  return next;
}

export function setSocialHistoryDimension(
  text: string,
  key: SocialHistoryDimensionKey,
  value: string | null,
): string {
  const parsed = parseV1SocialHistory(text);
  const next = { ...parsed.dimensions };
  const trimmed = value?.trim();
  if (!trimmed) {
    delete next[key];
  } else {
    next[key] = canonicalizeDimensionValue(key, trimmed);
  }
  return serializeV1SocialHistory({ dimensions: next, remainder: parsed.remainder });
}

export function setSocialHistoryRemainder(text: string, remainder: string): string {
  const parsed = parseV1SocialHistory(text);
  return serializeV1SocialHistory({ dimensions: parsed.dimensions, remainder });
}

export function formatSocialHistoryPreview(
  input: string | SocialHistoryStructured | null | undefined,
): string {
  const serialized = isStructuredInput(input)
    ? serializeStructuredSocialHistory(normalizeSocialHistoryStructured(input))
    : serializeV1SocialHistory(parseV1SocialHistory(input));

  if (serialized.length <= 120) return serialized;

  if (isStructuredInput(input)) {
    const withoutNotes = serializeStructuredSocialHistory({
      ...normalizeSocialHistoryStructured(input),
      notes: undefined,
    });
    if (!input.notes?.trim()) return withoutNotes;
    if (!withoutNotes) return `${input.notes.trim().slice(0, 117)}…`;
    return `${withoutNotes} · …`;
  }

  const parsed = parseV1SocialHistory(input);
  const dimensionSummary = serializeV1SocialHistory({ dimensions: parsed.dimensions, remainder: "" });
  if (!parsed.remainder.trim()) return dimensionSummary;
  if (!dimensionSummary) return `${parsed.remainder.trim().slice(0, 117)}…`;
  return `${dimensionSummary} · …`;
}
