/**
 * Deterministic vital set-value grammar for the visit command bar (rfec-03).
 *
 * `field value` only (e.g. `spo2 98`, `temp 38.2`, `bp 120/80`). No AI.
 * Ambiguous tokens return a pick list and never auto-write. Out-of-range
 * values return none so Jump can still offer the field.
 *
 * Aliases stay specific: `o2` alone is not SpO₂ / FiO₂ / O₂ flow.
 */

import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import { createEmptyBpReading } from "@/lib/cockpit/bp-readings";
import {
  CATEGORICAL_VITALS_REGISTRY,
  type CategoricalVitalKey,
} from "@/lib/cockpit/categorical-vitals-schema";
import { createEmptyGlucoseReading } from "@/lib/cockpit/glucose-readings";
import { isVitalExcludedFromObjectiveUi } from "@/lib/cockpit/vitals-visibility";
import {
  VITALS_REGISTRY,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";

export type SetVitalWriteKey = VitalKey | CategoricalVitalKey;

export interface SetVitalWrite {
  key: SetVitalWriteKey;
  value: number | string;
}

export interface SetVitalOption {
  id: string;
  label: string;
  focusField: SetVitalWriteKey;
  writes: readonly SetVitalWrite[];
}

export type ParseSetVitalResult =
  | { kind: "none" }
  | { kind: "one"; option: SetVitalOption }
  | { kind: "pick"; options: SetVitalOption[] };

const NONE: ParseSetVitalResult = { kind: "none" };

/** Short names that are specific enough not to collide (RFE2-D4 risk). */
const EXTRA_ALIASES: Partial<Record<SetVitalWriteKey, readonly string[]>> = {
  vitalsSpo2: ["spo2", "sp o2", "sp02", "sat"],
  vitalsTempC: ["temp", "temperature"],
  vitalsHr: ["hr", "pulse", "pr", "heart rate"],
  vitalsRr: ["rr"],
  vitalsWtKg: ["wt", "weight"],
  vitalsHtCm: ["ht", "height"],
  vitalsGlucoseMgDl: ["glucose", "bg", "rbs"],
  vitalsBpSystolic: ["sys", "systolic", "sbp"],
  vitalsBpDiastolic: ["dia", "diastolic", "dbp"],
  vitalsGcsTotal: ["gcs"],
  vitalsGcsE: ["gcs e", "gcs eye"],
  vitalsGcsV: ["gcs v", "gcs verbal"],
  vitalsGcsM: ["gcs m", "gcs motor"],
  vitalsO2FlowLMin: ["o2 flow", "oxygen flow"],
  vitalsFio2Pct: ["fio2"],
  vitalsAvpu: ["avpu"],
  vitalsPupilSizeLeftMm: ["pupil"],
  vitalsPupilSizeRightMm: ["pupil"],
};

const BP_PAIR_ALIASES = ["bp", "blood pressure"] as const;

type CatalogEntry =
  | {
      kind: "numeric";
      key: VitalKey;
      displayLabel: string;
      aliases: string[];
      hardMin: number;
      hardMax: number;
    }
  | {
      kind: "categorical";
      key: CategoricalVitalKey;
      displayLabel: string;
      aliases: string[];
      options: readonly { value: string; label: string }[];
    }
  | {
      kind: "bp-pair";
      aliases: string[];
    };

function fold(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[₂]/g, "2")
    .toLowerCase()
    .replace(/[°]/g, "")
    .replace(/[()[\],]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasesFromLabel(label: string): string[] {
  const out = new Set<string>();
  const folded = fold(label);
  if (folded) out.add(folded);
  const withoutParens = fold(label.replace(/\([^)]*\)/g, " "));
  if (withoutParens) out.add(withoutParens);
  const parenRe = /\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRe.exec(label)) !== null) {
    const inner = fold(match[1] ?? "");
    if (inner.length >= 2) out.add(inner);
  }
  return Array.from(out);
}

function aliasesForKey(key: SetVitalWriteKey, label: string): string[] {
  const extras = EXTRA_ALIASES[key] ?? [];
  return Array.from(
    new Set([...aliasesFromLabel(label), ...extras.map((alias) => fold(alias))])
  ).sort((a, b) => b.length - a.length);
}

function buildCatalog(): readonly CatalogEntry[] {
  const numeric: CatalogEntry[] = VITALS_REGISTRY.filter(
    (def) => !isVitalExcludedFromObjectiveUi(def.key)
  ).map((def) => ({
    kind: "numeric" as const,
    key: def.key,
    displayLabel: def.label,
    aliases: aliasesForKey(def.key, def.label),
    hardMin: def.hardMin,
    hardMax: def.hardMax,
  }));
  const categorical: CatalogEntry[] = CATEGORICAL_VITALS_REGISTRY.map(
    (def) => ({
      kind: "categorical" as const,
      key: def.key,
      displayLabel: def.label,
      aliases: aliasesForKey(def.key, def.label),
      options: def.options,
    })
  );
  return [
    { kind: "bp-pair", aliases: BP_PAIR_ALIASES.map((alias) => fold(alias)) },
    ...numeric,
    ...categorical,
  ];
}

const CATALOG = buildCatalog();

function parseNumberToken(raw: string): number | null {
  const stripped = fold(raw)
    .replace(/\s*%$/, "")
    .replace(/\s*c$/, "")
    .replace(/\s*f$/, "")
    .replace(/\s*mmhg$/, "")
    .replace(/\s*kg$/, "")
    .replace(/\s*cm$/, "")
    .replace(/\s*bpm$/, "")
    .replace(/\s*mg\/dl$/, "")
    .replace(/\s*mmol\/l$/, "")
    .trim();
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

function inHardRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

function parseBpPair(raw: string): { systolic: number; diastolic: number } | null {
  const folded = fold(raw).replace(/\s*mmhg$/, "").trim();
  const match = folded.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
  const sys = VITALS_REGISTRY.find((def) => def.key === "vitalsBpSystolic");
  const dia = VITALS_REGISTRY.find((def) => def.key === "vitalsBpDiastolic");
  if (!sys || !dia) return null;
  if (!inHardRange(systolic, sys.hardMin, sys.hardMax)) return null;
  if (!inHardRange(diastolic, dia.hardMin, dia.hardMax)) return null;
  return { systolic, diastolic };
}

function parseCategoricalValue(
  raw: string,
  options: readonly { value: string; label: string }[]
): string | null {
  const needle = fold(raw);
  if (!needle) return null;
  const hits = options.filter(
    (opt) => fold(opt.value.replace(/_/g, " ")) === needle || fold(opt.label) === needle
  );
  return hits.length === 1 ? hits[0]!.value : null;
}

function bpOption(systolic: number, diastolic: number): SetVitalOption {
  return {
    id: `set:bp:${systolic}/${diastolic}`,
    label: `Set BP to ${systolic}/${diastolic}`,
    focusField: "vitalsBpSystolic",
    writes: [
      { key: "vitalsBpSystolic", value: systolic },
      { key: "vitalsBpDiastolic", value: diastolic },
    ],
  };
}

function numericOption(
  key: VitalKey,
  displayLabel: string,
  value: number
): SetVitalOption {
  return {
    id: `set:${key}:${value}`,
    label: `Set ${displayLabel} to ${value}`,
    focusField: key,
    writes: [{ key, value }],
  };
}

function categoricalOption(
  key: CategoricalVitalKey,
  displayLabel: string,
  value: string,
  optionLabel: string
): SetVitalOption {
  return {
    id: `set:${key}:${value}`,
    label: `Set ${displayLabel} to ${optionLabel}`,
    focusField: key,
    writes: [{ key, value }],
  };
}

function matchAliasPrefix(
  folded: string,
  aliases: readonly string[]
): string | null {
  for (const alias of aliases) {
    if (!alias) continue;
    if (folded === alias) return "";
    if (folded.startsWith(`${alias} `)) {
      return folded.slice(alias.length + 1).trim();
    }
  }
  return null;
}

function optionFromEntry(
  entry: CatalogEntry,
  rest: string
): SetVitalOption | null {
  if (entry.kind === "bp-pair") {
    const pair = parseBpPair(rest);
    return pair ? bpOption(pair.systolic, pair.diastolic) : null;
  }
  if (entry.kind === "numeric") {
    const n = parseNumberToken(rest);
    if (n == null || !inHardRange(n, entry.hardMin, entry.hardMax)) return null;
    return numericOption(entry.key, entry.displayLabel, n);
  }
  const value = parseCategoricalValue(rest, entry.options);
  if (!value) return null;
  const opt = entry.options.find((item) => item.value === value);
  return categoricalOption(
    entry.key,
    entry.displayLabel,
    value,
    opt?.label ?? value
  );
}

/** Parse a command-bar query into zero, one, or several set actions. */
export function parseSetVitalCommand(query: string): ParseSetVitalResult {
  const folded = fold(query);
  if (!folded) return NONE;

  const barePair = parseBpPair(folded);
  if (barePair) {
    return { kind: "one", option: bpOption(barePair.systolic, barePair.diastolic) };
  }

  const options: SetVitalOption[] = [];
  const seen = new Set<string>();
  for (const entry of CATALOG) {
    const rest = matchAliasPrefix(folded, entry.aliases);
    if (rest == null || rest === "") continue;
    const option = optionFromEntry(entry, rest);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }

  if (options.length === 0) return NONE;
  if (options.length === 1) return { kind: "one", option: options[0]! };
  return { kind: "pick", options };
}

export function applySetVitalWrites(
  setField: <K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => void,
  fields: Pick<RxFormFields, "vitalsBpReadings" | "vitalsGlucoseReadings">,
  writes: readonly SetVitalWrite[]
): void {
  for (const write of writes) {
    setField(write.key as keyof RxFormFields, write.value as never);
  }

  const sys = writes.find((write) => write.key === "vitalsBpSystolic");
  const dia = writes.find((write) => write.key === "vitalsBpDiastolic");
  if (sys || dia) {
    const readings = [...fields.vitalsBpReadings];
    const primary = readings[0] ?? createEmptyBpReading();
    readings[0] = {
      ...primary,
      ...(typeof sys?.value === "number" ? { systolic: sys.value } : {}),
      ...(typeof dia?.value === "number" ? { diastolic: dia.value } : {}),
    };
    setField("vitalsBpReadings", readings);
  }

  const glucose = writes.find((write) => write.key === "vitalsGlucoseMgDl");
  if (glucose && typeof glucose.value === "number") {
    const readings = [...fields.vitalsGlucoseReadings];
    const primary = readings[0] ?? createEmptyGlucoseReading();
    readings[0] = { ...primary, valueMgDl: glucose.value };
    setField("vitalsGlucoseReadings", readings);
  }
}
