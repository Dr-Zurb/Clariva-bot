/**
 * Normalize / derive helpers for json-backed extended vitals (vitals-section ·
 * vit-03 / migration 156).
 *
 * The DB source of truth is `prescriptions.vitals_json` (JSONB object). This
 * module is the registry-driven mirror of the `test_results_json` derive path
 * (`test-results.ts`): it sanitizes the json payload against the vit-01
 * registries (numeric bounds from `vitals-schema`, categorical value-sets from
 * `categorical-vitals-schema`) and derives an ADDITIVE human-readable text
 * block for PDF/SMS/snapshot consumers.
 *
 * Byte-parity contract (V3-D5): an empty / all-invalid `vitals_json` derives to
 * "" so nothing appends — a row that uses only shipped columns is byte-identical
 * to today. Pure + stable (registry order, no `Date.now`, no I/O).
 */

import {
  resolveCategoricalVital,
  CATEGORICAL_VITAL_ORDER,
} from "./categorical-vitals-schema";
import {
  deriveExtraBpReadingsText,
  derivePrimaryBpReadingSupplementText,
  hydrateBpContextFromPrescription,
  normalizeBpContext,
  normalizeBpReadings,
  bpReadingNeedsJsonPersistence,
  compactBpReadingForJson,
  serializeBpContextForVitalsJson,
  serializeBpReadingsForVitalsJson,
  bpMeasuredByLabel,
  bpSettingLabel,
} from "./bp-readings";
import {
  compactGlucoseReadingForJson,
  deriveExtraGlucoseReadingsText,
  derivePrimaryGlucoseReadingSupplementText,
  glucoseReadingNeedsJsonPersistence,
  hydrateGlucoseContextFromPrescription,
  normalizeGlucoseContext,
  normalizeGlucoseReadings,
  serializeGlucoseContextForVitalsJson,
  serializeGlucoseReadingsForVitalsJson,
} from "./glucose-readings";
import {
  hydrateMeasurementContextFromPrescription,
  mergeBpBlockContext,
  normalizeMeasurementContext,
  normalizeVitalProvenance,
  serializeMeasurementContextForVitalsJson,
  serializeVitalProvenanceForVitalsJson,
  type MeasurementContext,
  type VitalProvenanceMap,
} from "./measurement-context";
import { vitalsByStorage, resolveVital, type VitalKey } from "./vitals-schema";
import {
  deriveVitalsCustomLines,
  normalizeVitalsCustomEntries,
} from "./vitals-custom";
import {
  formatVitalLineWithNote,
  normalizeVitalNotes,
  serializeVitalNotesForVitalsJson,
  type VitalNotesMap,
} from "./vital-notes";
import type {
  BpContext,
  BpReading,
  GlucoseContext,
  GlucoseReading,
  VitalsCustomValueEntry,
  VitalsJson,
} from "@/types/prescription";

/** Numeric json vitals in registry order (storage: "json"). */
const JSON_NUMERIC_DEFS = vitalsByStorage("json");

/** Numeric json vital keys (storage: "json"). */
export const JSON_VITAL_NUMERIC_KEYS = JSON_NUMERIC_DEFS.map(
  (v) => v.key,
) as readonly Extract<VitalKey, keyof VitalsJson>[];

/** Categorical json vital keys (storage: "json"). */
export const JSON_VITAL_CATEGORICAL_KEYS = CATEGORICAL_VITAL_ORDER;

/** All json-backed vital form/payload keys (numeric then categorical). */
export const JSON_VITAL_FORM_KEYS = [
  ...JSON_VITAL_NUMERIC_KEYS,
  ...JSON_VITAL_CATEGORICAL_KEYS,
] as const;

export type JsonVitalFormKey = (typeof JSON_VITAL_FORM_KEYS)[number];

/** Flat nullable form-state slice for json-backed vitals (vit-04). */
export type JsonVitalFormFields = {
  [K in JsonVitalFormKey]: NonNullable<VitalsJson[K]> | null;
};

/** Seed every json vital key null (vit-04 empty form). */
export function createEmptyJsonVitalFields(): JsonVitalFormFields {
  const out = {} as JsonVitalFormFields;
  for (const key of JSON_VITAL_FORM_KEYS) {
    out[key] = null;
  }
  return out;
}

/** Hydrate flat form fields from `prescriptions.vitals_json` (canonical units). */
export function hydrateJsonVitalFields(
  json: VitalsJson | null | undefined,
): JsonVitalFormFields {
  const fields = createEmptyJsonVitalFields();
  const normalized = normalizeVitalsJson(json);
  for (const key of JSON_VITAL_FORM_KEYS) {
    const value = normalized[key as keyof VitalsJson];
    if (value != null) {
      (fields as Record<JsonVitalFormKey, unknown>)[key] = value;
    }
  }
  return fields;
}

/** Assemble + normalize the payload object from flat form fields. */
export function serializeVitalsJsonFromFields(
  fields: JsonVitalFormFields,
): VitalsJson {
  const raw: Partial<Record<JsonVitalFormKey, NonNullable<VitalsJson[JsonVitalFormKey]>>> = {};
  for (const key of JSON_VITAL_FORM_KEYS) {
    const value = fields[key];
    if (value != null) {
      raw[key] = value;
    }
  }
  return normalizeVitalsJson(raw as VitalsJson);
}

/** True when at least one json vital is present after normalization. */
export function hasVitalsJsonContent(json: VitalsJson): boolean {
  const normalized = normalizeVitalsJson(json);
  return Object.keys(normalized).length > 0;
}

/** Merge json vital fields + optional multi-reading BP + context into one payload object. */
export function assembleVitalsJsonPayload(
  jsonFields: JsonVitalFormFields,
  bpReadings?: readonly BpReading[],
  bpContext?: BpContext | null,
  measurementContext?: MeasurementContext | null,
  vitalProvenance?: VitalProvenanceMap | null,
  customEntries?: readonly VitalsCustomValueEntry[] | null,
  glucoseReadings?: readonly GlucoseReading[],
  glucoseContext?: GlucoseContext | null,
  vitalNotes?: VitalNotesMap | null,
): VitalsJson {
  const base = serializeVitalsJsonFromFields(jsonFields);
  const visit = serializeMeasurementContextForVitalsJson(measurementContext);
  const block = mergeBpBlockContext(
    hydrateMeasurementContextFromPrescription({ measurementContext: measurementContext ?? null }),
    bpContext ?? {},
  );
  const readings = serializeBpReadingsForVitalsJson(bpReadings ?? [], block);
  const context = serializeBpContextForVitalsJson(bpContext);
  const glucoseBlock = hydrateGlucoseContextFromPrescription({ glucoseContext: glucoseContext ?? null });
  const glucoseRows = serializeGlucoseReadingsForVitalsJson(glucoseReadings ?? [], glucoseBlock);
  const glucoseCtx = serializeGlucoseContextForVitalsJson(glucoseContext);
  const provenance = serializeVitalProvenanceForVitalsJson(measurementContext, vitalProvenance);
  const custom = normalizeVitalsCustomEntries(customEntries);
  const notes = serializeVitalNotesForVitalsJson(vitalNotes);
  if (
    !readings &&
    !context &&
    !visit &&
    !provenance &&
    !glucoseRows &&
    !glucoseCtx &&
    custom.length === 0 &&
    !notes
  ) {
    return base;
  }
  return normalizeVitalsJson({
    ...base,
    ...(visit ? { measurementContext: visit } : {}),
    ...(readings ? { bpReadings: readings } : {}),
    ...(context ? { bpContext: context } : {}),
    ...(glucoseRows ? { glucoseReadings: glucoseRows } : {}),
    ...(glucoseCtx ? { glucoseContext: glucoseCtx } : {}),
    ...(provenance ? { vitalProvenance: provenance } : {}),
    ...(custom.length > 0 ? { vitalsCustom: custom } : {}),
    ...(notes ? { vitalNotes: notes } : {}),
  });
}

/** Pick the json-vital slice from a wider form-state object. */
export function pickJsonVitalFields<T extends JsonVitalFormFields>(fields: T): JsonVitalFormFields {
  const out = createEmptyJsonVitalFields();
  for (const key of JSON_VITAL_FORM_KEYS) {
    (out as Record<JsonVitalFormKey, unknown>)[key] = fields[key];
  }
  return out;
}

/**
 * Sanitize a `vitals_json` payload against the registries. Drops unknown keys,
 * non-finite / out-of-bounds numbers, and categorical values outside the
 * allowed set — so a stale or malformed key never bricks a render (V3-D6).
 * Pure: input is never mutated.
 */
export function normalizeVitalsJson(json: VitalsJson | null | undefined): VitalsJson {
  if (!json || typeof json !== "object") return {};
  const source = json as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const def of JSON_NUMERIC_DEFS) {
    const raw = source[def.key];
    if (
      typeof raw === "number" &&
      Number.isFinite(raw) &&
      raw >= def.hardMin &&
      raw <= def.hardMax
    ) {
      out[def.key] = raw;
    }
  }

  for (const key of CATEGORICAL_VITAL_ORDER) {
    const raw = source[key];
    if (typeof raw === "string" && resolveCategoricalVital(key).options.some((o) => o.value === raw)) {
      out[key] = raw;
    }
  }

  const bpReadings = normalizeBpReadings(source.bpReadings);
  const measurementContext = normalizeMeasurementContext(source.measurementContext);
  const bpContext = normalizeBpContext(source.bpContext);
  const block = hydrateBpContextFromPrescription({
    measurementContext,
    bpContext,
  });
  if (bpReadings.length > 1) {
    out.bpReadings = bpReadings.map(compactBpReadingForJson);
  } else if (
    bpReadings.length === 1 &&
    bpReadingNeedsJsonPersistence(bpReadings[0]!, block)
  ) {
    out.bpReadings = [compactBpReadingForJson(bpReadings[0]!)];
  }

  if (bpContext) {
    const persistedBpContext = serializeBpContextForVitalsJson(bpContext);
    if (persistedBpContext) {
      out.bpContext = persistedBpContext;
    }
  }

  if (measurementContext) {
    out.measurementContext = measurementContext;
  }

  const vitalProvenance = normalizeVitalProvenance(source.vitalProvenance);
  if (vitalProvenance) {
    out.vitalProvenance = vitalProvenance;
  }

  const vitalsCustom = normalizeVitalsCustomEntries(source.vitalsCustom);
  if (vitalsCustom.length > 0) {
    out.vitalsCustom = vitalsCustom;
  }

  const glucoseReadings = normalizeGlucoseReadings(source.glucoseReadings);
  const glucoseContext = normalizeGlucoseContext(source.glucoseContext);
  const glucoseBlock = hydrateGlucoseContextFromPrescription({
    glucoseContext,
    vitalsGlucoseDevice:
      typeof source.vitalsGlucoseDevice === "string" ? source.vitalsGlucoseDevice : null,
  } as VitalsJson);
  if (glucoseReadings.length > 1) {
    out.glucoseReadings = glucoseReadings.map(compactGlucoseReadingForJson);
  } else if (
    glucoseReadings.length === 1 &&
    glucoseReadingNeedsJsonPersistence(glucoseReadings[0]!, glucoseBlock)
  ) {
    out.glucoseReadings = [compactGlucoseReadingForJson(glucoseReadings[0]!)];
  }

  if (glucoseContext) {
    const persistedGlucoseContext = serializeGlucoseContextForVitalsJson(glucoseContext);
    if (persistedGlucoseContext) {
      out.glucoseContext = persistedGlucoseContext;
    }
  }

  const vitalNotes = serializeVitalNotesForVitalsJson(normalizeVitalNotes(source.vitalNotes));
  if (vitalNotes) {
    out.vitalNotes = vitalNotes;
  }

  return out as VitalsJson;
}

/** Format a canonical numeric value for derived text (trims a trailing `.0`). */
function formatVitalValue(value: number): string {
  return String(value);
}

/**
 * Derive the additive `vitals_json` text block from the structured payload.
 * Numeric vitals render in registry order as `Label: value unit`; categorical
 * vitals as `Label: <option label>`. An empty / all-invalid payload returns ""
 * (the byte-parity passthrough — appends nothing for shipped-column rows).
 */
export function deriveVitalsText(json: VitalsJson | null | undefined): string {
  const clean = normalizeVitalsJson(json) as Record<string, unknown>;
  const notes = normalizeVitalNotes(clean.vitalNotes);
  const lines: string[] = [];

  for (const def of JSON_NUMERIC_DEFS) {
    const value = clean[def.key];
    if (typeof value === "number") {
      lines.push(
        formatVitalLineWithNote(
          `${def.label}: ${formatVitalValue(value)} ${def.canonicalUnit}`,
          notes[def.key],
        ),
      );
    }
  }

  for (const key of CATEGORICAL_VITAL_ORDER) {
    const value = clean[key];
    if (typeof value === "string") {
      const def = resolveCategoricalVital(key);
      const option = def.options.find((o) => o.value === value);
      if (option) {
        lines.push(formatVitalLineWithNote(`${def.label}: ${option.label}`, notes[key]));
      }
    }
  }

  for (const line of deriveVitalsCustomLines(
    (clean.vitalsCustom as VitalsCustomValueEntry[] | undefined) ?? [],
  )) {
    lines.push(line);
  }

  const bpBlockContext = normalizeBpContext(clean.bpContext);
  const bpReadings = normalizeBpReadings(clean.bpReadings);
  const primaryBp = derivePrimaryBpReadingSupplementText(bpReadings, bpBlockContext);
  const extraBp = deriveExtraBpReadingsText(bpReadings, bpBlockContext);
  const bpDerived = [primaryBp, extraBp].filter((line) => line.length > 0).join("\n");
  if (bpDerived) {
    if (lines.length > 0) lines.push(bpDerived);
    else return bpDerived;
  }

  const glucoseBlockContext = normalizeGlucoseContext(clean.glucoseContext);
  const glucoseReadings = normalizeGlucoseReadings(clean.glucoseReadings);
  const primaryGlucose = derivePrimaryGlucoseReadingSupplementText(
    glucoseReadings,
    glucoseBlockContext,
  );
  const extraGlucose = deriveExtraGlucoseReadingsText(glucoseReadings, glucoseBlockContext);
  const glucoseDerived = [primaryGlucose, extraGlucose].filter((line) => line.length > 0).join("\n");
  if (glucoseDerived) {
    if (lines.length > 0) lines.push(glucoseDerived);
    else if (!bpDerived) return glucoseDerived;
  }

  const provenanceLines = deriveVitalProvenanceText(clean.vitalProvenance, clean.measurementContext);
  for (const line of provenanceLines) {
    lines.push(line);
  }

  return lines.join("\n");
}

function deriveVitalProvenanceText(
  vitalProvenance: unknown,
  measurementContext: unknown,
): string[] {
  const map = normalizeVitalProvenance(vitalProvenance);
  if (!map) return [];
  const visit = hydrateMeasurementContextFromPrescription({
    measurementContext: normalizeMeasurementContext(measurementContext),
  });
  const lines: string[] = [];

  for (const [key, override] of Object.entries(map) as [VitalKey, MeasurementContext][]) {
    const parts: string[] = [];
    const by = bpMeasuredByLabel(override.measuredBy ?? visit.measuredBy);
    const setting = bpSettingLabel(override.setting ?? visit.setting);
    if (by) parts.push(by);
    if (setting) parts.push(setting);
    if (parts.length === 0) continue;
    lines.push(`${resolveVital(key).label}: measured by ${parts.join(" at ")}`);
  }

  return lines;
}
