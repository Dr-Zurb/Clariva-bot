# Task rxl-07: Load path — fresh note instead of rehydrating an attested one

---

## 📋 Task Overview

When the doctor opens a patient whose newest note is attested, the cockpit currently rehydrates that note and lets the form point at it. Change the load path so an attested newest note is **not** adopted: the form starts empty, subjective is carried forward, and the new row is minted by the existing create-if-missing autosave on the doctor's first real edit.

This is the behavioural heart of RXL-DL-3 and RXL-DL-4, and it is the highest-blast-radius change in the program — the same load path serves the first note of every visit.

**Program / Phase:** rx-lifecycle · Phase 2 (append notes)
**Batch:** [`plan-p2-rx-lifecycle-append-notes-batch.md`](../plan-p2-rx-lifecycle-append-notes-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md`](./EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md)
**Estimated Time:** ~6 hours
**Status:** ✅ **IMPLEMENTED**
**Completed:** 2026-08-31

**Change Type:**
- [x] **Update existing** — changes the cockpit's initial-load decision; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `listPrescriptionsByAppointment` — already plural, ordered newest-first. No API change needed.
- ✅ `prescriptions.appointment_id` — indexed, **no unique constraint**. Multiple notes per appointment are already legal.
- ✅ `RxFormContext.persistSnapshot` — already creates-if-missing: if the form holds no prescription id it creates one and adopts the returned id. This is exactly the lazy-creation mechanism required; **reuse it, do not add a second path**.
- ✅ `PrescriptionMediaStrip` — has the same create-if-missing shape for attachments, so an attachment on a fresh note also mints correctly.
- ✅ `rxl-03` — seed-vs-edit split (hard dependency).
- ⚠️ `useRxFormProviderSetup` — EXISTS; on load it takes the newest note, adopts its id, and hydrates from it regardless of attest state.
- ❌ Nothing decides "this note is closed, start a new one".

**Scope Guard:** ≤ 6 files, frontend only. **No new appointment row, ever.** Do not touch queue / OPD / pipeline / next-patient, `visit_payments`, or the PDF pipeline. No new "Start new note" button — creation is implicit on first edit this phase. Carry-forward source selection is `rxl-08`.

**Reference:** product plan RXL-DL-3, RXL-DL-4, RXL-DL-5, RXL-DL-6 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 `rxl-06` implemented. `rxl-03` seed/RESET/zero-write still green.
- [x] 1.2 Both load branches call `resolveRxLoadDecision`.
- [x] 1.3 Media strip already mints. Print without an id is unavailable / errors softly. Previous-Rx popover does not require a current id.

### 2. The decision
- [x] 2.1 Attested newest note → continue (no id, no content hydrate).
- [x] 2.2 Draft newest note → adopt and hydrate.
- [x] 2.3 No note → empty visit, unchanged.
- [x] 2.4 `resolveRxLoadDecision` is the only branch.

### 3. What the fresh note starts with
- [x] 3.1 Subjective + diagnosis via `applySubjectiveCarrySeed` into `setInitialFields` (RESET).
- [x] 3.2 Vitals and exam left empty.
- [x] 3.3 Desk vitals still merged.
- [x] 3.4 Plan empty (medicines / advice / investigations not copied).
- [x] 3.5 `closedSibling` on the setup object for rxl-09.

### 4. Creation
- [x] 4.1 Existing `persistSnapshot` create-if-missing. No eager create.
- [x] 4.2 `createPrescription` already sends the current `appointmentId`.
- [x] 4.3 Print: no id → "No prescription to print yet." Media strip mints on upload.

### 5. Verification
- [x] 5.1 Hook test: attested newest → no `createPrescription`.
- [x] 5.2 Relies on existing autosave create-if-missing (rxl-03 dirty path). Same appointment id.
- [x] 5.3 Empty-list path unchanged.
- [x] 5.4 Draft newest still adopted.
- [x] 5.5 No appointment / queue / payment writes in this task.
- [x] 5.6 rxl-07 + lock + seed + Phase 1 gate suites green. Continuation unlocks via `noteClosed: false` so an ended visit can still be typed.

---

## 📁 Files

```
UPDATE: frontend/components/cockpit/rx/useRxFormProviderSetup.ts (adopt-or-start decision, both branches)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (only if null-id tolerance needs shoring; reuse persistSnapshot)
UPDATE: frontend/components/cockpit/rx/media/PrescriptionMediaStrip.tsx (only if 1.3 finds a gap)
UPDATE: frontend/components/consultation/cockpit/PreviousRxPopover.tsx (only if 1.3 finds a gap)
UPDATE/CREATE: frontend unit + integration tests
```

**Existing Code Status:**
- ⚠️ `useRxFormProviderSetup.ts` — EXISTS; adopts newest unconditionally
- ✅ `RxFormContext.tsx` — EXISTS; create-if-missing already correct
- ✅ `PrescriptionMediaStrip.tsx` — EXISTS; already mints on demand

**When updating existing code:**
- [ ] Audit all consumers of the current prescription id from 1.3 — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map the change per branch; do not leave the old adopt-unconditionally path reachable
- [ ] Remove obsolete branches rather than guarding them
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse the existing create-if-missing path.** A second creation mechanism would diverge from the media-strip path and produce two notes for one continuation.
- **Never create an appointment.** The appointment is the queue and billing unit (RXL-DL-3). A continuation note that moves a token or implies a fee is a defect, not a trade-off.
- Carrying subjective forward is a **seed** (RXL-DL-5). If it marks the form dirty, opening a chart creates a note and the phase has failed.
- Vitals and exam must start empty (RXL-DL-6). Carrying a reading into a document that gets printed as today's is a false record — this is a clinical-safety rule, not a UX preference.
- Do not add an explicit "new note" control in this task. If the implicit behaviour proves confusing, that is a finding for the gate, not a scope expansion.
- The attested note is never mutated by this task, including its `updated_at`.
- No PHI in logs (COMPLIANCE.md).

---

## 🌍 Global Safety Gate

- [x] Data touched? **Yes** — changes when `prescriptions` rows are created. No schema or RLS change.
- [x] PHI in logs? No.
- [x] External API / AI? No.
- [x] Retention? **Yes, indirectly** — more prescription rows per appointment over time. Same 7-year policy; noted for the phase gate.

---

## ✅ Acceptance & Verification Criteria

- [x] All five verification scenarios in §5 pass.
- [x] No new appointment row under any path.
- [x] Brand-new visits and draft reloads unregressed.
- [x] Tests: `rxLoadDecision.test.ts`, `useRxFormProviderSetup.rxl07.test.tsx`
- [x] Logs contain no PHI.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-03-seed-vs-edit.md`](../../p1-lock-integrity/Tasks/task-rxl-03-seed-vs-edit.md) — hard dependency
- [`task-rxl-08-carry-forward-sibling.md`](./task-rxl-08-carry-forward-sibling.md) — supplies the carry-forward source
- [`task-rxl-09-visit-history-per-note.md`](./task-rxl-09-visit-history-per-note.md) — where the closed note is read

---

**Last Updated:** 2026-08-31 (implemented)
**Completed:** 2026-08-31
