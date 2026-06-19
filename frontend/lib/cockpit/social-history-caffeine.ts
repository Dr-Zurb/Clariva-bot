/**
 * Caffeine section — structured capture, serialize/parse, clinical hints (sh-caffeine-v2).
 */

import type { SocialHistoryDurationUnit } from "@/lib/cockpit/social-history-indices";
import {
  formatSocialHistoryDurationSuffix,
  normalizeStoredDurationUnit,
  parseSocialHistoryDurationSuffix,
} from "@/lib/cockpit/social-history-indices";

export type CaffeineUseStatus = "never" | "current" | "ex";

export type CaffeineSource = "tea" | "coffee" | "energy" | "other";

export type CaffeineFrequencyUnit =
  | "day"
  | "times_per_day"
  | "week"
  | "fortnight"
  | "month"
  | "interval"
  | "occasional";

export type CaffeinePhase = "current" | "past";

export type CaffeineStrength = "light" | "regular" | "strong" | "custom";

export interface CaffeineUseItem {
  id: string;
  type?: CaffeineSource | string;
  typeOther?: string;
  amount?: number;
  amountUnit?: string;
  amountUnitOther?: string;
  strength?: CaffeineStrength;
  /** Estimated mg caffeine per serving (optional objective value). */
  caffeineMg?: number;
  frequency?: number;
  frequencyUnit?: CaffeineFrequencyUnit;
  years?: number;
  yearsUnit?: SocialHistoryDurationUnit;
  phase?: CaffeinePhase;
  quitYearsAgo?: number;
  quitYearsUnit?: SocialHistoryDurationUnit;
}

export interface CaffeineSectionInput {
  status?: CaffeineUseStatus;
  items: CaffeineUseItem[];
  notes?: string;
  /** @deprecated Legacy flat shape — migrated on normalize. */
  amount?: number;
  source?: CaffeineSource;
  sourceOther?: string;
  frequency?: number;
  frequencyUnit?: CaffeineFrequencyUnit;
  strength?: CaffeineStrength;
}

/** @deprecated Nested on diet — lifted to top-level caffeine on normalize. */
export interface LegacyNestedCaffeineFields {
  caffeineAmount?: number;
  caffeineSource?: CaffeineSource;
  caffeineSourceOther?: string;
  caffeineFrequency?: number;
  caffeineFrequencyUnit?: CaffeineFrequencyUnit;
  caffeineCupsPerDay?: number;
}

export const MAX_CAFFEINE_ITEMS = 10;

export const CAFFEINE_STATUS_OPTIONS = [
  { value: "never" as const, label: "None / minimal" },
  { value: "current" as const, label: "Current use" },
  { value: "ex" as const, label: "Ex-user" },
];

export const CAFFEINE_TYPE_OPTIONS = [
  { value: "tea" as const, label: "Tea" },
  { value: "coffee" as const, label: "Coffee" },
  { value: "energy" as const, label: "Energy drink" },
  { value: "other" as const, label: "Other" },
] as const;

export const CAFFEINE_PRESET_STRENGTHS = ["light", "regular", "strong"] as const;
export type CaffeinePresetStrength = (typeof CAFFEINE_PRESET_STRENGTHS)[number];

export const CAFFEINE_STRENGTH_OPTIONS = [
  { value: "light" as const, label: "Light" },
  { value: "regular" as const, label: "Regular" },
  { value: "strong" as const, label: "Strong" },
  { value: "custom" as const, label: "Custom mg" },
] as const;

/** Serialized TEXT token for status never (not “denies use”). */
export const CAFFEINE_NONE_TEXT = "None";

export const CAFFEINE_COMMON_FREQ_OPTIONS = [
  { value: "day" as const, label: "Every day" },
  { value: "times_per_day" as const, label: "Times per day" },
  { value: "week" as const, label: "Times per week" },
  { value: "occasional" as const, label: "Occasional / rare" },
] as const;

export const CAFFEINE_ADVANCED_FREQ_OPTIONS = [
  { value: "fortnight" as const, label: "Times per fortnight" },
  { value: "month" as const, label: "Times per month" },
  { value: "interval" as const, label: "Every N days" },
] as const;

/** @deprecated Use CAFFEINE_TYPE_OPTIONS */
export const CAFFEINE_SOURCE_OPTIONS = CAFFEINE_TYPE_OPTIONS;

/** @deprecated Use CAFFEINE_COMMON_FREQ_OPTIONS */
export const CAFFEINE_FREQ_OPTIONS = CAFFEINE_COMMON_FREQ_OPTIONS;

export const CAFFEINE_TYPE_LABELS: Record<string, string> = {
  tea: "Tea",
  coffee: "Coffee",
  energy: "Energy drink",
  other: "Other",
};

const CAFFEINE_MG_PRESETS: Record<CaffeineSource, Record<CaffeinePresetStrength, number>> = {
  tea: { light: 30, regular: 47, strong: 70 },
  coffee: { light: 80, regular: 95, strong: 150 },
  energy: { light: 80, regular: 100, strong: 160 },
  other: { light: 50, regular: 80, strong: 120 },
};

const CAFFEINE_SERVING_LABEL: Record<CaffeineSource, string> = {
  tea: "cup/mug of tea",
  coffee: "cup/mug of coffee",
  energy: "can",
  other: "serving",
};

export function caffeineStrengthMgPreset(
  type: CaffeineSource | string | undefined,
  strength: CaffeinePresetStrength,
): number {
  const source = (type && type in CAFFEINE_MG_PRESETS ? type : "other") as CaffeineSource;
  return CAFFEINE_MG_PRESETS[source][strength];
}

/** Tooltip for preset strength chips — approximate mg per serving. */
export function caffeineStrengthTooltip(
  type: CaffeineSource | string | undefined,
  strength: CaffeinePresetStrength,
): string {
  const mg = caffeineStrengthMgPreset(type, strength);
  const source = (type && type in CAFFEINE_SERVING_LABEL ? type : "other") as CaffeineSource;
  const serving = CAFFEINE_SERVING_LABEL[source];
  return `~${mg} mg per ${serving} (approx.; brew and size vary)`;
}

export function caffeineUsesCustomStrength(item: CaffeineUseItem): boolean {
  return item.strength === "custom" || (item.caffeineMg != null && item.strength !== "light" && item.strength !== "strong");
}

let caffeineIdCounter = 0;

export function newCaffeineItemId(): string {
  caffeineIdCounter += 1;
  return `caf-${Date.now()}-${caffeineIdCounter}`;
}

export function ensureCaffeineItemIds(items: CaffeineUseItem[]): CaffeineUseItem[] {
  return items.map((item) => ({
    ...item,
    id: item.id?.trim() ? item.id : newCaffeineItemId(),
  }));
}

export function defaultCaffeineAmountUnit(type?: string): string {
  if (type === "energy") return "cans";
  return "cups";
}

export function amountUnitsForCaffeineType(
  type?: string,
): readonly { value: string; label: string }[] {
  const base = [
    { value: "cups", label: "cups" },
    { value: "mugs", label: "mugs" },
    { value: "glasses", label: "glasses" },
    { value: "ml", label: "ml" },
  ];
  if (type === "energy") {
    return [{ value: "cans", label: "cans" }, ...base, { value: "other", label: "Other" }];
  }
  return [...base, { value: "other", label: "Other" }];
}

export function caffeineAmountUnitSuffix(unit?: string, unitOther?: string): string {
  if (unit === "other") return unitOther?.trim() || "units";
  return unit ?? "cups";
}

export function availableCaffeineAddChips(
  items: CaffeineUseItem[],
): typeof CAFFEINE_TYPE_OPTIONS {
  const usedStandard = new Set(items.filter((i) => i.type && i.type !== "other").map((i) => i.type));
  const hasOther = items.some((i) => i.type === "other");
  return CAFFEINE_TYPE_OPTIONS.filter((opt) => {
    if (opt.value === "other") return !hasOther;
    return !usedStandard.has(opt.value);
  });
}

export function createCaffeineItem(
  type: CaffeineSource | string,
  partial: Partial<Omit<CaffeineUseItem, "id" | "type">> = {},
): CaffeineUseItem {
  return {
    id: newCaffeineItemId(),
    type,
    phase: "current",
    amountUnit: defaultCaffeineAmountUnit(type),
    ...partial,
  };
}

function caffeineDisplayLabel(item: CaffeineUseItem): string {
  if (item.type === "other") {
    return item.typeOther?.trim() || CAFFEINE_TYPE_LABELS.other;
  }
  if (item.type) return CAFFEINE_TYPE_LABELS[item.type] ?? item.type;
  return "Caffeine";
}

function isLegacyFlatCaffeine(input: CaffeineSectionInput): boolean {
  return (
    !Array.isArray(input.items) ||
    (input.items.length === 0 &&
      (input.amount != null ||
        input.source != null ||
        input.strength != null ||
        (input.frequencyUnit != null && input.frequencyUnit !== "day") ||
        input.frequency != null))
  );
}

function migrateFlatToSection(input: CaffeineSectionInput): CaffeineSectionInput {
  const item: CaffeineUseItem = {
    id: newCaffeineItemId(),
    phase: "current",
  };

  if (input.source) item.type = input.source;
  const sourceOther = input.sourceOther?.trim();
  if (input.source === "other" && sourceOther) item.typeOther = sourceOther;

  if (input.amount != null && input.amount >= 0) item.amount = input.amount;
  if (input.source) item.amountUnit = defaultCaffeineAmountUnit(input.source);
  else if (input.amount != null) item.amountUnit = "cups";

  if (input.strength) item.strength = input.strength;

  const freqUnit = input.frequencyUnit ?? (input.amount != null ? "day" : undefined);
  if (freqUnit) item.frequencyUnit = freqUnit;
  if (typeof input.frequency === "number" && input.frequency >= 0) {
    item.frequency = input.frequency;
  }
  if (item.frequencyUnit === "day" && item.amount != null && item.frequency == null) {
    item.frequency = 1;
  }

  const notes = input.notes?.trim();
  return {
    status: "current",
    items: [item],
    ...(notes ? { notes } : {}),
  };
}

function normalizeCaffeineItem(raw: CaffeineUseItem): CaffeineUseItem | null {
  const cleaned: CaffeineUseItem = {
    id: raw.id?.trim() ? raw.id : newCaffeineItemId(),
  };

  if (raw.type) cleaned.type = raw.type;
  const typeOther = raw.typeOther?.trim();
  if (typeOther) cleaned.typeOther = typeOther;

  if (raw.amount != null && raw.amount >= 0) cleaned.amount = raw.amount;
  if (raw.amountUnit) cleaned.amountUnit = raw.amountUnit;
  const amountUnitOther = raw.amountUnitOther?.trim();
  if (amountUnitOther) cleaned.amountUnitOther = amountUnitOther;

  if (raw.strength === "custom") {
    cleaned.strength = "custom";
    if (raw.caffeineMg != null && raw.caffeineMg >= 0) cleaned.caffeineMg = raw.caffeineMg;
  } else if (raw.strength === "light" || raw.strength === "strong") {
    cleaned.strength = raw.strength;
  } else if (raw.caffeineMg != null && raw.caffeineMg >= 0) {
    cleaned.strength = "custom";
    cleaned.caffeineMg = raw.caffeineMg;
  }

  if (raw.frequencyUnit) {
    cleaned.frequencyUnit = raw.frequencyUnit;
    if (typeof raw.frequency === "number" && raw.frequency >= 0) {
      cleaned.frequency = raw.frequency;
    } else if (raw.frequencyUnit === "day") {
      cleaned.frequency = raw.frequency ?? 1;
    }
  }

  if (raw.years != null && raw.years >= 0) cleaned.years = raw.years;
  const storedDurationUnit = normalizeStoredDurationUnit(raw.yearsUnit);
  if (storedDurationUnit) cleaned.yearsUnit = storedDurationUnit;

  if (raw.phase) cleaned.phase = raw.phase;

  if (raw.quitYearsAgo != null && raw.quitYearsAgo >= 0) cleaned.quitYearsAgo = raw.quitYearsAgo;
  const storedQuitUnit = normalizeStoredDurationUnit(raw.quitYearsUnit);
  if (storedQuitUnit) cleaned.quitYearsUnit = storedQuitUnit;

  const hasItemContent =
    cleaned.type ||
    cleaned.amount != null ||
    cleaned.strength ||
    cleaned.caffeineMg != null ||
    cleaned.frequencyUnit ||
    cleaned.frequency != null ||
    cleaned.years != null ||
    cleaned.phase === "past" ||
    cleaned.quitYearsAgo != null;

  return hasItemContent ? cleaned : null;
}

export function normalizeCaffeineSection(
  input: CaffeineSectionInput | null | undefined,
): CaffeineSectionInput | null {
  if (!input) return null;

  let section: CaffeineSectionInput;
  if (isLegacyFlatCaffeine(input)) {
    section = migrateFlatToSection(input);
  } else {
    section = {
      ...input,
      items: ensureCaffeineItemIds(input.items ?? []),
    };
  }

  if (section.status === "never") {
    return { status: "never", items: [] };
  }

  const items = ensureCaffeineItemIds(section.items ?? [])
    .map(normalizeCaffeineItem)
    .filter((item): item is CaffeineUseItem => item != null);

  const notes = section.notes?.trim();
  const status = section.status ?? (items.length > 0 ? "current" : undefined);

  if (status === "never") return { status: "never", items: [] };
  if (!status && items.length === 0 && !notes) return null;

  return {
    ...(status ? { status } : {}),
    items,
    ...(notes ? { notes } : {}),
  };
}

export function caffeineItemsForDisplay(
  section: CaffeineSectionInput | null | undefined,
): CaffeineUseItem[] {
  const normalized = normalizeCaffeineSection(section ?? undefined);
  if (!normalized || normalized.status === "never") return [];
  return normalized.items;
}

export function caffeineHasContent(section: CaffeineSectionInput | null | undefined): boolean {
  const normalized = normalizeCaffeineSection(section ?? undefined);
  if (!normalized) return false;
  if (normalized.status === "never") return true;
  return normalized.items.length > 0 || Boolean(normalized.notes?.trim());
}

export function estimateCaffeineMgPerServing(item: CaffeineUseItem): number | null {
  if (item.strength === "custom" || (item.caffeineMg != null && item.strength !== "light" && item.strength !== "strong")) {
    return item.caffeineMg ?? null;
  }

  const presetStrength: CaffeinePresetStrength =
    item.strength === "light" || item.strength === "strong" ? item.strength : "regular";
  const type = item.type as CaffeineSource | undefined;

  if (item.amountUnit === "ml" && item.amount != null) {
    return Math.round(item.amount * 0.4);
  }

  if (type && CAFFEINE_MG_PRESETS[type as CaffeineSource]) {
    return CAFFEINE_MG_PRESETS[type as CaffeineSource][presetStrength];
  }
  return CAFFEINE_MG_PRESETS.other[presetStrength];
}

export function formatCaffeineFrequencyPhrase(item: CaffeineUseItem): string | null {
  const freqUnit = item.frequencyUnit;
  if (!freqUnit) return null;
  if (freqUnit === "occasional") return "occasional";
  if (freqUnit === "day") return "every day";
  if (freqUnit === "times_per_day") {
    const n = item.frequency ?? 1;
    return `${n} time${n === 1 ? "" : "s"}/day`;
  }
  if (freqUnit === "interval") {
    const n = item.frequency;
    if (n == null) return null;
    return n === 1 ? "every day" : `every ${n} days`;
  }
  const freq = item.frequency;
  if (freq == null) return null;
  if (freqUnit === "fortnight") {
    return `${freq} time${freq === 1 ? "" : "s"} per fortnight`;
  }
  if (freqUnit === "month") {
    return `${freq} time${freq === 1 ? "" : "s"} per month`;
  }
  return `${freq} time${freq === 1 ? "" : "s"} per week`;
}

function serializeQuitPart(item: CaffeineUseItem): string | null {
  if (item.quitYearsAgo == null) return null;
  return `quit ${formatSocialHistoryDurationSuffix(item.quitYearsAgo, item.quitYearsUnit)} ago`;
}

function serializeCaffeineItemClause(item: CaffeineUseItem): string {
  const label = caffeineDisplayLabel(item);
  const parts: string[] = [];

  if (item.amount != null) {
    const unit = caffeineAmountUnitSuffix(
      item.amountUnit ?? defaultCaffeineAmountUnit(item.type),
      item.amountUnitOther,
    );
    if (item.frequencyUnit === "times_per_day") {
      const times = item.frequency ?? 1;
      parts.push(`${item.amount} ${unit} × ${times} times/day`);
    } else if (item.frequencyUnit === "week") {
      const freq = item.frequency ?? 1;
      parts.push(`${item.amount} ${unit} × ${freq}/wk`);
    } else if (item.frequencyUnit === "occasional") {
      parts.push(`occasional ${item.amount} ${unit}`);
    } else {
      parts.push(`${item.amount} ${unit}/day`);
    }
  } else if (item.frequencyUnit === "occasional") {
    parts.push("occasional");
  }

  if (item.strength === "light" || item.strength === "strong") {
    parts.push(item.strength);
  }

  const mg = estimateCaffeineMgPerServing(item);
  if (mg != null) parts.push(`~${mg} mg/serving`);

  const freqPhrase = formatCaffeineFrequencyPhrase(item);
  if (
    freqPhrase &&
    item.frequencyUnit !== "day" &&
    item.frequencyUnit !== "week" &&
    item.frequencyUnit !== "times_per_day" &&
    item.frequencyUnit !== "occasional"
  ) {
    parts.push(freqPhrase);
  } else if (freqPhrase === "every day" && item.amount == null) {
    parts.push(freqPhrase);
  }

  if (item.years != null) {
    parts.push(formatSocialHistoryDurationSuffix(item.years, item.yearsUnit));
  }

  if (item.phase === "past") {
    const quit = serializeQuitPart(item);
    parts.push(quit ? `past; ${quit}` : "past");
  }

  if (parts.length === 0) return label;
  return `${label} (${parts.join(" · ")})`;
}

export function serializeCaffeineSection(section: CaffeineSectionInput): string {
  const normalized = normalizeCaffeineSection(section);
  if (!normalized) return "";

  if (normalized.status === "never") return `Caffeine: ${CAFFEINE_NONE_TEXT}`;

  const itemClauses = normalized.items.map(serializeCaffeineItemClause).filter(Boolean);
  const prefix =
    normalized.status === "ex"
      ? "Ex-user"
      : normalized.status === "current"
        ? "Current use"
        : "";

  const bodyParts: string[] = [];
  if (prefix && itemClauses.length > 0) {
    bodyParts.push(`${prefix} — ${itemClauses.join("; ")}`);
  } else if (prefix) {
    bodyParts.push(prefix);
  } else if (itemClauses.length > 0) {
    bodyParts.push(itemClauses.join("; "));
  }

  if (normalized.notes?.trim()) bodyParts.push(`notes: ${normalized.notes.trim()}`);
  if (bodyParts.length === 0) return "";
  return `Caffeine: ${bodyParts.join(" · ")}`;
}

function parseStrengthToken(token: string): CaffeineStrength | null {
  const lower = token.trim().toLowerCase();
  if (lower === "light" || lower === "strong") return lower;
  if (lower === "regular") return "regular";
  const strengthMatch = lower.match(/^(?:~?\d+\s*mg\/serving\s*·\s*)?(light|regular|strong)$/);
  return strengthMatch ? (strengthMatch[1] as CaffeineStrength) : null;
}

function parseMgToken(token: string): number | null {
  const match = token.trim().match(/^~?(\d+)\s*mg\/serving$/i);
  return match ? Number(match[1]) : null;
}

function parseFrequencyPhrase(token: string): Partial<CaffeineUseItem> {
  const lower = token.toLowerCase().trim();
  if (lower === "occasional" || lower === "rare") return { frequencyUnit: "occasional" };
  if (lower === "daily" || lower === "every day") return { frequencyUnit: "day", frequency: 1 };

  const timesPerDayMatch = lower.match(/^(\d+)\s*time?s?\/day$/);
  if (timesPerDayMatch) {
    return { frequencyUnit: "times_per_day", frequency: Number(timesPerDayMatch[1]) };
  }

  const weekMatch = lower.match(/^(\d+)\s*time?s?\s*per\s*week$/);
  if (weekMatch) return { frequencyUnit: "week", frequency: Number(weekMatch[1]) };

  const monthMatch = lower.match(/^(\d+)\s*time?s?\s*per\s*month$/);
  if (monthMatch) return { frequencyUnit: "month", frequency: Number(monthMatch[1]) };

  const fortnightMatch = lower.match(/^(\d+)\s*time?s?\s*per\s*fortnight$/);
  if (fortnightMatch) return { frequencyUnit: "fortnight", frequency: Number(fortnightMatch[1]) };

  const intervalMatch = lower.match(/^every\s+(\d+)\s*days?$/);
  if (intervalMatch) {
    const n = Number(intervalMatch[1]);
    return n === 1
      ? { frequencyUnit: "day", frequency: 1 }
      : { frequencyUnit: "interval", frequency: n };
  }

  return {};
}

function resolveTypeKey(label: string): CaffeineSource | string | undefined {
  const trimmed = label.trim();
  if (trimmed.toLowerCase() === "caffeine") return undefined;
  const byLabel = Object.entries(CAFFEINE_TYPE_LABELS).find(
    ([, l]) => l.toLowerCase() === trimmed.toLowerCase(),
  )?.[0];
  if (byLabel) return byLabel as CaffeineSource;
  const lower = trimmed.toLowerCase();
  if (lower.includes("tea")) return "tea";
  if (lower.includes("coffee")) return "coffee";
  if (lower.includes("energy")) return "energy";
  if (lower === trimmed.toLowerCase() && !trimmed.includes(" ")) return undefined;
  return trimmed.toLowerCase();
}

function parseQuitToken(token: string): Partial<CaffeineUseItem> {
  const lower = token.toLowerCase().trim();
  if (lower === "past") return { phase: "past" };
  const match = lower.match(/^past;\s*quit\s+(.+)\s+ago$/);
  if (match) {
    const parsed = parseSocialHistoryDurationSuffix(match[1]);
    if (parsed) {
      return {
        phase: "past",
        quitYearsAgo: parsed.value,
        quitYearsUnit: normalizeStoredDurationUnit(parsed.unit),
      };
    }
  }
  const quitMatch = lower.match(/^quit\s+(.+)\s+ago$/);
  if (quitMatch) {
    const parsed = parseSocialHistoryDurationSuffix(quitMatch[1]);
    if (parsed) {
      return {
        phase: "past",
        quitYearsAgo: parsed.value,
        quitYearsUnit: normalizeStoredDurationUnit(parsed.unit),
      };
    }
  }
  return {};
}

function parseCaffeineItemSegment(segment: string): CaffeineUseItem | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  let headline = trimmed;
  let paren = "";
  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    headline = parenMatch[1].trim();
    paren = parenMatch[2];
  }

  const item: CaffeineUseItem = {
    id: newCaffeineItemId(),
    phase: "current",
  };
  const typeKey = resolveTypeKey(headline);
  if (typeKey) item.type = typeKey;

  if (item.type === "other" && headline !== CAFFEINE_TYPE_LABELS.other) {
    item.typeOther = headline;
  }

  if (paren) {
    for (const token of paren.split(/\s*·\s*|\s*,\s*/)) {
      const t = token.trim();
      if (!t) continue;

      const quitPatch = parseQuitToken(t);
      if (quitPatch.phase || quitPatch.quitYearsAgo != null) {
        Object.assign(item, quitPatch);
        continue;
      }

      const mg = parseMgToken(t);
      if (mg != null) {
        item.caffeineMg = mg;
        item.strength = "custom";
        continue;
      }

      const strength = parseStrengthToken(t);
      if (strength) {
        item.strength = strength;
        continue;
      }

      const timesPerDayMatch = t.match(
        /^(\d+(?:\.\d+)?)\s+([a-z][a-z0-9/-]*)\s×\s*(\d+(?:\.\d+)?)\s*times\/day$/i,
      );
      if (timesPerDayMatch) {
        item.amount = Number(timesPerDayMatch[1]);
        item.amountUnit = timesPerDayMatch[2].toLowerCase();
        item.frequencyUnit = "times_per_day";
        item.frequency = Number(timesPerDayMatch[3]);
        continue;
      }

      const weekMatch = t.match(/^(\d+(?:\.\d+)?)\s+([a-z][a-z0-9/-]*)\s×\s*(\d+(?:\.\d+)?)\/wk$/i);
      if (weekMatch) {
        item.amount = Number(weekMatch[1]);
        item.amountUnit = weekMatch[2].toLowerCase();
        item.frequencyUnit = "week";
        item.frequency = Number(weekMatch[3]);
        continue;
      }

      const dayMatch = t.match(/^(\d+(?:\.\d+)?)\s+([a-z][a-z0-9/-]*)\/day$/i);
      if (dayMatch) {
        item.amount = Number(dayMatch[1]);
        item.amountUnit = dayMatch[2].toLowerCase();
        item.frequencyUnit = "day";
        item.frequency = 1;
        continue;
      }

      const occasionalAmountMatch = t.match(/^occasional\s+(\d+(?:\.\d+)?)\s+([a-z][a-z0-9/-]*)$/i);
      if (occasionalAmountMatch) {
        item.amount = Number(occasionalAmountMatch[1]);
        item.amountUnit = occasionalAmountMatch[2].toLowerCase();
        item.frequencyUnit = "occasional";
        continue;
      }

      if (t.toLowerCase() === "occasional") {
        item.frequencyUnit = "occasional";
        continue;
      }

      const freqPatch = parseFrequencyPhrase(t);
      if (freqPatch.frequencyUnit) {
        Object.assign(item, freqPatch);
        continue;
      }

      const yrMatch = parseSocialHistoryDurationSuffix(t);
      if (yrMatch) {
        item.years = yrMatch.value;
        const storedUnit = normalizeStoredDurationUnit(yrMatch.unit);
        if (storedUnit) item.yearsUnit = storedUnit;
      }
    }
  }

  return item;
}

/** Parse legacy flat token (also used by diet TEXT lift). Returns section partial. */
export function parseCaffeineToken(token: string): Partial<CaffeineSectionInput> | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const notesMatch = trimmed.match(/^notes:\s*(.+)$/i);
  if (notesMatch) return { notes: notesMatch[1].trim(), items: [] };

  const legacyMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*cups?\s*caffeine(?:\/day)?(?:\s*×\s*(\d+(?:\.\d+)?)\/wk)?$/i,
  );
  if (legacyMatch) {
    return migrateFlatToSection({
      items: [],
      amount: Number(legacyMatch[1]),
      frequencyUnit: legacyMatch[2] ? "week" : "day",
      frequency: legacyMatch[2] ? Number(legacyMatch[2]) : 1,
    });
  }

  const timesPerDayMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s+(?:(light|regular|strong)\s+)?(.+?)\s×\s*(\d+(?:\.\d+)?)\s*times\/day$/i,
  );
  if (timesPerDayMatch) {
    return migrateFlatToSection(flatPatchFromSourceClause(
      Number(timesPerDayMatch[1]),
      timesPerDayMatch[3],
      timesPerDayMatch[2] as CaffeineStrength | undefined,
      { frequencyUnit: "times_per_day", frequency: Number(timesPerDayMatch[4]) },
    ));
  }

  const cupsTimesPerDayMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*cups?\s*caffeine\s×\s*(\d+(?:\.\d+)?)\s*times\/day$/i,
  );
  if (cupsTimesPerDayMatch) {
    return migrateFlatToSection({
      items: [],
      amount: Number(cupsTimesPerDayMatch[1]),
      frequency: Number(cupsTimesPerDayMatch[2]),
      frequencyUnit: "times_per_day",
    });
  }

  const occasionalMatch = trimmed.match(
    /^occasional\s+(?:(light|regular|strong)\s+)?(.+?)(?:\s*\(~(\d+(?:\.\d+)?)\))?$/i,
  );
  if (occasionalMatch) {
    const patch = flatPatchFromSourceClause(
      occasionalMatch[3] ? Number(occasionalMatch[3]) : undefined,
      occasionalMatch[2],
      occasionalMatch[1] as CaffeineStrength | undefined,
      { frequencyUnit: "occasional" },
    );
    return migrateFlatToSection(patch);
  }

  if (/^occasional$/i.test(trimmed)) {
    return migrateFlatToSection({ items: [], frequencyUnit: "occasional" });
  }

  const weekMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s+(?:(light|regular|strong)\s+)?(.+?)\s×\s*(\d+(?:\.\d+)?)\/wk$/i,
  );
  if (weekMatch) {
    return migrateFlatToSection(flatPatchFromSourceClause(
      Number(weekMatch[1]),
      weekMatch[3],
      weekMatch[2] as CaffeineStrength | undefined,
      { frequencyUnit: "week", frequency: Number(weekMatch[4]) },
    ));
  }

  const dayMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s+(?:(light|regular|strong)\s+)?(tea|coffee|energy(?:\s+drink)?|.+?)\/day$/i,
  );
  if (dayMatch) {
    const sourceToken = dayMatch[3].trim().toLowerCase();
    if (sourceToken === "cups caffeine" || sourceToken === "cups") {
      return migrateFlatToSection({
        items: [],
        amount: Number(dayMatch[1]),
        frequencyUnit: "day",
        frequency: 1,
        strength: dayMatch[2] as CaffeineStrength | undefined,
      });
    }
    return migrateFlatToSection(flatPatchFromSourceClause(
      Number(dayMatch[1]),
      dayMatch[3],
      dayMatch[2] as CaffeineStrength | undefined,
      { frequencyUnit: "day", frequency: 1 },
    ));
  }

  const sourceOnlyMatch = trimmed.match(/^(tea|coffee|energy(?:\s+drink)?)$/i);
  if (sourceOnlyMatch) {
    return migrateFlatToSection(flatPatchFromSourceClause(undefined, sourceOnlyMatch[1], undefined, {}));
  }

  const item = parseCaffeineItemSegment(trimmed);
  if (item) {
    return { status: "current", items: [item] };
  }

  return null;
}

function flatPatchFromSourceClause(
  amount: number | undefined,
  sourceToken: string,
  strength?: CaffeineStrength,
  extra: Partial<CaffeineSectionInput> = {},
): CaffeineSectionInput {
  const patch: CaffeineSectionInput = { items: [], ...extra };
  if (amount != null) patch.amount = amount;
  if (strength) patch.strength = strength;
  const lower = sourceToken.trim().toLowerCase();
  if (lower.includes("tea")) patch.source = "tea";
  else if (lower.includes("coffee")) patch.source = "coffee";
  else if (lower.includes("energy")) patch.source = "energy";
  else if (lower !== "caffeine") {
    patch.source = "other";
    patch.sourceOther = sourceToken.trim();
  }
  return patch;
}

/** Parse the value portion after `Caffeine:` from derived TEXT. */
export function parseCaffeineText(value: string): CaffeineSectionInput {
  const raw = value.trim();
  if (!raw) return { items: [] };
  if (/^(?:denies use|none|no regular use)$/i.test(raw)) return { status: "never", items: [] };

  let status: CaffeineUseStatus | undefined;
  let body = raw;

  if (/^ex-user\s*[—–-]\s*/i.test(body)) {
    status = "ex";
    body = body.replace(/^ex-user\s*[—–-]\s*/i, "");
  } else if (/^current use\s*[—–-]\s*/i.test(body)) {
    status = "current";
    body = body.replace(/^current use\s*[—–-]\s*/i, "");
  } else if (/^ex-user$/i.test(body)) {
    return { status: "ex", items: [] };
  } else if (/^current use$/i.test(body)) {
    return { status: "current", items: [] };
  }

  const notesParts: string[] = [];
  const segments: string[] = [];
  for (const part of body.split(/\s*·\s*/)) {
    const notesMatch = part.match(/^notes:\s*(.+)$/i);
    if (notesMatch) {
      notesParts.push(notesMatch[1].trim());
      continue;
    }
    segments.push(part);
  }

  const items: CaffeineUseItem[] = [];
  for (const segment of segments.join(" · ").split(/\s*;\s*/)) {
    for (const part of segment.split(/\s*,\s*/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const inlineNotes = trimmed.match(/^notes:\s*(.+)$/i);
      if (inlineNotes) {
        notesParts.push(inlineNotes[1].trim());
        continue;
      }

      const tokenPatch = parseCaffeineToken(trimmed);
      if (tokenPatch?.items?.length) {
        items.push(...ensureCaffeineItemIds(tokenPatch.items));
        if (tokenPatch.status && !status) status = tokenPatch.status;
        continue;
      }
      if (tokenPatch?.notes) {
        notesParts.push(tokenPatch.notes);
        continue;
      }

      const parsed = parseCaffeineItemSegment(trimmed);
      if (parsed) items.push(parsed);
    }
  }

  return (
    normalizeCaffeineSection({
      status: status ?? (items.length > 0 ? "current" : undefined),
      items,
      ...(notesParts.length > 0 ? { notes: notesParts.join(" · ") } : {}),
    }) ?? { items: [] }
  );
}

export function mergeCaffeineSections(
  ...parts: (CaffeineSectionInput | null | undefined)[]
): CaffeineSectionInput | null {
  const base: CaffeineSectionInput = { items: [] };
  for (const part of parts) {
    if (!part) continue;
    if (part.status) base.status = part.status;
    if (part.notes?.trim()) base.notes = part.notes.trim();
    base.items = [...base.items, ...(part.items ?? [])];
    if (part.amount != null) base.amount = part.amount;
    if (part.source) base.source = part.source;
    if (part.sourceOther?.trim()) base.sourceOther = part.sourceOther.trim();
    if (part.frequency != null) base.frequency = part.frequency;
    if (part.frequencyUnit) base.frequencyUnit = part.frequencyUnit;
    if (part.strength) base.strength = part.strength;
  }
  return normalizeCaffeineSection(base);
}

export function liftLegacyNestedCaffeine(
  legacy: LegacyNestedCaffeineFields | null | undefined,
): CaffeineSectionInput | null {
  if (!legacy) return null;

  let amount = legacy.caffeineAmount;
  if (amount == null && legacy.caffeineCupsPerDay != null) {
    amount = legacy.caffeineCupsPerDay;
  }

  return normalizeCaffeineSection({
    items: [],
    amount,
    source: legacy.caffeineSource,
    sourceOther: legacy.caffeineSourceOther,
    frequency: legacy.caffeineFrequency,
    frequencyUnit: legacy.caffeineFrequencyUnit,
  });
}

export function effectiveDailyCaffeineAmount(section: CaffeineSectionInput): number | null {
  const normalized = normalizeCaffeineSection(section);
  if (!normalized || normalized.status === "never") return null;

  let total = 0;
  let hasAny = false;

  for (const item of normalized.items) {
    const amount = item.amount;
    if (amount == null) continue;
    const unit = item.frequencyUnit ?? "day";
    let daily = amount;
    if (unit === "times_per_day") {
      daily = amount * (item.frequency ?? 1);
    } else if (unit === "week") {
      daily = (amount * (item.frequency ?? 1)) / 7;
    } else if (unit === "fortnight") {
      daily = (amount * (item.frequency ?? 1)) / 14;
    } else if (unit === "month") {
      daily = (amount * (item.frequency ?? 1)) / 30;
    } else if (unit === "interval") {
      const interval = item.frequency ?? 7;
      daily = interval > 0 ? amount / interval : amount;
    } else if (unit === "occasional") {
      continue;
    }
    total += daily;
    hasAny = true;
  }

  return hasAny ? total : null;
}

export function caffeineClinicalHints(section: CaffeineSectionInput | null | undefined): string[] {
  const normalized = normalizeCaffeineSection(section ?? undefined);
  if (!normalized || normalized.status === "never") return [];

  const daily = effectiveDailyCaffeineAmount(normalized);
  if (daily != null && daily >= 4) {
    return [
      "High caffeine intake — consider sleep, anxiety, or palpitations as contributors.",
    ];
  }
  return [];
}

export function caffeineFrequencyUnitChangePatch(
  item: CaffeineUseItem,
  nextUnit: CaffeineFrequencyUnit,
): Partial<CaffeineUseItem> {
  const patch: Partial<CaffeineUseItem> = { frequencyUnit: nextUnit };
  if (nextUnit === "day") {
    patch.frequency = 1;
  } else if (nextUnit === "occasional") {
    patch.frequency = undefined;
  } else if (nextUnit === "times_per_day" && item.frequency == null) {
    patch.frequency = 2;
  } else if (nextUnit === "interval" && item.frequency == null) {
    patch.frequency = 7;
  } else if (nextUnit === "month" && item.frequency == null) {
    patch.frequency = 1;
  } else if (nextUnit === "fortnight" && item.frequency == null) {
    patch.frequency = 1;
  }
  return patch;
}

/** @deprecated Use caffeineAmountUnitSuffix */
export function caffeineAmountUnitLabel(
  source: CaffeineSource | undefined,
  sourceOther?: string,
): string {
  if (source === "other" && sourceOther?.trim()) return sourceOther.trim();
  if (source === "tea") return "cups tea";
  if (source === "coffee") return "cups coffee";
  if (source === "energy") return "drinks";
  return "cups";
}

/** @deprecated */
export function caffeineFrequencyCountLabel(unit: CaffeineFrequencyUnit): string {
  if (unit === "week") return "/wk";
  if (unit === "times_per_day") return "times/day";
  if (unit === "fortnight") return "per fortnight";
  if (unit === "month") return "per month";
  if (unit === "interval") return "days apart";
  return "";
}

/** @deprecated */
export function caffeineNeedsFrequencyCount(unit: CaffeineFrequencyUnit): boolean {
  return unit === "week" || unit === "times_per_day" || unit === "fortnight" || unit === "month" || unit === "interval";
}
