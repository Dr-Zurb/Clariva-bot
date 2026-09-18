# Task rxl-03: Seeding is not editing

---

## 📋 Task Overview

The Rx form cannot currently tell a programmatic seed from a doctor's keystroke. Desk vitals reach the form through the same field-setting path a user edit takes, so merely opening a chart for a patient who has desk vitals recorded dirties the form and schedules a save. Establish one rule — only user-originated changes mark the form dirty — and route hydration, desk-vitals seeding and carry-forward through a non-dirtying path.

This is the prerequisite for the whole of Phase 2. Lazy note creation (RXL-DL-4) is unimplementable while a seeder can dirty a form, because opening a finished chart would silently create a new note containing nothing but a blood pressure.

**Program / Phase:** rx-lifecycle · Phase 1 (lock integrity)
**Batch:** [`plan-p1-rx-lifecycle-lock-integrity-batch.md`](../plan-p1-rx-lifecycle-lock-integrity-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md`](./EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md)
**Estimated Time:** ~4 hours
**Status:** ✅ **DONE**
**Completed:** 2026-08-31

**Change Type:**
- [x] **Update existing** — changes dirty-tracking and how seeds land; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `RxFormContext` — has both an initial-fields path and a per-field setter, plus a debounced autosave and a create-if-missing persist step.
- ✅ Desk-vitals fetching / caching / prefetch — shipped 2026-08-31 and **correct**. `desk-vitals-query.ts`, the OPD-click prefetch and the queue-rail prefetch are out of scope.
- ✅ `useRxFormProviderSetup` — already merges desk vitals into the **initial** fields for both existing and new prescriptions.
- ⚠️ `DeskVitalsSectionNoteSeed` / `applyDeskVitalsPatch` — apply desk values by setting fields directly, which is indistinguishable from a doctor typing.
- ❌ No explicit seed-versus-edit distinction anywhere in the reducer or the autosave scheduler.
- ⚠️ Carry-forward and template-apply paths also write through field setters; they must be audited against the same rule even though only desk vitals is a live bug today.

**Scope Guard:** ≤ 6 files. Do not change which desk vitals are fetched, when they are fetched, or the prefetch call sites. Do not change what the vitals strip displays. No backend.

**Reference:** product plan RXL-DL-4, RXL-DL-5 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 Batch is `Committed`. `rxl-01` merged (the lock must exist before dirty-tracking is reasoned about on locked notes).
- [ ] 1.2 Enumerate **every** programmatic writer into the form: initial hydration, desk-vitals seed, carry-forward / copy-from-last-visit, template apply, visit-parse apply, AI refine, medicine capture. Record which are seeds and which are user-initiated — a doctor pressing "apply template" **is** an edit.
- [ ] 1.3 Confirm the autosave scheduler's trigger. If it observes field state rather than actions, the fix belongs there, not at each call site.

### 2. The rule
- [ ] 2.1 One documented distinction: a seed sets values without marking dirty and without scheduling a save; an edit does both.
- [ ] 2.2 Seeds must still be visible to the doctor immediately — this is not a deferral, only a dirty-flag change.
- [ ] 2.3 A seed must never be able to reach a locked note at all (interaction with `rxl-01`).

### 3. Route the writers
- [ ] 3.1 Desk-vitals seeding — becomes a seed. This is the live defect.
- [ ] 3.2 Initial hydration — confirm it is already a seed; make it explicit rather than incidental.
- [ ] 3.3 Carry-forward / template / parse-apply — classify each per 1.2 and route accordingly. Doctor-initiated applies stay edits.

### 4. Verification
- [ ] 4.1 Opening a chart for a patient with desk vitals recorded issues **zero** prescription writes. Assert on the API layer, not on a spy inside the reducer.
- [ ] 4.2 Desk vitals still appear immediately in the form and in the vitals strip on an open visit — the 31-Aug latency behaviour is not regressed.
- [ ] 4.3 A doctor typing one character still schedules exactly one debounced save.
- [ ] 4.4 A doctor-initiated template apply still saves.
- [ ] 4.5 `tsc` + lint clean; desk-vitals and Rx-form suites green.

---

## 📁 Files

```
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (seed vs edit in reducer / autosave scheduling)
UPDATE: frontend/lib/cockpit/desk-vitals-seed.ts (seed path)
UPDATE: frontend/components/cockpit/rx/subjective/DeskVitalsSectionNoteSeed (or its host) (seed path)
UPDATE: frontend/components/cockpit/rx/useRxFormProviderSetup.ts (explicit seed on hydrate)
UPDATE/CREATE: frontend unit tests (zero-write assertion; no-regression on immediacy)
```

**Existing Code Status:**
- ✅ `desk-vitals-query.ts` — EXISTS (complete; **do not touch**)
- ⚠️ `RxFormContext.tsx` — EXISTS but has no seed concept
- ⚠️ `desk-vitals-seed.ts` — EXISTS; contains both a merge helper and a direct-set helper
- ⚠️ `useRxFormProviderSetup.ts` — EXISTS; merges on hydrate already

**When updating existing code:**
- [ ] Audit all programmatic writers from 1.2 before changing any — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map each writer to seed or edit explicitly; an unclassified writer is a defect
- [ ] Remove the now-redundant direct-set helper if the merge path fully replaces it
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One rule, centrally enforced.** Do not solve this by adding a guard at each seeding call site; the next seeder added will miss it. The distinction belongs where dirty state and save scheduling live.
- A seed is not a deferral. Values must land on screen as fast as they do today — this task must not reintroduce the desk-vitals latency fixed on 2026-08-31.
- "Doctor-initiated" is the test for an edit, not "came from a helper function". Applying a template is an edit; hydrating a form is not.
- Do not widen this into an undo / dirty-field-tracking feature. The only requirement is: does this change count as the doctor working on the note.
- No PHI in logs (COMPLIANCE.md). Do not log seeded values while debugging this.
- Layout-preference autosave is a separate path and out of scope here (`rxl-01` owns it).

---

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes — indirectly.** This task removes spurious writes to `prescriptions`. No schema or RLS change; no new read path.
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? No.

---

## ✅ Acceptance & Verification Criteria

- [ ] Opening a finished or unopened chart with desk vitals present performs no prescription write.
- [ ] Desk vitals remain immediately visible on an open visit.
- [ ] User edits still autosave exactly as before.
- [ ] Every programmatic writer from 1.2 is explicitly classified.
- [ ] Tests added or updated per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)
- [ ] Logs contain no PHI (see [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md))

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 📝 Notes

The desk-vitals seeder was shipped hours before this plan was written, as the fix for vitals appearing late in the cockpit. That work is correct and stays. What is wrong is only that its values arrive by the same door a keystroke uses — which was harmless while nothing depended on the dirty flag, and becomes a silent record-creation bug the moment Phase 2 lands.

---

## 🔗 Related Tasks

- [`task-rxl-01-lock-gate-and-wiring.md`](./task-rxl-01-lock-gate-and-wiring.md) — must land first
- `rxl-07` (Phase 2) — lazy note creation; **hard-depends** on this task

---

**Last Updated:** 2026-08-31
**Completed:** 2026-08-31

**Ship notes:** `SEED_FIELDS` + `seedFields()` do not dirty. Autosave is `enabled: autosaveEnabled && isDirty`. `RESET` (hydrate / desk merge into initial fields) stays a seed. Late desk fill uses `seedFields` and no-ops when content is locked. `applyDeskVitalsPatch` removed. Template / parse / carry-forward remain edits via `setField`.
