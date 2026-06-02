/**
 * Allergy clash matcher (EHR Sub-batch C / T4.18).
 *
 * Pure, framework-agnostic function that pairs each draft prescription
 * medicine against the patient's documented allergies. Used by
 * `<AllergyClashBanner>` (the live red banner above the medicines
 * section in `<PrescriptionForm>`) and reused by
 * `<PrescriptionPreSendCheck>`'s pre-send aggregator (T4.21).
 *
 * Matching algorithm (Decision §19 LOCKED 2026-05-03):
 *   - Normalize all comparison strings via `s.trim().toLowerCase()`.
 *   - For each medicine, build a candidate-name set from:
 *       1. The drug_master row (generic_name + every brand_name) iff
 *          the medicine has a `drug_master_id` AND the row is in the
 *          provided index.
 *       2. The free-text `medicine_name` the doctor typed (always
 *          added when non-empty — covers the photo-only / pre-T2.8
 *          authoring path where there is no `drug_master_id`).
 *   - For each allergy × candidate pair, emit a match if EITHER
 *       `candidate.includes(allergen)` OR `allergen.includes(candidate)`
 *       is true (bidirectional substring). Both sides are normalized
 *       so case + leading/trailing whitespace are ignored.
 *   - At most ONE match per (medicine, allergy) pair — the first
 *     candidate match wins so we don't double-fire when an allergen
 *     matches a medicine via multiple candidates (e.g. allergen
 *     "Sulfa" against a medicine whose generic AND brand both
 *     contain "sulfa" → ONE match, not two).
 *
 * Candidate iteration order is deliberate:
 *   `generic_name` → `brand_names[]` → free-text `medicine_name`
 * so a medicine that's both linked to drug_master AND has a populated
 * free-text name reports its match as `generic-substring` (the
 * strongest signal), not `free-text-substring`.
 *
 * V1 known false-negatives (tracked as follow-ups in
 * `tasks-subbatch-C-safety.md` — Task 1):
 *   - Allergen-class matches ("Penicillin" allergy → "Amoxicillin"
 *     prescribed): substring matching cannot bridge the class
 *     hierarchy. Fix needs an allergen-class lookup table (T4-v2).
 *   - Free-text brand → free-text generic when the doctor typed
 *     neither side via T2.8 autocomplete (no `drug_master_id` → no
 *     brand list to expand against). Adoption of T2.8 reduces this
 *     over time.
 *
 * V1 known false-positives are accepted (Decision T4-D1: every
 * warning is soft; doctors acknowledge). The bidirectional `includes`
 * will over-fire on e.g. allergen "Sulfa" against any medicine whose
 * name contains "sulfa". Telemetry from C.4 will calibrate severity.
 *
 * @see frontend/components/ehr/AllergyClashBanner.tsx
 * @see docs/Work/Daily-plans/May 2026/03-05-2026/tasks-subbatch-C-safety.md
 * @see docs/Work/Product plans/ehr/plan-t4-ehr-safety.md (T4.18)
 */

import type {
  PatientAllergy,
  PatientAllergySeverity,
} from "@/types/patient-chart";
import type { PrescriptionMedicine } from "@/types/prescription";
import type { DrugMasterRow } from "@/types/drug-master";

/**
 * One (medicine × allergy) clash. The matcher emits 0..N of these;
 * the banner is responsible for de-duplicating by
 * `(medicineIndex, allergyId)` if it ever needs to render only the
 * highest-severity match per allergy.
 */
export interface AllergyMatch {
  /** Index into the input `medicines[]` array — stable within a
   *  single call, NOT a database id. The banner uses this to
   *  scroll-to / focus the offending row. */
  medicineIndex: number;
  /** What the doctor typed (for display). Mirrored even when the
   *  match came from a drug_master brand or generic, so the banner
   *  can echo the exact text in the input field. */
  medicineName: string;
  /** The allergy row's primary key — the canonical key for per-Rx
   *  acknowledgement state (see `use-acknowledgements.ts`). */
  allergyId: string;
  /** The allergen text as the doctor / patient entered it
   *  (un-normalized — for display in the banner). */
  allergenMatched: string;
  /** Severity passes through unchanged from the allergy row. */
  severity: PatientAllergySeverity;
  /** Reaction text from the allergy row, when present. */
  reaction: string | null;
  /**
   * Which candidate kind triggered the match. V1 emits one of:
   *   - `'generic-substring'`   — matched against
   *                                `drug_master.generic_name`
   *   - `'brand-substring'`     — matched against a
   *                                `drug_master.brand_names[]` entry
   *   - `'free-text-substring'` — matched against the doctor's typed
   *                                `medicine_name`
   * `'exact-id'` is reserved for V2 (canonical allergen → canonical
   * drug-master link) and is never emitted in V1.
   */
  matchKind:
    | "exact-id"
    | "generic-substring"
    | "brand-substring"
    | "free-text-substring";
}

/**
 * Subset of `PrescriptionMedicine` fields the matcher actually reads.
 * Defined as a distinct interface (instead of `Pick<PrescriptionMedicine, ...>`)
 * so callers can pass partial in-memory drafts (the form's
 * `MedicineEntry` shape, mapped to snake_case at the callsite) without
 * round-tripping through the API. Accepting `PrescriptionMedicine`
 * directly is also valid — the union below covers both paths.
 */
export interface MatchableMedicine {
  medicine_name: string;
  drug_master_id: string | null;
}

/**
 * Lowercase + trim — the single normalization applied to BOTH the
 * candidate side and the allergen side before substring comparison.
 * Exposed so callers and tests can assert the exact normalization
 * shape without re-deriving it. Keep in lockstep with the matcher.
 */
export function normalizeForAllergyMatch(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Match prescription medicines against patient allergies.
 *
 * Order-stable: matches are emitted in nested
 *   `for medicineIndex in 0..M { for allergy in allergies { ... } }`
 * order. The candidate-loop produces AT MOST one match per
 * (medicine, allergy) pair.
 *
 * @param medicines        Draft prescription rows (filtered or
 *                         unfiltered — the matcher silently skips rows
 *                         that have no candidates, i.e. empty
 *                         `medicine_name` AND no `drug_master_id`).
 * @param allergies        Patient allergies. Archived rows
 *                         (`archived_at != null`) are skipped
 *                         defensively — the chart service normally
 *                         pre-filters, but the form may receive raw
 *                         data from another path.
 * @param drugMasterIndex  Map keyed by `drug_master.id` so candidate
 *                         expansion is O(1) per medicine. Pass an
 *                         empty Map when the index is unavailable —
 *                         the matcher degrades gracefully to
 *                         free-text-only candidates.
 */
export function matchAllergens(
  medicines: ReadonlyArray<MatchableMedicine | PrescriptionMedicine>,
  allergies: ReadonlyArray<PatientAllergy>,
  drugMasterIndex: ReadonlyMap<string, DrugMasterRow>,
): AllergyMatch[] {
  const matches: AllergyMatch[] = [];

  // Pre-normalize allergens once. The medicine loop iterates over
  // every allergy for every candidate; normalizing inside that loop
  // would re-do the same work O(M × C) extra times per allergy.
  const normalizedAllergies = allergies
    .filter((a) => a.archived_at === null)
    .map((row) => ({
      row,
      allergen: normalizeForAllergyMatch(row.allergen),
    }))
    .filter((entry) => entry.allergen.length > 0);

  if (normalizedAllergies.length === 0) return matches;

  type Candidate = {
    text: string;
    kind:
      | "generic-substring"
      | "brand-substring"
      | "free-text-substring";
  };

  for (let medicineIndex = 0; medicineIndex < medicines.length; medicineIndex++) {
    const med = medicines[medicineIndex];
    const candidates: Candidate[] = [];
    const seen = new Set<string>();

    if (med.drug_master_id) {
      const dm = drugMasterIndex.get(med.drug_master_id);
      if (dm) {
        const gn = normalizeForAllergyMatch(dm.generic_name);
        if (gn && !seen.has(gn)) {
          candidates.push({ text: gn, kind: "generic-substring" });
          seen.add(gn);
        }
        for (const brand of dm.brand_names ?? []) {
          const bn = normalizeForAllergyMatch(brand);
          if (bn && !seen.has(bn)) {
            candidates.push({ text: bn, kind: "brand-substring" });
            seen.add(bn);
          }
        }
      }
    }

    const freeText = normalizeForAllergyMatch(med.medicine_name ?? "");
    if (freeText && !seen.has(freeText)) {
      candidates.push({ text: freeText, kind: "free-text-substring" });
      seen.add(freeText);
    }

    if (candidates.length === 0) continue;

    for (const { row: allergy, allergen } of normalizedAllergies) {
      for (const candidate of candidates) {
        if (
          candidate.text.includes(allergen) ||
          allergen.includes(candidate.text)
        ) {
          matches.push({
            medicineIndex,
            medicineName: med.medicine_name ?? "",
            allergyId: allergy.id,
            allergenMatched: allergy.allergen,
            severity: allergy.severity,
            reaction: allergy.reaction,
            matchKind: candidate.kind,
          });
          break;
        }
      }
    }
  }

  return matches;
}
