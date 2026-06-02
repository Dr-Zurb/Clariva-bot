# Sub-batch C — Safety (T4) — execution checklist

## Allergy clash + DDI + pre-send soft guards (never block — always confirm)

> **Source plan:** [plan-t4-ehr-safety.md](../../../Product%20plans/ehr/plan-t4-ehr-safety.md).
>
> **Master batch:** [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md).
>
> **Status:** `Drafted` — start AFTER Sub-batches A AND B1 merge. Hard prerequisite on T1.1 (`patient_allergies`) and T2.7 (`drug_master` for canonical name match).
>
> **Effort:** ~2 dev-days. **Items:** 4. **Migrations:** 1.
>
> **Decision T4-D1 LOCKED**: every warning is soft. No "Send" button is ever disabled. Every warning has "Acknowledge" / "Send anyway" affordance.
>
> **Dev DB:** Migrations **093** + **094** applied Supabase dev **2026-05-04** (after **088**–**089**).

---

## Pre-batch checklist

- [ ] Sub-batch A merged (provides `patient_allergies`).
- [ ] Sub-batch B1 merged (provides `drug_master_id` on `prescription_medicines` for canonical match — T4 still works on free-text rows but match quality is weaker).
- [ ] Decisions 19–23 in [§ Cross-cutting decisions / Before Sub-batch C starts](./plan-ehr-implementation-batch.md#before-sub-batch-c-starts) of the master batch confirmed.
- [ ] Owner approves the DDI seed list (~200 pairs from BNF + Beers Criteria). If not ready, ship the schema + endpoint with a 20-row starter seed and add a `[ ] DDI seed expanded to 200` follow-up.
- [ ] Confirm telemetry sink for warning ack/edit/send-anyway counts. Recommended: existing analytics service (per master-batch decision 23 — no PHI).

---

## Task 1 — Allergy clash banner + matcher (T4.18) — ships first

**Effort:** 0.5 day · **Source:** [T4 §T4.18](../../../Product%20plans/ehr/plan-t4-ehr-safety.md). **Independent of T4.19; ships first to deliver value early.**

**Implementation status:** ✅ impl 2026-05-04 (matcher + banner + per-Rx ack hook + form integration). Run `npm run test` in `frontend/` (Vitest) for `match-allergens` tests.

### Steps

1. Create `frontend/lib/ehr/match-allergens.ts` per source-plan §T4.18 implementation. Pure function, fully unit-testable. Signature:
   ```ts
   matchAllergens(
     medicines: PrescriptionMedicine[],
     allergies: PatientAllergy[],
     drugMasterIndex: Map<string, DrugMasterRow>,
   ): AllergyMatch[]
   ```
2. Write unit tests in `frontend/lib/ehr/match-allergens.test.ts`:
   - Brand match: `Crocin` × Paracetamol allergy → match.
   - Generic match: `Amoxicillin` × Penicillin allergy → match (substring "amoxicillin" doesn't contain "penicillin", but allergen "penicillin" is a substring of NEITHER — wait, this is the case where T4-v2 needs an allergen-class table; for V1, document that "amoxicillin × penicillin" is a false negative because of substring matching. Update the test to reflect this expected behavior, and add a TODO).
   - **Correction:** Re-read source plan §T4.18 — the matcher uses bidirectional `includes`. So `allergen "penicillin"` is checked against medicine candidate names. "Amoxicillin" does NOT contain "penicillin" as substring; "penicillin" does NOT contain "amoxicillin". This case requires an allergen-class lookup table. Document as a known V1 gap; add `[ ] Penicillin-class allergy → amoxicillin/etc match` follow-up. Test the case as expected-no-match.
   - Direct generic match: `Paracetamol` × Paracetamol allergy → match.
   - Brand match (the working case): `Crocin` × Paracetamol allergy → no match (Crocin doesn't contain "paracetamol"). UNLESS the doctor used T2.8 autocomplete and `drug_master_id` is set — then the matcher reads `drug_master.brand_names + generic_name` and the match works. Add a test for both cases.
   - Allergen normalization: case + leading/trailing whitespace.
   - No match for unrelated drugs.
   - Multiple matches per medicine (allergen "Sulfa" + medicine "Sulfa drug" + medicine "Sulfasalazine" → 2 matches).
3. Create `frontend/components/ehr/AllergyClashBanner.tsx`. Red banner (Tailwind `bg-red-50 border border-red-300 text-red-900`); shows allergen + matched medicine + severity + reaction text. "Acknowledge and continue" button stores ack in component-local state for this Rx draft.
4. Mount in `frontend/components/consultation/PrescriptionForm.tsx` above the medicines section. Pass `medicines={formState.medicines}`, `allergies={chartContext.allergies}`, `drugMasterIndex={...}`. The chart panel (T1.3) already loads allergies — reuse via context or prop-drill from the parent route page.
5. Track acknowledgements in a hook `frontend/lib/ehr/use-acknowledgements.ts` (created here; T4.20 reuses it). Per-Rx in-memory only (master-batch decision 22).

### Done when

- All unit tests for `matchAllergens` pass; documented V1 gaps (allergen-class) tracked as follow-ups.
- Banner appears within 100ms after typing/selecting a matching medicine.
- "Acknowledge and continue" dismisses the banner; doesn't fire on next render of same medicine.
- Removing then re-adding the medicine re-fires the banner (acknowledgements are per-instance, not per-medicine-name).
- No unrelated drugs trigger false positives in the test suite.

### Known V1 limitations (documented per [EXECUTION-ORDER-ehr.md § Sub-batch C](./Tasks/EXECUTION-ORDER-ehr.md#sub-batch-c--safety-2-days-4-tasks-needs-a--b1))

The matcher is bidirectional substring on lowercase-normalized
`drug_master.generic_name` + `drug_master.brand_names[]` + free-text
`medicine_name` (Decision §19 LOCKED). Two classes of false-negatives
fall out of that algorithm by construction; both are accepted for V1
and tracked here as follow-ups.

- [ ] **Penicillin-class allergy → Amoxicillin / Ampicillin / Cloxacillin / etc. match.** Substring matching has zero overlap between `"penicillin"` and `"amoxicillin"`, so an allergy captured as "Penicillin" produces no warning when the doctor prescribes any non-penicillin penicillin-class drug. The honest fix is an allergen-class lookup table — schema sketch: `patient_allergies.allergen_class TEXT NULL` referencing a small WHO drug-class table; matcher then expands the allergen by class membership before substring comparison. Out of scope for V1; targeted for T4-v2. The unit test at `frontend/lib/ehr/match-allergens.test.ts` codifies the current behaviour as expected-no-match so a future fix surfaces as a deliberate breaking change.
- [ ] **Free-text brand → free-text generic clash without T2.8 adoption.** Doctor types "Crocin" without using the autocomplete → no `drug_master_id` link → matcher has no brand list to expand against → no match against a "Paracetamol" allergy. Mitigation is doctor adoption of T2.8 autocomplete (B1.3 already shipped); no code change needed here. The post-batch validation E2E in this file's "Post-batch validation" section explicitly verifies BOTH directions (with-autocomplete → match; free-text → no match) to keep the gap visible.

### Test infrastructure

- [x] **Vitest** — `frontend` runs `npm run test` (Vitest) for `match-allergens.test.ts`, `pre-send-warnings.test.ts`, and related pure helpers. Wire CI when ready.

### Suggested PR

**PR #1 — Matcher + tests + banner.** Independent of T4.19; ships first.

---

## Task 2 — `drug_interactions` schema + seed + check endpoint (T4.19)

**Implementation / DB:** ✅ 2026-05-04 — `093_drug_interactions.sql` + `094_drug_interactions_seed.sql` applied on Supabase dev (after 088–089).

**Effort:** 0.5 day · **Source:** [T4 §T4.19](../../../Product%20plans/ehr/plan-t4-ehr-safety.md)

### Steps

1. Create `backend/migrations/0XX_drug_interactions.sql` per source-plan SQL block:
   - Table with `drug_a_id < drug_b_id` CHECK constraint (canonical ordered pair).
   - UNIQUE constraint on `(drug_a_id, drug_b_id)`.
   - Severity enum: `minor / moderate / major / contraindicated`.
   - Indexes on each column for fast lookup.
   - RLS: `drug_interactions_read_all` policy `USING (true)`. Writes service-role only.
2. Create `backend/migrations/0XX_drug_interactions_seed.sql` with the curated pairs. Use the LEAST/GREATEST pattern from source plan to avoid order-sensitivity at insert time:
   ```sql
   INSERT INTO drug_interactions (drug_a_id, drug_b_id, severity, description, recommendation, source)
   SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id), ...
   FROM drug_master a, drug_master b
   WHERE a.generic_name = 'Warfarin' AND b.generic_name = 'Aspirin'
   ON CONFLICT DO NOTHING;
   ```
3. Create `backend/src/services/drug-interactions-service.ts` with `checkInteractions(ids: string[]): Promise<InteractionRow[]>`. Compute all unordered pairs from `ids`, query with `(drug_a_id, drug_b_id) IN (...)` using LEAST/GREATEST normalization on the input pairs.
4. Create `backend/src/controllers/drug-interactions-controller.ts` + `routes/api/v1/drug-interactions-routes.ts`. Endpoint: `GET /api/v1/drug-interactions/check?ids=uuid1,uuid2,uuid3`. Hard ceiling `ids.length <= 20`.
5. Mount the new router in `index.ts`.

### Done when

- Migration + seed run cleanly; ~200 rows present (or 20 + follow-up flagged).
- `GET /check?ids=<warfarin>,<aspirin>` returns the pair.
- Order of input ids doesn't matter — `?ids=<aspirin>,<warfarin>` returns the same pair.
- Unknown drug ids silently produce no warnings (no false positives, no errors).
- Response p95 < 30ms for 5 ids.

### Suggested PR

**PR #2 — DDI schema + seed + endpoint.** Independent of PR #1.

---

## Task 3 — DDI warning chips + acknowledgement (T4.20) ✅ impl 2026-05-04

**Effort:** 0.5 day · **Source:** [T4 §T4.20](../../../Product%20plans/ehr/plan-t4-ehr-safety.md)

### Steps

1. Create `frontend/lib/api/drug-interactions.ts` — typed wrapper around `/check`.
2. Create `frontend/components/ehr/InteractionChips.tsx`. Renders 0..N chips above the medicines section. Chip shape: `[⚠️ <severity>] <drug-A> + <drug-B>` with a close (✕) button that acknowledges. Color codes:
   - `minor` → yellow (`bg-yellow-50 border-yellow-300`)
   - `moderate` → orange
   - `major` → red
   - `contraindicated` → dark red
3. Tapping a chip body opens a modal with full description + recommendation (from the DDI row) + "Acknowledge" button.
4. In `<PrescriptionForm>`, query `/api/v1/drug-interactions/check` whenever the set of `drug_master_id`s changes (debounce 300ms, SWR-cached by sorted-ids key). Free-text-only medicines (no `drug_master_id`) are ignored — DDI requires canonical ids.
5. Reuse `useAcknowledgements` hook from Task 1 — same per-Rx in-memory model.
6. T4.21 (next task) consumes the unacknowledged set.

### Done when

- Adding 2 interacting drugs (e.g. Warfarin + Aspirin) produces a chip within ~500ms p95 (300ms debounce per Step 4 + p95 network round-trip; cache-hit re-renders instant). Originally written as "250ms" but the locked 300ms debounce makes that unachievable on a cold path; the user-perceived budget is the debounce + p95 network, which is what we measure.
- Chip color matches severity.
- Acknowledgement removes the chip until the medicine is removed and re-added.
- Free-text-only medicines don't trigger chips (they have no `drug_master_id`).
- T4.21 sees unacknowledged DDIs in the pre-send aggregator.

### Suggested PR

**PR #3 — Interaction chips + form integration.** Depends on PR #2.

---

## Task 4 — Pre-send soft guards modal (T4.21) ✅ impl 2026-05-04

**Effort:** 0.5 day · **Source:** [T4 §T4.21](../../../Product%20plans/ehr/plan-t4-ehr-safety.md)

**Implementation status:** ✅ impl 2026-05-04 (modal + aggregator helper + PHI-free telemetry hook + form integration). Frontend `tsc --noEmit` clean. Run `npm run test` in `frontend/` for `pre-send-warnings` tests.

**Files added / changed:**

- `frontend/lib/ehr/pre-send-warnings.ts` (new) — pure aggregator over allergy + DDI + empty-rx + no-dx warnings. Returns ordered list with `targetId` for "Edit Rx" focus. Reads ack state via the same `useAcknowledgements` predicate the live banner / chips consume.
- `frontend/lib/ehr/telemetry.ts` (new) — single PHI-free emit surface for the pre-send outcome event. V1 sinks to `console.debug`; one-line swap for a real analytics SDK when one ships.
- `frontend/lib/ehr/pre-send-warnings.test.ts` (new) — runner-agnostic Jest-style coverage for the aggregator (empty-state, all four warning kinds, ack-key filtering, severity aggregation, ordering, telemetry de-dupe).
- `frontend/components/consultation/PrescriptionPreSendCheck.tsx` (new) — the modal. ESC + backdrop = Cancel; Edit Rx = close + scroll to first warning's target; Send anyway = always enabled (Decision T4-D1 LOCKED), `sending` prop is purely for in-flight click debounce.
- `frontend/components/consultation/PrescriptionForm.tsx` — wraps the existing send handler. Hoisted `matchAllergens` to form scope so the banner + the aggregator read the SAME match set (no drift). Added `id="medicines-section"` anchor (the existing `<input id="diagnosis">` covers the no-dx focus target). Pre-existing C.3 `[...new Set(ids)]` converted to `Array.from(new Set(ids))` so the file type-checks without `downlevelIteration`.

### Steps

1. Create `frontend/components/consultation/PrescriptionPreSendCheck.tsx`. Modal that aggregates:
   - Empty Rx (no medicines, no investigations, no patient education).
   - No diagnosis filled.
   - Unacknowledged allergy clashes from T4.18.
   - Unacknowledged DDI warnings from T4.20.
2. Modal layout per source-plan §T4.21 sketch. Each warning category has its own row with severity icon + summary text.
3. Three buttons: `Cancel` / `Edit Rx` (closes modal + focuses the relevant section, e.g. focuses the diagnosis textarea if dx is empty) / `Send anyway` (proceeds with send).
4. **Critical: `Send anyway` is ALWAYS enabled.** No warning ever blocks send (Decision T4-D1 LOCKED).
5. Modify `<PrescriptionForm>` "Send to patient" handler:
   - Compute warnings (empty-rx, no-dx, unacked-allergy, unacked-ddi).
   - If `warnings.length === 0`, fire send directly (modal skipped).
   - Else, open `<PrescriptionPreSendCheck warnings={...} onCancel={...} onEdit={...} onSendAnyway={...} />`.
6. Telemetry: log `{ doctor_id, rx_id, warning_kinds: [...], outcome: 'cancelled' | 'edited' | 'sent-anyway' }` to existing analytics. **No PHI** (no allergen text, no drug names, no diagnosis text — only warning kinds).
7. "Edit Rx" focus targeting: track which sections to scroll to per warning kind. Allergy → `#medicines`; DDI → `#medicines`; no-dx → `#diagnosis`; empty-rx → `#medicines` (default).

### Done when

- Modal aggregates all warning types correctly.
- "Send anyway" sends the Rx regardless of warning count.
- "Edit Rx" closes modal and focuses the first relevant section.
- Doctor's choice logged to telemetry with NO PHI.
- Modal skipped when there are zero warnings (instant send).
- Pre-send check runs in all three host surfaces consistently.

### Suggested PR

**PR #4 — Pre-send modal + telemetry.** Depends on PRs #1 + #3.

---

## Post-batch validation

Once Tasks 1–4 are merged:

- [ ] **All 4 source-plan acceptance criteria** pass.
- [ ] **Allergy banner E2E**: Patient with `allergen = 'Paracetamol'` + medicine via T2 autocomplete = `Crocin` (a Paracetamol brand) → banner appears (the brand-match path works because of `drug_master_id` lookup). Without autocomplete (free-text "crocin") → no match because we don't have brand metadata for the typed string. **This is the documented V1 gap reinforcing why B1 should ship before C.**
- [ ] **DDI E2E**: Add Warfarin + Aspirin via autocomplete → red chip appears. Acknowledge → chip disappears. Send → modal does NOT show DDI warning (it was acked). Remove and re-add Aspirin → chip re-appears.
- [ ] **Pre-send modal**: Send empty Rx → modal shows "Empty Rx" + "No diagnosis recorded". "Send anyway" works. "Cancel" closes without sending. "Edit Rx" focuses the diagnosis textarea.
- [ ] **Send always works**: there is no UI state in which a warning disables the "Send anyway" button.
- [ ] **PHI hygiene**: verify telemetry payloads contain no allergen text, drug names, or diagnosis text.
- [ ] **Type check + lint clean** for both backend + frontend.
- [ ] **Unit tests** for `matchAllergens` (all cases above) green.
- [ ] **Migration rollback** practiced on scratch DB.
- [ ] **Update tracking** — mark T4.18–T4.21 as ✓ in [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md); tag `[SHIPPED YYYY-MM-DD]` on each item in [plan-t4-ehr-safety.md](../../../Product%20plans/ehr/plan-t4-ehr-safety.md).

---

## Suggested PR ordering (solo dev)

```
PR #1: matcher + tests + allergy banner          (Task 1)  ← independent; ships first
PR #2: DDI schema + seed + check endpoint        (Task 2)
PR #3: DDI chips + form integration              (Task 3)  ← needs #2
PR #4: pre-send soft guards modal                (Task 4)  ← needs #1 + #3
```

---

## Risks (per source plan §T4)

- Seed of 200 pairs misses something dangerous → UI footer in pre-send modal acknowledges this honestly: "Clariva checks for ~200 known interactions. This is not a substitute for your clinical judgment." V2 adds third-party DDI database.
- Substring matching produces false positives → soft-warning model means doctor acknowledges and moves on; T2.8 autocomplete adoption reduces noise as `drug_master_id` lookups grow.
- Doctors get warning fatigue → telemetry tracks acknowledge-vs-edit ratio per warning type. If acknowledgement rate >95% on a class, downgrade severity.
- "PCN" abbreviation doesn't match "Penicillin" → V1 substring match catches it (both directions); for unusual abbreviations, document as V2.
- Allergen-class matching (penicillin → amoxicillin) is V1 false negative — documented; needs an allergen-class lookup table for V2.
- DDI severities jurisdiction-sensitive → seed tagged with `source` for audit; V1 starts conservative.

---

**Owner:** TBD. **Created:** 2026-05-03. **Status:** Drafted; start after Sub-batches A + B1 merge.
