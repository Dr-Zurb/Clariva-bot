/**
 * Doctor-authored custom vitals (vit-14).
 *
 * Two storage homes, mirroring the objective custom-section engine
 * (`custom-objective-sections.ts`):
 *   - DEFINITIONS live per-doctor in `doctor_settings.vitals_custom` (config,
 *     not PHI) and seed every fresh visit.
 *   - VALUES live per-visit in `prescriptions.vitals_json` under the
 *     self-describing `vitalsCustom` slot (PHI). Each value entry snapshots its
 *     own label/unit/kind so a historical prescription renders faithfully even
 *     after the doctor renames or removes the definition (retain-on-remove).
 *
 * Derived-text contract (V3-D5): an empty custom set derives to nothing, so
 * `deriveVitalsText` stays byte-identical for shipped-column rows.
 */

import type { VitalGroup } from "@/lib/cockpit/vitals-schema";
import type { VitalsCustomValueEntry, VitalsJson } from "@/types/prescription";
import type { VitalNotesMap } from "@/lib/cockpit/vital-notes";
import { formatVitalLineWithNote, normalizeVitalNoteText } from "@/lib/cockpit/vital-notes";

export type CustomVitalKind = "numeric" | "text";
export type CustomVitalGroup = VitalGroup;

/** A per-doctor custom-vital DEFINITION (not a value). Persisted in settings. */
export interface CustomVitalDef {
  id: string;
  label: string;
  unit?: string | null;
  kind: CustomVitalKind;
  group: CustomVitalGroup;
}

/** Caps + field lengths — kept in lockstep with the backend Zod schema (vit-14). */
export const CUSTOM_VITALS_MAX = 30;
export const CUSTOM_VITAL_LABEL_MAX = 60;
export const CUSTOM_VITAL_UNIT_MAX = 16;

export const CUSTOM_VITAL_KINDS: readonly CustomVitalKind[] = ["numeric", "text"];
export const CUSTOM_VITAL_GROUPS: readonly CustomVitalGroup[] = [
  "core",
  "respiratory",
  "metabolic",
  "neuro",
  "paediatric",
  "obstetric",
];

/** Per-visit entered values keyed by definition id (null = not entered). */
export type CustomVitalValueMap = Record<string, number | string | null>;

const CUSTOM_VITAL_ID_PREFIX = "custom_";

export function createCustomVitalId(): string {
  return `${CUSTOM_VITAL_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isCustomVitalId(id: string): boolean {
  return typeof id === "string" && id.startsWith(CUSTOM_VITAL_ID_PREFIX);
}

/** Capitalize the first character; leave the rest of the label as entered. */
export function capitalizeVitalLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function isCustomVitalKind(value: unknown): value is CustomVitalKind {
  return value === "numeric" || value === "text";
}

function isCustomVitalGroup(value: unknown): value is CustomVitalGroup {
  return (CUSTOM_VITAL_GROUPS as readonly string[]).includes(value as string);
}

/** Trim/coerce a single definition for storage; returns null when unusable. */
export function sanitizeCustomVitalDef(raw: unknown): CustomVitalDef | null {
  if (!raw || typeof raw !== "object") return null;
  const def = raw as Record<string, unknown>;
  const id = typeof def.id === "string" ? def.id.trim() : "";
  const label = capitalizeVitalLabel(
    typeof def.label === "string" ? def.label.slice(0, CUSTOM_VITAL_LABEL_MAX) : "",
  );
  if (!id || !label) return null;
  if (!isCustomVitalKind(def.kind)) return null;
  const group = isCustomVitalGroup(def.group) ? def.group : "core";
  const unit =
    typeof def.unit === "string" && def.unit.trim()
      ? def.unit.trim().slice(0, CUSTOM_VITAL_UNIT_MAX)
      : null;
  return { id, label, unit, kind: def.kind, group };
}

/** Sanitize + dedupe (last write wins) + cap a definition list. */
export function normalizeCustomVitalDefs(raw: unknown): CustomVitalDef[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, CustomVitalDef>();
  for (const entry of raw) {
    const def = sanitizeCustomVitalDef(entry);
    if (def) byId.set(def.id, def);
  }
  return Array.from(byId.values()).slice(0, CUSTOM_VITALS_MAX);
}

export function createCustomVitalDef(
  label: string,
  kind: CustomVitalKind,
  group: CustomVitalGroup,
  unit?: string | null,
): CustomVitalDef {
  return {
    id: createCustomVitalId(),
    label: capitalizeVitalLabel(label).slice(0, CUSTOM_VITAL_LABEL_MAX),
    unit: unit?.trim() ? unit.trim().slice(0, CUSTOM_VITAL_UNIT_MAX) : null,
    kind,
    group,
  };
}

/** Update an existing definition in-place (stable `id`). */
export function updateCustomVitalDef(
  defs: CustomVitalDef[],
  updated: CustomVitalDef,
): CustomVitalDef[] {
  const sanitized = sanitizeCustomVitalDef(updated);
  if (!sanitized) return normalizeCustomVitalDefs(defs);
  return normalizeCustomVitalDefs(
    defs.map((def) => (def.id === sanitized.id ? sanitized : def)),
  );
}

/** Apply editable fields to an existing definition (preserves `id`). */
export function patchCustomVitalDef(
  existing: CustomVitalDef,
  patch: {
    label: string;
    kind: CustomVitalKind;
    group: CustomVitalGroup;
    unit?: string | null;
  },
): CustomVitalDef {
  const unit =
    patch.kind === "numeric" && patch.unit?.trim()
      ? patch.unit.trim().slice(0, CUSTOM_VITAL_UNIT_MAX)
      : null;
  return {
    id: existing.id,
    label: capitalizeVitalLabel(patch.label).slice(0, CUSTOM_VITAL_LABEL_MAX),
    kind: patch.kind,
    group: patch.group,
    unit,
  };
}

/** Stable structural signature (id+label+unit+kind+group) for autosave debounce. */
export function customVitalDefsStructureKey(defs: CustomVitalDef[]): string {
  return JSON.stringify(
    normalizeCustomVitalDefs(defs).map((d) => ({
      id: d.id,
      label: d.label,
      unit: d.unit ?? null,
      kind: d.kind,
      group: d.group,
    })),
  );
}

/** Load the doctor's stored custom-vital definitions (empty = none). */
export async function fetchCustomVitals(token: string): Promise<CustomVitalDef[]> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return normalizeCustomVitalDefs(res.data.settings.vitals_custom);
}

/** Persist the doctor's custom-vital definition default (config, not PHI). */
export async function saveCustomVitalsDefault(
  token: string,
  defs: CustomVitalDef[],
): Promise<CustomVitalDef[]> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const normalized = normalizeCustomVitalDefs(defs);
  const res = await patchDoctorSettings(token, { vitals_custom: normalized });
  return normalizeCustomVitalDefs(res.data.settings.vitals_custom);
}

/** Merge stored defs into the active form defs (form snapshots win on id). */
export function mergeCustomVitalDefs(
  active: CustomVitalDef[],
  incoming: CustomVitalDef[],
): CustomVitalDef[] {
  const byId = new Map<string, CustomVitalDef>();
  for (const def of normalizeCustomVitalDefs(incoming)) byId.set(def.id, def);
  for (const def of normalizeCustomVitalDefs(active)) byId.set(def.id, def);
  return Array.from(byId.values()).slice(0, CUSTOM_VITALS_MAX);
}

// ---------------------------------------------------------------------------
// Per-visit VALUE helpers (vitals_json `vitalsCustom` slot)
// ---------------------------------------------------------------------------

function sanitizeCustomValue(
  kind: CustomVitalKind,
  raw: unknown,
): number | string | null {
  if (kind === "numeric") {
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? s : null;
}

/** Sanitize the self-describing `vitalsCustom` entry array from a json payload. */
export function normalizeVitalsCustomEntries(raw: unknown): VitalsCustomValueEntry[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, VitalsCustomValueEntry>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id.trim() : "";
    const label = typeof e.label === "string" ? e.label.trim().slice(0, CUSTOM_VITAL_LABEL_MAX) : "";
    if (!id || !label || !isCustomVitalKind(e.kind)) continue;
    const value = sanitizeCustomValue(e.kind, e.value);
    if (value === null) continue;
    const unit =
      typeof e.unit === "string" && e.unit.trim()
        ? e.unit.trim().slice(0, CUSTOM_VITAL_UNIT_MAX)
        : null;
    const note = normalizeVitalNoteText(e.note);
    byId.set(id, {
      id,
      label,
      unit,
      kind: e.kind,
      value,
      ...(note ? { note } : {}),
    });
  }
  return Array.from(byId.values()).slice(0, CUSTOM_VITALS_MAX);
}

/**
 * Build the self-describing `vitalsCustom` value entries from the active
 * definitions + the entered value map. Definitions with no entered value drop
 * out, so an untouched custom vital adds nothing to the payload.
 */
export function assembleVitalsCustomEntries(
  defs: CustomVitalDef[],
  values: CustomVitalValueMap,
  notes?: VitalNotesMap | null,
): VitalsCustomValueEntry[] {
  const entries: VitalsCustomValueEntry[] = [];
  for (const def of normalizeCustomVitalDefs(defs)) {
    const value = sanitizeCustomValue(def.kind, values[def.id]);
    if (value === null) continue;
    const note = normalizeVitalNoteText(notes?.[def.id]);
    entries.push({
      id: def.id,
      label: def.label,
      unit: def.kind === "numeric" ? def.unit ?? null : null,
      kind: def.kind,
      value,
      ...(note ? { note } : {}),
    });
  }
  return entries;
}

/**
 * Reconstruct the form-state defs + values for a visit: the doctor's default
 * definitions, overlaid with any self-describing entries already stored on the
 * prescription (so a historical Rx keeps showing a since-removed custom vital).
 */
export function hydrateVitalsCustom(
  json: VitalsJson | null | undefined,
  doctorDefaults: CustomVitalDef[],
): { defs: CustomVitalDef[]; values: CustomVitalValueMap } {
  const defaults = normalizeCustomVitalDefs(doctorDefaults);
  const stored = normalizeVitalsCustomEntries(json?.vitalsCustom);

  const defsById = new Map<string, CustomVitalDef>();
  for (const def of defaults) defsById.set(def.id, def);

  const values: CustomVitalValueMap = {};
  for (const def of defaults) values[def.id] = null;

  for (const entry of stored) {
    // A stored value's snapshot wins for label/unit (point-in-time record).
    defsById.set(entry.id, {
      id: entry.id,
      label: entry.label,
      unit: entry.unit ?? null,
      kind: entry.kind,
      group: defsById.get(entry.id)?.group ?? "core",
    });
    values[entry.id] = entry.value;
  }

  return { defs: Array.from(defsById.values()), values };
}

/** Derived-text lines for custom vitals (numeric: `Label: value unit`; text: `Label: value`). */
export function deriveVitalsCustomLines(entries: VitalsCustomValueEntry[]): string[] {
  return normalizeVitalsCustomEntries(entries).map((e) => {
    const base =
      e.kind === "numeric"
        ? `${e.label}: ${e.value}${e.unit ? ` ${e.unit}` : ""}`
        : `${e.label}: ${e.value}`;
    return formatVitalLineWithNote(base, e.note);
  });
}

/** Notes stored on self-describing custom entries (for hydrate into form state). */
export function hydrateCustomVitalNotesFromEntries(
  raw: unknown,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of normalizeVitalsCustomEntries(raw)) {
    const note = normalizeVitalNoteText(entry.note);
    if (note) out[entry.id] = note;
  }
  return out;
}
