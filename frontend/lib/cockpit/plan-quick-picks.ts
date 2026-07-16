/**
 * Plan-tab quick-pick presets (plan-p2).
 *
 * Static UI vocabulary only — free-text fields remain the source of truth.
 * Investigation panels / imaging reuse the shared order catalog (inv-lib-01).
 */

import { INVESTIGATION_QUICK_PICK_ENTRIES } from "@/lib/cockpit/investigation-order-catalog";
import {
  REFERRAL_SPECIALTY_CATALOG,
  REFERRAL_SPECIALTY_QUICK_PICK_LABELS,
} from "@/lib/cockpit/referral-specialty-catalog";

/** Common OPD advice lines (lifestyle + counseling — single Advice bucket). */
export const PLAN_ADVICE_QUICK_PICKS: readonly string[] = [
  "Rest",
  "Plenty of fluids",
  "Soft / bland diet",
  "Avoid oily and spicy food",
  "Steam inhalation",
  "Warm saline gargles",
  "Continue current medicines",
  "Return if symptoms worsen",
  "Review SOS",
] as const;

/**
 * @deprecated Education folded into PLAN_ADVICE_QUICK_PICKS — kept for import compat.
 */
export const PLAN_EDUCATION_QUICK_PICKS: readonly string[] = [
  "Return if symptoms worsen",
  "Review SOS",
] as const;

/** Investigation order quick-picks: lab panels + common imaging. */
export const PLAN_INVESTIGATION_QUICK_PICKS: readonly string[] =
  INVESTIGATION_QUICK_PICK_ENTRIES.map((entry) => entry.label);

/** Referral specialty quick-picks — short chip strip (full list is searchable). */
export const PLAN_REFERRAL_QUICK_PICKS: readonly string[] =
  REFERRAL_SPECIALTY_QUICK_PICK_LABELS;

/** Urgency prefixes for referral (mutually exclusive). */
export const PLAN_REFERRAL_URGENCY_QUICK_PICKS: readonly string[] = [
  "Routine",
  "Soon",
  "Urgent",
  "ER / same day",
] as const;

/** Why-refer chips (structured; not written into the notes textarea). */
export const PLAN_REFERRAL_REASON_QUICK_PICKS: readonly string[] = [
  "Further evaluation",
  "If not improving",
  "Opinion / second look",
  "Procedure",
] as const;

/** Chip label → preview lead ("Urgent" → "Urgent referral"). */
const REFERRAL_URGENCY_LEAD: Readonly<Record<string, string>> = {
  Routine: "Routine referral",
  Soon: "Early referral",
  Urgent: "Urgent referral",
  "ER / same day": "Same-day referral",
};

const REFERRAL_PARTS_JOIN = " · ";

export type ReferralParts = {
  urgency: string | null;
  specialties: string[];
  reason: string | null;
  /** Free notes — never auto-filled from chips. */
  freeText: string;
};

function urgencyLeadForChip(urgency: string): string {
  return REFERRAL_URGENCY_LEAD[urgency] ?? `${urgency} referral`;
}

function chipForUrgencyLead(text: string): string | null {
  const lower = text.trim().toLowerCase();
  for (const [chip, lead] of Object.entries(REFERRAL_URGENCY_LEAD)) {
    if (lead.toLowerCase() === lower) return chip;
  }
  return null;
}

function matchKnownReason(text: string): string | null {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;
  return (
    PLAN_REFERRAL_REASON_QUICK_PICKS.find((r) => r.toLowerCase() === lower) ??
    null
  );
}

function matchKnownSpecialty(text: string): string | null {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;
  const hit = REFERRAL_SPECIALTY_CATALOG.find(
    (o) => o.label.toLowerCase() === lower,
  );
  return hit?.label ?? null;
}

function normalizeSpecialtyList(specialties: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of specialties) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(matchKnownSpecialty(label) ?? label);
  }
  return out;
}

function splitSpecialtyBlob(blob: string): string[] {
  return normalizeSpecialtyList(
    blob
      .split(/\s*(?:,|;|\band\b|\s+·\s+)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Toggle a specialty in the multi-select list. */
export function toggleReferralSpecialty(
  specialties: readonly string[],
  label: string,
): string[] {
  const trimmed = label.trim();
  if (!trimmed) return [...specialties];
  const key = trimmed.toLowerCase();
  const has = specialties.some((s) => s.toLowerCase() === key);
  if (has) {
    return specialties.filter((s) => s.toLowerCase() !== key);
  }
  return normalizeSpecialtyList([...specialties, trimmed]);
}

/** Add a specialty if missing (search commit). */
export function addReferralSpecialty(
  specialties: readonly string[],
  label: string,
): string[] {
  const trimmed = label.trim();
  if (!trimmed) return [...specialties];
  if (specialties.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
    return [...specialties];
  }
  return normalizeSpecialtyList([...specialties, trimmed]);
}

/**
 * Compile chips + notes into persisted / preview text.
 * Parts style — no forced "for …" sentence.
 * e.g. `Routine referral · Internal Medicine, Cardiology · If not improving`
 */
export function composeReferral(parts: ReferralParts): string {
  const urgency = parts.urgency?.trim() || null;
  const specialties = normalizeSpecialtyList(parts.specialties ?? []);
  const reason = parts.reason?.trim() || null;
  const freeText = parts.freeText.trim();

  const bits: string[] = [];
  if (urgency) bits.push(urgencyLeadForChip(urgency));
  if (specialties.length > 0) bits.push(specialties.join(", "));
  if (reason) bits.push(reason);

  const body = bits.join(REFERRAL_PARTS_JOIN);
  if (body && freeText) return `${body} — ${freeText}`;
  return body || freeText;
}

/** Patient-facing / save / L1 preview string; null when empty. */
export function resolveReferralForOutput(parts: ReferralParts): string | null {
  const composed = composeReferral(parts).trim();
  return composed || null;
}

/** Map form chip + notes fields into ReferralParts. */
export function referralPartsFromFields(fields: {
  referralUrgency: string | null;
  referralSpecialties: readonly string[];
  referralReason: string | null;
  referral: string;
}): ReferralParts {
  return {
    urgency: fields.referralUrgency,
    specialties: [...fields.referralSpecialties],
    reason: fields.referralReason,
    freeText: fields.referral,
  };
}

/**
 * Split a persisted `referral` TEXT into chip fields + notes.
 * Accepts parts form, sentence form, and legacy `Urgent: ENT` dumps.
 */
export function hydrateReferralFields(saved: string | null | undefined): {
  referralUrgency: string | null;
  referralSpecialties: string[];
  referralReason: string | null;
  referral: string;
} {
  const parts = parseReferral(saved ?? "");
  return {
    referralUrgency: parts.urgency,
    referralSpecialties: parts.specialties,
    referralReason: parts.reason,
    referral: parts.freeText,
  };
}

/** Parse referral free-text into urgency / specialties / reason / notes. */
export function parseReferral(existing: string): ReferralParts {
  let trimmed = existing.trim();
  if (!trimmed) {
    return { urgency: null, specialties: [], reason: null, freeText: "" };
  }

  let freeText = "";
  const emDashIdx = trimmed.lastIndexOf(" — ");
  if (emDashIdx > 0) {
    freeText = trimmed.slice(emDashIdx + 3).trim();
    trimmed = trimmed.slice(0, emDashIdx).trim();
  }

  // Preferred parts form: `Urgent referral · ENT, Cardiology · Further evaluation`
  if (trimmed.includes(REFERRAL_PARTS_JOIN)) {
    const segments = trimmed
      .split(REFERRAL_PARTS_JOIN)
      .map((s) => s.trim())
      .filter(Boolean);
    let urgency: string | null = null;
    let reason: string | null = null;
    const specialtySegs: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (i === 0) {
        const fromLead = chipForUrgencyLead(seg);
        if (fromLead) {
          urgency = fromLead;
          continue;
        }
        const u = PLAN_REFERRAL_URGENCY_QUICK_PICKS.find(
          (chip) => chip.toLowerCase() === seg.toLowerCase(),
        );
        if (u) {
          urgency = u;
          continue;
        }
      }
      if (i === segments.length - 1) {
        const knownReason = matchKnownReason(seg);
        if (knownReason) {
          reason = knownReason;
          continue;
        }
      }
      specialtySegs.push(...splitSpecialtyBlob(seg));
    }

    return {
      urgency,
      specialties: normalizeSpecialtyList(specialtySegs),
      reason,
      freeText,
    };
  }

  let urgency: string | null = null;
  let rest = trimmed;

  const urgencyMatchers: { chip: string; patterns: RegExp[] }[] = [
    {
      chip: "ER / same day",
      patterns: [
        /^same-day referral\b/i,
        /^er\s*\/\s*same day\s*(?::|—|-)?\s*/i,
      ],
    },
    {
      chip: "Soon",
      patterns: [/^early referral\b/i, /^soon\s*(?::|—|-)?\s*/i],
    },
    {
      chip: "Routine",
      patterns: [/^routine referral\b/i, /^routine\s*(?::|—|-)?\s*/i],
    },
    {
      chip: "Urgent",
      patterns: [/^urgent referral\b/i, /^urgent\s*(?::|—|-)?\s*/i],
    },
  ];

  for (const { chip, patterns } of urgencyMatchers) {
    for (const re of patterns) {
      const m = rest.match(re);
      if (m && m.index === 0) {
        urgency = chip;
        rest = rest.slice(m[0].length).trim();
        if (rest.startsWith(":")) rest = rest.slice(1).trim();
        break;
      }
    }
    if (urgency) break;
  }

  rest = rest.replace(/^referral\b\s*/i, "").trim();

  const toFor = rest.match(/^to\s+(.+?)(?:\s+for\s+(.+))?$/i);
  if (toFor) {
    return {
      urgency,
      specialties: splitSpecialtyBlob(toFor[1]!),
      reason: toFor[2]
        ? (matchKnownReason(toFor[2]) ?? toFor[2].trim())
        : null,
      freeText,
    };
  }

  const forOnly = rest.match(/^for\s+(.+)$/i);
  if (forOnly) {
    return {
      urgency,
      specialties: [],
      reason: matchKnownReason(forOnly[1]!) ?? forOnly[1]!.trim(),
      freeText,
    };
  }

  const lines = rest
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { urgency, specialties: [], reason: null, freeText };
  }

  if (lines.length >= 2) {
    const maybeReason = matchKnownReason(lines[lines.length - 1]!);
    if (maybeReason) {
      const head = lines.slice(0, -1).join(", ").trim();
      return {
        urgency,
        specialties: splitSpecialtyBlob(head),
        reason: maybeReason,
        freeText,
      };
    }
  }

  const single = lines.join(", ").trim();
  const knownReason = matchKnownReason(single);
  if (knownReason) {
    return { urgency, specialties: [], reason: knownReason, freeText };
  }

  for (const r of PLAN_REFERRAL_REASON_QUICK_PICKS) {
    const suffix = ` for ${r}`;
    if (single.toLowerCase().endsWith(suffix.toLowerCase())) {
      const head = single.slice(0, single.length - suffix.length).trim();
      return {
        urgency,
        specialties: splitSpecialtyBlob(head),
        reason: r,
        freeText,
      };
    }
  }

  const specialties = splitSpecialtyBlob(single);
  if (specialties.length > 0) {
    return { urgency, specialties, reason: null, freeText };
  }

  if (!urgency) {
    return {
      urgency: null,
      specialties: [],
      reason: null,
      freeText: freeText ? `${single} — ${freeText}` : single,
    };
  }

  return { urgency, specialties: [], reason: null, freeText };
}

/** @deprecated Prefer structured chip fields + composeReferral. */
export function stripReferralUrgency(existing: string): string {
  const parts = parseReferral(existing);
  return composeReferral({ ...parts, urgency: null });
}

/** @deprecated Prefer comparing `referralUrgency` directly. */
export function isReferralUrgencySelected(
  existing: string,
  urgency: string,
): boolean {
  return parseReferral(existing).urgency === urgency;
}

/** @deprecated Prefer setting `referralUrgency` then composeReferral. */
export function applyReferralUrgency(existing: string, urgency: string): string {
  const parts = parseReferral(existing);
  return composeReferral({ ...parts, urgency });
}

/**
 * @deprecated Prefer `addReferralSpecialty` / `toggleReferralSpecialty`.
 * Kept for legacy callers/tests.
 */
export function appendReferralPhrase(existing: string, phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed) return existing;

  const parts = parseReferral(existing);

  if (matchKnownReason(trimmed)) {
    if (parts.reason?.toLowerCase() === trimmed.toLowerCase()) return existing;
    return composeReferral({
      ...parts,
      reason: matchKnownReason(trimmed) ?? trimmed,
    });
  }

  if (parts.specialties.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }

  return composeReferral({
    ...parts,
    specialties: addReferralSpecialty(parts.specialties, trimmed),
  });
}

export type FollowUpQuickPickUnit = "days" | "weeks" | "months" | "as_needed";

export type FollowUpQuickPick =
  | {
      label: string;
      action: "interval";
      value: number;
      unit: Exclude<FollowUpQuickPickUnit, "as_needed">;
    }
  | { label: string; action: "as_needed" }
  | { label: string; action: "clear" };

/** Common OPD follow-up intervals (sets structured value/unit). */
export const PLAN_FOLLOW_UP_QUICK_PICKS: readonly FollowUpQuickPick[] = [
  { label: "3 days", action: "interval", value: 3, unit: "days" },
  { label: "1 week", action: "interval", value: 1, unit: "weeks" },
  { label: "2 weeks", action: "interval", value: 2, unit: "weeks" },
  { label: "1 month", action: "interval", value: 1, unit: "months" },
  { label: "3 months", action: "interval", value: 3, unit: "months" },
  { label: "As needed", action: "as_needed" },
  { label: "No follow-up", action: "clear" },
] as const;

export function isFollowUpQuickPickSelected(
  pick: FollowUpQuickPick,
  value: number | null,
  unit: FollowUpQuickPickUnit | null,
): boolean {
  if (pick.action === "clear") return value == null && unit == null;
  if (pick.action === "as_needed") return unit === "as_needed";
  return value === pick.value && unit === pick.unit;
}

export function applyFollowUpQuickPick(pick: FollowUpQuickPick): {
  followUpValue: number | null;
  followUpUnit: FollowUpQuickPickUnit | null;
  clearNotes: boolean;
} {
  if (pick.action === "clear") {
    return { followUpValue: null, followUpUnit: null, clearNotes: true };
  }
  if (pick.action === "as_needed") {
    return { followUpValue: null, followUpUnit: "as_needed", clearNotes: false };
  }
  return {
    followUpValue: pick.value,
    followUpUnit: pick.unit,
    clearNotes: false,
  };
}

/**
 * Append a phrase if it is not already present (case-insensitive).
 * Uses newline for multi-line advice; pass `separator` for "; "-style fields.
 */
export function appendUniquePlanPhrase(
  existing: string,
  phrase: string,
  separator = "\n",
): string {
  const trimmed = phrase.trim();
  if (!trimmed) return existing;
  const base = existing.trim();
  if (!base) return trimmed;
  if (planPhraseTokenPresent(base, trimmed)) return existing;
  return `${base}${separator}${trimmed}`;
}

export function planPhraseAlreadyPresent(existing: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  return existing.toLowerCase().includes(trimmed.toLowerCase());
}

/**
 * Token-aware presence check (word boundaries). Prefer this for short specialty
 * labels like "ENT" that would false-positive inside "Urgent".
 */
export function planPhraseTokenPresent(existing: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w/])${escaped}(?=$|[^\\w/])`, "i").test(existing);
}
