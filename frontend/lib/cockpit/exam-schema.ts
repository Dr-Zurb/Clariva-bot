/**
 * Exam-system schema registry (objective-tab · obj-02).
 *
 * Pure data module — no React, no network, no side effects. Mirrors the
 * subjective `complaint-schema.ts` pattern (ST-D4): each core system carries
 * a label, a within-normal-limits one-liner, and an abnormal chip palette.
 * The chip vocabulary is UI guidance only; obj-01 Zod does not enforce it.
 *
 * Canonical systemId order is defined by `EXAM_CORE_SYSTEMS` array order and
 * exported as `EXAM_CORE_SYSTEM_ORDER` for obj-01 derivation + obj-03 render.
 */

/** One exam-system entry in the registry (core or resolver fallback). */
export interface ExamSystemDefinition {
  systemId: string;
  label: string;
  /** Within-normal-limits one-liner — filled by "mark normal" / normal toggle. */
  normalLine: string;
  /** Common abnormal finding chips (tap-to-fill; free-text escape hatch stays). */
  abnormalChips: readonly string[];
}

/**
 * Ordered registry of the 5 core exam systems (P1 v1 scope — exam-catalog §A1).
 * Array order is the canonical derivation + render order contract.
 */
export const EXAM_CORE_SYSTEMS: readonly ExamSystemDefinition[] = [
  {
    systemId: "general",
    label: "General",
    normalLine: "Alert, oriented, no distress",
    abnormalChips: ["Pallor", "Icterus", "Cyanosis", "Edema", "Lymphadenopathy"],
  },
  {
    systemId: "cvs",
    label: "Cardiovascular",
    normalLine: "HS S1+S2 normal, no murmur",
    abnormalChips: ["Murmur", "Gallop", "JVP raised", "Peripheral edema"],
  },
  {
    systemId: "resp",
    label: "Respiratory",
    normalLine: "Chest clear, NVBS bilaterally",
    abnormalChips: ["Wheeze", "Crackles", "Reduced AE", "Dullness"],
  },
  {
    systemId: "abd",
    label: "Abdomen",
    normalLine: "Soft, non-tender, no organomegaly",
    abnormalChips: ["Tenderness", "Guarding", "Distension", "Hepatosplenomegaly"],
  },
  {
    systemId: "cns",
    label: "CNS / Neuro",
    normalLine: "Conscious, oriented, no focal deficit",
    abnormalChips: ["GCS ↓", "Cranial nerve deficit", "Power/sensory loss"],
  },
] as const;

/** Canonical systemId order — single source for derivation (obj-01) and cards (obj-03). */
export const EXAM_CORE_SYSTEM_ORDER: readonly string[] = EXAM_CORE_SYSTEMS.map(
  (s) => s.systemId,
);

/** Shared fallback body for unknown / future specialty systemIds. */
const DEFAULT_EXAM_SYSTEM_BODY = {
  normalLine: "Within normal limits",
  abnormalChips: [
    "Tenderness",
    "Swelling",
    "Deformity",
    "Reduced function",
    "Abnormal appearance",
    "Other",
  ],
} as const satisfies Pick<ExamSystemDefinition, "normalLine" | "abnormalChips">;

const CORE_BY_ID = new Map(EXAM_CORE_SYSTEMS.map((s) => [s.systemId, s]));

/** Title-case a slug-style systemId for fallback labels (`msk` → `Msk`). */
function humanizeExamSystemId(systemId: string): string {
  const words = systemId
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length > 0 ? words.join(" ") : systemId;
}

/**
 * Resolve a systemId to its registry entry, or an OLDCARTS-style generic
 * fallback for unknown / future custom systems — never throws.
 */
export function resolveExamSystem(systemId: string): ExamSystemDefinition {
  const trimmed = systemId.trim();
  const core = CORE_BY_ID.get(trimmed);
  if (core) return core;

  return {
    systemId: trimmed,
    label: humanizeExamSystemId(trimmed),
    normalLine: DEFAULT_EXAM_SYSTEM_BODY.normalLine,
    abnormalChips: [...DEFAULT_EXAM_SYSTEM_BODY.abnormalChips],
  };
}

/** Return the ordered core exam systems (canonical registry list). */
export function listExamSystems(): readonly ExamSystemDefinition[] {
  return EXAM_CORE_SYSTEMS;
}
