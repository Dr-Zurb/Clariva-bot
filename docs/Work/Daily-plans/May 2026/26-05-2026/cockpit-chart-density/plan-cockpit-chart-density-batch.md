# Cockpit chart-rail density — 26 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: **zero Opus tasks** — pure UI polish. Three Auto + one Composer 2 Fast close-out.
>
> **Source of issues:** dogfood review on 2026-05-26 (issues #10-12 from the [day README crosswalk](../README.md#issue-to-batch-crosswalk)).
>
> **Predecessor batches:**
> - `cockpit-chart-extraction` (cce-01..04) — shipped `<SnapshotPane>` + `<HistoryPane>` + the left-column factory. ccd-02 wires real data through `<SnapshotPane>`.
> - `cockpit-history-pane` (chp-01..05) — shipped the chip-grid vitals + General/Systemic split. ccd-01 unifies the empty-states.
> - The chart-rail today has five empty-state surfaces (Snapshot, History, Allergies, Chronic conditions, Problem list) and each owns its own placeholder copy + affordance. ccd-01 unifies them.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-cockpit-chart-density.md`](./Tasks/EXECUTION-ORDER-cockpit-chart-density.md).

---

## Why this batch

Three chart-rail density issues from the dogfood review:

1. **Allergies + Chronic + Problem list + History empty-state stack.** A patient on first visit has nothing in any of the four chart-rail panes. Each pane renders its own variant of "no data yet" placeholder — four different shapes, four different copies, four different empty visuals stacked vertically. The left rail at 22% of viewport width becomes a wall of grey "no data" boxes. Doctors learn to ignore the rail; new doctors don't know what they're missing.
2. **Snapshot pane empty even when patient has vitals.** Vitals captured during the visit (BP, HR, weight) live in the prescription draft, not in the patient's `patient_chart` row. `<SnapshotPane>` reads from `patient_chart` only — current visit data doesn't surface. Doctors enter vitals in the Objective section but Snapshot still shows "no vitals on file".
3. **Disclosure affordance inconsistent.** Allergies + Chronic conditions show a `▼` chevron indicating "click to expand"; History + Snapshot + Problem list don't. Some panes are expandable; some aren't; visually they all look the same. Inconsistent affordance teaches doctors that the cockpit is fragile.

These three issues compound: the chart rail is the "patient context" surface, and today it teaches doctors that the chart rail doesn't work. The fix is a consistent empty-state pattern + Snapshot reading from the live draft + uniform disclosure affordance.

**Visible artifact at the close-gate:** opening `/dashboard/appointments/[id]` for a new patient shows a single unified "Add patient context" affordance in the left rail (or the rail collapses to ~80px when fully empty). Snapshot pane reflects current-visit vitals as they're entered. Every pane has the same disclosure affordance (or none — pick one and apply).

This batch closes the three chart-rail issues with **4 tasks across 2 waves**, **~3-4h wall-clock single-engineer (~0.5 dev-day)**, **zero new migrations**, **zero Opus tasks**.

---

## Decision lock (frozen for batch duration)

**DL-1: Unified empty-state pattern is a shared component `<ChartRailEmptyState>`.** Located at `frontend/components/patient-profile/panes/ChartRailEmptyState.tsx` (new, ~80 LOC). Renders an icon + headline + secondary CTA. Used by all five chart-rail empty cases (Allergies / Chronic / Problem list / Snapshot / History — though History empty is rare). Props: `{ icon: LucideIcon; headline: string; cta?: { label: string; onClick: () => void } }`.

**DL-2: When ALL FIVE chart-rail panes are empty, render a single rail-level "Add patient context" card** (instead of five stacked empty-state cards). The trigger lives in the left-column wrapper (a new conditional render in `templates.tsx` `makeLeftColumn` or in a new wrapper component). When at least one pane has data, all five panes render normally (individual empty-states for the others). Threshold rule: ALL five empty → unified; ANY one has data → per-pane.

**DL-3: Snapshot reads current-visit vitals from `<RxFormContext>` AS WELL AS `patient_chart`.** Modify `<SnapshotPane>` to subscribe to the optional `useRxForm()` hook (degrades to `null` if no provider is mounted, e.g. on patient-only pages). When the hook returns a draft with non-empty vitals (BP, HR, weight, height), merge those into the displayed snapshot, marked with a "Live draft" badge to distinguish from persisted patient_chart data. On Send Rx, the vitals persist to `patient_chart` (existing behavior); the "Live draft" badge then disappears.

**DL-4: Disclosure affordance — pick "all expandable, all have chevron".** Every chart-rail pane gets a `▼` chevron in its header. Clicking the chevron collapses the pane body to a single-line summary ("3 allergies", "5 problems", "Last visit: 12 Mar"). The rail pane's `PaneDefinition` already supports collapsed state via the existing pane-collapse mechanism (ppr-15); ccd-03 adds the chevron and wires it. Alternative considered: "no chevron, panes always expanded" — rejected because patients with long histories need to collapse for screen real estate.

**DL-5: Collapsed state per pane is NOT persisted across sessions in v1.** Each cockpit mount starts with all panes expanded. Capture-inbox: persist to `doctor_settings.cockpit_chart_rail_collapsed` JSONB in a future micro-batch.

**DL-6: Empty-state CTAs are non-destructive.** "Add allergy" opens the existing allergy chip input (or routes to patient-edit). "Add problem" opens the problem-list input. "No CTA" for History + Snapshot when no patient_chart row exists (the empty-state copy is informational only — doctors don't manually add history; it accrues from past visits).

**DL-7: `<SnapshotPane>`'s "Live draft" badge is informational, not interactive.** Hovering shows a tooltip: "These vitals are from the current draft. They'll be saved when you send the Rx." Clicking the badge does nothing in v1. Capture-inbox: clicking could expand a comparison view (draft vs persisted).

**DL-8: No backend changes / no migrations.** Pure UI. The patient_chart schema is unchanged. The new `<ChartRailEmptyState>` component is a frontend-only addition.

**DL-9: Telemetry — single event `cockpit_polish.chart_density_landed`** fires once per session on first cockpit mount post-batch. Payload: `{ appointmentId, emptyPaneCount: number, unifiedEmptyState: boolean }`. Captures rollout coverage.

**DL-10: Aria-label consistency.** Each chart-rail pane's collapse chevron has `aria-label={"Collapse " + paneTitle}` or `"Expand " + paneTitle` based on state. `aria-expanded` reflects the collapsed boolean. Tested via the existing pane-shell aria test.

---

## Phases

### Wave 1 — Shared component + per-pane wiring (3 tasks, ~2-3h)

Wave 1 has three lanes that touch different files but ccd-01 (the shared component) must ship first as the sync point. Lanes β + γ wait on ccd-01.

- [`task-ccd-01-shared-empty-state-component.md`](./Tasks/task-ccd-01-shared-empty-state-component.md) — **M, Auto** — New `<ChartRailEmptyState>` component (~80 LOC). New `<UnifiedChartRailEmptyState>` wrapper component (~50 LOC) that decides single-vs-multi empty-state per DL-2. Tests in `__tests__/ChartRailEmptyState.test.tsx` (new, ~60 LOC). Lane α — must ship before ccd-02 + ccd-03 touch the chart-rail panes' empty branches.
- [`task-ccd-02-snapshot-live-vitals.md`](./Tasks/task-ccd-02-snapshot-live-vitals.md) — **S, Auto** — Modify `frontend/components/patient-profile/panes/SnapshotPane.tsx` to: (a) subscribe to `useOptionalRxForm()`, (b) merge draft vitals into the displayed snapshot with a "Live draft" badge per DL-3, (c) use `<ChartRailEmptyState>` when fully empty. Tests in `__tests__/SnapshotPane.test.tsx` (mod or new, ~60 LOC). Lane β — waits on ccd-01.
- [`task-ccd-03-disclosure-and-collapse.md`](./Tasks/task-ccd-03-disclosure-and-collapse.md) — **S, Auto** — Add chevron + collapse handler to each chart-rail pane (`<HistoryPane>`, `<SnapshotPane>`, and the allergy / chronic / problem-list sub-cards inside `<HistoryPane>`'s body). Wire chevron to local collapse state per DL-4 + DL-5. Tests in respective pane test files (mod, ~80 LOC total). Lane γ — waits on ccd-01.

### Wave 2 — Verification + close-out (1 task, ~1h)

- [`task-ccd-04-verification-and-close-out.md`](./Tasks/task-ccd-04-verification-and-close-out.md) — **XS, Composer 2 Fast** — Cross-cutting smoke matrix. Telemetry wire. COCKPIT.md update. Capture-inbox.

---

## Cross-cutting acceptance gate (whole batch)

### Structural

- [x] `<ChartRailEmptyState>` component exists.
- [x] `<UnifiedChartRailEmptyState>` wrapper exists and renders only when all 5 chart-rail empty-state signals are true.
- [x] `<SnapshotPane>` subscribes to `useOptionalRxForm()`.
- [x] All chart-rail panes have a chevron + collapse state.

### Behavior

- [x] First-visit patient (no patient_chart data) → left rail renders a single unified "Add patient context" affordance.
- [x] Patient with allergies on file → Allergies card renders normally; other empty panes render per-pane empty-state.
- [x] Entering vitals in Objective updates Snapshot in real-time with "Live draft" badge.
- [x] Send Rx → "Live draft" badge disappears (vitals persisted to patient_chart).
- [x] Clicking chevron in any chart-rail pane collapses to single-line summary; clicking again expands.
- [x] Collapsed state resets on page reload (DL-5).

### Quality

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] `pnpm --filter frontend test` clean (new + modified tests).
- [x] Screen-reader: chevron announces "Collapse / Expand {pane name}"; `aria-expanded` toggles correctly.
- [x] Visual regression: first-visit patient view shows unified empty-state; patient-with-history view shows individual panes with chevrons.
- [x] Telemetry — `cockpit_polish.chart_density_landed` fires once per session.

### Documentation

- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated — chart-rail empty-state pattern documented; live-vitals merge documented.
- [x] `plan-cockpit-v2-execution-roadmap.md` § Changelog — new line.
- [x] `docs/Work/capture/inbox.md` has 2-3 new lines (follow-ups).

---

## Out-of-scope (rolled forward)

| Item | Where it lands |
|---|---|
| **Per-session persisted collapse state** | Capture-inbox — needs `doctor_settings` migration; defer to a follow-up micro-batch. |
| **Animated collapse transitions** | Capture-inbox — feels minor; only if dogfood explicitly asks. |
| **Live-draft comparison view** (draft vs persisted) | Capture-inbox — bigger UX change, needs a separate plan. |
| **Auto-expanding the pane when new data lands** | Capture-inbox — surprising behavior; pilot before shipping. |

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | ccd-01, ccd-02, ccd-03 | 3 | 0 | 0 | ~2-3h (ccd-01 syncs ccd-02 + ccd-03 in two parallel lanes after) |
| 2 | ccd-04 | 0 | 1 | 0 | ~1h |
| **Total** | **4** | **3** | **1** | **0** | **~3-4h (~0.5 dev-day)** |

---

## References

- Source list: [day README crosswalk](../README.md#issue-to-batch-crosswalk).
- Existing left-column factory: [`frontend/lib/patient-profile/templates.tsx`](../../../../../frontend/lib/patient-profile/templates.tsx) `makeLeftColumn`.
- Existing chart-rail panes: [`frontend/components/patient-profile/panes/SnapshotPane.tsx`](../../../../../frontend/components/patient-profile/panes/SnapshotPane.tsx), [`HistoryPane.tsx`](../../../../../frontend/components/patient-profile/panes/HistoryPane.tsx).
- RxFormContext (live draft source): [`frontend/components/cockpit/rx/RxFormContext.tsx`](../../../../../frontend/components/cockpit/rx/RxFormContext.tsx).
- Cost-aware model strategy: [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- Wave / lane / shape rules: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../process/EXECUTION-ORDER-GUIDELINES.md).
