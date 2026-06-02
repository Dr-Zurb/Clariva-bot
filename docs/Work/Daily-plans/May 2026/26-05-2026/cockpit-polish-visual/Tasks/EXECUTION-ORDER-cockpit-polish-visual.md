# cockpit-polish-visual — execution order

> Sibling document of [`plan-cockpit-polish-visual-batch.md`](../plan-cockpit-polish-visual-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (4 waves)

```
Wave 1 (Strip + pill copy — ~1.5h, single lane sequential):
  Lane α  ──── cpv-01 (S, Auto) ──> cpv-02 (XS, Auto)

Wave 2 (BMI + examination split — ~1h wall-clock with parallelism, 2 parallel lanes — fully independent):
  Lane α  ──── cpv-03 (S, Auto)                                    [frontend / VitalsGrid]
  Lane β  ──── cpv-04 (XS, Auto)                                   [frontend / ObjectiveSection]

Wave 3 (Visual system — ~2h wall-clock with parallelism, 2 parallel lanes after cpv-05):
  Lane α  ──── cpv-05 (S, Auto) ──> cpv-06 (M, Auto)               [tokens audit]
  Lane β  ──── (waits on cpv-05) ──> cpv-07 (S, Auto)              [misc nits]

Wave 4 (Verification + close-out — ~30min, single lane sequential):
  Lane α  ──── cpv-08 (XS, Composer 2 Fast)
```

**Total wall-clock with parallelism:** ~5-6h.
**Total agent-time (sequential equivalent):** ~6-8h.

The bottleneck is **Wave 3** — cpv-05 (column-header unification) is the sync point that cpv-06's token audit and cpv-07's misc nits both want to follow.

---

## Lane-by-lane details

### Wave 1 — Strip + pill copy (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | cpv-01 ✅ | S | Auto | `AssessmentStrip.tsx`, `__tests__/AssessmentStrip.test.tsx` | Zero-state collapse + muted hint copy. |
| 1 | cpv-02 ✅ | XS | Auto | `SaveStatusPill.tsx`, optional `__tests__/SaveStatusPill.test.tsx` (new if absent) | Copy + icon swap across 4 states. |

### Wave 2 — BMI + examination split (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| α | cpv-03 ✅ | S | Auto | `VitalsGrid.tsx`, `__tests__/VitalsGrid.test.tsx` (existing per chp-01) | BMI computation + badge. Lane α — disjoint. |
| β | cpv-04 ✅ | XS | Auto | `ObjectiveSection.tsx`, `__tests__/ObjectiveSection.test.tsx` | Labels + icons + divider on existing General/Systemic textareas. Lane β — disjoint. |

### Wave 3 — Visual system (2 parallel lanes after cpv-05)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| α-0 | cpv-05 ✅ | S | Auto | `PaneHeader.tsx`, all chart-rail + middle-column panes that render inline headers | Sync point. Routes every column header through `<PaneHeader>`. |
| α-1 | cpv-06 ✅ | M | Auto | `tailwind.config.ts`, full `frontend/components/cockpit/**` + `frontend/components/patient-profile/**` grep | Lane α — token audit + PatientRibbon separator swap. |
| β | cpv-07 ✅ | S | Auto | `frontend/components/layout/Header*` (search bar), `frontend/lib/patient-profile/pane-icons.ts` (new), `templates.tsx` (icon imports), problem-list rendering surface | Lane β — three nits bundled (search collapse, pane-icon SoT, problem-list wrap). |

**Lane gate check (§5) for Wave 3:**
1. Lane β can run today after cpv-05 ships? ✓ — Lane β's nits don't read Lane α's token work.
2. Files disjoint? Lane α touches `tailwind.config.ts` + the components for color swaps; Lane β touches the header / pane-icons / problem-list surfaces. ✓
3. Cross-consumption? No. ✓
4. Convergence task? cpv-08 (Wave 4) consumes both. ✓
5. Each lane ≥ 1h? Lane α (cpv-06) ~1.5h; Lane β (cpv-07) ~1h. ✓
6. Scope tag namable? Lane α = `[tokens]`, Lane β = `[nits]`. ✓

### Wave 4 — Verification + close-out (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | cpv-08 ✅ | XS | Composer 2 Fast | `docs/Reference/product/cockpit/COCKPIT.md`, `plan-cockpit-v2-execution-roadmap.md`, `docs/Work/capture/inbox.md`, telemetry file | Smoke + docs + capture + telemetry. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cpv-01 | S | Auto | Zero-state branch + tests; well-specified. |
| cpv-02 | XS | Auto | Copy + icon swap; mechanical. |
| cpv-03 | S | Auto | BMI math + badge UI + tests; ~80 LOC. |
| cpv-04 | XS | Auto | Label + icon + divider; ~30 LOC. |
| cpv-05 | S | Auto | Audit + route through `<PaneHeader>`. |
| cpv-06 | M | Auto | Token audit across many files; grep + replace. |
| cpv-07 | S | Auto | Three small unrelated changes bundled. |
| cpv-08 | XS | Composer 2 Fast | Smoke + docs + capture. |

---

## Acceptance gates per wave

### After Wave 1

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [x] AssessmentStrip in `waiting` + no-Dx state collapses to ~24px with muted hint.
- [x] SaveStatusPill shows one of 4 copy states; no "—" anywhere.

### After Wave 2

- [ ] All Wave 1 gates still green.
- [x] VitalsGrid shows BMI badge when height + weight set; tooltip shows category.
- [x] ObjectiveSection's General + Systemic textareas have labels, icons, and a divider.

### After Wave 3

- [ ] All Wave 2 gates still green.
- [x] All three column headers render via `<PaneHeader>`; visually identical.
- [ ] `rg "#[0-9a-fA-F]{3,6}" frontend/components/cockpit/ frontend/components/patient-profile/` returns zero results (or only commented exceptions).
- [x] PatientRibbon separators are all `·`.
- [x] Header search collapses below 1280px.
- [x] All chart-rail / middle-column panes use the single source-of-truth pane-icon map.
- [x] Problem-list text wraps within pane bounds.

### After Wave 4

- [x] All Wave 3 gates still green.
- [x] Telemetry — `cockpit_polish.visual_system_landed` fires.
- [x] COCKPIT.md + roadmap + capture-inbox updated.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Wall-clock |
|---|---|---|---|---|
| 1 | 2 | 2 | 0 | ~1.5h |
| 2 | 2 | 2 | 0 | ~1h (parallel) / ~2h (sequential) |
| 3 | 3 | 3 | 0 | ~2h (parallel) / ~3h (sequential) |
| 4 | 1 | 0 | 1 | ~30min |
| **Total** | **8** | **7** | **1** | **~6-8h sequential / ~5-6h parallel** |

---

## References

- Plan: [`plan-cockpit-polish-visual-batch.md`](../plan-cockpit-polish-visual-batch.md).
- Sibling exec-orders (today): `cockpit-plan-pane-deduplication`, `cockpit-nav-clarity`, `cockpit-chart-density`.
- Existing visual-polish precedent: `cockpit-history-pane` (chp-01..05) — chip-grid + General/Systemic split.
- Cost-aware model strategy: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- Wave / lane / shape rules: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md).
