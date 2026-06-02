/**
 * Pre-send warning aggregator (EHR Sub-batch C / T4.21 — C.4).
 *
 * Pure, framework-agnostic function that combines every soft warning
 * surface the form already exposes into a single ordered list, ready
 * for `<PrescriptionPreSendCheck>` to render and emit telemetry over.
 *
 * Decision T4-D1 LOCKED 2026-05-03: every warning is soft. This helper
 * exists to ENUMERATE warnings — it does NOT decide whether the doctor
 * may send. The caller never branches on warning count to disable the
 * Send button; only to decide whether to skip the modal entirely.
 *
 * Decision §22 LOCKED: acknowledgement state is per-Rx in-memory only.
 * The helper accepts `isAcked` so the same source-of-truth that backs
 * the live banner / chips also drives the aggregator — no state
 * duplication, no ack drift between surfaces.
 *
 * Warning ordering (clinical severity-first, deterministic):
 *   1. `unacked-allergy`  — red banner items not yet "Acknowledge and continue"d
 *   2. `unacked-ddi`      — DDI chips not yet ✕'d
 *   3. `no-diagnosis`     — empty `provisional_diagnosis`
 *   4. `empty-rx`         — no medicines, no investigations, no patient education
 *
 * "Edit Rx" focuses the FIRST warning's `targetId`, so this order is
 * also the focus-priority order. The two known DOM anchors are:
 *   - `medicines-section` (mounted on the medicines wrapper in the form)
 *   - `diagnosis`         (the existing diagnosis input id)
 *
 * V1 telemetry payload is built by the caller from `warning.kind`
 * values only — this helper deliberately does NOT expose drug names,
 * allergen text, or diagnosis text in any field intended for logging.
 * The `summary` strings are for in-modal display only.
 *
 * @see frontend/components/consultation/PrescriptionPreSendCheck.tsx
 * @see frontend/lib/ehr/telemetry.ts
 * @see frontend/lib/ehr/match-allergens.ts
 * @see frontend/components/ehr/InteractionChips.tsx
 */

import type { AllergyMatch } from "./match-allergens";
import type {
  InteractionRow,
  InteractionSeverity,
} from "@/lib/api/drug-interactions";
import { ackKeyForAllergyMatch } from "@/components/ehr/AllergyClashBanner";
import { ackKeyForDdi } from "@/components/ehr/InteractionChips";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Stable identifiers for the warning-kind enum. PHI-free. */
export type PreSendWarningKind =
  | "unacked-allergy"
  | "unacked-ddi"
  | "no-diagnosis"
  | "empty-rx";

/** Known DOM ids the modal can focus on "Edit Rx". */
export type PreSendFocusTarget = "medicines-section" | "diagnosis";

/** Discriminated union — each kind carries shape suited to its
 *  rendering needs. The `summary` string is for the modal only and
 *  must NOT be forwarded to telemetry (it may include drug / allergy
 *  text). */
export type PreSendWarning =
  | {
      kind: "unacked-allergy";
      targetId: PreSendFocusTarget;
      summary: string;
      /** Number of (medicine × allergy) pairs. Useful for telemetry
       *  severity calibration; PHI-free. */
      count: number;
      matches: ReadonlyArray<AllergyMatch>;
    }
  | {
      kind: "unacked-ddi";
      targetId: PreSendFocusTarget;
      summary: string;
      count: number;
      /** Highest severity in the unacked set — V1 telemetry uses this
       *  to flag "doctor sent through a contraindicated DDI" without
       *  shipping any drug names. */
      highestSeverity: InteractionSeverity;
      rows: ReadonlyArray<InteractionRow>;
    }
  | {
      kind: "no-diagnosis";
      targetId: PreSendFocusTarget;
      summary: string;
    }
  | {
      kind: "empty-rx";
      targetId: PreSendFocusTarget;
      summary: string;
    };

/** Form-side inputs the helper needs. The form already computes
 *  every field below, so the call-site is a one-liner. Strings are
 *  passed pre-trimmed by convention; defensively re-checked here. */
export interface PreSendInputs {
  /** Count of medicine rows the doctor has actually entered (i.e.
   *  rows whose `medicine_name` is non-empty after trim). The full
   *  draft array may include an empty trailing row. */
  filledMedicineCount: number;
  hasInvestigations: boolean;
  hasPatientEducation: boolean;
  hasDiagnosis: boolean;
  /** True when at least one prescription attachment (photo / PDF) is
   *  uploaded. Counts as content for the empty-rx check — a photo Rx
   *  with no structured fields is NOT empty. Defaults to false at
   *  callsites that don't track attachments. */
  hasAttachments?: boolean;
  /** Raw matcher output — the helper does the unacked filter
   *  internally so the caller never has to derive the ack key shape. */
  allergyMatches: ReadonlyArray<AllergyMatch>;
  /** Parallel to medicines[]: stable per-row id used to key allergy
   *  acknowledgements. Missing entries fall back to surfacing the
   *  match (better to over-warn than to silently swallow). */
  medicineInstanceIds: ReadonlyArray<string>;
  /** Raw DDI rows — same unacked filter applied here. */
  ddiInteractions: ReadonlyArray<InteractionRow>;
  /** Single source of truth for ack state (parent form's
   *  `useAcknowledgements()`). */
  isAcked: (key: string) => boolean;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<InteractionSeverity, number> = {
  minor: 1,
  moderate: 2,
  major: 3,
  contraindicated: 4,
};

function highestSeverityIn(
  rows: ReadonlyArray<InteractionRow>,
): InteractionSeverity {
  let best: InteractionSeverity = "minor";
  let bestRank = 0;
  for (const r of rows) {
    const rank = SEVERITY_RANK[r.severity];
    if (rank > bestRank) {
      best = r.severity;
      bestRank = rank;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Compute the ordered list of pre-send warnings for the current
 * draft Rx. Returns `[]` when nothing is amiss → caller skips the
 * modal and sends directly.
 */
export function computePreSendWarnings(
  inputs: PreSendInputs,
): PreSendWarning[] {
  const warnings: PreSendWarning[] = [];

  // 1. Unacked allergy clashes.
  const unackedAllergy = inputs.allergyMatches.filter((m) => {
    const instanceId = inputs.medicineInstanceIds[m.medicineIndex];
    if (!instanceId) {
      // Defensive: no instance id ⇒ no possible ack key was ever
      // emitted ⇒ surface the match so a real warning isn't silently
      // dropped by an upstream invariant violation.
      return true;
    }
    return !inputs.isAcked(ackKeyForAllergyMatch(instanceId, m.allergyId));
  });
  if (unackedAllergy.length > 0) {
    const isOne = unackedAllergy.length === 1;
    warnings.push({
      kind: "unacked-allergy",
      targetId: "medicines-section",
      summary: isOne
        ? "1 allergy clash not acknowledged"
        : `${unackedAllergy.length} allergy clashes not acknowledged`,
      count: unackedAllergy.length,
      matches: unackedAllergy,
    });
  }

  // 2. Unacked DDI warnings.
  const unackedDdi = inputs.ddiInteractions.filter(
    (row) => !inputs.isAcked(ackKeyForDdi(row.id)),
  );
  if (unackedDdi.length > 0) {
    const isOne = unackedDdi.length === 1;
    warnings.push({
      kind: "unacked-ddi",
      targetId: "medicines-section",
      summary: isOne
        ? "1 drug interaction not acknowledged"
        : `${unackedDdi.length} drug interactions not acknowledged`,
      count: unackedDdi.length,
      highestSeverity: highestSeverityIn(unackedDdi),
      rows: unackedDdi,
    });
  }

  // 3. No diagnosis recorded.
  if (!inputs.hasDiagnosis) {
    warnings.push({
      kind: "no-diagnosis",
      targetId: "diagnosis",
      summary: "No provisional diagnosis recorded",
    });
  }

  // 4. Empty Rx (no medicines, no investigations, no patient education,
  //    no attachments). Deliberately permissive — a doctor might send
  //    pure advice (patient education only) or a photo-only Rx with
  //    one attachment. We only flag the all-empty case.
  if (
    inputs.filledMedicineCount === 0 &&
    !inputs.hasInvestigations &&
    !inputs.hasPatientEducation &&
    !inputs.hasAttachments
  ) {
    warnings.push({
      kind: "empty-rx",
      targetId: "medicines-section",
      summary: "Prescription is empty (no medicines, investigations, education, or attachments)",
    });
  }

  return warnings;
}

/**
 * Helper: pick the focus target for "Edit Rx" — the first warning's
 * `targetId`, with a default of `medicines-section` when somehow
 * called with an empty list (the modal shouldn't be open in that
 * case, but the fallback keeps the UX coherent).
 */
export function focusTargetFor(
  warnings: ReadonlyArray<PreSendWarning>,
): PreSendFocusTarget {
  return warnings[0]?.targetId ?? "medicines-section";
}

/**
 * Build the PHI-free `warningKinds` array for telemetry. Stable
 * iteration order so dashboards aggregate cleanly. De-dupes (a
 * given kind appears at most once in the V1 aggregator output, but
 * the helper is robust to future expansion).
 */
export function warningKindsForTelemetry(
  warnings: ReadonlyArray<PreSendWarning>,
): PreSendWarningKind[] {
  const seen = new Set<PreSendWarningKind>();
  const out: PreSendWarningKind[] = [];
  for (const w of warnings) {
    if (!seen.has(w.kind)) {
      seen.add(w.kind);
      out.push(w.kind);
    }
  }
  return out;
}
