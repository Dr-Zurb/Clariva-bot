export type SleepQuality = "good" | "fair" | "poor";
export type StressLevel = "low" | "moderate" | "high";
export type StressSupport = "good" | "limited" | "none";
export type StressSource = "work" | "family" | "health" | "money" | "other";

export interface SleepSectionInput {
  hoursPerNight?: number;
  quality?: SleepQuality;
  snoring?: boolean;
  shiftWork?: boolean;
  notes?: string;
}

export interface StressSectionInput {
  level?: StressLevel;
  support?: StressSupport;
  sources?: StressSource[];
  notes?: string;
}

export const SLEEP_FLAG_OPTIONS = [
  { value: "snoring", label: "Snoring / suspected OSA" },
  { value: "shiftWork", label: "Shift / irregular schedule" },
] as const;

export const STRESS_SOURCE_OPTIONS: readonly { value: StressSource; label: string }[] = [
  { value: "work", label: "Work" },
  { value: "family", label: "Family" },
  { value: "health", label: "Health" },
  { value: "money", label: "Money" },
  { value: "other", label: "Other" },
] as const;

const STRESS_SOURCE_LABELS: Record<StressSource, string> = {
  work: "Work",
  family: "Family",
  health: "Health",
  money: "Money",
  other: "Other",
};

export function sleepHasContent(section: SleepSectionInput | null | undefined): boolean {
  if (!section) return false;
  if (section.hoursPerNight != null) return true;
  if (section.quality) return true;
  if (section.snoring) return true;
  if (section.shiftWork) return true;
  if (section.notes?.trim()) return true;
  return false;
}

export function stressHasContent(section: StressSectionInput | null | undefined): boolean {
  if (!section) return false;
  if (section.level) return true;
  if (section.support) return true;
  if ((section.sources?.length ?? 0) > 0) return true;
  if (section.notes?.trim()) return true;
  return false;
}

export function normalizeSleepSection(
  input: SleepSectionInput | null | undefined,
): SleepSectionInput | null {
  if (!input) return null;

  const cleaned: SleepSectionInput = {};
  if (input.hoursPerNight != null) cleaned.hoursPerNight = input.hoursPerNight;
  if (input.quality) cleaned.quality = input.quality;
  if (input.snoring) cleaned.snoring = true;
  if (input.shiftWork) cleaned.shiftWork = true;
  const notes = input.notes?.trim();
  if (notes) cleaned.notes = notes;

  return sleepHasContent(cleaned) ? cleaned : null;
}

export function normalizeStressSection(
  input: StressSectionInput | null | undefined,
): StressSectionInput | null {
  if (!input) return null;

  const cleaned: StressSectionInput = {};
  if (input.level) cleaned.level = input.level;
  if (input.support) cleaned.support = input.support;
  const sources = [...(input.sources ?? [])].filter(Boolean) as StressSource[];
  if (sources.length > 0) cleaned.sources = sources;
  const notes = input.notes?.trim();
  if (notes) cleaned.notes = notes;

  return stressHasContent(cleaned) ? cleaned : null;
}

export function serializeSleepSection(section: SleepSectionInput): string {
  const normalized = normalizeSleepSection(section);
  if (!normalized) return "";

  const parts: string[] = [];
  if (normalized.hoursPerNight != null) parts.push(`${normalized.hoursPerNight} h`);
  if (normalized.quality) parts.push(normalized.quality);

  const flags: string[] = [];
  if (normalized.snoring) flags.push("snoring");
  if (normalized.shiftWork) flags.push("shift work");
  if (flags.length > 0) parts.push(flags.join(", "));

  let body = parts.join(", ");
  if (normalized.notes?.trim()) {
    body = body ? `${body} · ${normalized.notes.trim()}` : normalized.notes.trim();
  }

  return body ? `Sleep: ${body}` : "";
}

export function serializeStressSection(section: StressSectionInput): string {
  const normalized = normalizeStressSection(section);
  if (!normalized) return "";

  const parts: string[] = [];
  if (normalized.level) {
    parts.push(normalized.level.charAt(0).toUpperCase() + normalized.level.slice(1));
  }
  if (normalized.support) {
    parts.push(
      normalized.support === "good" ? "good support" : `${normalized.support} support`,
    );
  }

  let body = parts.join(", ");
  if (normalized.sources?.length) {
    const sourceLabels = normalized.sources
      .map((source) => STRESS_SOURCE_LABELS[source] ?? source)
      .join(", ");
    body = body ? `${body} · ${sourceLabels}` : sourceLabels;
  }
  if (normalized.notes?.trim()) {
    body = body ? `${body} · ${normalized.notes.trim()}` : normalized.notes.trim();
  }

  return body ? `Stress: ${body}` : "";
}

function resolveStressSource(value: string): StressSource | undefined {
  const trimmed = value.trim().toLowerCase();
  return STRESS_SOURCE_OPTIONS.find(
    (option) =>
      option.value === trimmed ||
      option.label.toLowerCase() === trimmed ||
      STRESS_SOURCE_LABELS[option.value].toLowerCase() === trimmed,
  )?.value;
}

/** Parse value after `Sleep:` from derived TEXT. */
export function parseSleepText(value: string): SleepSectionInput {
  const sleep: SleepSectionInput = {};
  const segments = value.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
  const noteParts: string[] = [];

  for (const segment of segments) {
    let handled = false;
    for (const part of segment.split(/,\s*/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const hoursMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*h$/i);
      if (hoursMatch) {
        sleep.hoursPerNight = Number(hoursMatch[1]);
        handled = true;
        continue;
      }

      const qualityLower = trimmed.toLowerCase();
      if (qualityLower === "good" || qualityLower === "fair" || qualityLower === "poor") {
        sleep.quality = qualityLower;
        handled = true;
        continue;
      }

      if (/^snoring$/i.test(trimmed)) {
        sleep.snoring = true;
        handled = true;
        continue;
      }
      if (/^shift work$/i.test(trimmed)) {
        sleep.shiftWork = true;
        handled = true;
      }
    }

    if (!handled) noteParts.push(segment);
  }

  if (noteParts.length > 0) sleep.notes = noteParts.join(" · ");
  return sleep;
}

/** Parse value after `Stress:` from derived TEXT. */
export function parseStressText(value: string): StressSectionInput {
  const stress: StressSectionInput = {};
  const segments = value.split(/\s*·\s*/).map((part) => part.trim()).filter(Boolean);
  const noteParts: string[] = [];

  if (segments.length > 0) {
    const headParts = segments[0].split(/,\s*/).map((part) => part.trim()).filter(Boolean);
    if (headParts[0]) {
      const levelLower = headParts[0].toLowerCase();
      if (levelLower === "low" || levelLower === "moderate" || levelLower === "high") {
        stress.level = levelLower;
      }
    }

    const supportPart = headParts.slice(1).join(", ").toLowerCase();
    if (supportPart.includes("good support")) stress.support = "good";
    else if (supportPart.includes("limited support")) stress.support = "limited";
    else if (supportPart.includes("none support") || supportPart === "none") {
      stress.support = "none";
    }
  }

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const sourceTokens = segment.split(/,\s*/).map((token) => token.trim()).filter(Boolean);
    const resolvedSources = sourceTokens
      .map((token) => resolveStressSource(token))
      .filter((token): token is StressSource => token != null);
    if (resolvedSources.length === sourceTokens.length && resolvedSources.length > 0) {
      stress.sources = [...(stress.sources ?? []), ...resolvedSources];
      continue;
    }
    noteParts.push(segment);
  }

  if (noteParts.length > 0) stress.notes = noteParts.join(" · ");
  return stress;
}

export function wellbeingClinicalHints(input: {
  sleep?: SleepSectionInput | null;
  stress?: StressSectionInput | null;
}): string[] {
  const hints: string[] = [];
  const sleep = normalizeSleepSection(input.sleep ?? null);
  const stress = normalizeStressSection(input.stress ?? null);

  if (
    sleep &&
    (sleep.quality === "poor" ||
      (sleep.hoursPerNight != null && sleep.hoursPerNight < 5))
  ) {
    hints.push("Poor or short sleep — consider sleep hygiene, snoring/OSA, mood, and caffeine.");
  }

  if (stress?.level === "high" && stress.support === "none") {
    hints.push("High stress with limited support — consider psychosocial support or follow-up.");
  }

  return hints;
}
