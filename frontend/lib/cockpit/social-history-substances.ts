/**
 * Substances section — structured capture, serialize/parse, clinical hints (sh-substances-v2).
 */

import type { SocialHistoryDurationUnit } from "@/lib/cockpit/social-history-indices";
import {
  formatSocialHistoryDurationSuffix,
  normalizeStoredDurationUnit,
  parseSocialHistoryDurationSuffix,
} from "@/lib/cockpit/social-history-indices";
import { resolveClinicalRegion } from "@/lib/config/clinical-region";

export type SubstanceUseStatus = "never" | "current" | "ex";

export type SubstanceType =
  | "cannabis"
  | "bhanga"
  | "opioids"
  | "prescription-opioids"
  | "sedatives"
  | "stimulants"
  | "inhalants"
  | "other";

export type SubstanceRoute =
  | "oral"
  | "inhaled"
  | "iv"
  | "snorted"
  | "smoked"
  | "other";

export type SubstanceFrequencyUnit =
  | "day"
  | "week"
  | "fortnight"
  | "month"
  | "interval"
  | "occasional";

/** @deprecated Legacy coarse frequency — migrated on normalize. */
export type SubstanceFrequencyLegacy = "daily" | "weekly" | "occasional";

export type SubstancePhase = "current" | "past";

export interface SubstanceUseItem {
  id: string;
  type: SubstanceType | string;
  typeOther?: string;
  route?: SubstanceRoute;
  routeOther?: string;
  amount?: number;
  amountUnit?: string;
  amountUnitOther?: string;
  /** Occasions per period (see frequencyUnit). */
  frequency?: number;
  frequencyUnit?: SubstanceFrequencyUnit;
  years?: number;
  yearsUnit?: SocialHistoryDurationUnit;
  phase?: SubstancePhase;
}

export interface SubstancesSectionInput {
  status?: SubstanceUseStatus;
  items: SubstanceUseItem[];
  notes?: string;
  /** @deprecated Legacy flat shape — migrated on normalize. */
  uses?: string[];
  route?: "oral" | "inhaled" | "iv";
}

export const MAX_SUBSTANCE_ITEMS = 10;

export const SUBSTANCE_STATUS_OPTIONS = [
  { value: "never" as const, label: "None / denies use" },
  { value: "current" as const, label: "Current use" },
  { value: "ex" as const, label: "Ex-user" },
];

export const SUBSTANCE_ROUTE_OPTIONS = [
  { value: "oral" as const, label: "Oral" },
  { value: "inhaled" as const, label: "Inhaled" },
  { value: "smoked" as const, label: "Smoked" },
  { value: "snorted" as const, label: "Snorted" },
  { value: "iv" as const, label: "IV" },
  { value: "other" as const, label: "Other" },
] as const;

export const SUBSTANCE_COMMON_FREQ_OPTIONS = [
  { value: "day" as const, label: "Every day" },
  { value: "week" as const, label: "Times per week" },
  { value: "occasional" as const, label: "Occasional / rare" },
] as const;

export const SUBSTANCE_ADVANCED_FREQ_OPTIONS = [
  { value: "fortnight" as const, label: "Times per fortnight" },
  { value: "month" as const, label: "Times per month" },
  { value: "interval" as const, label: "Every N days" },
] as const;

const BASE_SUBSTANCE_TYPE_OPTIONS: readonly {
  value: SubstanceType;
  label: string;
  tooltip?: string;
}[] = [
  { value: "cannabis", label: "Cannabis" },
  {
    value: "sedatives",
    label: "Sedatives / benzos",
    tooltip: "Includes non-prescribed benzodiazepines and sleeping pills",
  },
  {
    value: "stimulants",
    label: "Stimulants",
    tooltip: "Includes prescription stimulant misuse (e.g. amphetamines)",
  },
  { value: "opioids", label: "Opioids (illicit)" },
];

const SUBSTANCE_OTHER_OPTION = { value: "other" as const, label: "Other" };

const INDIA_EXTRA_SUBSTANCE_TYPE_OPTIONS: readonly {
  value: SubstanceType;
  label: string;
  tooltip?: string;
}[] = [
  { value: "bhanga", label: "Bhanga / cannabis (local)" },
  {
    value: "prescription-opioids",
    label: "Rx opioids (misuse)",
    tooltip: "Tramadol, codeine combinations, etc.",
  },
  { value: "inhalants", label: "Inhalants / glue", tooltip: "Volatile solvents, glue, thinners" },
];

/** Broad categories where optional agent name (typeOther) is clinically useful. */
export const SUBSTANCE_AGENT_NAME_TYPES: readonly SubstanceType[] = [
  "sedatives",
  "stimulants",
  "opioids",
  "prescription-opioids",
  "inhalants",
];

export function substanceSupportsAgentName(type: string): boolean {
  return (SUBSTANCE_AGENT_NAME_TYPES as readonly string[]).includes(type);
}

function sortSubstanceOptionsOtherLast<
  T extends { value: SubstanceType; label: string; tooltip?: string },
>(options: readonly T[]): T[] {
  const other = options.find((opt) => opt.value === "other");
  const rest = options.filter((opt) => opt.value !== "other");
  return other ? [...rest, other] : [...rest];
}

/** Region-aware substance type catalog for add chips. */
export function substanceTypeOptions(): readonly {
  value: SubstanceType;
  label: string;
  tooltip?: string;
}[] {
  const region = resolveClinicalRegion();
  if (region === "IN") {
    const seen = new Set<string>();
    const merged = [...BASE_SUBSTANCE_TYPE_OPTIONS, ...INDIA_EXTRA_SUBSTANCE_TYPE_OPTIONS].filter(
      (opt) => {
        if (seen.has(opt.value)) return false;
        seen.add(opt.value);
        return true;
      },
    );
    return sortSubstanceOptionsOtherLast([...merged, SUBSTANCE_OTHER_OPTION]);
  }
  return sortSubstanceOptionsOtherLast([...BASE_SUBSTANCE_TYPE_OPTIONS, SUBSTANCE_OTHER_OPTION]);
}

/** Add chips for types not yet on the chart (tobacco-style). */
export function availableSubstanceAddChips(
  items: SubstanceUseItem[],
): ReturnType<typeof substanceTypeOptions> {
  const usedStandard = new Set(items.filter((i) => i.type !== "other").map((i) => i.type));
  const hasOther = items.some((i) => i.type === "other");
  return substanceTypeOptions().filter((opt) => {
    if (opt.value === "other") return !hasOther;
    return !usedStandard.has(opt.value);
  });
}

export const SUBSTANCE_TYPE_LABELS: Record<string, string> = {
  cannabis: "Cannabis",
  bhanga: "Bhanga",
  opioids: "Opioids",
  "prescription-opioids": "Rx opioids",
  sedatives: "Sedatives",
  stimulants: "Stimulants",
  inhalants: "Inhalants",
  other: "Other",
};

export function defaultSubstanceAmountUnit(type: string): string {
  switch (type) {
    case "sedatives":
    case "stimulants":
      return "tablets";
    case "cannabis":
    case "bhanga":
      return "joints";
    case "opioids":
    case "prescription-opioids":
      return "doses";
    case "inhalants":
      return "sessions";
    default:
      return "other";
  }
}

export function amountUnitsForSubstanceType(
  type: string,
): readonly { value: string; label: string }[] {
  switch (type) {
    case "sedatives":
      return [
        { value: "tablets", label: "tablets" },
        { value: "mg", label: "mg" },
        { value: "other", label: "Other" },
      ];
    case "stimulants":
      return [
        { value: "tablets", label: "tablets" },
        { value: "doses", label: "doses" },
        { value: "other", label: "Other" },
      ];
    case "cannabis":
    case "bhanga":
      return [
        { value: "joints", label: "joints" },
        { value: "g", label: "g" },
        { value: "sessions", label: "sessions" },
        { value: "other", label: "Other" },
      ];
    case "opioids":
    case "prescription-opioids":
      return [
        { value: "doses", label: "doses" },
        { value: "bags", label: "bags" },
        { value: "other", label: "Other" },
      ];
    case "inhalants":
      return [
        { value: "sessions", label: "sessions" },
        { value: "other", label: "Other" },
      ];
    default:
      return [{ value: "other", label: "Other" }];
  }
}

export function substanceAmountUnitSuffix(unit?: string, unitOther?: string): string {
  if (unit === "other") return unitOther?.trim() || "units";
  if (unit === "tablets") return "tablets";
  if (unit === "joints") return "joints";
  if (unit === "sessions") return "sessions";
  if (unit === "doses") return "doses";
  if (unit === "bags") return "bags";
  if (unit === "mg") return "mg";
  if (unit === "g") return "g";
  return unit ?? "units";
}

let substanceIdCounter = 0;

export function newSubstanceItemId(): string {
  substanceIdCounter += 1;
  return `sub-${Date.now()}-${substanceIdCounter}`;
}

export function ensureSubstanceItemIds(items: SubstanceUseItem[]): SubstanceUseItem[] {
  return items.map((item) => ({
    ...item,
    id: item.id?.trim() ? item.id : newSubstanceItemId(),
  }));
}

function substanceDisplayLabel(item: SubstanceUseItem): string {
  if (item.type === "other") {
    return item.typeOther?.trim() || SUBSTANCE_TYPE_LABELS.other;
  }
  return SUBSTANCE_TYPE_LABELS[item.type] ?? item.type;
}

function migrateLegacyFrequency(item: Record<string, unknown>): Partial<SubstanceUseItem> {
  const raw = item.frequency;
  if (typeof raw !== "string") return {};
  if (raw === "daily") return { frequencyUnit: "day", frequency: 1 };
  if (raw === "weekly") return { frequencyUnit: "week" };
  if (raw === "occasional") return { frequencyUnit: "occasional" };
  return {};
}

function normalizeSubstanceItem(raw: SubstanceUseItem): SubstanceUseItem {
  const legacyFreq = migrateLegacyFrequency(raw as unknown as Record<string, unknown>);
  const cleaned: SubstanceUseItem = {
    id: raw.id,
    type: raw.type,
  };
  const typeOther = raw.typeOther?.trim();
  if (typeOther) cleaned.typeOther = typeOther;
  if (raw.route) cleaned.route = raw.route;
  const routeOther = raw.routeOther?.trim();
  if (routeOther) cleaned.routeOther = routeOther;

  if (raw.amount != null && raw.amount > 0) cleaned.amount = raw.amount;
  if (raw.amountUnit) cleaned.amountUnit = raw.amountUnit;
  const amountUnitOther = raw.amountUnitOther?.trim();
  if (amountUnitOther) cleaned.amountUnitOther = amountUnitOther;

  const freqUnit =
    legacyFreq.frequencyUnit ?? raw.frequencyUnit ?? (legacyFreq.frequency ? undefined : undefined);
  if (legacyFreq.frequencyUnit) {
    cleaned.frequencyUnit = legacyFreq.frequencyUnit;
    if (legacyFreq.frequency != null) cleaned.frequency = legacyFreq.frequency;
  } else if (raw.frequencyUnit) {
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
  return cleaned;
}

function migrateLegacySubstances(input: SubstancesSectionInput): SubstancesSectionInput {
  const legacyUses = [...(input.uses ?? [])].filter(Boolean);
  if (input.items?.length > 0 || legacyUses.length === 0) {
    return { ...input, items: ensureSubstanceItemIds(input.items ?? []) };
  }
  const sharedRoute = input.route;
  return {
    status: input.status ?? "current",
    items: ensureSubstanceItemIds(
      legacyUses.map((type) => ({
        id: newSubstanceItemId(),
        type,
        ...(sharedRoute ? { route: sharedRoute as SubstanceRoute } : {}),
        phase: input.status === "ex" ? ("past" as const) : ("current" as const),
      })),
    ),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };
}

export function normalizeSubstancesSection(
  input: SubstancesSectionInput | null | undefined,
): SubstancesSectionInput | null {
  if (!input) return null;
  const migrated = migrateLegacySubstances(input);

  if (migrated.status === "never") {
    return { status: "never", items: [] };
  }

  const items = ensureSubstanceItemIds(migrated.items ?? [])
    .map(normalizeSubstanceItem)
    .filter((item) => item.type);

  const notes = migrated.notes?.trim();
  const status = migrated.status ?? (items.length > 0 ? "current" : undefined);

  if (status === "never") return { status: "never", items: [] };
  if (!status && items.length === 0 && !notes) return null;

  return {
    ...(status ? { status } : {}),
    items,
    ...(notes ? { notes } : {}),
  };
}

export function substanceItemsForDisplay(
  section: SubstancesSectionInput | null | undefined,
): SubstanceUseItem[] {
  const normalized = normalizeSubstancesSection(section ?? undefined);
  if (!normalized || normalized.status === "never") return [];
  return normalized.items;
}

export function substancesHasContent(section: SubstancesSectionInput | null | undefined): boolean {
  const normalized = normalizeSubstancesSection(section ?? undefined);
  if (!normalized) return false;
  if (normalized.status === "never") return true;
  return normalized.items.length > 0 || Boolean(normalized.notes?.trim());
}

export function formatSubstanceFrequencyPhrase(item: SubstanceUseItem): string | null {
  const freqUnit = item.frequencyUnit;
  if (!freqUnit) return null;
  if (freqUnit === "occasional") return "occasional";
  if (freqUnit === "day") return "every day";
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

function serializeRoutePart(item: SubstanceUseItem): string | null {
  if (!item.route) return null;
  if (item.route === "iv") return "IV — infection risk · consider BBV screen";
  if (item.route === "other") {
    return item.routeOther?.trim() ? `other (${item.routeOther.trim()})` : "other route";
  }
  return item.route;
}

function serializeSubstanceItemClause(item: SubstanceUseItem): string {
  const label = substanceDisplayLabel(item);
  const parts: string[] = [];

  const agent = item.typeOther?.trim();
  if (agent && substanceSupportsAgentName(item.type)) parts.push(agent);

  if (item.amount != null) {
    const unit = substanceAmountUnitSuffix(
      item.amountUnit ?? defaultSubstanceAmountUnit(item.type),
      item.amountUnitOther,
    );
    parts.push(`${item.amount} ${unit}/day`);
  }

  const routePart = serializeRoutePart(item);
  if (routePart) parts.push(routePart);

  const freqPhrase = formatSubstanceFrequencyPhrase(item);
  if (freqPhrase) parts.push(freqPhrase);

  if (item.years != null) {
    parts.push(formatSocialHistoryDurationSuffix(item.years, item.yearsUnit));
  }
  if (item.phase === "past") parts.push("past");

  if (parts.length === 0) return label;
  return `${label} (${parts.join(" · ")})`;
}

export function serializeSubstancesSection(section: SubstancesSectionInput): string {
  const normalized = normalizeSubstancesSection(section);
  if (!normalized) return "";

  if (normalized.status === "never") return "Substances: Denies use";

  const itemClauses = normalized.items.map(serializeSubstanceItemClause).filter(Boolean);
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

  if (normalized.notes?.trim()) bodyParts.push(normalized.notes.trim());
  if (bodyParts.length === 0) return "";
  return `Substances: ${bodyParts.join(" · ")}`;
}

function parseRouteToken(token: string): { route?: SubstanceRoute; routeOther?: string } {
  const lower = token.toLowerCase();
  if (lower.includes("other route") || lower.startsWith("other (")) {
    const match = token.match(/other\s*\(([^)]+)\)/i);
    return { route: "other", routeOther: match?.[1]?.trim() };
  }
  if (lower.includes("iv")) return { route: "iv" };
  if (lower.includes("inhaled")) return { route: "inhaled" };
  if (lower.includes("oral")) return { route: "oral" };
  if (lower.includes("snort")) return { route: "snorted" };
  if (lower.includes("smok")) return { route: "smoked" };
  return {};
}

function parseFrequencyPhrase(token: string): Partial<SubstanceUseItem> {
  const lower = token.toLowerCase().trim();
  if (lower === "occasional" || lower === "rare") return { frequencyUnit: "occasional" };
  if (lower === "daily" || lower === "every day") return { frequencyUnit: "day", frequency: 1 };
  if (lower === "weekly") return { frequencyUnit: "week" };

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

  const legacy = lower as SubstanceFrequencyLegacy;
  if (legacy === "daily") return { frequencyUnit: "day", frequency: 1 };
  if (legacy === "weekly") return { frequencyUnit: "week" };
  if (legacy === "occasional") return { frequencyUnit: "occasional" };

  return {};
}

function resolveTypeKey(label: string): string {
  const trimmed = label.trim();
  const byLabel = Object.entries(SUBSTANCE_TYPE_LABELS).find(
    ([, l]) => l.toLowerCase() === trimmed.toLowerCase(),
  )?.[0];
  if (byLabel) return byLabel;
  const byOption = substanceTypeOptions().find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  )?.value;
  return byOption ?? trimmed.toLowerCase();
}

function isKnownSubstanceParenToken(token: string): boolean {
  const t = token.trim();
  if (!t) return true;
  if (t.toLowerCase() === "past") return true;
  if (parseFrequencyPhrase(t).frequencyUnit) return true;
  if (parseRouteToken(t).route) return true;
  if (/^(\d+(?:\.\d+)?)\s+[a-z][a-z0-9/-]*\/day$/i.test(t)) return true;
  if (parseSocialHistoryDurationSuffix(t)) return true;
  if (t.toLowerCase().includes("infection risk")) return true;
  return false;
}

function parseSubstanceItemSegment(segment: string): SubstanceUseItem | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  let headline = trimmed;
  let paren = "";
  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    headline = parenMatch[1].trim();
    paren = parenMatch[2];
  }

  const item: SubstanceUseItem = {
    id: newSubstanceItemId(),
    type: resolveTypeKey(headline),
    phase: "current",
  };

  if (paren) {
    for (const token of paren.split(/\s*·\s*|\s*,\s*/)) {
      const t = token.trim();
      if (!t) continue;
      if (t.toLowerCase() === "past") {
        item.phase = "past";
        continue;
      }

      const amountMatch = t.match(/^(\d+(?:\.\d+)?)\s+([a-z][a-z0-9/-]*)\/day$/i);
      if (amountMatch) {
        item.amount = Number(amountMatch[1]);
        const unitRaw = amountMatch[2].toLowerCase();
        if (["tablets", "joints", "sessions", "doses", "bags", "mg", "g"].includes(unitRaw)) {
          item.amountUnit = unitRaw;
        } else {
          item.amountUnit = "other";
          item.amountUnitOther = amountMatch[2];
        }
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
        continue;
      }

      if (
        substanceSupportsAgentName(item.type) &&
        !item.typeOther &&
        !isKnownSubstanceParenToken(t)
      ) {
        item.typeOther = t;
        continue;
      }

      const routePatch = parseRouteToken(t);
      if (routePatch.route) {
        item.route = routePatch.route;
        if (routePatch.routeOther) item.routeOther = routePatch.routeOther;
      }
    }
  }

  return item;
}

/** Parse the value portion after `Substances:` from derived TEXT. */
export function parseSubstancesText(value: string): SubstancesSectionInput {
  const raw = value.trim();
  if (!raw) return { items: [] };
  if (/^denies use$/i.test(raw)) return { status: "never", items: [] };

  let status: SubstanceUseStatus | undefined;
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

  const items: SubstanceUseItem[] = [];

  const legacyRouteMatch = body.match(/^(.+?)\s*\((inhaled|oral|iv[^)]*)\)\s*$/i);
  if (legacyRouteMatch && !body.includes(";")) {
    const headline = legacyRouteMatch[1];
    const routePatch = parseRouteToken(legacyRouteMatch[2]);
    for (const token of headline.split(/,\s*/)) {
      const parsed = parseSubstanceItemSegment(token.trim());
      if (parsed) {
        if (routePatch.route) {
          parsed.route = routePatch.route;
          if (routePatch.routeOther) parsed.routeOther = routePatch.routeOther;
        }
        items.push(parsed);
      }
    }
    return normalizeSubstancesSection({ status: status ?? "current", items }) ?? { items: [] };
  }

  for (const segment of body.split(/\s*;\s*/)) {
    const parsed = parseSubstanceItemSegment(segment);
    if (parsed) items.push(parsed);
  }

  return (
    normalizeSubstancesSection({
      status: status ?? (items.length > 0 ? "current" : undefined),
      items,
    }) ?? { items: [] }
  );
}

export interface SubstanceClinicalHintsInput {
  substances?: SubstancesSectionInput | null;
  alcoholStatus?: "never" | "current" | "ex" | null;
}

function itemUsesDaily(item: SubstanceUseItem): boolean {
  return item.frequencyUnit === "day" || (item.frequencyUnit === "interval" && item.frequency === 1);
}

/** Passive, non-diagnostic hints for the substances UI zone. */
export function substanceClinicalHints(input: SubstanceClinicalHintsInput): string[] {
  const normalized = normalizeSubstancesSection(input.substances ?? undefined);
  if (!normalized || normalized.status === "never") return [];

  const hints: string[] = [];
  const items = normalized.items;
  const alcoholCurrent = input.alcoholStatus === "current";

  const types = new Set(items.map((i) => i.type));
  const hasIv = items.some((i) => i.route === "iv");
  const hasOpioids = types.has("opioids") || types.has("prescription-opioids");
  const hasSedatives = types.has("sedatives");

  if (items.length >= 2) {
    hints.push("Polysubstance use — consider structured assessment (e.g. ASSIST).");
  }
  if (hasIv) {
    hints.push("IV route — consider blood-borne virus screening (HIV, HCV, HBV).");
  }
  if (hasOpioids && alcoholCurrent) {
    hints.push("Opioids + current alcohol — elevated overdose / respiratory depression risk.");
  }
  if (hasSedatives && alcoholCurrent) {
    hints.push("Sedatives + current alcohol — consider interaction and dependence risk.");
  }
  if (hasOpioids && items.some(itemUsesDaily)) {
    hints.push("Daily opioid use — assess dependence and safer-supply / naloxone where appropriate.");
  }

  return hints;
}

export function createSubstanceItem(
  type: SubstanceType | string,
  partial: Partial<Omit<SubstanceUseItem, "id" | "type">> = {},
): SubstanceUseItem {
  return {
    id: newSubstanceItemId(),
    type,
    phase: "current",
    amountUnit: defaultSubstanceAmountUnit(type),
    ...partial,
  };
}

export function substanceFrequencyUnitChangePatch(
  item: SubstanceUseItem,
  nextUnit: SubstanceFrequencyUnit,
): Partial<SubstanceUseItem> {
  const patch: Partial<SubstanceUseItem> = { frequencyUnit: nextUnit };
  if (nextUnit === "day") {
    patch.frequency = 1;
  } else if (nextUnit === "occasional") {
    patch.frequency = undefined;
  } else if (nextUnit === "interval" && item.frequency == null) {
    patch.frequency = 7;
  } else if (nextUnit === "month" && item.frequency == null) {
    patch.frequency = 1;
  } else if (nextUnit === "fortnight" && item.frequency == null) {
    patch.frequency = 1;
  }
  return patch;
}
