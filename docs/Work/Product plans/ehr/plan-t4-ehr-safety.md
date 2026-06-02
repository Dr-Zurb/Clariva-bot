# Plan T4 — EHR safety (clinical guardrails)

## Catch the allergy clash and the dangerous interaction _before_ the doctor hits Send

> **Read-order:** [README.md](./README.md) → [plan-f01](./plan-f01-prescription-foundation-status.md) → [plan-00](./plan-00-ehr-roadmap.md) → [plan-t1](./plan-t1-ehr-foundation.md) → [plan-t2](./plan-t2-ehr-speed.md) → **plan-t4 (this file)**.
>
> **Status:** `Drafted` 2026-05-03. **Depends on:** T1 (`patient_allergies`) + T2 (`drug_master` for canonical names).
>
> **Effort:** ~2 dev-days for the 4 items.
>
> **Schema:** 1 migration: `drug_interactions` table + seed.

---

## Why safety lives _after_ T1 + T2 (not first)

A safety check that says "you may have prescribed something dangerous, but I'm not sure because the drug name was free-text 'paracetomol' and I don't know which database row it maps to" is worse than no check — it desensitizes the doctor to the warning UI. By the time T2 ships drug autocomplete, the system actually KNOWS what was prescribed and can match canonical generics against allergens and interactions.

That's also why this tier ships:

- **Soft guards, not blockers.** Doctors are licensed; we're a tool, not a gatekeeper. Every warning is a chip + a "Send anyway" / "Acknowledge" path. We never refuse to send a Rx.
- **Local rules, not third-party APIs.** No First Databank / Lexicomp / Wolters Kluwer dependency in V1. A small seeded `drug_interactions` table catching the top 200 dangerous pairs covers ~90% of common-prescriber risk. (V2: add a paid API.)

---

## Decisions LOCKED 2026-05-03

| ID | Decision | Implication |
|----|----------|-------------|
| **T4-D1** | **All warnings are soft.** No "Send" button is ever disabled by a safety check. | Every warning has an "Acknowledge" or "Send anyway" affordance. Acknowledgements are persisted (T4.20) so the audit trail is clean. |
| **T4-D2** | **Allergy match: substring on canonical generic name (`drug_master.generic_name`) AND on brand names (`drug_master.brand_names[]`) AND on allergen free text (`patient_allergies.allergen`), all normalized lowercase.** | If the doctor used T2 autocomplete, we have `drug_master_id` → exact lookup. If they typed free text, we still substring-match against the generic + brand list. Allergen also normalized. |
| **T4-D3** | **DDI seed: ~200 most-common dangerous pairs, hand-curated.** No third-party data buy in V1. | Source: WHO essential medicines list + commonly-cited "top dangerous interactions" guides. Owner picks; recommend starting from `Beers Criteria` + `BNF` flagged interactions. |
| **T4-D4** | **No interaction check across CHRONIC meds + new Rx in V1.** Only WITHIN the new Rx (drug-drug pairs being prescribed today). | Chronic-meds aren't structured today (chronic conditions are; medications are usually noted free-text in clinical notes). When patient-medication-list ships as structured data (post-V1), extend T4 to cross-check. |

---

## Items

### T4.18 — Allergy clash banner (live during medicine entry)

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create / touch:**

- `frontend/components/ehr/AllergyClashBanner.tsx` (new) — red banner that appears above the medicines section when ≥1 entered medicine matches a documented allergy.
- `frontend/components/consultation/PrescriptionForm.tsx` — mount the banner; pass current `medicines[]` + the patient's `allergies[]` (already loaded by T1's chart panel — share via context or prop).
- `frontend/lib/ehr/match-allergens.ts` (new) — pure function with unit tests. Takes `(medicines, allergies, drugMasterIndex)` → returns `{ medicineIndex, allergenMatched, severity }[]`.

**Spec.** As the doctor types or selects a medicine in `<MedicineRow>`, run the matcher. If any match, render:

```
┌──────────────────────────────────────────────────────────┐
│ ⚠️  Allergy alert                                          │
│                                                            │
│ This patient is allergic to:                               │
│  • Penicillin (severe — anaphylaxis)                       │
│                                                            │
│ Your prescription includes:                                │
│  • Amoxicillin (penicillin family)                         │
│                                                            │
│ [Acknowledge and continue]   [Edit medicines]              │
└──────────────────────────────────────────────────────────┘
```

Matching algorithm (`matchAllergens`):

```ts
// frontend/lib/ehr/match-allergens.ts
export interface AllergyMatch {
  medicineIndex: number;
  medicineName: string;        // what the doctor entered
  allergenMatched: string;     // the allergy text that matched
  severity: 'mild' | 'moderate' | 'severe' | 'unknown';
  matchKind: 'exact-id' | 'generic-substring' | 'brand-substring' | 'free-text-substring';
}

export function matchAllergens(
  medicines: PrescriptionMedicine[],
  allergies: PatientAllergy[],
  drugMasterIndex: Map<string, DrugMasterRow>,  // keyed by drug_master_id
): AllergyMatch[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const matches: AllergyMatch[] = [];

  for (let i = 0; i < medicines.length; i++) {
    const med = medicines[i];
    const candidateNames = new Set<string>();
    if (med.drug_master_id && drugMasterIndex.has(med.drug_master_id)) {
      const dm = drugMasterIndex.get(med.drug_master_id)!;
      candidateNames.add(norm(dm.generic_name));
      dm.brand_names.forEach((b) => candidateNames.add(norm(b)));
    }
    if (med.medicine_name) candidateNames.add(norm(med.medicine_name));

    for (const allergy of allergies) {
      const allergen = norm(allergy.allergen);
      if (!allergen) continue;
      for (const candidate of candidateNames) {
        if (candidate.includes(allergen) || allergen.includes(candidate)) {
          matches.push({
            medicineIndex: i,
            medicineName: med.medicine_name,
            allergenMatched: allergy.allergen,
            severity: allergy.severity,
            matchKind: med.drug_master_id ? 'exact-id' : 'free-text-substring',
          });
          break;
        }
      }
    }
  }

  return matches;
}
```

**Acceptance.**

- Doctor enters "Amoxicillin" with patient allergic to "Penicillin" → banner appears.
- Doctor enters "Crocin" with patient allergic to "Paracetamol" → banner appears (brand match).
- Doctor enters something unrelated → no banner.
- Acknowledging the warning persists (see T4.20) so it doesn't re-fire on the same submit.
- Unit tests cover: brand match, generic match, free-text match, no match, allergen normalization (case + whitespace), multiple matches per medicine, multiple matches across medicines.

---

### T4.19 — Schema + seed: `drug_interactions`

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create:**

- `backend/migrations/0XX_drug_interactions.sql`.
- `backend/migrations/0XX_drug_interactions_seed.sql` (or `backend/scripts/seed-drug-interactions.ts`).

**Spec.**

```sql
CREATE TABLE IF NOT EXISTS drug_interactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_a_id       UUID NOT NULL REFERENCES drug_master(id) ON DELETE CASCADE,
    drug_b_id       UUID NOT NULL REFERENCES drug_master(id) ON DELETE CASCADE,
    severity        TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'contraindicated')),
    description     TEXT NOT NULL,                            -- "Increased risk of bleeding"
    recommendation  TEXT NULL,                                -- "Avoid combination" / "Reduce dose" / "Monitor INR"
    source          TEXT NULL,                                -- "BNF" / "Beers" / "WHO" — for audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- ordered uniqueness: store with drug_a_id < drug_b_id (lex order on UUID) so each pair has one row
    CONSTRAINT drug_interactions_ordered_pair CHECK (drug_a_id < drug_b_id),
    CONSTRAINT drug_interactions_unique_pair UNIQUE (drug_a_id, drug_b_id)
);

CREATE INDEX IF NOT EXISTS idx_drug_interactions_a ON drug_interactions (drug_a_id);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_b ON drug_interactions (drug_b_id);

ALTER TABLE drug_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY drug_interactions_read_all ON drug_interactions FOR SELECT USING (true);
-- (writes service-role only)
```

**Seed format:**

```sql
-- Example: Warfarin + Aspirin
INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source)
SELECT
  LEAST(a.id, b.id), GREATEST(a.id, b.id),
  'major',
  'Concurrent use significantly increases bleeding risk',
  'Avoid combination unless benefit outweighs risk; monitor INR closely',
  'BNF'
FROM drug_master a, drug_master b
WHERE a.generic_name = 'Warfarin' AND b.generic_name = 'Aspirin'
ON CONFLICT DO NOTHING;
-- ... repeat for ~200 pairs
```

**API:**

```ts
// GET /api/v1/drug-interactions/check?ids=uuid1,uuid2,uuid3
// Returns: [{ drugAId, drugBId, severity, description, recommendation }]
//
// Backend computes all unordered pairs from the input ids, queries the
// table with `(drug_a_id, drug_b_id) IN (...)` using LEAST/GREATEST normalization.
```

**Acceptance.**

- Migration runs cleanly; ~200 seed rows present.
- `GET /api/v1/drug-interactions/check?ids=<warfarin>,<aspirin>` returns the pair.
- Order of input IDs doesn't matter (canonical pair lookup via LEAST/GREATEST).
- Unknown drugs (no `drug_master_id`) silently produce no warnings (no false positives).

---

### T4.20 — DDI warning chips in `<MedicineRow>` + acknowledgement persistence

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create / touch:**

- `frontend/components/ehr/InteractionChips.tsx` (new) — renders 0..N severity-coded chips above the medicines section listing pairs that interact.
- `frontend/components/consultation/PrescriptionForm.tsx` — mount the chips; query `/api/v1/drug-interactions/check` whenever the set of `drug_master_id`s changes.
- `frontend/lib/ehr/use-acknowledgements.ts` (new) — local React state hook tracking acknowledged warning IDs (per Rx draft, in-memory only — does NOT persist across refresh; that's a v2 enhancement).

**Spec.** Chip shape:

```
[ ⚠️ major  Warfarin + Aspirin ✕ ]
[ ⚠ moderate  Atorvastatin + Clarithromycin ✕ ]
```

Tapping the chip opens a modal with full description + recommendation. Tapping "Acknowledge" dismisses the chip for this Rx. Pre-send, all unacknowledged chips trigger T4.21 final confirm.

**Acceptance.**

- Adding 2 interacting drugs produces a chip within 250ms.
- Chip color codes by severity (yellow / orange / red / dark red for minor / moderate / major / contraindicated).
- Acknowledgement removes the chip until the medicine is removed and re-added.
- T4.21 sees the unacknowledged set and either gates send or confirms-through.

---

### T4.21 — Pre-send soft guards modal [SHIPPED 2026-05-04]

**Status:** `Implemented 2026-05-04` (frontend `tsc --noEmit` clean; pure-helper tests deferred pending frontend Jest infra — see Sub-batch C exec-order). **Effort:** 0.5 day. **Files to create / touch:**

- `frontend/components/consultation/PrescriptionPreSendCheck.tsx` (new) — modal that runs when doctor hits "Send to patient".
- `frontend/components/consultation/PrescriptionForm.tsx` — wrap send button to invoke the check first.

**Spec.** Modal aggregates ALL soft warnings:

- Empty Rx (no medicines, no investigations, no patient education) — "This prescription is empty. Continue?"
- No diagnosis filled — "No provisional diagnosis recorded. Add one?"
- Unacknowledged allergy clash from T4.18.
- Unacknowledged interaction warning from T4.20.
- (Future) No follow-up specified for follow-up-warranted conditions — out of T4.

```
┌──────────────────────────────────────────────────────────┐
│ Before sending — please review                             │
│                                                            │
│ ⚠️  Allergy clash                                          │
│   Amoxicillin × Penicillin allergy                         │
│                                                            │
│ ⚠ Interaction (major)                                     │
│   Warfarin + Aspirin — increased bleeding risk             │
│                                                            │
│ ℹ No diagnosis recorded                                    │
│                                                            │
│ [ Cancel ]   [ Edit Rx ]   [ Send anyway ]                 │
└──────────────────────────────────────────────────────────┘
```

If NO warnings exist, the modal is skipped — send fires directly.

**Acceptance.**

- Modal aggregates all warning types correctly.
- "Send anyway" sends the Rx (T4-D1 — never block).
- "Edit Rx" closes the modal and focuses the relevant section (e.g. focuses the diagnosis textarea if dx is the issue).
- Doctor's choice is logged to telemetry (count by warning type + outcome) — useful for tuning the seed and the UX over time. NO PHI in logs, only counts + warning types.

---

## Out of scope for T4

- Third-party DDI database integration (First Databank, Lexicomp, Micromedex) — V2 if the seeded list proves insufficient.
- Cross-checking new Rx against the patient's CHRONIC meds list (Decision T4-D4) — needs structured chronic-meds data, not in T1 / T5.
- Pediatric dose checks (mg/kg validation) — Decision E1 defers specialty modules.
- Renal/hepatic dose adjustment warnings — same.
- Pregnancy category warnings — same (would need OB-GYN module).
- Hard "block send" rules — Decision T4-D1.
- Allergy alerts across the patient's family / household — out of scope.

---

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Seed of 200 pairs misses something dangerous → false sense of safety | Be honest in the UI footer of the warning modal: "Clariva checks for ~200 known interactions. This is not a substitute for your clinical judgment." Plan for V2 to add a third-party database. |
| Substring matching produces false positives ("Sulfa allergy" alarms on "Sulfanilamide" → fine, BUT also on "Sulfasalazine" which is fine) | Acceptable noise for V1; mitigated by the soft-warning model — doctor acknowledges and moves on. T2's `drug_master_id` exact match reduces noise as autocomplete adoption grows. |
| Doctors get warning fatigue and click through everything | Telemetry tracks acknowledge-vs-edit ratio per warning type. If acknowledgement rate is >95% on a class of warning, downgrade its severity. |
| Allergy stored as "PCN" abbreviation doesn't match "Penicillin" drug name | T4 V1 substring match works in either direction (`includes`). For "PCN" specifically, allergy entry UI in T1 could surface a drug-master-typeahead; out of T4 scope but worth noting for T1 polish. |
| DDI severities are doctor-jurisdiction-sensitive (Indian BNF differs from US) | Seed is tagged with `source` for audit; future tiers can add jurisdictional filters. V1 starts conservative — when in doubt, severity is bumped UP. |
| Acknowledgements not persisted across page refresh | V1 acceptable (warnings re-appear, doctor re-clicks). Persisting per-Rx requires a `prescription_warning_acknowledgements` table — defer to T4 v2 if telemetry shows pain. |

---

## Sequencing inside T4

```
T4.18 (allergy banner)  ← needs T1.1 only; can ship before T4.19
T4.19 (drug_interactions schema + seed)
  └→ T4.20 (DDI chips)
       └→ T4.21 (pre-send soft guards)  ← aggregates T4.18 + T4.20
```

T4.18 can ship the same day T1 ships. T4.19/.20/.21 are sequential.

---

**Created:** 2026-05-03. **Status:** `Drafted`. **Owner:** TBD.
