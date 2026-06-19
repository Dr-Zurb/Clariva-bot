import {
  durationToYears,
  type SocialHistoryDurationUnit,
  formatSocialHistoryDurationSuffix,
  normalizeStoredDurationUnit,
  parseDurationToken,
  parseSocialHistoryDurationSuffix,
} from "@/lib/cockpit/social-history-indices";

export type TobaccoSmokingStatus = "never" | "current" | "ex";
export type TobaccoProductPhase = "current" | "past";
export type SmokelessAmountUnit = "packets" | "times" | "other";
export type TobaccoFrequencyUnit =
  | "day"
  | "week"
  | "fortnight"
  | "month"
  | "interval"
  | "occasional";

export const TOBACCO_COMMON_FREQ_OPTIONS = [
  { value: "day" as const, label: "Every day" },
  { value: "week" as const, label: "Times per week" },
  { value: "occasional" as const, label: "Occasional / rare" },
] as const;

export const TOBACCO_ADVANCED_FREQ_OPTIONS = [
  { value: "fortnight" as const, label: "Times per fortnight" },
  { value: "month" as const, label: "Times per month" },
  { value: "interval" as const, label: "Every N days" },
] as const;

export interface TobaccoProductRow {
  id: string;
  type: string;
  typeOther?: string;
  perDay?: number;
  perDayUnit?: string;
  perDayUnitOther?: string;
  frequency?: number;
  frequencyUnit?: TobaccoFrequencyUnit;
  years?: number;
  yearsUnit?: SocialHistoryDurationUnit;
  /** `past` = stopped this product; default/current when omitted. */
  phase?: TobaccoProductPhase;
  quitYearsAgo?: number;
  quitYearsUnit?: SocialHistoryDurationUnit;
}

export interface TobaccoUseSection {
  status: TobaccoSmokingStatus;
  products: TobaccoProductRow[];
  years?: number;
  yearsUnit?: SocialHistoryDurationUnit;
  quitYearsAgo?: number;
  quitYearsUnit?: SocialHistoryDurationUnit;
}

/** Legacy flat fields — migrated to `products[]` on normalize. */
export interface LegacyTobaccoFlatFields {
  types?: string[];
  typeOther?: string;
  perDay?: number;
  perDayUnit?: SmokelessAmountUnit | string;
  perDayUnitOther?: string;
}

export const SMOKING_PRODUCT_TYPES = [
  { value: "cigarette", label: "Cigarette" },
  { value: "beedi", label: "Beedi" },
  { value: "hookah", label: "Hookah" },
  { value: "cigar", label: "Cigar" },
  { value: "vape", label: "Vape" },
  { value: "other", label: "Other" },
] as const;

export const SMOKELESS_PRODUCT_TYPES = [
  { value: "gutka", label: "Gutka" },
  { value: "khaini", label: "Khaini" },
  { value: "paan/supari", label: "Paan/Supari" },
  { value: "zarda", label: "Zarda" },
  { value: "mishri", label: "Mishri" },
  { value: "other", label: "Other" },
] as const;

export const SMOKING_AMOUNT_UNITS = [
  { value: "cigarettes", label: "Cigarettes" },
  { value: "beedis", label: "Beedis" },
  { value: "cigars", label: "Cigars" },
  { value: "sessions", label: "Sessions" },
  { value: "pods", label: "Pods" },
  { value: "other", label: "Other" },
] as const;

export const SMOKELESS_AMOUNT_UNITS = [
  { value: "packets", label: "Packets" },
  { value: "times", label: "Times" },
  { value: "other", label: "Other" },
] as const;

export const SMOKING_TYPE_LABELS: Record<string, string> = {
  cigarette: "cigarette",
  beedi: "beedi",
  hookah: "hookah",
  cigar: "cigar",
  vape: "vape",
  other: "other",
};

export const SMOKELESS_TYPE_LABELS: Record<string, string> = {
  gutka: "Gutka",
  khaini: "Khaini",
  "gutka/khaini": "Gutka/Khaini",
  "paan/supari": "Paan/Supari",
  zarda: "Zarda",
  mishri: "Mishri",
  other: "Other",
};

/** 1 beedi ≈ 1 cigarette for pack-year equivalent (clinical approximation). */
export const BEEDI_CIGARETTE_EQUIVALENT = 1;

/**
 * Hookah session → cigarette equivalent (approximate).
 * One waterpipe session exposes roughly 10 cigarettes' worth of smoke; actual
 * exposure varies widely by session length and sharing.
 */
export const HOOKAH_SESSION_CIGARETTE_EQUIVALENT = 10;

/** 1 cigar ≈ 1 cigarette for pack-year approximation (large cigars may exceed this). */
export const CIGAR_CIGARETTE_EQUIVALENT = 1;

/**
 * 1 vape pod ≈ 20 cigarettes (≈1 standard pack; approximate — pod nicotine varies).
 */
export const VAPE_POD_CIGARETTE_EQUIVALENT = 20;

export const SMOKING_PACK_YEARS_TOOLTIP =
  "Pack-years = (cigarette-equivalents per day ÷ 20) × duration in years. Cigarettes and beedis count 1:1. Hookah sessions, cigars, and vape pods use documented approximations (labelled on the row). Other products are recorded but excluded from the total. ≥20 = elevated COPD/CV risk; ≥30 may meet LDCT screening thresholds (age-dependent). Screening hints are not diagnoses.";

export type TobaccoCatalog = "smoking" | "smokeless";

export function newTobaccoProductId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createTobaccoProduct(
  type: string,
  partial?: Partial<Omit<TobaccoProductRow, "id" | "type">>,
): TobaccoProductRow {
  return {
    id: newTobaccoProductId(),
    type,
    ...partial,
  };
}

export function formatProductDurationSuffix(
  value: number,
  unit?: SocialHistoryDurationUnit,
): string {
  return formatSocialHistoryDurationSuffix(value, unit);
}

export function parseProductDurationSuffix(
  raw: string,
): { value: number; unit: SocialHistoryDurationUnit } | null {
  return parseSocialHistoryDurationSuffix(raw);
}

export function productPhase(product: TobaccoProductRow): TobaccoProductPhase {
  return product.phase === "past" ? "past" : "current";
}

function formatProductPhaseClause(product: TobaccoProductRow): string {
  if (product.quitYearsAgo != null) {
    return ` (past; quit ${formatProductDurationSuffix(product.quitYearsAgo, product.quitYearsUnit)} ago)`;
  }
  if (productPhase(product) === "past") return " (past)";
  return "";
}

function parseProductPhaseSuffix(raw: string): {
  rest: string;
  phase?: TobaccoProductPhase;
  quitYearsAgo?: number;
  quitYearsUnit?: SocialHistoryDurationUnit;
} {
  const match = raw.match(
    /\s*\((past)(?:;\s*quit\s+(\d+(?:\.\d+)?)\s*(yr|mo|d)\s+ago)?\)\s*$/i,
  );
  if (!match) return { rest: raw };
  return {
    rest: raw.slice(0, match.index).trim(),
    phase: "past",
    ...(match[2]
      ? {
          quitYearsAgo: Number(match[2]),
          quitYearsUnit: parseDurationToken(match[3]),
        }
      : {}),
  };
}

export function smokingProductIncludedInPackYears(type: string): boolean {
  const normalized = type.toLowerCase();
  return (
    normalized === "cigarette" ||
    normalized === "beedi" ||
    normalized === "hookah" ||
    normalized === "cigar" ||
    normalized === "vape"
  );
}

/** True for hookah / cigar / vape — pack-years use documented approximations (SHv3-D6). */
export function smokingProductUsesApproximateEquivalent(type: string): boolean {
  const normalized = type.toLowerCase();
  return normalized === "hookah" || normalized === "cigar" || normalized === "vape";
}

export function smokingAmountUnitLabel(
  type: string,
  perDayUnitOther?: string,
): string {
  if (type === "other") {
    return perDayUnitOther?.trim() || "units";
  }
  const unit = defaultSmokingAmountUnit(type);
  const found = SMOKING_AMOUNT_UNITS.find((u) => u.value === unit);
  return found?.label.toLowerCase() ?? unit;
}

export function defaultSmokingAmountUnit(type: string): string {
  switch (type) {
    case "beedi":
      return "beedis";
    case "hookah":
      return "sessions";
    case "cigar":
      return "cigars";
    case "vape":
      return "pods";
    case "other":
      return "other";
    default:
      return "cigarettes";
  }
}

export function defaultSmokelessAmountUnit(_type: string): SmokelessAmountUnit {
  return "packets";
}

export function tobaccoProductLabel(
  product: TobaccoProductRow,
  catalog: TobaccoCatalog,
): string {
  if (product.type === "other" && product.typeOther?.trim()) {
    return product.typeOther.trim();
  }
  const labels = catalog === "smoking" ? SMOKING_TYPE_LABELS : SMOKELESS_TYPE_LABELS;
  return labels[product.type.toLowerCase()] ?? product.type;
}

/** Title-case label for UI cards (serialization keeps lowercase smoking tokens). */
export function tobaccoProductDisplayLabel(
  product: TobaccoProductRow,
  catalog: TobaccoCatalog,
): string {
  if (product.type === "other") {
    return product.typeOther?.trim() || "Other";
  }
  const types = catalog === "smoking" ? SMOKING_PRODUCT_TYPES : SMOKELESS_PRODUCT_TYPES;
  return types.find((t) => t.value === product.type)?.label ?? product.type;
}

function resolveAmountSuffix(
  catalog: TobaccoCatalog,
  unit?: string,
  unitOther?: string,
): string {
  if (catalog === "smoking") {
    if (unit === "other") return unitOther?.trim() || "other";
    return unit ?? "cigarettes";
  }
  if (unit === "times") return "times";
  if (unit === "other") return unitOther?.trim() || "other";
  return "packets";
}

/** Occasions per week for pack-years / intake estimates (daily when frequency omitted). */
export function tobaccoOccasionsPerWeek(product: TobaccoProductRow): number {
  const freqUnit = product.frequencyUnit ?? "day";
  if (freqUnit === "occasional") return 0;
  const freq = product.frequency ?? (freqUnit === "day" ? 1 : 0);
  switch (freqUnit) {
    case "day":
      return (product.frequency ?? 1) * 7;
    case "fortnight":
      return freq / 2;
    case "month":
      return freq > 0 ? (freq * 12) / 52 : 0;
    case "interval":
      return freq > 0 ? 7 / freq : 0;
    default:
      return freq;
  }
}

export function tobaccoFrequencyUnitChangePatch(
  product: TobaccoProductRow,
  nextUnit: TobaccoFrequencyUnit,
): Partial<TobaccoProductRow> {
  const freqUnit = product.frequencyUnit ?? "day";
  const patch: Partial<TobaccoProductRow> = { frequencyUnit: nextUnit };
  if (nextUnit === "day") {
    patch.frequency = 1;
  } else if (nextUnit === "occasional") {
    patch.frequency = undefined;
  } else if (nextUnit === "interval" && product.frequency == null) {
    patch.frequency = 7;
  } else if (nextUnit === "month" && product.frequency == null) {
    patch.frequency = 1;
  } else if (nextUnit === "fortnight" && product.frequency == null) {
    patch.frequency = 1;
  } else if (product.frequency === 1 && freqUnit === "day" && nextUnit !== "day") {
    patch.frequency = undefined;
  }
  return patch;
}

export function formatTobaccoProductAmount(
  product: TobaccoProductRow,
  catalog: TobaccoCatalog,
): string | null {
  if (product.perDay == null) return null;
  const defaultUnit =
    catalog === "smoking"
      ? defaultSmokingAmountUnit(product.type)
      : defaultSmokelessAmountUnit(product.type);
  const suffix = resolveAmountSuffix(
    catalog,
    product.perDayUnit ?? defaultUnit,
    product.perDayUnitOther,
  );
  const freqUnit = product.frequencyUnit ?? "day";
  const freq = product.frequency;
  if (freqUnit === "occasional") {
    return `${product.perDay} ${suffix}, occasional`;
  }
  if (freqUnit === "day" || freq == null) {
    return `${product.perDay} ${suffix}/day`;
  }
  if (freqUnit === "fortnight") {
    return `${product.perDay} ${suffix} × ${freq}/2wk`;
  }
  if (freqUnit === "month") {
    return `${product.perDay} ${suffix} × ${freq}/mo`;
  }
  if (freqUnit === "interval") {
    return `${product.perDay} ${suffix} × 1/${freq}d`;
  }
  return `${product.perDay} ${suffix} × ${freq}/wk`;
}

export function formatTobaccoProductClause(
  product: TobaccoProductRow,
  catalog: TobaccoCatalog,
): string {
  const label = tobaccoProductLabel(product, catalog);
  const amount = formatTobaccoProductAmount(product, catalog);
  let clause = amount ? `${label} ${amount}` : label;
  if (product.years != null) {
    clause += `, ${formatProductDurationSuffix(product.years, product.yearsUnit)}`;
  }
  clause += formatProductPhaseClause(product);
  return clause;
}

export function migrateLegacyTobaccoProducts(
  legacy: LegacyTobaccoFlatFields,
  catalog: TobaccoCatalog,
): TobaccoProductRow[] {
  const types = legacy.types ?? [];
  if (types.length === 0) {
    if (legacy.perDay == null) return [];
    const defaultType = catalog === "smoking" ? "cigarette" : "gutka";
    return [
      createTobaccoProduct(defaultType, {
        perDay: legacy.perDay,
        perDayUnit:
          legacy.perDayUnit ??
          (catalog === "smoking"
            ? defaultSmokingAmountUnit(defaultType)
            : defaultSmokelessAmountUnit(defaultType)),
        ...(legacy.perDayUnitOther ? { perDayUnitOther: legacy.perDayUnitOther } : {}),
      }),
    ];
  }

  return types.map((type) =>
    createTobaccoProduct(type, {
      ...(type === "other" && legacy.typeOther ? { typeOther: legacy.typeOther } : {}),
      ...(legacy.perDay != null ? { perDay: legacy.perDay } : {}),
      perDayUnit:
        legacy.perDayUnit ??
        (catalog === "smoking"
          ? defaultSmokingAmountUnit(type)
          : defaultSmokelessAmountUnit(type)),
      ...(legacy.perDayUnitOther ? { perDayUnitOther: legacy.perDayUnitOther } : {}),
    }),
  );
}

function normalizeProductRow(
  product: TobaccoProductRow,
  catalog: TobaccoCatalog,
): TobaccoProductRow {
  const row: TobaccoProductRow = {
    id: product.id || newTobaccoProductId(),
    type: product.type,
  };
  if (product.typeOther != null && product.typeOther !== "") {
    row.typeOther = product.typeOther;
  }
  if (product.perDay != null) row.perDay = product.perDay;
  const defaultUnit =
    catalog === "smoking"
      ? defaultSmokingAmountUnit(product.type)
      : defaultSmokelessAmountUnit(product.type);
  const unit = product.perDayUnit ?? defaultUnit;
  if (unit !== defaultUnit) row.perDayUnit = unit;
  if (unit === "other" && product.perDayUnitOther != null && product.perDayUnitOther !== "") {
    row.perDayUnitOther = product.perDayUnitOther;
  }
  if (product.frequency != null && product.frequency >= 0) row.frequency = product.frequency;
  if (product.frequencyUnit) row.frequencyUnit = product.frequencyUnit;
  if (product.years != null) row.years = product.years;
  const storedYearsUnit = normalizeStoredDurationUnit(product.yearsUnit);
  if (storedYearsUnit) row.yearsUnit = storedYearsUnit;
  if (product.phase === "past") row.phase = "past";
  if (product.quitYearsAgo != null) row.quitYearsAgo = product.quitYearsAgo;
  const storedQuitUnit = normalizeStoredDurationUnit(product.quitYearsUnit);
  if (storedQuitUnit) row.quitYearsUnit = storedQuitUnit;
  return row;
}

function migrateSectionDurationToProducts(
  products: TobaccoProductRow[],
  sectionYears?: number,
  sectionYearsUnit?: SocialHistoryDurationUnit,
): TobaccoProductRow[] {
  if (sectionYears == null) return products;
  return products.map((product) => {
    if (product.years != null) return product;
    return {
      ...product,
      years: sectionYears,
      ...(normalizeStoredDurationUnit(sectionYearsUnit)
        ? { yearsUnit: normalizeStoredDurationUnit(sectionYearsUnit) }
        : {}),
    };
  });
}

export function normalizeTobaccoSection(
  input: (TobaccoUseSection & LegacyTobaccoFlatFields) | null | undefined,
  catalog: TobaccoCatalog,
): TobaccoUseSection | undefined {
  if (!input) return undefined;

  let products =
    input.products && input.products.length > 0
      ? input.products.map((p) => normalizeProductRow(p, catalog))
      : migrateLegacyTobaccoProducts(input, catalog);

  products = migrateSectionDurationToProducts(products, input.years, input.yearsUnit);

  let sectionQuitYearsAgo = input.quitYearsAgo;
  let sectionQuitYearsUnit = input.quitYearsUnit;
  if (
    input.status === "ex" &&
    sectionQuitYearsAgo != null &&
    products.length > 0 &&
    products.every((product) => product.quitYearsAgo == null)
  ) {
    products = products.map((product) => ({
      ...product,
      quitYearsAgo: sectionQuitYearsAgo,
      ...(sectionQuitYearsUnit === "months" ? { quitYearsUnit: "months" as const } : {}),
    }));
    sectionQuitYearsAgo = undefined;
    sectionQuitYearsUnit = undefined;
  }

  const next: TobaccoUseSection = {
    status: input.status,
    products,
  };

  if (sectionQuitYearsAgo != null) next.quitYearsAgo = sectionQuitYearsAgo;
  if (sectionQuitYearsUnit === "months") next.quitYearsUnit = "months";

  return next;
}

export function smokingCigaretteEquivalent(product: TobaccoProductRow): number | null {
  if (product.perDay == null || product.perDay <= 0) return null;
  const occasionsPerWeek = tobaccoOccasionsPerWeek(product);
  if (occasionsPerWeek <= 0) return null;
  const effectiveDaily = (product.perDay * occasionsPerWeek) / 7;
  const type = product.type.toLowerCase();
  switch (type) {
    case "cigarette":
      return effectiveDaily;
    case "beedi":
      return effectiveDaily * BEEDI_CIGARETTE_EQUIVALENT;
    case "hookah":
      return effectiveDaily * HOOKAH_SESSION_CIGARETTE_EQUIVALENT;
    case "cigar":
      return effectiveDaily * CIGAR_CIGARETTE_EQUIVALENT;
    case "vape":
      return effectiveDaily * VAPE_POD_CIGARETTE_EQUIVALENT;
    default:
      return null;
  }
}

export function smokingPackYearsForProduct(product: TobaccoProductRow): number | null {
  const equiv = smokingCigaretteEquivalent(product);
  if (equiv == null) return null;
  const years = durationToYears(product.years, product.yearsUnit ?? "years");
  if (years == null) return null;
  return Math.round((equiv / 20) * years * 10) / 10;
}

export function smokingPackYearsFromProducts(
  products: TobaccoProductRow[],
): { packYears: number | null; hasNonConvertible: boolean; hasApproximateProducts: boolean } {
  let totalPackYears = 0;
  let hasConvertible = false;
  let hasNonConvertible = false;
  let hasApproximateProducts = false;

  for (const product of products) {
    const rowPy = smokingPackYearsForProduct(product);
    if (rowPy != null) {
      totalPackYears += rowPy;
      hasConvertible = true;
      if (smokingProductUsesApproximateEquivalent(product.type)) {
        hasApproximateProducts = true;
      }
    } else if (product.perDay != null && product.perDay > 0) {
      hasNonConvertible = true;
    }
  }

  if (!hasConvertible) return { packYears: null, hasNonConvertible, hasApproximateProducts: false };

  return {
    packYears: Math.round(totalPackYears * 10) / 10,
    hasNonConvertible,
    hasApproximateProducts,
  };
}

const STATUS_TOKENS = new Set(["current", "uses tobacco", "former user"]);

const TOBACCO_STANDARD_AMOUNT_UNITS = new Set([
  "packets",
  "times",
  "cigarettes",
  "beedis",
  "cigars",
  "sessions",
  "pods",
  "other",
]);

function tobaccoAmountUnitFields(
  type: string,
  catalog: TobaccoCatalog,
  unitRaw: string,
): Pick<TobaccoProductRow, "perDayUnit" | "perDayUnitOther"> {
  const defaultUnit =
    catalog === "smoking" ? defaultSmokingAmountUnit(type) : defaultSmokelessAmountUnit(type);
  if (TOBACCO_STANDARD_AMOUNT_UNITS.has(unitRaw)) {
    if (unitRaw === defaultUnit) return {};
    if (unitRaw === "other") return { perDayUnit: "other" };
    return { perDayUnit: unitRaw };
  }
  return { perDayUnit: "other", perDayUnitOther: unitRaw };
}

function durationFields(
  duration: { value: number; unit: SocialHistoryDurationUnit } | null,
): Pick<TobaccoProductRow, "years" | "yearsUnit"> {
  if (!duration) return {};
  const stored = normalizeStoredDurationUnit(duration.unit);
  return stored ? { years: duration.value, yearsUnit: stored } : { years: duration.value };
}

function buildParsedTobaccoProduct(
  type: { type: string; typeOther?: string },
  catalog: TobaccoCatalog,
  amount: number,
  unitRaw: string,
  frequency: Partial<Pick<TobaccoProductRow, "frequency" | "frequencyUnit">>,
  duration: { value: number; unit: SocialHistoryDurationUnit } | null,
  phaseFields: Partial<TobaccoProductRow>,
): TobaccoProductRow {
  return createTobaccoProduct(type.type, {
    ...(type.typeOther ? { typeOther: type.typeOther } : {}),
    perDay: amount,
    ...tobaccoAmountUnitFields(type.type, catalog, unitRaw),
    ...frequency,
    ...durationFields(duration),
    ...phaseFields,
  });
}

export function parseTobaccoProductClause(
  raw: string,
  catalog: TobaccoCatalog,
): TobaccoProductRow | null {
  let trimmed = raw.trim();
  if (!trimmed || STATUS_TOKENS.has(trimmed.toLowerCase())) return null;

  const phaseParsed = parseProductPhaseSuffix(trimmed);
  trimmed = phaseParsed.rest;

  let duration: { value: number; unit: SocialHistoryDurationUnit } | null = null;
  const durationTrail = trimmed.match(/,\s*(\d+(?:\.\d+)?)\s*(yr|mo|d)$/i);
  if (durationTrail) {
    duration = {
      value: Number(durationTrail[1]),
      unit: parseDurationToken(durationTrail[2]),
    };
    trimmed = trimmed.slice(0, durationTrail.index).trim();
  }

  const phaseFields = {
    ...(phaseParsed.phase === "past" ? { phase: "past" as const } : {}),
    ...(phaseParsed.quitYearsAgo != null ? { quitYearsAgo: phaseParsed.quitYearsAgo } : {}),
    ...(phaseParsed.quitYearsUnit
      ? { quitYearsUnit: normalizeStoredDurationUnit(phaseParsed.quitYearsUnit) }
      : {}),
  };

  const occasionalMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*),\s*occasional$/i,
  );
  if (occasionalMatch) {
    const type = resolveTypeFromLabel(occasionalMatch[1].trim(), catalog);
    return buildParsedTobaccoProduct(
      type,
      catalog,
      Number(occasionalMatch[2]),
      occasionalMatch[3].toLowerCase(),
      { frequencyUnit: "occasional" },
      duration,
      phaseFields,
    );
  }

  const weeklyMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\s+×\s+(\d+(?:\.\d+)?)\/wk$/i,
  );
  if (weeklyMatch) {
    const type = resolveTypeFromLabel(weeklyMatch[1].trim(), catalog);
    return buildParsedTobaccoProduct(
      type,
      catalog,
      Number(weeklyMatch[2]),
      weeklyMatch[3].toLowerCase(),
      { frequency: Number(weeklyMatch[4]), frequencyUnit: "week" },
      duration,
      phaseFields,
    );
  }

  const fortnightMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\s+×\s+(\d+(?:\.\d+)?)\/2wk$/i,
  );
  if (fortnightMatch) {
    const type = resolveTypeFromLabel(fortnightMatch[1].trim(), catalog);
    return buildParsedTobaccoProduct(
      type,
      catalog,
      Number(fortnightMatch[2]),
      fortnightMatch[3].toLowerCase(),
      { frequency: Number(fortnightMatch[4]), frequencyUnit: "fortnight" },
      duration,
      phaseFields,
    );
  }

  const monthMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\s+×\s+(\d+(?:\.\d+)?)\/mo$/i,
  );
  if (monthMatch) {
    const type = resolveTypeFromLabel(monthMatch[1].trim(), catalog);
    return buildParsedTobaccoProduct(
      type,
      catalog,
      Number(monthMatch[2]),
      monthMatch[3].toLowerCase(),
      { frequency: Number(monthMatch[4]), frequencyUnit: "month" },
      duration,
      phaseFields,
    );
  }

  const intervalMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\s+×\s+1\/(\d+(?:\.\d+)?)d$/i,
  );
  if (intervalMatch) {
    const type = resolveTypeFromLabel(intervalMatch[1].trim(), catalog);
    return buildParsedTobaccoProduct(
      type,
      catalog,
      Number(intervalMatch[2]),
      intervalMatch[3].toLowerCase(),
      { frequency: Number(intervalMatch[4]), frequencyUnit: "interval" },
      duration,
      phaseFields,
    );
  }

  const labeledAmount = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\/day$/i,
  );
  if (labeledAmount) {
    const type = resolveTypeFromLabel(labeledAmount[1].trim(), catalog);
    return buildParsedTobaccoProduct(
      type,
      catalog,
      Number(labeledAmount[2]),
      labeledAmount[3].toLowerCase(),
      {},
      duration,
      phaseFields,
    );
  }

  const typeOnly = resolveTypeFromLabel(trimmed, catalog);
  if (typeOnly.found) {
    return createTobaccoProduct(typeOnly.type, {
      ...(typeOnly.typeOther ? { typeOther: typeOnly.typeOther } : {}),
      ...durationFields(duration),
      ...phaseFields,
    });
  }

  return null;
}

/** True when comma-separated tail is product duration, not the next product clause. */
function isTobaccoDurationContinuation(afterComma: string): boolean {
  return /^\d+(?:\.\d+)?\s*(yr|mo|d)\b/i.test(afterComma.trim());
}

/** Split smoking/smokeless detail clauses on commas outside parentheses. */
export function splitTobaccoDetailClauseParts(details: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < details.length; i++) {
    const ch = details[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      const after = details.slice(i + 1);
      if (isTobaccoDurationContinuation(after)) continue;
      const part = details.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
      while (details[start] === " ") start++;
    }
  }
  const tail = details.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function resolveTypeFromLabel(
  label: string,
  catalog: TobaccoCatalog,
): { type: string; typeOther?: string; found: boolean } {
  const labels = catalog === "smoking" ? SMOKING_TYPE_LABELS : SMOKELESS_TYPE_LABELS;
  const lower = label.toLowerCase();
  for (const [key, display] of Object.entries(labels)) {
    if (display.toLowerCase() === lower || key.toLowerCase() === lower) {
      return { type: key, found: true };
    }
  }
  if (catalog === "smokeless") {
    return { type: "other", typeOther: label, found: true };
  }
  return { type: "other", typeOther: label, found: Boolean(label.trim()) };
}

export function parseLegacySmokingAmountParts(raw: string): Partial<TobaccoUseSection> | null {
  const perDayDuration = raw.match(/^(\d+(?:\.\d+)?)\/day × (\d+(?:\.\d+)?) (yr|mo|d)$/i);
  if (perDayDuration) {
    return {
      products: [
        createTobaccoProduct("cigarette", {
          perDay: Number(perDayDuration[1]),
          perDayUnit: "cigarettes",
        }),
      ],
      years: Number(perDayDuration[2]),
      ...(normalizeStoredDurationUnit(parseDurationToken(perDayDuration[3]))
        ? { yearsUnit: normalizeStoredDurationUnit(parseDurationToken(perDayDuration[3])) }
        : {}),
    };
  }

  const perDayYears = raw.match(/^(\d+(?:\.\d+)?)\/day × (\d+(?:\.\d+)?) yr$/i);
  if (perDayYears) {
    return {
      products: [
        createTobaccoProduct("cigarette", {
          perDay: Number(perDayYears[1]),
          perDayUnit: "cigarettes",
        }),
      ],
      years: Number(perDayYears[2]),
    };
  }

  const perDayOnly = raw.match(/^(\d+(?:\.\d+)?)\/day$/i);
  if (perDayOnly) {
    return {
      products: [
        createTobaccoProduct("cigarette", {
          perDay: Number(perDayOnly[1]),
          perDayUnit: "cigarettes",
        }),
      ],
    };
  }

  return null;
}

export function parseLegacySmokelessAmountParts(raw: string): Partial<TobaccoUseSection> | null {
  const unitAmountMatch = raw.match(
    /^(\d+(?:\.\d+)?)\s*(packets|times|[a-z][a-z-]*)\/day × (\d+(?:\.\d+)?) (yr|mo|d)$/i,
  );
  if (unitAmountMatch) {
    const suffix = unitAmountMatch[2].toLowerCase();
    const partial: Partial<TobaccoUseSection> = {
      products: [
        createTobaccoProduct("gutka", {
          perDay: Number(unitAmountMatch[1]),
          perDayUnit: suffix === "packets" || suffix === "times" ? suffix : "other",
          ...(suffix !== "packets" && suffix !== "times"
            ? { perDayUnitOther: unitAmountMatch[2] }
            : {}),
        }),
      ],
      years: Number(unitAmountMatch[3]),
      ...(normalizeStoredDurationUnit(parseDurationToken(unitAmountMatch[4]))
        ? { yearsUnit: normalizeStoredDurationUnit(parseDurationToken(unitAmountMatch[4])) }
        : {}),
    };
    return partial;
  }

  const legacyMatch = raw.match(/^(\d+(?:\.\d+)?)\/day × (\d+(?:\.\d+)?) (yr|mo|d)$/i);
  if (legacyMatch) {
    return {
      products: [
        createTobaccoProduct("gutka", { perDay: Number(legacyMatch[1]), perDayUnit: "packets" }),
      ],
      years: Number(legacyMatch[2]),
      ...(normalizeStoredDurationUnit(parseDurationToken(legacyMatch[3]))
        ? { yearsUnit: normalizeStoredDurationUnit(parseDurationToken(legacyMatch[3])) }
        : {}),
    };
  }

  const legacyYearsMatch = raw.match(/^(\d+(?:\.\d+)?)\/day × (\d+(?:\.\d+)?) yr$/i);
  if (legacyYearsMatch) {
    return {
      products: [
        createTobaccoProduct("gutka", {
          perDay: Number(legacyYearsMatch[1]),
          perDayUnit: "packets",
        }),
      ],
      years: Number(legacyYearsMatch[2]),
    };
  }

  const packetsMatch = raw.match(/^(\d+(?:\.\d+)?)\s*packets\/day$/i);
  if (packetsMatch) {
    return {
      products: [
        createTobaccoProduct("gutka", {
          perDay: Number(packetsMatch[1]),
          perDayUnit: "packets",
        }),
      ],
    };
  }

  const timesMatch = raw.match(/^(\d+(?:\.\d+)?)\s*times\/day$/i);
  if (timesMatch) {
    return {
      products: [
        createTobaccoProduct("gutka", {
          perDay: Number(timesMatch[1]),
          perDayUnit: "times",
        }),
      ],
    };
  }

  const customMatch = raw.match(/^(\d+(?:\.\d+)?)\s*([a-z][a-z-]*)\/day$/i);
  if (customMatch) {
    const suffix = customMatch[2].toLowerCase();
    return {
      products: [
        createTobaccoProduct("gutka", {
          perDay: Number(customMatch[1]),
          perDayUnit: suffix === "packets" || suffix === "times" ? suffix : "other",
          ...(suffix !== "packets" && suffix !== "times"
            ? { perDayUnitOther: customMatch[2] }
            : {}),
        }),
      ],
    };
  }

  const legacyDay = raw.match(/^(\d+(?:\.\d+)?)\/day$/i);
  if (legacyDay) {
    return {
      products: [
        createTobaccoProduct("gutka", { perDay: Number(legacyDay[1]), perDayUnit: "packets" }),
      ],
    };
  }

  return null;
}
