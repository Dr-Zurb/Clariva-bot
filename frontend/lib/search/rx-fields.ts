/**
 * Static SOAP-field index for the Cmd-K `fields` source (rfeq-01).
 *
 * Client-only. Labels come from the existing section-order / vitals
 * registries — never recopied as string literals. Custom blocks
 * (`custom_block:…`) are out of the index (RFE1-D3).
 *
 * Hits are navigation-only: `routedTo` is the current appointment path
 * plus `rxFocus=pane.section[.field]`. The source is silent off
 * `/dashboard/appointments/:id` (RFE-DL-2).
 */

import { ASSESSMENT_SECTION_LABELS } from "@/lib/cockpit/assessment-section-order";
import { CATEGORICAL_VITALS_REGISTRY } from "@/lib/cockpit/categorical-vitals-schema";
import { OBJECTIVE_SECTION_LABELS } from "@/lib/cockpit/objective-section-order";
import { PLAN_SECTION_LABELS } from "@/lib/cockpit/plan-section-order";
import { SUBJECTIVE_SECTION_LABELS } from "@/lib/cockpit/subjective-section-order";
import { VITALS_REGISTRY } from "@/lib/cockpit/vitals-schema";

/** SOAP pane ids that can appear in `rxFocus` (matches `COCKPIT_TAB_ORDER` leaves). */
export type RxFieldPaneId = "subjective" | "objective" | "assessment" | "plan";

export interface RxFieldIndexEntry {
  pane: RxFieldPaneId;
  section: string;
  field?: string;
  /** Display label — pointer into a registry, not a copy. */
  label: string;
}

/** Palette row. Same four keys as `SourceItem` — no action kind. */
export interface RxFieldHit {
  id: string;
  label: string;
  subtitle: string;
  routedTo: string;
}

const APPOINTMENT_PATH_RE = /^\/dashboard\/appointments\/([^/]+)$/;

const PANE_SUBTITLE: Record<RxFieldPaneId, string> = {
  subjective: "Subjective",
  objective: "Objective",
  assessment: "Assessment",
  plan: "Plan",
};

/** Max hits per query — matches the patients source. */
const MAX_HITS = 8;

function sectionEntries(
  pane: RxFieldPaneId,
  labels: Record<string, string>,
): RxFieldIndexEntry[] {
  return Object.entries(labels).map(([section, label]) => ({
    pane,
    section,
    label,
  }));
}

function buildIndex(): readonly RxFieldIndexEntry[] {
  const sections: RxFieldIndexEntry[] = [
    ...sectionEntries("subjective", SUBJECTIVE_SECTION_LABELS),
    ...sectionEntries("objective", OBJECTIVE_SECTION_LABELS),
    ...sectionEntries("assessment", ASSESSMENT_SECTION_LABELS),
    ...sectionEntries("plan", PLAN_SECTION_LABELS),
  ];
  const vitals: RxFieldIndexEntry[] = [
    ...VITALS_REGISTRY.map((def) => ({
      pane: "objective" as const,
      section: "vitals",
      field: def.key,
      label: def.label,
    })),
    ...CATEGORICAL_VITALS_REGISTRY.map((def) => ({
      pane: "objective" as const,
      section: "vitals",
      field: def.key,
      label: def.label,
    })),
  ];
  return [...sections, ...vitals];
}

/** Module-scope snapshot — registries are compile-time constants. */
const INDEX: readonly RxFieldIndexEntry[] = buildIndex();

/** Exposed for tests (label-registry lock, custom-block absence). */
export function listRxFieldIndex(): readonly RxFieldIndexEntry[] {
  return INDEX;
}

export function appointmentIdFromPath(pathname: string): string | null {
  const match = APPOINTMENT_PATH_RE.exec(pathname);
  return match?.[1] ?? null;
}

export function rxFocusValue(entry: RxFieldIndexEntry): string {
  return entry.field
    ? `${entry.pane}.${entry.section}.${entry.field}`
    : `${entry.pane}.${entry.section}`;
}

function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function matches(entry: RxFieldIndexEntry, needle: string): boolean {
  if (fold(entry.label).includes(needle)) return true;
  if (fold(entry.section.replace(/_/g, " ")).includes(needle)) return true;
  if (fold(entry.section).includes(needle)) return true;
  if (entry.field && fold(entry.field).includes(needle)) return true;
  return false;
}

function subtitleFor(entry: RxFieldIndexEntry): string {
  const pane = PANE_SUBTITLE[entry.pane];
  if (!entry.field) return pane;
  const sectionLabel =
    entry.pane === "objective"
      ? OBJECTIVE_SECTION_LABELS.vitals
      : entry.section;
  return `${pane} · ${sectionLabel}`;
}

function toHit(entry: RxFieldIndexEntry, pathname: string): RxFieldHit {
  const focus = rxFocusValue(entry);
  return {
    id: focus,
    label: entry.label,
    subtitle: subtitleFor(entry),
    routedTo: `${pathname}?rxFocus=${encodeURIComponent(focus)}`,
  };
}

/**
 * Search the static field index. Returns `[]` unless `pathname` is exactly
 * `/dashboard/appointments/:id`. Match is case-insensitive substring
 * (NFKC so `spo2` hits `SpO₂`). No network.
 */
export function searchRxFields(query: string, pathname: string): RxFieldHit[] {
  if (!appointmentIdFromPath(pathname)) return [];
  const needle = fold(query.trim());
  if (needle.length === 0) return [];

  const hits: RxFieldHit[] = [];
  for (const entry of INDEX) {
    if (!matches(entry, needle)) continue;
    hits.push(toHit(entry, pathname));
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}
