# cockpit-nav-clarity — execution order

> Sibling document of [`plan-cockpit-nav-clarity-batch.md`](../plan-cockpit-nav-clarity-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (3 waves)

```
Wave 1 (Cockpit-mode prop scaffolding — ~30min-1h, single lane sequential):
  Lane α  ──── cnc-01 (S, Auto)

Wave 2 (Empty-states + labels — ~1h wall-clock with parallelism, 3 parallel lanes — fully independent):
  Lane α  ──── cnc-02 (XS, Composer 2 Fast)               [docs / templates string change]
  Lane β  ──── cnc-03 (S, Auto)                            [frontend / InvestigationsPane empty]
  Lane γ  ──── cnc-04 (S, Auto)                            [frontend / PatientRibbon labels]

Wave 3 (Verification + close-out — ~30min, single lane sequential):
  Lane α  ──── cnc-05 (XS, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~2-2.5h.
**Total agent-time (sequential equivalent):** ~3-4h.

The bottleneck is **Wave 2 Lane β (cnc-03)** — empty-state + CTA wiring is the most involved task; the other two Wave 2 lanes finish faster.

---

## Lane-by-lane details

### Wave 1 — Cockpit-mode prop scaffolding (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | cnc-01 | S | Auto | `RxWorkspace.tsx` (props + chip-strip block at lines 212-225), `RxPane.tsx`, `templates.tsx` `makeMiddleBottomRow` | Single prop chain + one conditional gate on `<RxSectionNav>`. |

### Wave 2 — Empty-states + labels (3 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| α | cnc-02 | XS | Composer 2 Fast | `templates.tsx` `makeRightColumn` (line 225) | Single string change. Lane α — disjoint. |
| β | cnc-03 | S | Auto | `InvestigationsPane.tsx`, `__tests__/InvestigationsPane.test.tsx` (mod or new), `InvestigationsChipRow.tsx`, optional `<AddInvestigationDialog>` from cmi-01 | Empty-state + CTA wiring. Lane β — disjoint. |
| γ | cnc-04 | S | Auto | `PatientRibbon.tsx`, `__tests__/PatientRibbon.test.tsx` (mod or new), Radix Tooltip primitive | Aria-labels + tooltip + null-fallback copy. Lane γ — disjoint. |

### Wave 3 — Verification + close-out (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | cnc-05 | XS | Composer 2 Fast | `docs/Reference/product/cockpit/COCKPIT.md`, `plan-cockpit-v2-execution-roadmap.md`, `docs/Work/capture/inbox.md`, telemetry file | Docs + capture + telemetry only. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cnc-01 | S | Auto | Prop scaffolding + one conditional gate; mechanical. |
| cnc-02 | XS | Composer 2 Fast | Single string change; cheapest possible. |
| cnc-03 | S | Auto | Empty-state component + CTA + tests. Sonnet-tier. |
| cnc-04 | S | Auto | A11y + tooltip wrap; well-specified. |
| cnc-05 | XS | Composer 2 Fast | Smoke + docs + capture — checklist. |

---

## Acceptance gates per wave

### After Wave 1

- [x] `pnpm --filter frontend tsc --noEmit` clean (pre-existing errors elsewhere; cnc-01 files clean).
- [x] `<RxWorkspace>` + `<RxPane>` accept `cockpitMode`; default `false`.
- [x] Cockpit Plan pane does NOT render `<RxSectionNav>` (wired via `templates.tsx` `cockpitMode`).
- [x] Non-cockpit mounts still render `<RxSectionNav>` (`RxWorkspace.test.tsx`).

### After Wave 2

- [x] All Wave 1 gates still green.
- [x] Right column header reads "Chart Notes" (cnc-02).
- [x] `<InvestigationsPane>` shows empty-state copy + Add CTA when empty (cnc-03).
- [x] `<PatientRibbon>` indicators have labels + tooltip; "not assigned" fallback works (cnc-04).
- [x] All three lanes' tests pass.

### After Wave 3

- [x] All Wave 2 gates still green.
- [x] Telemetry — `cockpit_polish.nav_clarity_landed` fires (`RxWorkspace` + `RxWorkspace.test.tsx`).
- [x] COCKPIT.md + roadmap + capture-inbox updated.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Wall-clock |
|---|---|---|---|---|
| 1 | 1 | 1 | 0 | ~30min-1h |
| 2 | 3 | 2 | 1 | ~1h (parallel) / ~2h (sequential) |
| 3 | 1 | 0 | 1 | ~30min |
| **Total** | **5** | **3** | **2** | **~3-4h sequential / ~2-2.5h parallel** |

---

## References

- Plan: [`plan-cockpit-nav-clarity-batch.md`](../plan-cockpit-nav-clarity-batch.md).
- Sibling exec-order: [`cockpit-plan-pane-deduplication`](../../cockpit-plan-pane-deduplication/Tasks/EXECUTION-ORDER-cockpit-plan-pane-deduplication.md).
- Cost-aware model strategy: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- Wave / lane / shape rules: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md).
