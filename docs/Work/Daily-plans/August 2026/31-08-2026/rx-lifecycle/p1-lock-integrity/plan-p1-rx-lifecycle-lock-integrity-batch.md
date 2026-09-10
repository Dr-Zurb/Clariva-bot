# Plan p1 — Rx lifecycle: lock integrity

## 31 Aug 2026 — Batch `rx-lifecycle` / `p1-lock-integrity` (`rxl-01..04`) — **M, ~11h · Auto-safe**

> **Status:** **IMPLEMENTED** 2026-08-31 — behaviour gate passed; mechanical residuals below. No migration, no backend change.
> **Product plan:** [`plan-rx-lifecycle.md`](../../../../../Product%20plans/plan-rx-lifecycle.md) (RXL-DL-1…12)
> **Program:** [`../README.md`](../README.md) · Prefix `rxl`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md`](./Tasks/EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md)
> **Not this sitting:** attest stamp, backend write guard, append-a-note, edit window, revisions, PDF retention, slip marker. All Phase 2–3.

---

## Why this phase

`canEditPrescriptionDraft` exists and says an attested visit is read-only. Two surfaces out of five obey it. Plan is gated on `saving` — an autosave-in-flight flag that has nothing to do with visit state. Objective is passed no lock at all. Vitals is ungated a second time *inside* Objective. The overlay meant to catch all of this is `pointer-events-none`, so it blocks nothing.

The result the doctor sees: complaints lock after finish, medicines and BP do not.

This phase does not add a feature. It makes one existing rule true, and it separates seeding from editing so Phase 2 has a foundation to stand on.

---

## Decision lock (inherits the product plan)

RXL-DL-1…12 are locked. Do not re-litigate in a task file.

Phase 1 implements **RXL-DL-2** (one gate, read from context, fails closed) and **RXL-DL-5** (seeding is not editing). It does **not** implement RXL-DL-1's attest stamp — Phase 1 keeps reading the existing `CockpitState`, so "attested" still means the appointment is `completed`. Swapping the input for a real stamp is `rxl-06`, and the gate is built so that swap touches one module.

**Confirm before promote (recommended defaults in the product plan):**

| ID | Default | Owner |
|---|---|---|
| RXL-Q2 | `clinical_notes` lock with the document | ⟨fill⟩ |
| RXL-Q3 | Split layout prefs from content lock — prefs keep saving on a locked visit | ⟨fill⟩ |

---

## Scope Guard — DO NOT TOUCH

- `backend/` — **nothing.** No service, controller, validation, migration or type change in this phase.
- `prescriptions` schema, `updatePrescription`, the PDF service, the PDF cache.
- Queue / OPD / pipeline / `useNextAppointmentRoute` / `useDoctorDayPipeline` / next-patient advance.
- `visit_payments`, hisab, desk-left.
- The commit actions — `useRxCommitActions`, `CockpitRxActionDock`, send / finish / print sequencing. A locked note stays re-sendable and re-printable; that is correct and Phase 3 formalises it.
- `templates.tsx` legacy pane copies beyond passing the same lock prop the v3 tab passes (`cv3x-03` owns deleting that file).
- Desk-vitals **fetching / prefetch** (`desk-vitals-query.ts`, OPD and queue-rail prefetch). `rxl-03` changes only how the fetched value reaches the form.
- Any new UI affordance for starting a new note, amending, or reprinting.

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`rxl-01`](./Tasks/task-rxl-01-lock-gate-and-wiring.md) | One lock gate + wire the five ungated surfaces | M | Sonnet |
| [`rxl-02`](./Tasks/task-rxl-02-read-only-affordance.md) | Replace the inert overlay with a real read-only banner | S | Sonnet |
| [`rxl-03`](./Tasks/task-rxl-03-seed-vs-edit.md) | Seeding is not editing — desk vitals, hydration, carry-forward | M | Sonnet |
| [`rxl-04`](./Tasks/task-rxl-04-phase-1-gate.md) | Suites + docs + gate | M | Sonnet |

---

## Acceptance gate

- [x] Product-plan confirms (RXL-Q2 / RXL-Q3) recorded — **Locked** 2026-08-31.
- [x] Five SOAP surfaces lock on `ended`, vitals field-by-field (PR, systolic, diastolic, WNL, section-note). Suite: `frontend/components/cockpit/rx/__tests__/rxLifecyclePhase1Gate.test.tsx`. Not every listed control (reports/media/referral/custom vitals) has its own assertion — those inherit the same `contentLocked` / fieldset.
- [x] Fails closed — `resolveRxLock(undefined)` and an unwired `useRxLock` probe are read-only.
- [x] Overlay gone (`rxl-02`). Banner is non-blocking (`role="status"`).
- [x] Opening a finished chart with desk vitals: zero `createPrescription` / `updatePrescription`.
- [x] Desk vitals appear on an open visit without dirtying.
- [x] Vitals manage-menu still persists hide/show on an ended visit (RXL-Q3).
- [ ] Send / finish / print on a locked note — **not re-run.** Commit-action files were not touched.
- [ ] Type-check + lint + full suite green — **failed.** Residuals below. No backend file touched by this phase.

### Gate residuals (2026-08-31)

| Item | Result | Why |
|---|---|---|
| Frontend `npx tsc --noEmit` | Fail | Pre-existing: `vital-confidence.ts`, `lib/desk/search-page.ts`, `filter-patient-in-call-thread.ts`, `use-persisted-entry-open.ts`. None in Phase 1 files. |
| ESLint on SOAP section files | Warnings | Pre-existing `react-hooks/exhaustive-deps` in Plan/Subjective/Assessment/PrescriptionForm. Core lock/seed files clean. |
| Full `vitest run` | 99 failed / 4718 passed (45 files) | Repo-wide. Not all attributed — log truncated. Blast-radius (`components/cockpit` + `consultation/cockpit` + `lib/cockpit`): 72 failed / 2344 passed. |
| `PlanSection` incomplete-row collapse | Fail | Pre-existing (visit-narrative Phase 1 residual). Isolated section tests have no lock provider; not a lock regression. Left untouched. |
| Persist suites asserting “no save when `disabled`” | Fail | Encode pre-Q3 shared flag. After RXL-Q3, `prefsLocked` stays false so order/collapse/hidden still persist. Judged, not blanket-updated. |
| `rxLockIntegrity` objective notes | Flake under parallel load | Passes in isolation and in the rxl-04 gate file. |
| DEFINITION_OF_DONE type-check / lint hard-stops | Not met | Same pre-existing repo residuals. Phase 1 is **not Shipped**. |

**Phase 2:** `rxl-03` (seed vs edit) landed — lazy create is implementable. Do **not** start `rxl-05` until RXL-Q1 is ticked and the founder accepts the mechanical residuals. Opus required.

**Interim for the team:** attested notes are hard-locked with no correction window until Phase 3 (RXL-DL-8). Do not file that as a bug.

---

## Risk (phase)

Covered by the product-plan register. Phase-specific:

- **Existing tests assert editability.** Several suites mount Plan and Objective sections and type into them without setting a cockpit state. Expect failures that are the tests encoding the bug, not the fix breaking behaviour — each one must be judged, not blanket-updated.
- **`rxl-03` is the load-bearing one.** It is the prerequisite for the whole of Phase 2 and it touches the desk-vitals path shipped the same day. If it slips, Phase 2 must not start.

---

**Created:** 2026-08-31.
**Last Updated:** 2026-08-31 (rxl-04 gate).
