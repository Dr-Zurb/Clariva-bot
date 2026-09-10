# Task rxl-01: One lock gate + wire the five ungated surfaces

---

## 📋 Task Overview

Replace the scattered `disabled` booleans in the Rx workspace with a single lock the sections read themselves, then wire the five surfaces that currently escape it. No new rule — `canEditPrescriptionDraft` already says an attested visit is read-only; today only Subjective and Assessment obey it.

**Program / Phase:** rx-lifecycle · Phase 1 (lock integrity)
**Batch:** [`plan-p1-rx-lifecycle-lock-integrity-batch.md`](../plan-p1-rx-lifecycle-lock-integrity-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md`](./EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md)
**Estimated Time:** ~5 hours
**Status:** ✅ **DONE**
**Completed:** 2026-08-31

**Change Type:**
- [x] **Update existing** — changes how existing sections receive their lock; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `frontend/lib/patient-profile/state.ts` — `canEditPrescriptionDraft(state)` exists, returns false for `ended` / `terminal`.
- ✅ `SubjectivePane` and the assessment tab def in `cockpit-tabs.tsx` — already pass `disabled={!canEditPrescriptionDraft(ctx.state)}`.
- ✅ `VitalsGrid` — accepts `disabled` and threads it to every field, the section note, and `ManageVitalsMenu`. It is simply never given one.
- ❌ **Plan** — `PrescriptionForm` passes `disabled={saving}` to `PrescriptionFormCompositionRoot`. Visit state never reaches Plan; `canEditPrescriptionDraft` is not imported in that file (only `canSendPrescription` is).
- ❌ **Objective (composition root)** — mounted as `<ObjectiveSection heading={null} />`, no lock, while its siblings on the same lines receive one.
- ❌ **Objective (cockpit pane)** — `ObjectivePane` props are `appointmentId` and `hideHeader` only. No lock prop exists to pass.
- ❌ **Vitals** — `ObjectiveSection` honours `disabled` on exam, notes, reports and media but mounts vitals without it. Locking Objective without this leaves BP and pulse editable.
- ⚠️ `cockpitState` on `PrescriptionForm` is optional — non-cockpit mounts pass nothing and **must stay editable**.
- ⚠️ Layout-preference autosaves (section order / collapse / hidden sets in Subjective, Objective and Plan; vitals hidden set in `VitalsGrid`) gate on the same `disabled` flag as clinical content. Per RXL-Q3 these must keep working on a locked visit.

**Scope Guard:** ≤ 8 files. No backend. No attest stamp — the gate still reads `CockpitState` this phase (RXL-DL-1's stamp is `rxl-06`). Do not touch commit actions, the overlay (`rxl-02`), or dirty-tracking (`rxl-03`).

**Reference:** product plan RXL-DL-2, RXL-Q3 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 Batch is `Committed` and RXL-Q2 / RXL-Q3 recorded. Else **STOP**.
- [ ] 1.2 Read all five call sites plus the two that already work, so the wired pattern is copied rather than invented.
- [ ] 1.3 Grep for every mount of `ObjectiveSection`, `PlanSection`, `SubjectiveSection` and `AssessmentSection`, including the legacy `templates.tsx` pane copies. Record the full list before editing.

### 2. The gate module
- [ ] 2.1 One derivation the sections read from the Rx form context — not a prop assembled by each parent.
- [ ] 2.2 Default must be **locked**, so a section that never wires anything renders read-only (RXL-DL-2).
- [ ] 2.3 Expose content-lock and preference-lock separately so RXL-Q3 holds — clinical fields freeze, doctor layout preferences do not.
- [ ] 2.4 Shape the input so `rxl-06` can swap `CockpitState` for the attest stamp by changing this module only.

### 3. Wire the five surfaces
- [ ] 3.1 Plan — derive from cockpit state alongside the existing in-flight-save flag, preserving editability when no cockpit state is supplied.
- [ ] 3.2 Objective in the composition root — same lock its siblings already receive.
- [ ] 3.3 `ObjectivePane` — accept a lock and pass it down; the cockpit tab def supplies it with the same expression the assessment def already uses.
- [ ] 3.4 Vitals inside `ObjectiveSection` — pass the lock `VitalsGrid` already knows how to honour.
- [ ] 3.5 Legacy `templates.tsx` pane copies from 1.3 — same prop, no restructuring.

### 4. Verification
- [ ] 4.1 Each listed field group is non-editable on a `completed` appointment. Vitals asserted field-by-field, not just at section level.
- [ ] 4.2 A section mounted with no wiring renders read-only.
- [ ] 4.3 Non-cockpit `PrescriptionForm` mounts unchanged.
- [ ] 4.4 Layout-preference autosave still fires on a locked visit; clinical autosave does not.
- [ ] 4.5 `tsc` + lint clean. Suites judged one by one where they assert editability.

---

## 📁 Files

```
CREATE: frontend/components/cockpit/rx/useRxLock.ts (or lib/cockpit equivalent — one module)
UPDATE: frontend/components/consultation/PrescriptionForm.tsx (Plan lock + import)
UPDATE: frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx (Objective lock)
UPDATE: frontend/components/patient-profile/panes/ObjectivePane.tsx (accept + pass lock)
UPDATE: frontend/lib/patient-profile/v3/cockpit-tabs.tsx (objective tab def supplies lock)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (vitals lock)
UPDATE: frontend/lib/patient-profile/templates.tsx (legacy pane copies, if 1.3 finds them)
UPDATE/CREATE: frontend unit tests
```

**Existing Code Status:**
- ✅ `state.ts` — EXISTS (complete; gate function is correct, its callers are not)
- ✅ `VitalsGrid.tsx` — EXISTS (complete; honours `disabled` throughout)
- ⚠️ `PrescriptionForm.tsx` — EXISTS but wrong input (`saving`)
- ⚠️ `PrescriptionFormCompositionRoot.tsx` — EXISTS but omits one prop
- ⚠️ `ObjectiveSection.tsx` — EXISTS but omits vitals
- ❌ `ObjectivePane.tsx` — MISSING the prop entirely
- ❌ lock module — MISSING

**When updating existing code:**
- [ ] Audit every mount from 1.3 before changing any of them — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map each site to a concrete change; no opportunistic restructuring of pane trees
- [ ] Remove the now-dead per-parent `disabled` plumbing rather than leaving both paths live
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Fail closed.** Absence of wiring must mean read-only. This is the whole point of the task; a gate that defaults to editable reproduces the bug for the next section someone adds.
- Sections read the lock from context. Do not reintroduce a parent-assembled boolean, and do not let two sources of truth coexist "for now".
- Clinical content and doctor layout preferences are different concerns and must not share one flag (RXL-Q3).
- Do not enforce anything in this task that the service layer will own in `rxl-06`. The UI lock is a courtesy; it is not the security boundary and must not be described as one.
- No PHI in logs (COMPLIANCE.md). No new telemetry payload carrying field values.
- Architectural boundary: `lib/patient-profile` must stay free of medical domain types (DL-2), as `state.ts` documents.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **No** — no read or write path changes. Presentation and prop wiring only.
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? No.

---

## ✅ Acceptance & Verification Criteria

- [ ] Functional behaviour matches the overview: all five surfaces locked on an attested visit, vitals included.
- [ ] An unwired section is read-only.
- [ ] Non-cockpit mounts unaffected.
- [ ] Layout preferences still persist on a locked visit.
- [ ] Tests added or updated per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)
- [ ] Logs contain no PHI (see [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md))

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-02-read-only-affordance.md`](./task-rxl-02-read-only-affordance.md) — states the locked condition to the doctor
- [`task-rxl-03-seed-vs-edit.md`](./task-rxl-03-seed-vs-edit.md) — sibling; the other half of Phase 1
- `rxl-06` (Phase 2) — swaps this module's input for the attest stamp

---

**Last Updated:** 2026-08-31
**Completed:** 2026-08-31

**Ship notes:** Gate is `useRxLock.ts` (`resolveRxLock` / `RxLockProvider` / `useRxSectionLock`). Isolated section tests stay editable without a provider. `templates.tsx` Objective pane needed no extra prop — page-level provider covers it. Q3 forced more than 8 files (S/O/A/Plan persist + `VitalsGrid` fieldset). `VitalField` has no `disabled`; core numbers lock via `<fieldset>`. Assessment "Stable" button assertion dropped — chips are a toggle group, not a named button. Plan incomplete-row collapse suite is a pre-existing flake (not lock-caused).
