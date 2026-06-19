/**
 * Per-doctor complaint attribute defaults (subj-09 / ST.9).
 *
 * Derives most-common attribute values from prior complaints with the same name.
 * Suggestions are kept separate from entered data until confirmed.
 */

import type { Complaint, ComplaintSeverity } from "@/types/prescription";
import {
  type ComplaintAttributeKey,
  type ComplaintCategory,
} from "@/lib/cockpit/complaint-schema";

export type ComplaintAttributeDefaults = Partial<Pick<Complaint, ComplaintAttributeKey>>;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function isEmptyAttributeValue(
  key: ComplaintAttributeKey,
  value: Complaint[ComplaintAttributeKey] | undefined,
): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function attributeValueKey(
  key: ComplaintAttributeKey,
  value: Complaint[ComplaintAttributeKey],
): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

/** Pick the mode of non-empty string/severity values. */
export function mostCommonAttributeValue<T extends string | ComplaintSeverity>(
  values: T[],
): T | undefined {
  const counts = new Map<string, { value: T; count: number }>();
  for (const raw of values) {
    if (raw === null || raw === undefined) continue;
    const str = String(raw).trim();
    if (!str) continue;
    const key = str.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { value: raw, count: 1 });
    }
  }
  let best: { value: T; count: number } | undefined;
  for (const entry of Array.from(counts.values())) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.value;
}

/** Prior complaints matching by exact name (case-insensitive trim). */
export function pickMatchingPriorComplaints(
  complaintName: string,
  priorComplaints: Complaint[],
): Complaint[] {
  const normalized = normalizeName(complaintName);
  if (!normalized) return [];

  return priorComplaints.filter((c) => normalizeName(c.name) === normalized);
}

export interface ResolveComplaintDefaultsInput {
  complaintName: string;
  category?: ComplaintCategory | string | null;
  priorComplaints: Complaint[];
  attributeKeys: ComplaintAttributeKey[];
}

/** Most-common attribute values for a complaint from prior charting. */
export function resolveComplaintAttributeDefaults(
  input: ResolveComplaintDefaultsInput,
): ComplaintAttributeDefaults {
  const matches = pickMatchingPriorComplaints(
    input.complaintName,
    input.priorComplaints,
  );
  if (matches.length === 0) return {};

  const defaults: ComplaintAttributeDefaults = {};
  for (const key of input.attributeKeys) {
    const values = matches
      .map((c) => c[key])
      .filter((v) => !isEmptyAttributeValue(key, v)) as Array<
      Complaint[ComplaintAttributeKey]
    >;
    if (values.length === 0) continue;

    if (key === "severity") {
      const mode = mostCommonAttributeValue(values as ComplaintSeverity[]);
      if (mode !== undefined) defaults.severity = mode;
      continue;
    }

    if (key === "feverGrade") {
      const strings = values.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      const mode = mostCommonAttributeValue(strings);
      if (mode !== undefined) {
        (defaults as Record<string, string>).feverGrade = mode;
      }
      continue;
    }

    if (key === "temperature" || key === "temperatureUnit") {
      continue;
    }

    const strings = values.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    const mode = mostCommonAttributeValue(strings);
    if (mode !== undefined) {
      (defaults as Record<string, string>)[key] = mode;
    }
  }

  return defaults;
}

export function hasComplaintAttributeDefaults(
  defaults: ComplaintAttributeDefaults,
): boolean {
  return Object.keys(defaults).length > 0;
}

/** Keep suggestions only for fields the doctor has not entered yet. */
export function filterSuggestionsForEmptyFields(
  value: Complaint,
  suggestions: ComplaintAttributeDefaults,
  attributeKeys: ComplaintAttributeKey[],
): ComplaintAttributeDefaults {
  const filtered: ComplaintAttributeDefaults = {};
  for (const key of attributeKeys) {
    if (!isEmptyAttributeValue(key, value[key])) continue;
    const suggested = suggestions[key];
    if (isEmptyAttributeValue(key, suggested)) continue;
    (filtered as Record<string, unknown>)[key] = suggested;
  }
  return filtered;
}

/** Build a patch applying all (or selected) suggested keys. */
export function buildConfirmedDefaultsPatch(
  suggestions: ComplaintAttributeDefaults,
  keys?: ComplaintAttributeKey[],
): Partial<Complaint> {
  const patch: Partial<Complaint> = {};
  const entries = keys ?? (Object.keys(suggestions) as ComplaintAttributeKey[]);
  for (const key of entries) {
    const suggested = suggestions[key];
    if (isEmptyAttributeValue(key, suggested)) continue;
    (patch as Record<string, unknown>)[key] = suggested;
  }
  return patch;
}

/** Whether a field already has doctor-entered data (explicit edit). */
export function isExplicitComplaintField(
  value: Complaint,
  key: ComplaintAttributeKey,
): boolean {
  return !isEmptyAttributeValue(key, value[key]);
}

/** Merge sibling + last-visit complaints into one prior pool (dedupe by id). */
export function mergePriorComplaintPools(...pools: Complaint[][]): Complaint[] {
  const seen = new Set<string>();
  const merged: Complaint[] = [];
  for (const pool of pools) {
    for (const complaint of pool) {
      if (seen.has(complaint.id)) continue;
      seen.add(complaint.id);
      merged.push(complaint);
    }
  }
  return merged;
}

export function suggestedFieldCount(
  suggestions: ComplaintAttributeDefaults,
): number {
  return Object.keys(suggestions).length;
}

export function isSuggestedFieldValue(
  key: ComplaintAttributeKey,
  current: Complaint[ComplaintAttributeKey] | undefined,
  suggested: ComplaintAttributeDefaults,
): boolean {
  if (!isEmptyAttributeValue(key, current)) return false;
  const suggestedValue = suggested[key];
  if (isEmptyAttributeValue(key, suggestedValue)) return false;
  return attributeValueKey(key, suggestedValue as Complaint[ComplaintAttributeKey]) !== "";
}
