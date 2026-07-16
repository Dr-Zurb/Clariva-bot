/**
 * Normalize / derive helpers for structured diagnoses (asmt-03 / asmt-05).
 *
 * The DB source of truth is `prescriptions.diagnoses_json` (JSONB array,
 * migration 161). The legacy `provisional_diagnosis` TEXT column STAYS and is
 * DERIVED from the primary row's label on save (ASMT-D4 / OBJ-D2 analog) so
 * PDF, SMS, snapshot, and notification readers stay byte-unchanged. An empty
 * structured set leaves the legacy free-text `provisional_diagnosis` untouched
 * (passthrough).
 *
 * asmt-05 / ASMT-D4′: `differential_diagnosis` is also DERIVED from cards where
 * `kind === 'differential' && certainty !== 'excluded'`. Excluded differentials
 * stay in `diagnoses_json` (record of what was dismissed) but are omitted from
 * patient-facing output. Legacy `differential_diagnosis[]` hydrates into
 * differential cards on load.
 *
 * Direct analog of `frontend/lib/cockpit/test-results.ts`.
 */

import type {
  AssessmentAcuity,
  DiagnosisCertainty,
  DiagnosisKind,
  DiagnosisRow,
  DiagnosisStatus,
} from "@/types/prescription";

const DIAGNOSIS_KINDS: readonly DiagnosisKind[] = [
  "primary",
  "secondary",
  "differential",
];
/** Active certainties offered in the UI. `rule_out` is deprecated (maps → provisional). */
const DIAGNOSIS_CERTAINTIES: readonly DiagnosisCertainty[] = [
  "provisional",
  "confirmed",
  "excluded",
];
/** Legacy value still accepted on hydrate; never written by the editor. */
const DEPRECATED_CERTAINTIES = new Set<string>(["rule_out"]);
const DIAGNOSIS_STATUSES: readonly DiagnosisStatus[] = [
  "new",
  "ongoing",
  "resolved",
];
const ASSESSMENT_ACUITIES: readonly AssessmentAcuity[] = [
  "improving",
  "stable",
  "worsening",
];

function trimToNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asKind(value: unknown): DiagnosisKind {
  return DIAGNOSIS_KINDS.includes(value as DiagnosisKind)
    ? (value as DiagnosisKind)
    : "secondary";
}

function asCertainty(value: unknown): DiagnosisCertainty {
  // Deprecated `rule_out` (old "rule out X" on committed cards) → Working/provisional.
  if (typeof value === "string" && DEPRECATED_CERTAINTIES.has(value)) {
    return "provisional";
  }
  return DIAGNOSIS_CERTAINTIES.includes(value as DiagnosisCertainty)
    ? (value as DiagnosisCertainty)
    : "provisional";
}

function asStatus(value: unknown): DiagnosisStatus {
  return DIAGNOSIS_STATUSES.includes(value as DiagnosisStatus)
    ? (value as DiagnosisStatus)
    : "new";
}

function asAcuity(value: unknown): AssessmentAcuity | null {
  return ASSESSMENT_ACUITIES.includes(value as AssessmentAcuity)
    ? (value as AssessmentAcuity)
    : null;
}

function isCommittedKind(kind: DiagnosisKind): boolean {
  return kind === "primary" || kind === "secondary";
}

/**
 * Hydrate / sanitize `diagnoses_json` rows, dropping malformed entries.
 * Missing/empty `label` drops the row; missing `id` is regenerated. Unknown
 * enums fall back to defaults (`secondary` / `provisional` / `new`). After
 * normalize, at most one `primary` remains among committed (non-differential)
 * rows (first wins; later primaries demote to secondary). Differentials are
 * never demoted to secondary by this pass.
 */
export function normalizeDiagnoses(
  json: DiagnosisRow[] | null | undefined,
): DiagnosisRow[] {
  if (!Array.isArray(json)) return [];
  const out: DiagnosisRow[] = [];
  let hasPrimary = false;
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!label) continue;
    const id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : crypto.randomUUID();
    let kind = asKind(row.kind);
    if (kind === "primary") {
      if (hasPrimary) kind = "secondary";
      else hasPrimary = true;
    }
    // asmt-04: conditionId must be a non-empty string (UUID validated server-side);
    // malformed values collapse to null and never drop the row.
    // Differentials never carry a problem-list link (cleared on normalize).
    const rawConditionId =
      typeof row.conditionId === "string" && row.conditionId.trim()
        ? row.conditionId.trim()
        : null;
    const conditionId = kind === "differential" ? null : rawConditionId;
    out.push({
      id,
      label,
      kind,
      certainty: asCertainty(row.certainty),
      status: asStatus(row.status),
      note: trimToNull(row.note),
      acuity: kind === "differential" ? null : asAcuity(row.acuity),
      conditionId,
      // asmt-06: preserve optional ICD-11 coding across hydrate → payload.
      // Additive metadata — never alters derived provisional/differential TEXT.
      code: trimToNull(row.code),
      codeTitle: trimToNull(row.codeTitle),
    });
  }
  return out;
}

/**
 * Primary row's trimmed label (fallback: first **non-differential** row), or
 * `""` when empty. A differential must never derive into
 * `provisional_diagnosis` (ASMT-D4 / asmt-05).
 */
export function derivePrimaryDiagnosis(rows: DiagnosisRow[]): string {
  const normalized = normalizeDiagnoses(rows);
  if (normalized.length === 0) return "";
  const primary = normalized.find((r) => r.kind === "primary");
  if (primary) return primary.label.trim();
  const firstCommitted = normalized.find((r) => isCommittedKind(r.kind));
  return firstCommitted?.label.trim() ?? "";
}

/**
 * Labels of non-excluded differential cards, de-duped (case-folded),
 * order-preserving. Used to derive `differential_diagnosis` on save (ASMT-D4′).
 */
export function deriveDifferentialDiagnosis(rows: DiagnosisRow[]): string[] {
  const normalized = normalizeDiagnoses(rows);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of normalized) {
    if (row.kind !== "differential") continue;
    if (row.certainty === "excluded") continue;
    const label = row.label.trim();
    if (!label) continue;
    const key = normalizeConditionKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** Seed one primary row from a legacy free-text provisional diagnosis. */
export function seedPrimaryDiagnosisFromLegacy(
  provisionalDiagnosis: string | null | undefined,
  id?: string,
): DiagnosisRow[] {
  const label =
    typeof provisionalDiagnosis === "string" ? provisionalDiagnosis.trim() : "";
  if (!label) return [];
  return [
    {
      id: id ?? crypto.randomUUID(),
      label,
      kind: "primary",
      certainty: "provisional",
      status: "new",
      note: null,
      acuity: null,
      conditionId: null,
      code: null,
      codeTitle: null,
    },
  ];
}

/**
 * Seed differential cards from a legacy free-text `differential_diagnosis[]`.
 * Skips blanks and labels already represented (by normalized key) in
 * `existing`. Mirrors `seedPrimaryDiagnosisFromLegacy`.
 */
export function seedDifferentialsFromLegacy(
  differentialDiagnosis: string[] | null | undefined,
  existing: DiagnosisRow[] = [],
): DiagnosisRow[] {
  if (!Array.isArray(differentialDiagnosis) || differentialDiagnosis.length === 0) {
    return [];
  }
  const seen = new Set(
    existing
      .map((r) => normalizeConditionKey(r.label))
      .filter(Boolean),
  );
  const out: DiagnosisRow[] = [];
  for (const raw of differentialDiagnosis) {
    const label = typeof raw === "string" ? raw.trim() : "";
    if (!label) continue;
    const key = normalizeConditionKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: crypto.randomUUID(),
      label,
      kind: "differential",
      certainty: "provisional",
      status: "new",
      note: null,
      acuity: null,
      conditionId: null,
      code: null,
      codeTitle: null,
    });
  }
  return out;
}

/**
 * Apply a legacy visit-level `assessment_acuity` onto the primary (or first
 * committed) card when that card has no acuity yet. No-op when acuity is
 * already set on any committed row, or when there is no committed row.
 */
export function seedAcuityFromLegacyVisit(
  rows: DiagnosisRow[],
  visitAcuity: AssessmentAcuity | null | undefined,
): DiagnosisRow[] {
  const acuity = asAcuity(visitAcuity);
  if (!acuity || rows.length === 0) return rows;
  if (rows.some((r) => isCommittedKind(r.kind) && r.acuity)) return rows;
  const targetId =
    rows.find((r) => r.kind === "primary")?.id ??
    rows.find((r) => isCommittedKind(r.kind))?.id;
  if (!targetId) return rows;
  return rows.map((row) =>
    row.id === targetId ? { ...row, acuity } : row,
  );
}

/** Create an empty diagnosis row for the editor. */
export function createEmptyDiagnosisRow(
  kind: DiagnosisKind = "secondary",
): DiagnosisRow {
  return {
    id: crypto.randomUUID(),
    label: "",
    kind,
    certainty: "provisional",
    status: "new",
    note: null,
    acuity: null,
    conditionId: null,
    code: null,
    codeTitle: null,
  };
}

/** Case-fold + collapse whitespace for duplicate-condition matching. */
export function normalizeConditionKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Enforce at most one primary among **committed** (non-differential) rows.
 * Differentials are never promoted to primary and never demoted to secondary.
 * If no non-differential row exists, there is simply no primary.
 */
export function enforceSinglePrimary(
  rows: DiagnosisRow[],
  primaryId?: string | null,
): DiagnosisRow[] {
  if (rows.length === 0) return [];
  const committed = rows.filter((r) => isCommittedKind(r.kind));
  if (committed.length === 0) {
    // Only differentials — leave kinds untouched.
    return rows.map((row) =>
      row.kind === "differential"
        ? { ...row, kind: "differential" as const, conditionId: null }
        : row,
    );
  }
  const targetId =
    primaryId && committed.some((r) => r.id === primaryId)
      ? primaryId
      : (committed.find((r) => r.kind === "primary")?.id ?? committed[0].id);
  return rows.map((row) => {
    if (row.kind === "differential") {
      return { ...row, kind: "differential" as const, conditionId: null };
    }
    return {
      ...row,
      kind: row.id === targetId ? ("primary" as const) : ("secondary" as const),
    };
  });
}

/** Order: primary → secondary → differential (relative order within each). */
export function sortDiagnosesPrimaryFirst(rows: DiagnosisRow[]): DiagnosisRow[] {
  const primary = rows.filter((r) => r.kind === "primary");
  const secondary = rows.filter((r) => r.kind === "secondary");
  const differential = rows.filter((r) => r.kind === "differential");
  return [...primary, ...secondary, ...differential];
}
