# 26 May 2026 — daily plan README

> Day overview for batches scheduled to plan or ship on 2026-05-26. **Post-program polish day** for the cockpit. The cockpit-v2 program closed 2026-05-24 (kill-switch removal still pending soak); this day's batches are ongoing maintenance/polish discovered while dogfooding the v2 shell and DO NOT block any cockpit-v2 gate.
>
> **Source of issues:** dogfooding screenshot review on 2026-05-26 surfaced 22 distinct UI/UX problems. Severity-grouped and split into 4 sibling batches by problem family (correctness → labels → density → visual system). Detailed list lives inline in each plan doc's "Why this batch" section.

---

## Batches

| Batch | Status | Phase | Owning issue family | Plan doc | Execution order |
|---|---|---|---|---|---|
| `cockpit-plan-pane-deduplication` | Planning | Polish | Duplicate Subjective/Objective forms, legacy entry-mode radio + Photo block in Plan column, PlanActionFooter visibility | [`./cockpit-plan-pane-deduplication/plan-cockpit-plan-pane-deduplication-batch.md`](./cockpit-plan-pane-deduplication/plan-cockpit-plan-pane-deduplication-batch.md) | [`./cockpit-plan-pane-deduplication/Tasks/EXECUTION-ORDER-cockpit-plan-pane-deduplication.md`](./cockpit-plan-pane-deduplication/Tasks/EXECUTION-ORDER-cockpit-plan-pane-deduplication.md) |
| `cockpit-nav-clarity` | Planning | Polish | Right-column "Notes" mislabel, RxSectionNav chip strip noise in cockpit mode, Investigations empty surface, unlabeled header indicators | [`./cockpit-nav-clarity/plan-cockpit-nav-clarity-batch.md`](./cockpit-nav-clarity/plan-cockpit-nav-clarity-batch.md) | [`./cockpit-nav-clarity/Tasks/EXECUTION-ORDER-cockpit-nav-clarity.md`](./cockpit-nav-clarity/Tasks/EXECUTION-ORDER-cockpit-nav-clarity.md) |
| `cockpit-chart-density` | ✅ Shipped | Polish | Chart-rail empty-state overload (allergies + chronic + problem-list + history all-empty stack), inconsistent disclosure affordance, Snapshot pane sparsity | [`./cockpit-chart-density/plan-cockpit-chart-density-batch.md`](./cockpit-chart-density/plan-cockpit-chart-density-batch.md) | [`./cockpit-chart-density/Tasks/EXECUTION-ORDER-cockpit-chart-density.md`](./cockpit-chart-density/Tasks/EXECUTION-ORDER-cockpit-chart-density.md) |
| `cockpit-polish-visual` | Planning | Polish | AssessmentStrip zero-state, SaveStatusPill copy, BMI badge wiring, examination split visibility, column header treatment, color tokens, misc nits | [`./cockpit-polish-visual/plan-cockpit-polish-visual-batch.md`](./cockpit-polish-visual/plan-cockpit-polish-visual-batch.md) | [`./cockpit-polish-visual/Tasks/EXECUTION-ORDER-cockpit-polish-visual.md`](./cockpit-polish-visual/Tasks/EXECUTION-ORDER-cockpit-polish-visual.md) |

---

## Where this day fits in the cockpit-v2 program

The cockpit-v2 program proper closed on 2026-05-24 (all R-items shipped; `cockpit-v2-decommission` planned). This day is **NOT a Phase 4** — it is the routine "polish from dogfooding" wave that every shipped feature accrues. The four batches below resolve concrete defects visible in the shipped cockpit; none of them resurface cockpit-v2 program scope or require unfreezing the cockpit-v2 plan docs.

```
2026-05-17  cockpit-v2 (Phase 1)                              ✅ shipped
2026-05-19  cockpit-shell-flip (Phase 2 foothold)             ✅ shipped
2026-05-20  cockpit-chart-extraction (R-CHART)                ✅ shipped
2026-05-21  cockpit-ribbon (R-RIBBON)                         ✅ shipped
2026-05-21  templates-r-mod (R-MOD-full)                      ✅ shipped 2026-05-23
2026-05-21  cockpit-middle-investigations (R-MIDDLE-L)        ✅ shipped 2026-05-23
2026-05-21  cockpit-middle-rebuild (R-MIDDLE rest)            ✅ shipped 2026-05-23
2026-05-21  cockpit-history-pane (R-HISTORY)                  ✅ shipped 2026-05-24
2026-05-24  rx-polish-* (R-RX-POLISH)                         ⏳ shipping / planned
2026-05-24  cockpit-layout-presets-modality (R-LAYOUT-UX)     ⏳ planned
2026-05-24  cockpit-v2-decommission                           ⏳ awaiting soak
─────── Cockpit-v2 program closed ───────
2026-05-26  cockpit-plan-pane-deduplication (polish)          ⏳ today's planning
2026-05-26  cockpit-nav-clarity (polish)                      ⏳ today's planning
2026-05-26  cockpit-chart-density (polish)                    ✅ shipped
2026-05-26  cockpit-polish-visual (polish)                    ⏳ today's planning
```

Master tracker: [`docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md).

---

## Sibling batch ordering (locked 2026-05-26)

Four batches; sequencing rules below. **`cockpit-plan-pane-deduplication` must ship first** — every other batch's screenshots assume the duplicate forms are gone, and any visual rework done before dedup will need redoing once the Plan column collapses to a single source of truth.

1. **cockpit-plan-pane-deduplication** — touches `PrescriptionFormCompositionRoot.tsx`, `PrescriptionForm.tsx`, `RxWorkspace.tsx`, `RxPane.tsx`, `templates.tsx`. Adds `subjectiveLifted` / `objectiveLifted` / `entryModeLifted` / `photoLifted` prop chains (mirroring the existing `dxLifted` / `safetyLifted` pattern from cmr-01/02/06). **Start here.** Highest correctness impact; smallest visible diff.
2. **cockpit-nav-clarity** — touches `RxWorkspace.tsx` (gate `<RxSectionNav>`), `templates.tsx` (right-column title), `InvestigationsPane.tsx` (empty-state), `PatientRibbon.tsx` (indicator labels). **Disjoint from dedup AFTER ppd-01 lands** — both touch `RxWorkspace.tsx` but in different regions (props vs body); execute cnc after ppd Wave 1 to avoid merge conflicts.
3. **cockpit-chart-density** — touches `SnapshotPane.tsx`, `HistoryPane.tsx`, `PatientChartPane*` empty-state surfaces. Independent of ppd / cnc — parallelizable with cnc on a separate worktree.
4. **cockpit-polish-visual** — touches `AssessmentStrip.tsx`, `SaveStatusPill.tsx`, `VitalsGrid.tsx`, `ObjectiveSection.tsx`, column header CSS, and the token surfaces. Lands last so the visual polish reflects the structurally-correct (post-dedup) UI.

**Two engineers in parallel (recommended):**
- Engineer A: `cockpit-plan-pane-deduplication` → `cockpit-polish-visual`.
- Engineer B: `cockpit-nav-clarity` → `cockpit-chart-density` (after A's Wave 1 lands).
- Join at the daily smoke matrix.

Single-engineer wall-clock: ~10-13h (~1.5 dev-days). Two-engineer wall-clock: ~5-7h (~0.75 dev-days).

---

## Issue-to-batch crosswalk

The 22 issues from the 2026-05-26 dogfood review mapped to their owning batch and task:

| # | Issue | Batch | Task | Severity |
|---|---|---|---|---|
| 1 | Subjective section mounted twice (right column + Plan column) | ppd | ppd-01 + ppd-02 | Critical |
| 2 | Objective section mounted twice | ppd | ppd-01 + ppd-02 | Critical |
| 3 | Legacy "Prescription type" radio in Plan column | ppd | ppd-03 | Critical |
| 4 | Photo / attachments stub block in Plan column | ppd | ppd-03 | High |
| 5 | PlanActionFooter Send/Finish CTAs not visible | ppd | ppd-04 | Critical |
| 6 | Right column titled "Notes" but renders SOAP documentation | cnc | cnc-02 | High |
| 7 | RxSectionNav chip strip stacks under template tab nav | cnc | cnc-01 | High |
| 8 | Investigations pane header with empty body | cnc | cnc-03 | High |
| 9 | Header safety + treating indicators are mystery icons | cnc | cnc-04 | High |
| 10 | Allergies / Chronic / Problem list empty-state stack | ccd | ccd-01 | High |
| 11 | Snapshot pane empty even when patient has vitals | ccd | ccd-02 | High |
| 12 | Disclosure affordance inconsistent across chart-rail panes | ccd | ccd-03 | Medium |
| 13 | AssessmentStrip too tall / empty during waiting state | cpv | cpv-01 | Medium |
| 14 | SaveStatusPill renders as "—" when idle | cpv | cpv-02 | Medium |
| 15 | VitalsGrid lacks BMI badge despite height + weight present | cpv | cpv-03 | Medium |
| 16 | Examination General/Systemic split not visually obvious | cpv | cpv-04 | Medium |
| 17 | Column header treatment ad-hoc per column | cpv | cpv-05 | Medium |
| 18 | Ad-hoc badge/button colors (yellow safety, blue indicators) | cpv | cpv-06 | Medium |
| 19 | Patient meta row separators inconsistent | cpv | cpv-06 | Low |
| 20 | Top-bar search bar takes ~30% of width even when collapsible | cpv | cpv-07 | Low |
| 21 | Lucide icon mismatch on Investigations vs Snapshot | cpv | cpv-07 | Low |
| 22 | Problem-list text overflows pane | cpv | cpv-07 | Low |

---

## What's in flight today (other branches)

- **Cockpit-v2 program batches:** `rx-polish-densification`, `rx-polish-favorites`, `rx-polish-shortcuts`, `cockpit-layout-presets-modality` from 2026-05-24 are still in-flight. **No file overlap with today's batches** — those touch `MedicineRow.tsx`, autocomplete, cmdk, layout-tree. Today's polish touches dedupe + chart-rail surfaces.
- **`cockpit-v2-decommission`** is awaiting soak (cleared ~2026-06-21 per csf-05). No conflict with today's polish; if today's batches surface a cockpit-v2 plan-doc edit need, they can amend the plan since decommission archive hasn't run yet.
- **Other batches:** `patients-redesign` + text-stream batches — disjoint surfaces, no conflict.

---

## Adjacent reading

- **Source product plan:** [`docs/Work/Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) — context for the existing lift-pattern (DL-31, DL-32 reference `dxLifted` / `safetyLifted`).
- **Existing lift pattern precedent:** `cmr-01` (AssessmentStrip + `dxLifted`), `cmr-02` (SafetyStickyStrip + `safetyLifted`), `cmr-03` (PlanActionFooter + `actionsInFooter`). Today's `ppd` batch extends the pattern with two more lifts (`subjectiveLifted` / `objectiveLifted`) and two block-hide flags (`entryModeLifted` / `photoLifted`).
- **Auxiliary surface contracts:** [`frontend/lib/patient-profile/aux-surfaces.ts`](../../../../../frontend/lib/patient-profile/aux-surfaces.ts).
- **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- **Wave / lane / shape rules:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../EXECUTION-ORDER-GUIDELINES.md).

---

## Capture-inbox

- [ ] [polish day follow-up] After today's 4 batches ship, schedule a follow-up dogfood pass to confirm none of the 22 issues regress. (Source: docs/Work/Daily-plans/May 2026/26-05-2026/README.md)
- [ ] [polish day follow-up] Several "low" severity nits from cpv-07 may want their own micro-batch if scope creeps; capture before merging. (Source: same)
