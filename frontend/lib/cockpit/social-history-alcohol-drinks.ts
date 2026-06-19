import {
  durationToYears,
  type AuditCAnswers,
  type AuditFullAnswers,
  type SocialHistoryDurationUnit,
  formatSocialHistoryDurationSuffix,
  normalizeStoredDurationUnit,
  parseDurationToken,
  parseSocialHistoryDurationSuffix,
} from "@/lib/cockpit/social-history-indices";
import {
  DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
  SOCIAL_HISTORY_THRESHOLDS,
} from "@/lib/cockpit/social-history-thresholds";
import { splitTobaccoDetailClauseParts } from "@/lib/cockpit/social-history-tobacco-products";

export type AlcoholStatus = "never" | "current" | "ex";
export type AlcoholDrinkPhase = "current" | "past";
export type AlcoholFrequencyUnit = "day" | "week" | "fortnight" | "month" | "interval";

export interface AlcoholMaxPerSession {
  amount: number;
  amountUnit?: string;
  amountUnitOther?: string;
}

export interface AlcoholDrinkRow {
  id: string;
  type: string;
  typeOther?: string;
  amount?: number;
  amountUnit?: string;
  amountUnitOther?: string;
  /** Occasions per day or week (see frequencyUnit). */
  frequency?: number;
  frequencyUnit?: AlcoholFrequencyUnit;
  years?: number;
  yearsUnit?: SocialHistoryDurationUnit;
  phase?: AlcoholDrinkPhase;
  quitYearsAgo?: number;
  quitYearsUnit?: SocialHistoryDurationUnit;
  /** Optional ABV override (0–100 %); blank = assumed strength for the drink type. */
  abv?: number;
}

export interface LegacyAlcoholFlatFields {
  types?: string[];
  unitsPerWeek?: number;
}

export interface AlcoholUseSection {
  status: AlcoholStatus;
  drinks: AlcoholDrinkRow[];
  /** @deprecated Use drink row frequency; stripped on normalize. */
  pattern?: "occasional" | "weekend" | "daily" | "binge";
  cage?: {
    cutDown: boolean;
    annoyed: boolean;
    guilty: boolean;
    eyeOpener: boolean;
  };
  auditC?: AuditCAnswers;
  /** WHO AUDIT Q4–Q10 (Q1–Q3 on {@link AuditCAnswers}). */
  auditFull?: AuditFullAnswers;
  /** Max typical amount consumed in one sitting (binge capture; independent of units/week). */
  maxPerSession?: AlcoholMaxPerSession;
  /** @deprecated Migrated to drinks[] on normalize. */
  types?: string[];
  /** @deprecated Migrated to drinks[] on normalize. */
  unitsPerWeek?: number;
  quitYearsAgo?: number;
  quitYearsUnit?: SocialHistoryDurationUnit;
}

export const ALCOHOL_DRINK_TYPES = [
  { value: "spirits", label: "Spirits" },
  { value: "beer", label: "Beer" },
  { value: "wine", label: "Wine" },
  { value: "local", label: "Local" },
  { value: "other", label: "Other" },
] as const;

export const ALCOHOL_AMOUNT_UNITS = [
  { value: "peg", label: "Pegs" },
  { value: "ml", label: "ml" },
  { value: "bottle", label: "Bottles" },
  { value: "can", label: "Cans" },
  { value: "glass", label: "Glasses" },
  { value: "other", label: "Other" },
] as const;

/** UK unit = 10 ml pure ethanol (approximate clinical threshold basis). */
export const UK_ML_ETHANOL_PER_UNIT = 10;

/** Volume of one Indian peg (ml). Used with ABV for unit math — not a strength value. */
export const SPIRITS_ML_PER_UNIT = 30;

/** Assumed spirits/local ABV when Default strength is selected (matches first preset). */
export const STANDARD_SPIRITS_ABV = 0.4;

/** Standard retail bottle sizes used when coercing legacy spirits “bottle” entries. */
export const STANDARD_SPIRITS_BOTTLE_ML = 750;

/** Assumed beer bottle/can size when using container shortcuts (not ABV-specific). */
export const STANDARD_BEER_CONTAINER_ML = 330;

/** Assumed average beer ABV for container/ml shortcuts. */
export const STANDARD_BEER_ABV = 0.05;

/** Assumed wine glass/bottle ABV for shortcuts. */
export const STANDARD_WINE_ABV = 0.12;

export const STANDARD_WINE_GLASS_ML = 175;

export const STANDARD_WINE_BOTTLE_ML = 750;

/** Per-occasion amount caps by unit (ml needs headroom for daily volume). */
export const ALCOHOL_AMOUNT_MAX_BY_UNIT: Record<string, number> = {
  peg: 50,
  ml: 5000,
  bottle: 20,
  can: 20,
  glass: 20,
  other: 200,
};

export function maxAmountForUnit(unit: string): number {
  return ALCOHOL_AMOUNT_MAX_BY_UNIT[unit] ?? ALCOHOL_AMOUNT_MAX_BY_UNIT.other;
}

export function ukUnitsFromVolumeMl(volumeMl: number, abv: number): number {
  const ethanolMl = volumeMl * abv;
  return Math.round((ethanolMl / UK_ML_ETHANOL_PER_UNIT) * 10) / 10;
}

/** ~330 ml beer @ 5% ABV ≈ 1.7 UK units. */
export const STANDARD_BEER_CONTAINER_UNITS = ukUnitsFromVolumeMl(
  STANDARD_BEER_CONTAINER_ML,
  STANDARD_BEER_ABV,
);

/** @deprecated Use STANDARD_BEER_CONTAINER_UNITS. */
export const STANDARD_BEER_BOTTLE_UNITS = STANDARD_BEER_CONTAINER_UNITS;

/** ~750 ml wine bottle @ 12% ABV ≈ 9 UK units. */
export const STANDARD_WINE_BOTTLE_UNITS = ukUnitsFromVolumeMl(
  STANDARD_WINE_BOTTLE_ML,
  STANDARD_WINE_ABV,
);

/** ~175 ml wine glass @ 12% ABV ≈ 2.1 UK units. */
export const STANDARD_WINE_GLASS_UNITS = ukUnitsFromVolumeMl(
  STANDARD_WINE_GLASS_ML,
  STANDARD_WINE_ABV,
);

function defaultAbvDecimalForDrink(drinkType: string): number {
  switch (drinkType.toLowerCase()) {
    case "beer":
      return STANDARD_BEER_ABV;
    case "wine":
      return STANDARD_WINE_ABV;
    default:
      return STANDARD_SPIRITS_ABV;
  }
}

/** Assumed ABV % when the Default strength chip is selected. */
export function defaultAbvPercentForDrink(drinkType: string): number {
  return Math.round(defaultAbvDecimalForDrink(drinkType) * 100);
}

function unitsPerOccasionFromMl(type: string, ml: number): number {
  return ukUnitsFromVolumeMl(ml, defaultAbvDecimalForDrink(type));
}

function spiritsPegUnitsPerOccasion(pegs: number, abvPercent?: number): number {
  const abv =
    abvPercent != null && abvPercent > 0 ? abvPercent / 100 : STANDARD_SPIRITS_ABV;
  return ukUnitsFromVolumeMl(pegs * SPIRITS_ML_PER_UNIT, abv);
}

function beerContainerUnitsPerOccasion(amount: number): number {
  return Math.round(amount * STANDARD_BEER_CONTAINER_UNITS * 10) / 10;
}

/** Amount units offered per drink type (spirits/local: peg or ml only — bottle sizes vary). */
export function amountUnitsForDrinkType(
  type: string,
): readonly (typeof ALCOHOL_AMOUNT_UNITS)[number][] {
  switch (type) {
    case "beer":
      return ALCOHOL_AMOUNT_UNITS.filter((u) =>
        (["bottle", "can", "ml", "other"] as string[]).includes(u.value),
      );
    case "wine":
      return ALCOHOL_AMOUNT_UNITS.filter((u) =>
        (["glass", "bottle", "ml", "other"] as string[]).includes(u.value),
      );
    case "spirits":
    case "local":
      return ALCOHOL_AMOUNT_UNITS.filter((u) =>
        (["peg", "ml", "other"] as string[]).includes(u.value),
      );
    default:
      return ALCOHOL_AMOUNT_UNITS;
  }
}

export const ALCOHOL_TYPE_LABELS: Record<string, string> = {
  beer: "beer",
  wine: "wine",
  spirits: "spirits",
  local: "local",
  other: "other",
};

export const STANDARD_UNITS_PER_WEEK_TOOLTIP =
  "Approximate UK units/week. Default strength assumes typical ABV (spirits 40%, beer 5%, wine 12%). Pick strength % for accuracy. Clinical thresholds only.";

/** @deprecated Read `SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek` for runtime value. */
export const HAZARDOUS_UNITS_PER_WEEK = DEFAULT_SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek;

/** @deprecated Read `SOCIAL_HISTORY_THRESHOLDS.bingeUnitsPerSession` for runtime value. */
export const BINGE_UNITS_PER_SESSION_THRESHOLD =
  DEFAULT_SOCIAL_HISTORY_THRESHOLDS.bingeUnitsPerSession;

export function supportsAbvOverride(unit: string): boolean {
  return ["ml", "bottle", "can", "glass", "peg"].includes(unit);
}

/** Whether the drink row shows an optional strength (ABV) control. */
export function supportsStrengthControl(drinkType: string, unit: string): boolean {
  const normalized = unit.toLowerCase();
  if (["ml", "bottle", "can", "glass"].includes(normalized)) return true;
  if (normalized === "peg" && (drinkType === "spirits" || drinkType === "local")) return true;
  return false;
}

/** True when stored ABV changes the units/week estimate for this row. */
export function abvAffectsUnits(drink: AlcoholDrinkRow): boolean {
  if (drink.abv == null || drink.abv <= 0) return false;
  const unit = (drink.amountUnit ?? defaultAlcoholAmountUnit(drink.type)).toLowerCase();
  return supportsStrengthControl(drink.type, unit);
}

export const SPIRITS_STRENGTH_PRESETS = [40, 42, 43, 48] as const;
export const BEER_STRENGTH_PRESETS = [4, 5, 6, 8] as const;
export const WINE_STRENGTH_PRESETS = [11, 12, 13] as const;

export function strengthPresetsForDrink(type: string): readonly number[] {
  switch (type) {
    case "beer":
      return BEER_STRENGTH_PRESETS;
    case "wine":
      return WINE_STRENGTH_PRESETS;
    case "spirits":
    case "local":
      return SPIRITS_STRENGTH_PRESETS;
    default:
      return [];
  }
}

/** Clear ABV when switching to a unit that cannot express strength. */
export function shouldClearAbvOnUnitChange(
  drinkType: string,
  fromUnit: string,
  toUnit: string,
): boolean {
  return supportsStrengthControl(drinkType, fromUnit) && !supportsStrengthControl(drinkType, toUnit);
}

/** Chip label when no explicit ABV is stored. */
export function strengthDefaultLabel(_drinkType?: string, _unit?: string): string {
  return "Default";
}

/** Tooltip for the Default strength chip — explains assumed ABV %. */
export function strengthDefaultTooltip(drinkType: string, unit: string): string {
  const type = drinkType.toLowerCase();
  const pct = defaultAbvPercentForDrink(type);
  if (type === "spirits" || type === "local") {
    const pegNote =
      unit.toLowerCase() === "peg" ? ` Each peg = ${SPIRITS_ML_PER_UNIT} ml.` : "";
    return `Assumes ${pct}% ABV.${pegNote} Pick a preset or Custom to override.`;
  }
  if (type === "beer") {
    return `Assumes ${pct}% ABV. Pick a preset or Custom for stronger or craft beer.`;
  }
  if (type === "wine") {
    return `Assumes ${pct}% ABV. Pick a preset or Custom for lighter or fortified wine.`;
  }
  return `Assumes ${pct}% ABV. Pick a preset or Custom to override.`;
}

function formatAbvSuffix(abv?: number): string {
  return abv != null && abv > 0 ? ` @${abv}%` : "";
}

function extractAbvFromClause(raw: string): { rest: string; abv?: number } {
  const match = raw.match(/\s+@(\d+(?:\.\d+)?)%/);
  if (!match || match.index == null) return { rest: raw };
  return {
    rest: `${raw.slice(0, match.index)}${raw.slice(match.index + match[0].length)}`,
    abv: Number(match[1]),
  };
}

let drinkIdCounter = 0;

export function newAlcoholDrinkId(): string {
  drinkIdCounter += 1;
  return `alc-${Date.now()}-${drinkIdCounter}`;
}

export function createAlcoholDrink(
  type: string,
  partial: Partial<Omit<AlcoholDrinkRow, "id" | "type">> = {},
): AlcoholDrinkRow {
  return {
    id: partial.id ?? newAlcoholDrinkId(),
    type,
    ...partial,
  };
}

export function drinkPhase(drink: AlcoholDrinkRow): AlcoholDrinkPhase {
  return drink.phase === "past" ? "past" : "current";
}

export function alcoholDrinkDisplayLabel(drink: AlcoholDrinkRow): string {
  if (drink.type === "other") {
    return drink.typeOther?.trim() || "Other";
  }
  return ALCOHOL_DRINK_TYPES.find((t) => t.value === drink.type)?.label ?? drink.type;
}

export function defaultAlcoholAmountUnit(type: string): string {
  switch (type) {
    case "beer":
      return "bottle";
    case "wine":
      return "glass";
    default:
      return "peg";
  }
}

function formatDurationSuffix(value: number, unit?: SocialHistoryDurationUnit): string {
  return formatSocialHistoryDurationSuffix(value, unit);
}

function formatDrinkPhaseClause(drink: AlcoholDrinkRow): string {
  if (drink.quitYearsAgo != null) {
    return ` (past; quit ${formatDurationSuffix(drink.quitYearsAgo, drink.quitYearsUnit)} ago)`;
  }
  if (drinkPhase(drink) === "past") return " (past)";
  return "";
}

function resolveAmountSuffix(unit?: string, unitOther?: string): string {
  if (unit === "other") return unitOther?.trim() || "other";
  if (unit === "peg") return "pegs";
  if (unit === "bottle") return "bottles";
  if (unit === "can") return "cans";
  if (unit === "glass") return "glasses";
  return unit ?? "peg";
}

export function occasionsPerWeekFromDrink(drink: AlcoholDrinkRow): number {
  const freqUnit = drink.frequencyUnit ?? "week";
  const freq = drink.frequency ?? (freqUnit === "day" ? 1 : 0);
  switch (freqUnit) {
    case "day":
      return (drink.frequency ?? 1) * 7;
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

/** Standard UK units for a single occasion (no frequency multiplier). */
export function standardUnitsPerOccasion(
  amount: number,
  amountUnit: string,
  drinkType = "spirits",
  abvPercent?: number,
): number {
  const type = drinkType.toLowerCase();
  const unit = amountUnit.toLowerCase();
  const abvDecimal = abvPercent != null && abvPercent > 0 ? abvPercent / 100 : undefined;

  if (unit === "units" || unit === "unit") {
    return amount;
  }
  switch (unit) {
    case "peg":
    case "pegs":
      if (type === "spirits" || type === "local") {
        return spiritsPegUnitsPerOccasion(amount, abvPercent);
      }
      return amount;
    case "ml":
      if (abvDecimal != null) {
        return ukUnitsFromVolumeMl(amount, abvDecimal);
      }
      return unitsPerOccasionFromMl(type, amount);
    case "bottle":
      if (type === "beer") {
        if (abvDecimal != null) {
          return ukUnitsFromVolumeMl(amount * STANDARD_BEER_CONTAINER_ML, abvDecimal);
        }
        return beerContainerUnitsPerOccasion(amount);
      }
      if (type === "wine") {
        if (abvDecimal != null) {
          return ukUnitsFromVolumeMl(amount * STANDARD_WINE_BOTTLE_ML, abvDecimal);
        }
        return amount * STANDARD_WINE_BOTTLE_UNITS;
      }
      if (abvDecimal != null) {
        return ukUnitsFromVolumeMl(amount * STANDARD_SPIRITS_BOTTLE_ML, abvDecimal);
      }
      return ukUnitsFromVolumeMl(
        amount * STANDARD_SPIRITS_BOTTLE_ML,
        STANDARD_SPIRITS_ABV,
      );
    case "can":
      if (type === "beer") {
        if (abvDecimal != null) {
          return ukUnitsFromVolumeMl(amount * STANDARD_BEER_CONTAINER_ML, abvDecimal);
        }
        return beerContainerUnitsPerOccasion(amount);
      }
      return amount;
    case "glass":
      if (type === "wine") {
        if (abvDecimal != null) {
          return ukUnitsFromVolumeMl(amount * STANDARD_WINE_GLASS_ML, abvDecimal);
        }
        return amount * STANDARD_WINE_GLASS_UNITS;
      }
      return amount;
    default:
      return amount;
  }
}

export function unitsPerSessionFromMax(
  maxPerSession: AlcoholMaxPerSession | undefined | null,
): number | null {
  if (maxPerSession?.amount == null || maxPerSession.amount <= 0) return null;
  const unit = maxPerSession.amountUnit ?? "peg";
  return Math.round(standardUnitsPerOccasion(maxPerSession.amount, unit) * 10) / 10;
}

/** Binge hint from max-in-one-sitting — independent of weekly average. */
export function bingeSessionClinicalHint(
  maxPerSession: AlcoholMaxPerSession | undefined | null,
): string | null {
  const units = unitsPerSessionFromMax(maxPerSession);
  const threshold = SOCIAL_HISTORY_THRESHOLDS.bingeUnitsPerSession;
  if (units == null || units < threshold) return null;
  return `≥${threshold} units in one sitting: binge-pattern drinking — assess further.`;
}

export function formatMaxPerSessionClause(maxPerSession: AlcoholMaxPerSession): string {
  if (maxPerSession.amountUnit === "units") {
    return `max ${maxPerSession.amount} units/session`;
  }
  const unit = resolveAmountSuffix(maxPerSession.amountUnit ?? "peg", maxPerSession.amountUnitOther);
  return `max ${maxPerSession.amount} ${unit}/session`;
}

export function parseMaxPerSessionClause(raw: string): AlcoholMaxPerSession | null {
  const match = raw.trim().match(/^max\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\/session$/i);
  if (!match) return null;
  const unitRaw = match[2].toLowerCase();
  if (unitRaw === "units" || unitRaw === "unit") {
    return { amount: Number(match[1]), amountUnit: "units" };
  }
  const normalized = normalizeAmountUnit(unitRaw);
  return {
    amount: Number(match[1]),
    amountUnit: normalized,
    ...(normalized === "other" ? { amountUnitOther: match[2] } : {}),
  };
}

export function formatAlcoholDrinkAmount(drink: AlcoholDrinkRow): string | null {
  if (drink.amount == null) return null;
  const unit = resolveAmountSuffix(
    drink.amountUnit ?? defaultAlcoholAmountUnit(drink.type),
    drink.amountUnitOther,
  );
  const abvSuffix = formatAbvSuffix(drink.abv);
  const freqUnit = drink.frequencyUnit ?? "week";
  const freq = drink.frequency;
  if (freqUnit === "day" || freq == null) {
    return `${drink.amount} ${unit}${abvSuffix}/day`;
  }
  if (freqUnit === "fortnight") {
    return `${drink.amount} ${unit}${abvSuffix} × ${freq}/2wk`;
  }
  if (freqUnit === "month") {
    return `${drink.amount} ${unit}${abvSuffix} × ${freq}/mo`;
  }
  if (freqUnit === "interval") {
    return `${drink.amount} ${unit}${abvSuffix} × 1/${freq}d`;
  }
  return `${drink.amount} ${unit}${abvSuffix} × ${freq}/wk`;
}

export function alcoholDrinkLabel(drink: AlcoholDrinkRow): string {
  if (drink.type === "other" && drink.typeOther?.trim()) {
    return drink.typeOther.trim();
  }
  return ALCOHOL_TYPE_LABELS[drink.type] ?? drink.type;
}

export function formatAlcoholDrinkClause(drink: AlcoholDrinkRow): string {
  const label = alcoholDrinkLabel(drink);
  const amount = formatAlcoholDrinkAmount(drink);
  let clause = amount ? `${label} ${amount}` : label;
  if (drink.years != null) {
    clause += `, ${formatDurationSuffix(drink.years, drink.yearsUnit)}`;
  }
  clause += formatDrinkPhaseClause(drink);
  return clause;
}

/** Plain-language frequency phrase for UI preview (e.g. "3 times per week"). */
export function formatAlcoholDrinkFrequencyPhrase(drink: AlcoholDrinkRow): string | null {
  const freqUnit = drink.frequencyUnit ?? "week";
  const freq = drink.frequency;
  if (freqUnit === "day") return "every day";
  if (freqUnit === "interval") {
    if (freq == null) return null;
    return freq === 1 ? "every day" : `every ${freq} days`;
  }
  if (freq == null) return null;
  if (freqUnit === "fortnight") {
    return `${freq} time${freq === 1 ? "" : "s"} per fortnight`;
  }
  if (freqUnit === "month") {
    return `${freq} time${freq === 1 ? "" : "s"} per month`;
  }
  return `${freq} time${freq === 1 ? "" : "s"} per week`;
}

/** Readable one-line summary for the drink row UI. */
export function formatAlcoholDrinkPreviewSentence(drink: AlcoholDrinkRow): string | null {
  if (drink.amount == null) return null;
  const label = alcoholDrinkDisplayLabel(drink);
  const unit = resolveAmountSuffix(
    drink.amountUnit ?? defaultAlcoholAmountUnit(drink.type),
    drink.amountUnitOther,
  );
  const abvPart = abvAffectsUnits(drink) ? ` @ ${drink.abv}%` : "";
  const amountPart = `${drink.amount} ${unit}${abvPart}`;
  const freqPhrase = formatAlcoholDrinkFrequencyPhrase(drink);
  const parts = [label, amountPart];
  if (freqPhrase) parts.push(freqPhrase);
  if (drink.years != null) {
    parts.push(
      drink.yearsUnit === "months"
        ? `for ${drink.years} months`
        : drink.yearsUnit === "days"
          ? `for ${drink.years} days`
          : `for ${drink.years} years`,
    );
  }
  if (drink.quitYearsAgo != null) {
    parts.push(
      drink.quitYearsUnit === "months"
        ? `quit ${drink.quitYearsAgo} months ago`
        : drink.quitYearsUnit === "days"
          ? `quit ${drink.quitYearsAgo} days ago`
          : `quit ${drink.quitYearsAgo} years ago`,
    );
  }
  return parts.join(" · ");
}

/** Standard units for one drink row (approximate). */
export function standardUnitsForDrink(drink: AlcoholDrinkRow): number | null {
  if (drink.amount == null || drink.amount <= 0) return null;
  const type = drink.type.toLowerCase();
  const unit = (drink.amountUnit ?? defaultAlcoholAmountUnit(type)).toLowerCase();
  const unitsPerOccasion = standardUnitsPerOccasion(drink.amount, unit, type, drink.abv);
  const occasionsPerWeek = occasionsPerWeekFromDrink(drink);
  if (occasionsPerWeek <= 0) return null;
  return Math.round(unitsPerOccasion * occasionsPerWeek * 10) / 10;
}

/** Non-diagnostic action hints from units/week and CAGE (shown in separate UI zones). */
export function alcoholClinicalHints(
  unitsPerWeek: number | null,
  cage: { positive: boolean } | null | undefined,
): { intakeHint: string | null; cageHint: string | null } {
  const hazardous =
    unitsPerWeek != null && unitsPerWeek > SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek;
  const cagePositive = cage?.positive === true;
  return {
    intakeHint: hazardous
      ? "High intake: consider brief intervention for hazardous drinking."
      : null,
    cageHint: cagePositive
      ? "CAGE positive: consider further alcohol assessment."
      : null,
  };
}

/** @deprecated Use alcoholClinicalHints for split intake/CAGE hints. */
export function alcoholClinicalActionHint(
  unitsPerWeek: number | null,
  cage: { positive: boolean } | null | undefined,
): string | null {
  const { intakeHint, cageHint } = alcoholClinicalHints(unitsPerWeek, cage);
  if (intakeHint && cageHint) {
    return "Consider brief intervention and further alcohol assessment.";
  }
  return intakeHint ?? cageHint;
}

export function standardUnitsPerWeekFromDrinks(
  drinks: AlcoholDrinkRow[],
): { unitsPerWeek: number | null; hasIncomplete: boolean } {
  let total = 0;
  let hasAny = false;
  let hasIncomplete = false;

  for (const drink of drinks) {
    if (drinkPhase(drink) === "past" && drink.quitYearsAgo != null) {
      // still counts past use for lifetime context — include in weekly estimate if amount filled
    }
    const rowUnits = standardUnitsForDrink(drink);
    if (rowUnits != null) {
      total += rowUnits;
      hasAny = true;
    } else if (drink.amount != null && drink.amount > 0) {
      hasIncomplete = true;
    }
  }

  if (!hasAny) return { unitsPerWeek: null, hasIncomplete };
  return {
    unitsPerWeek: Math.round(total * 10) / 10,
    hasIncomplete,
  };
}

function parseDrinkPhaseSuffix(raw: string): {
  rest: string;
  phase?: AlcoholDrinkPhase;
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

function resolveTypeFromLabel(label: string): {
  type: string;
  typeOther?: string;
  found: boolean;
} {
  const lower = label.toLowerCase();
  const found = Object.entries(ALCOHOL_TYPE_LABELS).find(([, v]) => v === lower)?.[0];
  if (found) return { type: found, found: true };
  if (lower === "whisky" || lower === "whiskey" || lower === "rum") {
    return { type: "spirits", found: true };
  }
  if (label.trim()) return { type: "other", typeOther: label.trim(), found: true };
  return { type: "other", found: false };
}

export function parseAlcoholDrinkClause(raw: string): AlcoholDrinkRow | null {
  let trimmed = raw.trim();
  if (!trimmed) return null;

  const phaseParsed = parseDrinkPhaseSuffix(trimmed);
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

  const abvParsed = extractAbvFromClause(trimmed);
  trimmed = abvParsed.rest;
  const abvFields = abvParsed.abv != null ? { abv: abvParsed.abv } : {};

  const weeklyMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\s+×\s+(\d+(?:\.\d+)?)\/wk$/i,
  );
  if (weeklyMatch) {
    const type = resolveTypeFromLabel(weeklyMatch[1].trim());
    const unitRaw = weeklyMatch[3].toLowerCase();
    return createAlcoholDrink(type.type, {
      ...(type.typeOther ? { typeOther: type.typeOther } : {}),
      amount: Number(weeklyMatch[2]),
      amountUnit: normalizeAmountUnit(unitRaw),
      ...(unitRaw === "other" ? { amountUnitOther: weeklyMatch[3] } : {}),
      frequency: Number(weeklyMatch[4]),
      frequencyUnit: "week",
            ...(duration
              ? {
                  years: duration.value,
                  ...(() => {
                    const unit = normalizeStoredDurationUnit(duration.unit);
                    return unit ? { yearsUnit: unit } : {};
                  })(),
                }
              : {}),
      ...phaseFields,
      ...abvFields,
    });
  }

  const fortnightMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\s+×\s+(\d+(?:\.\d+)?)\/2wk$/i,
  );
  if (fortnightMatch) {
    const type = resolveTypeFromLabel(fortnightMatch[1].trim());
    const unitRaw = fortnightMatch[3].toLowerCase();
    return createAlcoholDrink(type.type, {
      ...(type.typeOther ? { typeOther: type.typeOther } : {}),
      amount: Number(fortnightMatch[2]),
      amountUnit: normalizeAmountUnit(unitRaw),
      ...(unitRaw === "other" ? { amountUnitOther: fortnightMatch[3] } : {}),
      frequency: Number(fortnightMatch[4]),
      frequencyUnit: "fortnight",
            ...(duration
              ? {
                  years: duration.value,
                  ...(() => {
                    const unit = normalizeStoredDurationUnit(duration.unit);
                    return unit ? { yearsUnit: unit } : {};
                  })(),
                }
              : {}),
      ...phaseFields,
      ...abvFields,
    });
  }

  const monthlyMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\s+×\s+(\d+(?:\.\d+)?)\/mo$/i,
  );
  if (monthlyMatch) {
    const type = resolveTypeFromLabel(monthlyMatch[1].trim());
    const unitRaw = monthlyMatch[3].toLowerCase();
    return createAlcoholDrink(type.type, {
      ...(type.typeOther ? { typeOther: type.typeOther } : {}),
      amount: Number(monthlyMatch[2]),
      amountUnit: normalizeAmountUnit(unitRaw),
      ...(unitRaw === "other" ? { amountUnitOther: monthlyMatch[3] } : {}),
      frequency: Number(monthlyMatch[4]),
      frequencyUnit: "month",
            ...(duration
              ? {
                  years: duration.value,
                  ...(() => {
                    const unit = normalizeStoredDurationUnit(duration.unit);
                    return unit ? { yearsUnit: unit } : {};
                  })(),
                }
              : {}),
      ...phaseFields,
      ...abvFields,
    });
  }

  const intervalMatch = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\s+×\s+1\/(\d+(?:\.\d+)?)d$/i,
  );
  if (intervalMatch) {
    const type = resolveTypeFromLabel(intervalMatch[1].trim());
    const unitRaw = intervalMatch[3].toLowerCase();
    return createAlcoholDrink(type.type, {
      ...(type.typeOther ? { typeOther: type.typeOther } : {}),
      amount: Number(intervalMatch[2]),
      amountUnit: normalizeAmountUnit(unitRaw),
      ...(unitRaw === "other" ? { amountUnitOther: intervalMatch[3] } : {}),
      frequency: Number(intervalMatch[4]),
      frequencyUnit: "interval",
            ...(duration
              ? {
                  years: duration.value,
                  ...(() => {
                    const unit = normalizeStoredDurationUnit(duration.unit);
                    return unit ? { yearsUnit: unit } : {};
                  })(),
                }
              : {}),
      ...phaseFields,
      ...abvFields,
    });
  }

  const dailyMatch = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)\/day$/i);
  if (dailyMatch) {
    const type = resolveTypeFromLabel(dailyMatch[1].trim());
    const unitRaw = dailyMatch[3].toLowerCase();
    return createAlcoholDrink(type.type, {
      ...(type.typeOther ? { typeOther: type.typeOther } : {}),
      amount: Number(dailyMatch[2]),
      amountUnit: normalizeAmountUnit(unitRaw),
      ...(unitRaw === "other" ? { amountUnitOther: dailyMatch[3] } : {}),
      frequency: 1,
      frequencyUnit: "day",
            ...(duration
              ? {
                  years: duration.value,
                  ...(() => {
                    const unit = normalizeStoredDurationUnit(duration.unit);
                    return unit ? { yearsUnit: unit } : {};
                  })(),
                }
              : {}),
      ...phaseFields,
      ...abvFields,
    });
  }

  const typeOnly = resolveTypeFromLabel(trimmed);
  if (typeOnly.found) {
    return createAlcoholDrink(typeOnly.type, {
      ...(typeOnly.typeOther ? { typeOther: typeOnly.typeOther } : {}),
            ...(duration
              ? {
                  years: duration.value,
                  ...(() => {
                    const unit = normalizeStoredDurationUnit(duration.unit);
                    return unit ? { yearsUnit: unit } : {};
                  })(),
                }
              : {}),
      ...phaseFields,
      ...abvFields,
    });
  }

  return null;
}

function normalizeAmountUnit(raw: string): string {
  const standard = new Set([
    "peg",
    "pegs",
    "ml",
    "bottle",
    "bottles",
    "can",
    "cans",
    "glass",
    "glasses",
  ]);
  if (standard.has(raw)) {
    if (raw === "pegs") return "peg";
    if (raw === "bottles") return "bottle";
    if (raw === "cans") return "can";
    if (raw === "glasses") return "glass";
    return raw;
  }
  return "other";
}

function clampAmountForUnit(amount: number | undefined, unit: string): number | undefined {
  if (amount == null) return undefined;
  return Math.min(amount, maxAmountForUnit(unit));
}

function coerceAmountUnitForDrinkType(drink: AlcoholDrinkRow): AlcoholDrinkRow {
  const unit = drink.amountUnit ?? defaultAlcoholAmountUnit(drink.type);
  const allowed = new Set(amountUnitsForDrinkType(drink.type).map((u) => u.value));

  if (allowed.has(unit)) return drink;

  // Legacy: spirits/local entered as “bottle” → convert to ml (750 ml per bottle).
  if (
    (drink.type === "spirits" || drink.type === "local") &&
    unit === "bottle" &&
    drink.amount != null
  ) {
    return {
      ...drink,
      amount: drink.amount * STANDARD_SPIRITS_BOTTLE_ML,
      amountUnit: "ml",
      amountUnitOther: undefined,
    };
  }

  // Disallowed unit (e.g. glass on spirits) → reset to type default.
  return {
    ...drink,
    amountUnit: undefined,
    amountUnitOther: undefined,
  };
}

function normalizeDrinkRow(drink: AlcoholDrinkRow): AlcoholDrinkRow {
  const coerced = coerceAmountUnitForDrinkType(drink);
  const row: AlcoholDrinkRow = {
    id: coerced.id || newAlcoholDrinkId(),
    type: coerced.type,
  };
  if (coerced.typeOther != null && coerced.typeOther !== "") row.typeOther = coerced.typeOther;
  const defaultUnit = defaultAlcoholAmountUnit(coerced.type);
  const unit = coerced.amountUnit ?? defaultUnit;
  if (coerced.amount != null) row.amount = clampAmountForUnit(coerced.amount, unit);
  if (unit !== defaultUnit) row.amountUnit = unit;
  if (unit === "other" && coerced.amountUnitOther) row.amountUnitOther = coerced.amountUnitOther;
  if (coerced.frequency != null) row.frequency = coerced.frequency;
  if (coerced.frequencyUnit) row.frequencyUnit = coerced.frequencyUnit;
  if (coerced.years != null) row.years = coerced.years;
  const storedYearsUnit = normalizeStoredDurationUnit(coerced.yearsUnit);
  if (storedYearsUnit) row.yearsUnit = storedYearsUnit;
  if (coerced.phase === "past") row.phase = "past";
  if (coerced.quitYearsAgo != null) row.quitYearsAgo = coerced.quitYearsAgo;
  const storedQuitUnit = normalizeStoredDurationUnit(coerced.quitYearsUnit);
  if (storedQuitUnit) row.quitYearsUnit = storedQuitUnit;
  if (coerced.abv != null && coerced.abv > 0 && coerced.abv <= 100) {
    row.abv = Math.round(coerced.abv * 10) / 10;
  }
  return row;
}

function migrateLegacyAlcoholDrinks(legacy: LegacyAlcoholFlatFields): AlcoholDrinkRow[] {
  const types = legacy.types ?? [];
  if (types.length === 0) {
    if (legacy.unitsPerWeek == null) return [];
    return [
      createAlcoholDrink("spirits", {
        frequency: legacy.unitsPerWeek,
        frequencyUnit: "week",
        amount: 1,
        amountUnit: "peg",
      }),
    ];
  }
  return types.map((type) => createAlcoholDrink(type));
}

function migrateSectionQuitToDrinks(
  drinks: AlcoholDrinkRow[],
  quitYearsAgo?: number,
  quitYearsUnit?: SocialHistoryDurationUnit,
): AlcoholDrinkRow[] {
  if (quitYearsAgo == null || drinks.length === 0 || drinks.some((d) => d.quitYearsAgo != null)) {
    return drinks;
  }
  return drinks.map((drink) => ({
    ...drink,
    quitYearsAgo,
    ...(normalizeStoredDurationUnit(quitYearsUnit)
      ? { quitYearsUnit: normalizeStoredDurationUnit(quitYearsUnit) }
      : {}),
  }));
}

function normalizeMaxPerSession(
  input: AlcoholMaxPerSession | undefined | null,
): AlcoholMaxPerSession | undefined {
  if (!input?.amount || input.amount <= 0) return undefined;
  const unit = input.amountUnit ?? "peg";
  const next: AlcoholMaxPerSession = {
    amount: Math.min(input.amount, maxAmountForUnit(unit)),
    amountUnit: unit === "peg" ? undefined : unit,
  };
  if (unit === "other" && input.amountUnitOther) {
    next.amountUnit = "other";
    next.amountUnitOther = input.amountUnitOther;
  }
  if (unit === "units") {
    next.amountUnit = "units";
    next.amount = Math.min(input.amount, 50);
  }
  return next;
}

export function normalizeAlcoholSection(
  input: (AlcoholUseSection & LegacyAlcoholFlatFields) | null | undefined,
): AlcoholUseSection | undefined {
  if (!input) return undefined;

  let drinks =
    input.drinks && input.drinks.length > 0
      ? input.drinks.map(normalizeDrinkRow)
      : migrateLegacyAlcoholDrinks(input);

  let sectionQuit = input.quitYearsAgo;
  let sectionQuitUnit = input.quitYearsUnit;
  if (input.status === "ex" && sectionQuit != null) {
    drinks = migrateSectionQuitToDrinks(drinks, sectionQuit, sectionQuitUnit);
    sectionQuit = undefined;
    sectionQuitUnit = undefined;
  }

  const next: AlcoholUseSection = {
    status: input.status,
    drinks,
  };

  if (input.cage) {
    next.cage = { ...input.cage };
  }

  if (input.auditC) {
    const auditC = normalizeAuditCAnswers(input.auditC);
    if (auditC) next.auditC = auditC;
  }

  if (input.auditFull) {
    const auditFull = normalizeAuditFullAnswers(input.auditFull);
    if (auditFull) next.auditFull = auditFull;
  }

  if (input.maxPerSession) {
    const maxPerSession = normalizeMaxPerSession(input.maxPerSession);
    if (maxPerSession) next.maxPerSession = maxPerSession;
  }

  return next;
}

function normalizeAuditCAnswers(input: AuditCAnswers): AuditCAnswers | undefined {
  const next: AuditCAnswers = {};
  if (input.enabled === true) next.enabled = true;
  for (const key of ["frequency", "typicalQuantity", "bingeFrequency"] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4) {
      next[key] = value;
    }
  }
  const hasAnswers =
    next.frequency != null || next.typicalQuantity != null || next.bingeFrequency != null;
  if (!hasAnswers && !next.enabled) return undefined;
  return next;
}

function normalizeAuditFullAnswers(input: AuditFullAnswers): AuditFullAnswers | undefined {
  const next: AuditFullAnswers = {};
  if (input.enabled === true) next.enabled = true;

  const frequencyKeys = [
    "unableToStop",
    "failedExpectations",
    "morningDrink",
    "guiltRemorse",
    "blackout",
  ] as const;
  for (const key of frequencyKeys) {
    const value = input[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4) {
      next[key] = value;
    }
  }

  for (const key of ["injury", "othersConcerned"] as const) {
    const value = input[key];
    if (value === 0 || value === 2 || value === 4) {
      next[key] = value;
    }
  }

  const hasAnswers =
    next.unableToStop != null ||
    next.failedExpectations != null ||
    next.morningDrink != null ||
    next.guiltRemorse != null ||
    next.blackout != null ||
    next.injury != null ||
    next.othersConcerned != null;
  if (!hasAnswers && !next.enabled) return undefined;
  return next;
}

export function splitAlcoholDetailClauseParts(details: string): string[] {
  return splitTobaccoDetailClauseParts(details);
}
