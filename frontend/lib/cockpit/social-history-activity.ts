/**
 * Activity section — structured capture, serialize/parse, clinical hints (sh-activity-v2).
 */

export type ActivityLevel = "sedentary" | "light" | "moderate" | "vigorous";

export type JobActivityLevel = "sedentary" | "light" | "moderate" | "heavy";

export type ActivityType =
  | "walking"
  | "yoga"
  | "gym"
  | "sport"
  | "household"
  | "commute"
  | "other";

export interface ActivityUseItem {
  id: string;
  type: ActivityType | string;
  typeOther?: string;
  daysPerWeek?: number;
  minutesPerSession?: number;
}

export interface ActivitySectionInput {
  level?: ActivityLevel;
  jobActivity?: JobActivityLevel;
  /** Quick entry when no detailed items (legacy-compatible). */
  daysPerWeek?: number;
  minutesPerSession?: number;
  types?: ActivityType[];
  items: ActivityUseItem[];
  limitedByHealth?: boolean;
  barriers?: string;
  notes?: string;
}

export const MAX_ACTIVITY_ITEMS = 8;

export const ACTIVITY_LEVEL_OPTIONS = [
  { value: "sedentary" as const, label: "Sedentary" },
  { value: "light" as const, label: "Light" },
  { value: "moderate" as const, label: "Moderate" },
  { value: "vigorous" as const, label: "Vigorous" },
] as const;

export const JOB_ACTIVITY_OPTIONS = [
  { value: "sedentary" as const, label: "Desk job" },
  { value: "light" as const, label: "Mostly on feet" },
  { value: "moderate" as const, label: "Physically active job" },
  { value: "heavy" as const, label: "Heavy manual" },
] as const;

export const ACTIVITY_TYPE_OPTIONS = [
  { value: "walking" as const, label: "Walking" },
  { value: "yoga" as const, label: "Yoga / home exercise" },
  { value: "gym" as const, label: "Gym / weights" },
  { value: "sport" as const, label: "Sport" },
  { value: "household" as const, label: "Household / farm work" },
  { value: "commute" as const, label: "Active commute" },
  { value: "other" as const, label: "Other" },
] as const;

const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  vigorous: "Vigorous",
};

const JOB_ACTIVITY_LABELS: Record<JobActivityLevel, string> = {
  sedentary: "desk job",
  light: "mostly on feet",
  moderate: "physically active job",
  heavy: "heavy manual",
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  walking: "Walking",
  yoga: "Yoga",
  gym: "Gym",
  sport: "Sport",
  household: "Household",
  commute: "Commute",
  other: "Other",
};

const ACTIVITY_LEVEL_TOOLTIPS: Record<ActivityLevel, string> = {
  sedentary: "Mostly sitting; little planned exercise most days",
  light: "Some movement, below usual aerobic recommendations",
  moderate: "~150 min/week moderate activity (e.g. brisk walking)",
  vigorous: "~75 min/week vigorous activity (e.g. running, sport)",
};

let activityIdCounter = 0;

export function newActivityItemId(): string {
  activityIdCounter += 1;
  return `act-${Date.now()}-${activityIdCounter}`;
}

export function activityLevelTooltip(level: ActivityLevel): string {
  return ACTIVITY_LEVEL_TOOLTIPS[level];
}

export function defaultDaysPerWeekForLevel(level: ActivityLevel): number | undefined {
  if (level === "moderate" || level === "vigorous") return 3;
  if (level === "light") return 2;
  return undefined;
}

export function levelShowsExerciseDetails(level: ActivityLevel | undefined): boolean {
  return level != null && level !== "sedentary";
}

/** Job movement is only prompted when planned exercise is low — avoids duplicating moderate/vigorous rows. */
export function levelPromptsForJobActivity(level: ActivityLevel | undefined): boolean {
  return level === "sedentary" || level === "light";
}

export function ensureActivityItemIds(items: ActivityUseItem[]): ActivityUseItem[] {
  return items.map((item) => ({
    ...item,
    id: item.id?.trim() ? item.id : newActivityItemId(),
  }));
}

export function availableActivityAddChips(
  items: ActivityUseItem[],
): typeof ACTIVITY_TYPE_OPTIONS {
  const usedStandard = new Set(items.filter((i) => i.type && i.type !== "other").map((i) => i.type));
  const hasOther = items.some((i) => i.type === "other");
  return ACTIVITY_TYPE_OPTIONS.filter((opt) => {
    if (opt.value === "other") return !hasOther;
    return !usedStandard.has(opt.value);
  });
}

export function createActivityItem(
  type: ActivityType | string,
  partial: Partial<Omit<ActivityUseItem, "id" | "type">> = {},
): ActivityUseItem {
  return {
    id: newActivityItemId(),
    type,
    ...partial,
  };
}

function activityDisplayLabel(item: ActivityUseItem): string {
  if (item.type === "other") return item.typeOther?.trim() || ACTIVITY_TYPE_LABELS.other;
  return ACTIVITY_TYPE_LABELS[item.type] ?? item.type;
}

function migrateLegacyFlat(input: ActivitySectionInput): ActivitySectionInput {
  return { ...input, items: ensureActivityItemIds(input.items ?? []) };
}

function normalizeActivityItem(raw: ActivityUseItem): ActivityUseItem | null {
  if (!raw.type && raw.daysPerWeek == null && raw.minutesPerSession == null) return null;
  const cleaned: ActivityUseItem = {
    id: raw.id?.trim() ? raw.id : newActivityItemId(),
    type: raw.type ?? "other",
  };
  const typeOther = raw.typeOther?.trim();
  if (typeOther) cleaned.typeOther = typeOther;
  if (raw.daysPerWeek != null && raw.daysPerWeek >= 0) cleaned.daysPerWeek = raw.daysPerWeek;
  if (raw.minutesPerSession != null && raw.minutesPerSession >= 0) {
    cleaned.minutesPerSession = raw.minutesPerSession;
  }
  return cleaned;
}

export function normalizeActivitySection(
  input: ActivitySectionInput | null | undefined,
): ActivitySectionInput | null {
  if (!input) return null;

  const migrated = migrateLegacyFlat({ ...input, items: input.items ?? [] });
  const cleaned: ActivitySectionInput = { items: [] };

  if (migrated.level) cleaned.level = migrated.level;
  if (migrated.jobActivity) cleaned.jobActivity = migrated.jobActivity;

  if (migrated.daysPerWeek != null) cleaned.daysPerWeek = migrated.daysPerWeek;
  if (migrated.minutesPerSession != null) cleaned.minutesPerSession = migrated.minutesPerSession;

  const types = [...(migrated.types ?? [])].filter(Boolean);
  if (types.length > 0) cleaned.types = types as ActivityType[];

  cleaned.items = ensureActivityItemIds(migrated.items)
    .map(normalizeActivityItem)
    .filter((item): item is ActivityUseItem => item != null);

  // Detail items replace section-level typical schedule and legacy type tags.
  if (cleaned.items.length > 0) {
    delete cleaned.daysPerWeek;
    delete cleaned.minutesPerSession;
    delete cleaned.types;
  }

  if (typeof migrated.limitedByHealth === "boolean") {
    cleaned.limitedByHealth = migrated.limitedByHealth;
  }
  const barriers = migrated.barriers?.trim();
  if (barriers) cleaned.barriers = barriers;
  const notes = migrated.notes?.trim();
  if (notes) cleaned.notes = notes;

  return activityHasContent(cleaned) ? cleaned : null;
}

export function activityHasContent(section: ActivitySectionInput | null | undefined): boolean {
  if (!section) return false;
  if (section.level) return true;
  if (section.jobActivity) return true;
  if (section.daysPerWeek != null) return true;
  if (section.minutesPerSession != null) return true;
  if ((section.types?.length ?? 0) > 0) return true;
  if ((section.items?.length ?? 0) > 0) return true;
  if (section.limitedByHealth != null) return true;
  if (section.barriers?.trim()) return true;
  if (section.notes?.trim()) return true;
  return false;
}

function serializeActivityItemClause(item: ActivityUseItem): string {
  const label = activityDisplayLabel(item);
  const parts: string[] = [];
  if (item.daysPerWeek != null) parts.push(`${item.daysPerWeek} days/wk`);
  if (item.minutesPerSession != null) parts.push(`${item.minutesPerSession} min/session`);
  if (parts.length === 0) return label;
  return `${label} (${parts.join(" · ")})`;
}

export function serializeActivitySection(section: ActivitySectionInput): string {
  const normalized = normalizeActivitySection(section);
  if (!normalized) return "";

  let main = "";
  if (normalized.level) {
    main = ACTIVITY_LEVEL_LABELS[normalized.level];
  }

  if (normalized.items.length > 0) {
    const itemClauses = normalized.items.map(serializeActivityItemClause).join("; ");
    main = main ? `${main} — ${itemClauses}` : itemClauses;
  } else {
    const quick: string[] = [];
    if (normalized.daysPerWeek != null) quick.push(`${normalized.daysPerWeek} days/wk`);
    if (normalized.minutesPerSession != null) quick.push(`${normalized.minutesPerSession} min/session`);
    if (quick.length > 0) {
      main = main ? `${main}, ${quick.join(", ")}` : quick.join(", ");
    }
  }

  const tailParts: string[] = [];
  if (normalized.types?.length && normalized.items.length === 0) {
    tailParts.push(
      normalized.types.map((t) => ACTIVITY_TYPE_LABELS[t] ?? t).join(", "),
    );
  }
  if (normalized.jobActivity) {
    tailParts.push(`job: ${JOB_ACTIVITY_LABELS[normalized.jobActivity]}`);
  }
  if (normalized.limitedByHealth) tailParts.push("limited by health");
  if (normalized.barriers?.trim()) tailParts.push(`barriers: ${normalized.barriers.trim()}`);
  if (normalized.notes?.trim()) tailParts.push(`notes: ${normalized.notes.trim()}`);

  const body = [main, ...tailParts].filter(Boolean).join("; ");
  return body ? `Activity: ${body}` : "";
}

function splitActivityDetailSegments(raw: string): string[] {
  const segments: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
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
    if (depth === 0 && ch === ";") {
      const piece = current.trim();
      if (piece) segments.push(piece);
      current = "";
      continue;
    }
    current += ch;
  }

  const tail = current.trim();
  if (tail) segments.push(tail);
  return segments.length > 0 ? segments : [raw.trim()].filter(Boolean);
}

function resolveActivityLevel(label: string): ActivityLevel | undefined {
  const trimmed = label.trim().toLowerCase();
  const byLabel = Object.entries(ACTIVITY_LEVEL_LABELS).find(
    ([, l]) => l.toLowerCase() === trimmed,
  )?.[0] as ActivityLevel | undefined;
  if (byLabel) return byLabel;
  if (trimmed === "active") return "vigorous";
  if (trimmed === "moderately active") return "moderate";
  return undefined;
}

function resolveJobActivity(token: string): JobActivityLevel | undefined {
  const lower = token.trim().toLowerCase();
  if (!lower.startsWith("job:")) return undefined;

  const val = lower.replace(/^job:\s*/, "");
  if (val.includes("heavy")) return "heavy";
  if (val.includes("desk") || val.includes("sedentary")) return "sedentary";
  if (val.includes("mostly on feet") || val.includes("on feet")) return "light";
  if (val.includes("physically active")) return "moderate";
  if (val === "light") return "light";
  if (val === "moderate") return "moderate";

  const byOption = JOB_ACTIVITY_OPTIONS.find(
    (option) => option.label.toLowerCase() === val,
  )?.value;
  return byOption;
}

function resolveActivityType(label: string): ActivityType | string {
  const trimmed = label.trim();
  const byLabel = Object.entries(ACTIVITY_TYPE_LABELS).find(
    ([, l]) => l.toLowerCase() === trimmed.toLowerCase(),
  )?.[0];
  if (byLabel) return byLabel as ActivityType;
  const byValue = ACTIVITY_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
  )?.value;
  return byValue ?? trimmed.toLowerCase();
}

function parseActivityItemSegment(segment: string): ActivityUseItem | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  let headline = trimmed;
  let paren = "";
  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    headline = parenMatch[1].trim();
    paren = parenMatch[2];
  }

  const item: ActivityUseItem = {
    id: newActivityItemId(),
    type: resolveActivityType(headline),
  };
  if (item.type === "other" && headline !== ACTIVITY_TYPE_LABELS.other) {
    item.typeOther = headline;
  }

  if (paren) {
    for (const token of paren.split(/\s*·\s*|\s*,\s*/)) {
      const daysMatch = token.match(/^(\d+(?:\.\d+)?)\s*days?\/wk$/i);
      if (daysMatch) {
        item.daysPerWeek = Number(daysMatch[1]);
        continue;
      }
      const minMatch = token.match(/^(\d+(?:\.\d+)?)\s*min(?:\/session)?$/i);
      if (minMatch) {
        item.minutesPerSession = Number(minMatch[1]);
      }
    }
  }

  return item;
}

function segmentIsActivityTypeLabels(segment: string): boolean {
  const parts = segment.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((part) => {
    if (!part || part.includes("(") || part.includes("—")) return false;
    const typeKey = resolveActivityType(part);
    return (
      ACTIVITY_TYPE_LABELS[typeKey] != null ||
      ACTIVITY_TYPE_OPTIONS.some((option) => option.label.toLowerCase() === part.toLowerCase())
    );
  });
}

function appendActivityItemsFromSegment(segment: string, section: ActivitySectionInput): void {
  for (const part of segment.split(/\s*;\s*/)) {
    const parsed = parseActivityItemSegment(part);
    if (parsed) section.items.push(parsed);
  }
}

function parseActivityLevelHead(segment: string, section: ActivitySectionInput): boolean {
  const dashMatch = segment.match(/^(.+?)\s*—\s*(.+)$/);
  if (dashMatch) {
    const head = dashMatch[1].trim();
    const tail = dashMatch[2].trim();
    const level = resolveActivityLevel(head.split(",")[0]?.trim() ?? head);
    if (!level) return false;
    section.level = level;
    if (head.includes(",")) {
      parseActivityQuickTail(head.slice(head.indexOf(",") + 1), section);
    }
    appendActivityItemsFromSegment(tail, section);
    return true;
  }

  const level = resolveActivityLevel(segment.split(",")[0]?.trim() ?? segment);
  if (!level) return false;
  section.level = level;
  const rest = segment.includes(",") ? segment.slice(segment.indexOf(",") + 1).trim() : "";
  if (rest) parseActivityQuickTail(rest, section);
  return true;
}

/** Parse value after `Activity:` from derived TEXT. */
export function parseActivityText(value: string): ActivitySectionInput {
  const raw = value.trim();
  if (!raw) return { items: [] };

  const section: ActivitySectionInput = { items: [] };
  const segments = splitActivityDetailSegments(raw);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    if (/^limited by health$/i.test(trimmed)) {
      section.limitedByHealth = true;
      continue;
    }

    const barriersMatch = trimmed.match(/^barriers:\s*(.+)$/i);
    if (barriersMatch) {
      section.barriers = barriersMatch[1].trim();
      continue;
    }

    const notesMatch = trimmed.match(/^notes:\s*(.+)$/i);
    if (notesMatch) {
      section.notes = notesMatch[1].trim();
      continue;
    }

    const job = resolveJobActivity(trimmed);
    if (job) {
      section.jobActivity = job;
      continue;
    }

    if (!section.level && parseActivityLevelHead(trimmed, section)) {
      continue;
    }

    if (segmentIsActivityTypeLabels(trimmed)) {
      parseActivityQuickTail(trimmed, section);
      continue;
    }

    if (trimmed.includes(";")) {
      appendActivityItemsFromSegment(trimmed, section);
      continue;
    }

    const parsedItem = parseActivityItemSegment(trimmed);
    if (parsedItem && trimmed.includes("(")) {
      section.items.push(parsedItem);
      continue;
    }

    parseActivityQuickTail(trimmed, section);
  }

  return normalizeActivitySection(section) ?? { items: [] };
}

function parseActivityQuickTail(tail: string, section: ActivitySectionInput): void {
  for (const part of tail.split(/,\s*/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const daysMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*days?\/wk$/i);
    if (daysMatch) {
      section.daysPerWeek = Number(daysMatch[1]);
      continue;
    }

    const minMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*min(?:\/session)?$/i);
    if (minMatch) {
      section.minutesPerSession = Number(minMatch[1]);
      continue;
    }

    const minSessionMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*min\/session$/i);
    if (minSessionMatch) {
      section.minutesPerSession = Number(minSessionMatch[1]);
      continue;
    }

    const typeKey = resolveActivityType(trimmed);
    if (ACTIVITY_TYPE_LABELS[typeKey] || ACTIVITY_TYPE_OPTIONS.some((o) => o.value === typeKey)) {
      section.types = [...(section.types ?? []), typeKey as ActivityType];
    }
  }
}

export function mapActivityChipToStructured(chip: string): ActivitySectionInput {
  const level = resolveActivityLevel(chip) ?? "sedentary";
  return normalizeActivitySection({ level, items: [] }) ?? { level, items: [] };
}

export interface ActivityClinicalHintsInput {
  activity?: ActivitySectionInput | null;
}

export function activityClinicalHints(input: ActivityClinicalHintsInput): string[] {
  const normalized = normalizeActivitySection(input.activity ?? undefined);
  if (!normalized) return [];

  const hints: string[] = [];

  if (normalized.level === "sedentary") {
    hints.push(
      "Sedentary lifestyle — consider counselling on gradual activity increase where appropriate.",
    );
  }

  if (normalized.limitedByHealth || normalized.barriers?.trim()) {
    hints.push(
      "Activity limited by health — document barriers and safe alternatives in the plan.",
    );
  }

  if (normalized.level === "vigorous") {
    hints.push(
      "Vigorous activity — confirm no contraindications if cardiac or musculoskeletal concerns.",
    );
  }

  const weeklyMinutes =
    normalized.minutesPerSession != null && normalized.daysPerWeek != null
      ? normalized.minutesPerSession * normalized.daysPerWeek
      : normalized.items.reduce((sum, item) => {
          if (item.minutesPerSession != null && item.daysPerWeek != null) {
            return sum + item.minutesPerSession * item.daysPerWeek;
          }
          return sum;
        }, 0);

  if (
    normalized.level === "moderate" &&
    weeklyMinutes > 0 &&
    weeklyMinutes < 150
  ) {
    hints.push("Below ~150 min/week moderate-equivalent — room to increase if goals allow.");
  }

  return hints;
}
