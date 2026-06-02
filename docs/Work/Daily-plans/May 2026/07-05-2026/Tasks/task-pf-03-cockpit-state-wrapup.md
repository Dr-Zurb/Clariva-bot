# Task pf-03: Cockpit state — add `wrap_up`

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 1, Lane β step 0 — **XS, ~1h**

---

## Task overview

Extend the cockpit state machine (shipped in `cockpit-1` of the 06-05-2026 batch) so `deriveCockpitState()` returns a new `wrap_up` state when the consultation session has ended but the appointment is not yet `completed`. Today this combination silently routes to `ended`, so the doctor sees `EndedCard` even though the appointment is still officially open.

This task is independent of the backend (Lane α) and can run in parallel from `T+0`.

**Estimated time:** ~1h. Pure helper edit + truth-table extension + unit-test additions.

**Status:** Shipped (2026-05-08).

**Hard deps:** none (06-05-2026 cockpit-1 already shipped the state machine).

**Source:** [plan-patient-seeing-flow.md § P1.3](../../../../Product%20plans/plan-patient-seeing-flow.md#p13--cockpit-state-add-wrap_up).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A from the efficiency guide — bounded edit, clear spec, existing test infra to extend.

**Why not Opus:** truth-table is small (1 new row + 4 helper updates) and the existing test file from cockpit-1 makes the spec unambiguous.

**New chat?** **Yes** — fresh chat. Pre-load: this task file + `frontend/lib/consultation/cockpit-state.ts` + `frontend/lib/consultation/__tests__/cockpit-state.test.ts`.

**Composer-OK sub-steps:** none.

**Estimated turns:** 1–2 Sonnet turns.

---

## Acceptance criteria

### State machine update

- [ ] Add `'wrap_up'` to the `CockpitState` union:

  ```ts
  export type CockpitState =
    | 'ready'
    | 'lobby'
    | 'live'
    | 'wrap_up'   // NEW: session ended, appointment not yet completed
    | 'ended'
    | 'terminal';
  ```

- [ ] Extend the truth table inside `deriveCockpitState()`:

  | `appointment.status` | `session?.status` | → New behaviour |
  |---|---|---|
  | `pending` / `confirmed` | `ended` | **`wrap_up`** (was `ended`) |
  | `completed` | `ended` | `ended` (unchanged) |
  | `completed` | absent | `ended` (unchanged) |

  All other rows stay verbatim from cockpit-1.

### Helper updates

- [ ] `canSendPrescription(state)` — `true` for `live`, `wrap_up`, `ended`. (Was `live` + `ended`.)
- [ ] `canEditPrescriptionDraft(state)` — `true` for `ready`, `lobby`, `live`, `wrap_up`. (Was `ready`, `lobby`, `live`.)
- [ ] `shouldShowChartRail(state, hasPatientId)` — unchanged (still gated on `hasPatientId`).
- [ ] `primaryCtaFor(state, modality)`:
  - Add `wrap_up` → `{ label: "Done with patient", action: "wrap-up" }`. (Surfaced by pf-05 in the header.)
  - Existing five rows unchanged.
- [ ] **NEW helper** `shouldMountLauncher(state)` — `true` for `ready`, `false` otherwise. Used by pf-11's countdown overlay to decide whether to even render the launcher area.

### Tests

- [ ] Extend `frontend/lib/consultation/__tests__/cockpit-state.test.ts`:
  - 1 new truth-table row test: `(confirmed, ended)` → `'wrap_up'`.
  - 1 new truth-table row test: `(pending, ended)` → `'wrap_up'`.
  - Re-assertions for `(completed, ended)` → `'ended'` (regression guard).
  - 5 helper assertions: `canSendPrescription('wrap_up')`, `canEditPrescriptionDraft('wrap_up')`, `primaryCtaFor('wrap_up')`, `shouldMountLauncher` for each state.
- [ ] All existing tests still pass — no regression.

### General

- [ ] Type-check + lint clean.
- [ ] JSDoc on `wrap_up` state explains the discriminator (session ended, appointment not yet completed).
- [ ] No imports from `react`, `next`, or any UI lib — this stays a pure helper.

---

## Out of scope

- **`MobilePillBar`** — the source plan says it handles `wrap_up` identically to `ended` for now. No edit needed if the bar already keys off `state === 'live'`. If it doesn't already, leave a `// TODO(pf-07): handle wrap_up` comment and move on.
- **Any consumer-side wiring** — pf-04 (dialog), pf-05 (header CTA), pf-11 (countdown) consume the new state. This task is helper-only.

---

## Files expected to touch

**Modified:**
- `frontend/lib/consultation/cockpit-state.ts` (~30 LOC additive)
- `frontend/lib/consultation/__tests__/cockpit-state.test.ts` (~60 LOC additive)

**New:** none.
**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why not derive `wrap_up` from `appointment.status === 'wrap_up'`?** We considered adding a `wrap_up` enum value to `appointments.status` itself, but `appointments.status` is already crowded (`pending`, `confirmed`, `cancelled`, `no_show`, `completed`) and adding another value forces a migration + RLS audit + downstream consumer audit. The session-vs-appointment derivation is a free win.
2. **`shouldMountLauncher`.** Lifted from existing logic in `ConsultationCockpit`'s right-pane mount; centralising it here keeps pf-08 / pf-11 from drifting on the rule.
3. **`pending` × `ended` quirk.** Theoretical only — a session can be `ended` while the appointment is still `pending` if status flips were skipped. Defensively map to `wrap_up` (better than the current `ended`).

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P1.3](../../../../Product%20plans/plan-patient-seeing-flow.md#p13--cockpit-state-add-wrap_up)
- **Predecessor task (state machine origin):** [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-1-state-machine.md](../../06-05-2026/Tasks/task-cockpit-1-state-machine.md)
- **Batch plan:** [plan-patient-flow-batch.md](../plan-patient-flow-batch.md)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
