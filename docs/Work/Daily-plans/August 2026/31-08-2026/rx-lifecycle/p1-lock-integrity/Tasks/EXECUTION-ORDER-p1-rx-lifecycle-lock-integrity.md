# p1 — rx-lifecycle · lock integrity — execution order

> Sibling of [`plan-p1-rx-lifecycle-lock-integrity-batch.md`](../plan-p1-rx-lifecycle-lock-integrity-batch.md).
>
> **Implemented** 2026-08-31. Behaviour gate in `rxl-04`; mechanical residuals in the batch plan.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (3 waves)

```
Wave 1 (Gate — ~5h, single lane sequential):
  Lane α  ──── rxl-01 (M, Sonnet)

Wave 2 (Affordance + seed split — ~4h, 2 parallel lanes after rxl-01):
  Lane α  ──── rxl-02 (S, Sonnet)                      [overlay → banner]
  Lane β  ──── rxl-03 (M, Sonnet)                      [seed vs edit]

Wave 3 (Gate — ~2h, single lane sequential):
  Lane α  ──── rxl-04 (M, Sonnet)
```

**Total wall-clock with parallelism:** ~11h.
**Total agent-time (sequential equivalent):** ~13h.

`rxl-01` is the bottleneck and everything else reads the module it creates. `rxl-02` and `rxl-03` are genuinely independent — one is presentation, the other is the dirty-tracking path — but both need `rxl-01`'s gate to exist first.

---

## Lane-by-lane details

### Wave 1 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rxl-01 | M | Sonnet | `state.ts` (`canEditPrescriptionDraft`), `SubjectivePane`, `cockpit-tabs.tsx` (assessment + plan defs), `PrescriptionForm.tsx` (~1340), `PrescriptionFormCompositionRoot.tsx`, `ObjectivePane.tsx`, `ObjectiveSection.tsx` (~736), `VitalsGrid.tsx` (props ~154) | Five ungated sites. `canEditPrescriptionDraft` is **not** imported in `PrescriptionForm` — only `canSendPrescription` is. `cockpitState` there is optional; non-cockpit mounts must stay editable. |

### Wave 2 — Affordance + seed split

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rxl-02 | S | Sonnet | `RxWorkspace.tsx` (~244-250), existing cockpit banner / toast patterns | Delete the overlay, do not repair it. A click-blocking overlay would also block scroll and text selection of a record the doctor needs to read. |
| 0 | rxl-03 | M | Sonnet | `RxFormContext.tsx` (reducer, `setInitialFields`, autosave scheduling, `persistSnapshot` ~2739), `desk-vitals-seed.ts`, `DeskVitalsSectionNoteSeed`, `useRxFormProviderSetup.ts` (~360-420), `useLastVisitVitals.ts` | The seeder currently reaches the form through `setField`. Do **not** change what desk vitals are fetched or when — only how they land. |

### Wave 3 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rxl-04 | M | Sonnet | whole phase diff, existing Plan / Objective / vitals suites | Expect pre-existing suites that assert editability. Judge each; do not blanket-update. Honest ticks. |

**Branch suggestion:** `fix/rxl-p1-lock-integrity` (single branch; Wave 2 lanes only if worktrees).

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| rxl-01 | M | Sonnet | Prop threading against a documented gate; no new rule to invent |
| rxl-02 | S | Sonnet | Delete + replace with an existing banner pattern |
| rxl-03 | M | Sonnet | Dirty-tracking discipline in one context module |
| rxl-04 | M | Sonnet | Gate / docs |

No Opus in this phase — frontend only, no schema, no PHI store, no RLS. Well under the §8 cap.

---

## Acceptance gates per wave

**Wave 1:** every listed surface read-only on a `completed` appointment, vitals included; an unwired section renders read-only (fails closed); layout-preference autosave still fires on a locked visit; non-cockpit mounts of `PrescriptionForm` unaffected.

**Wave 2:** overlay gone, locked note still scrolls and selects; read-only state is visibly stated, not only announced to screen readers. Separately — opening a finished chart with desk vitals present issues zero prescription writes, while an open visit still shows desk vitals immediately.

**Wave 3:** full phase gate; `DEFINITION_OF_DONE.md` run; product-plan Phase 1 marked, Phase 2 unblocked.

---

## Cost estimate

| Wave | Tasks | Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| 1 | 1 | 1 | 0 | ~5h |
| 2 | 2 | 2 | 0 | ~4h |
| 3 | 1 | 1 | 0 | ~2h |
| **Total** | **4** | **4** | **0** | **~11h** |

---

## References

- Plan: [`plan-p1-rx-lifecycle-lock-integrity-batch.md`](../plan-p1-rx-lifecycle-lock-integrity-batch.md)
- Product: [`plan-rx-lifecycle.md`](../../../../../../Product%20plans/plan-rx-lifecycle.md)
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)

---

**Created:** 2026-08-31.
