# 21 May 2026 — daily plan README

> Day overview for batches scheduled to plan or ship on 2026-05-21. This is the **Phase 2 finish-out day** for cockpit-v2 — five sibling batches planned today cover every remaining R-item before the Phase 2 gate (R-RIBBON → R-MOD-full → R-MIDDLE bottom-left → R-MIDDLE rest → R-HISTORY).

---

## Batches

| Batch | Status | Phase | Owning R-item(s) | Plan doc | Execution order |
|---|---|---|---|---|---|
| `cockpit-ribbon` | Planning | Cockpit v2 Phase 2 | R-RIBBON (always-visible patient context strip) | [`./cockpit-ribbon/plan-cockpit-ribbon-batch.md`](./cockpit-ribbon/plan-cockpit-ribbon-batch.md) | [`./cockpit-ribbon/Tasks/EXECUTION-ORDER-cockpit-ribbon.md`](./cockpit-ribbon/Tasks/EXECUTION-ORDER-cockpit-ribbon.md) |
| `templates-r-mod` | Planning | Cockpit v2 Phase 2 | R-MOD-full (Telemed-Voice / Telemed-Text / Review modality templates + `mapStateToTemplate`) | [`./templates-r-mod/plan-templates-r-mod-batch.md`](./templates-r-mod/plan-templates-r-mod-batch.md) | [`./templates-r-mod/Tasks/EXECUTION-ORDER-templates-r-mod.md`](./templates-r-mod/Tasks/EXECUTION-ORDER-templates-r-mod.md) |
| `cockpit-middle-investigations` | Planning | Cockpit v2 Phase 2 | R-MIDDLE bottom-left (Investigations leaf — replaces the last `<PanePlaceholder>`) | [`./cockpit-middle-investigations/plan-cockpit-middle-investigations-batch.md`](./cockpit-middle-investigations/plan-cockpit-middle-investigations-batch.md) | [`./cockpit-middle-investigations/Tasks/EXECUTION-ORDER-cockpit-middle-investigations.md`](./cockpit-middle-investigations/Tasks/EXECUTION-ORDER-cockpit-middle-investigations.md) |
| `cockpit-middle-rebuild` | Planning | Cockpit v2 Phase 2 | R-MIDDLE rest (Assessment sticky strip · safety strip · action footer · Body variants · narrow-monitor auto-merge) | [`./cockpit-middle-rebuild/plan-cockpit-middle-rebuild-batch.md`](./cockpit-middle-rebuild/plan-cockpit-middle-rebuild-batch.md) | [`./cockpit-middle-rebuild/Tasks/EXECUTION-ORDER-cockpit-middle-rebuild.md`](./cockpit-middle-rebuild/Tasks/EXECUTION-ORDER-cockpit-middle-rebuild.md) |
| `cockpit-history-pane` | Planning | Cockpit v2 Phase 2 | R-HISTORY (right column rebuild — vitals chip-grid · general/systemic exam · test results in Subjective/Objective panes) | [`./cockpit-history-pane/plan-cockpit-history-pane-batch.md`](./cockpit-history-pane/plan-cockpit-history-pane-batch.md) | [`./cockpit-history-pane/Tasks/EXECUTION-ORDER-cockpit-history-pane.md`](./cockpit-history-pane/Tasks/EXECUTION-ORDER-cockpit-history-pane.md) |

---

## Where this day fits in the cockpit-v2 program

This day plans **every remaining Phase-2 R-item** in the cockpit-v2 chain. By close of these batches, the Phase 2 gate from [`plan-cockpit-v2.md` §6](../../../Product%20plans/plan-cockpit-v2.md) is reachable and Phase 3 (R-RX-POLISH + R-LAYOUT-UX) can open.

```
2026-05-17  cockpit-v2 (Phase 1)                       ✅ shipped
2026-05-19  cockpit-shell-flip (Phase 2 foothold)      🟡 in flight
2026-05-20  cockpit-chart-extraction (R-CHART)         🟡 in flight
2026-05-21  cockpit-ribbon (R-RIBBON)                  ⏳ today's planning
2026-05-21  templates-r-mod (R-MOD-full)               ⏳ today's planning
2026-05-21  cockpit-middle-investigations (R-MIDDLE-L) ⏳ today's planning
2026-05-21  cockpit-middle-rebuild (R-MIDDLE rest)     ⏳ today's planning
2026-05-21  cockpit-history-pane (R-HISTORY)           ⏳ today's planning
─── Phase 2 gate ───
   ...      Phase 3 batches (R-RX-POLISH + R-LAYOUT-UX)
```

Master tracker: [`docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md). Read that before planning the next cockpit-v2 batch — it has the file-overlap heatmap, recommended ordering, and decision rules in one place.

---

## Sibling batch ordering (locked 2026-05-21)

The five sibling batches share Phase-2 surfaces (`templates.tsx`, `PatientProfilePage.tsx`, the deferred placeholders). They MUST be executed in the order below; the dependencies are encoded in each batch's "Predecessor batches" block.

1. **cockpit-ribbon** — independent of all other 21-05-2026 batches (new files only, plus one mount in `PatientProfilePage.tsx`). Can ship first.
2. **templates-r-mod** — adds Voice / Text / Review template factories and `mapStateToTemplate(state, modality)`. Other batches consume the new factories.
3. **cockpit-middle-investigations** — fills the last `<PanePlaceholder>` in `templates.tsx`. Depends on `templates-r-mod` if the Investigations leaf is consumed by the new factories.
4. **cockpit-middle-rebuild** — Body variants, Assessment strip, safety strip, action footer. Heaviest content batch; depends on the Investigations leaf existing so the bottom-row layout is final.
5. **cockpit-history-pane** — Subjective + Objective content (vitals chip-grid, examination_findings, test_results). Disjoint from the middle column but depends on `RxFormContext` field expansions already wired in cv2-05.

Two engineers running in parallel can compress the middle of the chain: `cockpit-history-pane` is disjoint enough from `cockpit-middle-rebuild` to ship in a parallel lane.

---

## What's in flight today (other branches)

- **`cockpit-shell-flip`** (planned 2026-05-19): csf-01..06. The 8-pane production cutover. **Must be merged before** crb-03, tmr-04, cmi-02, cmr-06, and chp-05 — every cutover task on `PatientProfilePage.tsx` stacks on csf-04. Wave 1 + Wave 2 of every batch is conflict-free and can start in parallel.
- **`cockpit-chart-extraction`** (planned 2026-05-20): cce-01..05. Snapshot + History split + `<SideSheetHost>`. **Conflict surface is `templates.tsx`** — the Snapshot/History leaves are already wired; subsequent batches edit different leaves of the same factory. Stack ordering preserved by Wave 3+ task dependencies in each batch's EXECUTION-ORDER doc.
- **`patients-redesign`** (planned 2026-05-18): pr-01..14. Disjoint surface (`patients-v2/**` route tree). No conflicts with any 21-05-2026 batch.

---

## Adjacent reading

- **Source product plan:** [`docs/Work/Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) — R-RIBBON (§R-RIBBON, ~line 311), R-MOD (§R-MOD, ~line 254), R-MIDDLE (§R-MIDDLE, ~line 342), R-HISTORY (§R-HISTORY, ~line 375).
- **Form context:** [`frontend/components/cockpit/rx/RxFormContext.tsx`](../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) — the lifted provider from csf-01. Already types every DL-24 field (vitals*, examinationFindings, differentialDiagnosis, advice, followUpValue/Unit, referral, testResults); R-MIDDLE + R-HISTORY add the UI inputs.
- **Templates factory:** [`frontend/lib/patient-profile/templates.tsx`](../../../../../frontend/lib/patient-profile/templates.tsx) — current single factory `getTelemedVideoTemplate`. R-MOD-full adds three siblings.
- **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- **Wave / lane / shape rules:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../EXECUTION-ORDER-GUIDELINES.md).
