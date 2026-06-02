# cockpit-chart-density — execution order

> Sibling document of [`plan-cockpit-chart-density-batch.md`](../plan-cockpit-chart-density-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (2 waves)

```
Wave 1 (Shared component + per-pane wiring — ~2h wall-clock with parallelism, 2 parallel lanes after ccd-01):
  Lane α  ──── ccd-01 (M, Auto) ──> ccd-02 (S, Auto)              [frontend / shared component + SnapshotPane]
  Lane β  ──── (waits on ccd-01) ──> ccd-03 (S, Auto)              [frontend / disclosure affordance]

Wave 2 (Verification + close-out — ~1h, single lane sequential):
  Lane α  ──── ccd-04 (XS, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~3h.
**Total agent-time (sequential equivalent):** ~3-4h.

The bottleneck is **Wave 1** — ccd-01 (the shared component) is the sync point; ccd-02 + ccd-03 unblock only after ccd-01 ships.

---

## Lane-by-lane details

### Wave 1 — Shared component + per-pane wiring (2 parallel lanes after ccd-01)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| α-0 | ccd-01 | M | Auto | None (new files) — but reference the existing `<SnapshotPane>` / `<HistoryPane>` body shape for the wrapper integration | Sync point. Lane α continues with ccd-02; Lane β starts ccd-03 after this lands. |
| α-1 | ccd-02 | S | Auto | `SnapshotPane.tsx`, `RxFormContext.tsx` (`useOptionalRxForm`), `__tests__/SnapshotPane.test.tsx` (mod or new) | Lane α — Snapshot integration. Disjoint from Lane β file set. |
| β | ccd-03 | S | Auto | `HistoryPane.tsx`, `SnapshotPane.tsx` (for chevron only), `PaneHeader.tsx` chevron wiring | Lane β — chevron / collapse wiring across all chart-rail panes. Touches `SnapshotPane` header only (no body changes) so doesn't fight Lane α. |

**Lane gate check (§5):**
1. Could Lane β run today, ignoring Lane α's WIP? ✓ — once ccd-01 ships, Lane β only adds chevron + collapse state to existing panes; Lane α's Snapshot-body work is a separate region of the same files.
2. Files disjoint? Lane α touches `SnapshotPane.tsx`'s body + new component; Lane β touches `SnapshotPane.tsx`'s header + `HistoryPane.tsx`'s body. Overlap in `SnapshotPane.tsx` but in disjoint regions; both lanes only ADD to it. Acceptable per §7 "low-churn surface".
3. Cross-consumption? Lane β doesn't read Lane α's WIP. ✓
4. Convergence task? ccd-04 (Wave 2) consumes both lanes' outputs. ✓ — convergence is in next wave, not in Wave 1. Per §3 Shape B sync-point variant.
5. Each lane ≥ 1h wall-clock? Lane α (ccd-01 + ccd-02) ~2h; Lane β (ccd-03) ~1h. ✓
6. Scope tag namable? Lane α = `[shared-comp + snapshot]`, Lane β = `[disclosure]`. ✓ (slightly two-word — acceptable.)

### Wave 2 — Verification + close-out (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | ccd-04 | XS | Composer 2 Fast | `docs/Reference/product/cockpit/COCKPIT.md`, `plan-cockpit-v2-execution-roadmap.md`, `docs/Work/capture/inbox.md`, telemetry file | Smoke + docs + capture + telemetry. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| ccd-01 | M | Auto | Shared component + wrapper + tests; ~190 LOC; clear spec. |
| ccd-02 | S | Auto | `useOptionalRxForm` integration + badge UI + tests. |
| ccd-03 | S | Auto | Chevron + collapse state wired into 3+ surfaces. |
| ccd-04 | XS | Composer 2 Fast | Smoke + docs + capture. |

---

## Acceptance gates per wave

### After Wave 1

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `<ChartRailEmptyState>` + `<UnifiedChartRailEmptyState>` components exist and render per DL-1 / DL-2. (ccd-01)
- [x] `<SnapshotPane>` reads live draft vitals from `useOptionalRxForm()`; renders "Live draft" badge when applicable. (ccd-02)
- [x] Chevrons render on all chart-rail panes; click toggles collapsed state per DL-4. (ccd-03)
- [x] First-visit empty patient → left rail renders single unified "Add patient context" card.
- [x] All Wave 1 tests pass.

### After Wave 2

- [x] All Wave 1 gates still green.
- [x] Visual smoke: first-visit + with-history patient views both look correct.
- [x] Telemetry — `cockpit_polish.chart_density_landed` fires.
- [x] COCKPIT.md + roadmap + capture-inbox updated.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Wall-clock |
|---|---|---|---|---|
| 1 | 3 | 3 | 0 | ~2h (parallel) / ~3h (sequential) |
| 2 | 1 | 0 | 1 | ~1h |
| **Total** | **4** | **3** | **1** | **~3-4h sequential / ~3h parallel** |

---

## References

- Plan: [`plan-cockpit-chart-density-batch.md`](../plan-cockpit-chart-density-batch.md).
- Sibling exec-orders (today): `cockpit-plan-pane-deduplication`, `cockpit-nav-clarity`.
- Sibling chart-rail exec-order (21-05): [`cockpit-history-pane`](../../../21-05-2026/cockpit-history-pane/Tasks/EXECUTION-ORDER-cockpit-history-pane.md).
- Cost-aware model strategy: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- Wave / lane / shape rules: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md).
