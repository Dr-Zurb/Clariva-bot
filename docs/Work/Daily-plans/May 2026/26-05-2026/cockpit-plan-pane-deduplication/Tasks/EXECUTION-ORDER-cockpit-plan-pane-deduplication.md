# cockpit-plan-pane-deduplication — execution order

> Sibling document of [`plan-cockpit-plan-pane-deduplication-batch.md`](../plan-cockpit-plan-pane-deduplication-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (3 waves)

```
Wave 1 (Lift prop scaffolding — ~1.5h, single lane sequential):
  Lane α  ──── ppd-01 (S, Auto)

Wave 2 (Conditional rendering at leaves — ~2h wall-clock with parallelism, 3 parallel lanes after ppd-01):
  Lane α  ──── (waits on ppd-01) ──> ppd-02 (S, Auto)              [frontend / comp-root]
  Lane β  ──── (waits on ppd-01) ──> ppd-03 (M, Auto)              [frontend / PrescriptionForm body]
  Lane γ  ──── (waits on ppd-01) ──> ppd-04 (XS, Auto)             [frontend / templates wiring]

Wave 3 (PlanActionFooter visibility + close-out — ~1.5-2h, single lane sequential):
  Lane α  ──── ppd-05 (S, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~4-5h.
**Total agent-time (sequential equivalent):** ~5-7h.

The bottleneck is **Wave 1** — ppd-01 is the sync point unlocking the three independent leaves; until the prop chain exists, every Wave 2 lane is blocked.

---

## Lane-by-lane details

### Wave 1 — Lift prop scaffolding (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | ppd-01 | S | Auto | `PrescriptionFormCompositionRoot.tsx`, `PrescriptionForm.tsx` (props block lines 69-122), `RxWorkspace.tsx`, `RxPane.tsx` | Touches 4 files; adds 4 props each chained through. No conditional rendering yet. |

### Wave 2 — Conditional rendering at leaves (3 parallel lanes after ppd-01)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| α | ppd-02 | S | Auto | `PrescriptionFormCompositionRoot.tsx`, `__tests__/PrescriptionFormCompositionRoot.test.tsx` (new) | Lane α — comp-root conditional render. Disjoint from Lane β / γ. |
| β | ppd-03 | M | Auto | `PrescriptionForm.tsx` (lines 1083-1140 for radio + photo blocks), `__tests__/PrescriptionForm.test.tsx` | Lane β — PrescriptionForm body conditional render. Disjoint from Lane α / γ. |
| γ | ppd-04 | XS | Auto | `frontend/lib/patient-profile/templates.tsx` `makeMiddleBottomRow` (lines 260-334) | Lane γ — single-line JSX prop wire-up. Disjoint. |

### Wave 3 — PlanActionFooter visibility + close-out (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | ppd-05 | S | Composer 2 Fast | `PlanActionFooter.tsx`, `PrescriptionForm.tsx` (commit-row search), `docs/Reference/product/cockpit/COCKPIT.md`, `plan-cockpit-v2-execution-roadmap.md`, `docs/Work/capture/inbox.md`, `frontend/lib/patient-profile/telemetry.ts` | Smoke matrix + telemetry + docs + capture. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| ppd-01 | S | Auto | Pure prop scaffolding across 4 files; mechanical work, Sonnet-tier. |
| ppd-02 | S | Auto | Conditional render in one file + new tests; well-specified. |
| ppd-03 | M | Auto | Two conditional renders in PrescriptionForm body + entryMode forcing; ~80 LOC tests. |
| ppd-04 | XS | Auto | Single JSX block change in templates.tsx. |
| ppd-05 | S | Composer 2 Fast | Smoke + docs + telemetry — checklist execution. |

---

## Acceptance gates per wave

### After Wave 1

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] All four prop chains compile through `PrescriptionFormCompositionRoot` → `PrescriptionForm` → `RxWorkspace` → `RxPane`.
- [ ] Defaults preserved: all four new props default `false`; no behavioral change yet.

### After Wave 2

- [ ] All Wave 1 gates still green.
- [ ] Conditional rendering of `<SubjectiveSection>` / `<ObjectiveSection>` works (test).
- [ ] Conditional rendering of entry-mode radio + photo block works (test).
- [x] `makeMiddleBottomRow` passes `subjectiveLifted objectiveLifted entryModeLifted photoLifted` to the Plan `<RxPane>`.
- [ ] `pnpm --filter frontend test` clean across all three lanes' touched files.

### After Wave 3

- [x] All Wave 2 gates still green.
- [x] Visual smoke at `/dashboard/appointments/[id]`: Plan column does NOT show Subjective + Objective + radio + photo block; right column DOES show Subjective + Objective; `<PlanActionFooter>` sticky with SaveStatus + Send Rx & finish when `canSendPrescription`.
- [x] Telemetry — `cockpit_polish.plan_pane_dedup_landed` fires.
- [x] COCKPIT.md + roadmap + capture-inbox updated.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Wall-clock |
|---|---|---|---|---|
| 1 | 1 | 1 | 0 | ~1.5h |
| 2 | 3 | 3 | 0 | ~2h (parallel) / ~3-4h (sequential) |
| 3 | 1 | 0 | 1 | ~1.5-2h |
| **Total** | **5** | **4** | **1** | **~5-7h sequential / ~4-5h parallel** |

---

## References

- Plan: [`plan-cockpit-plan-pane-deduplication-batch.md`](../plan-cockpit-plan-pane-deduplication-batch.md).
- Sibling exec-orders (24-05): [`rx-polish-densification`](../../../24-05-2026/rx-polish-densification/Tasks/EXECUTION-ORDER-rx-polish-densification.md).
- Cost-aware model strategy: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- Wave / lane / shape rules: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md).
