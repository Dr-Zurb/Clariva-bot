# 20 May 2026 — daily plan README

> Day overview for batches scheduled to plan or ship on 2026-05-20.

---

## Batches

| Batch | Status | Phase | Owning R-item(s) | Plan doc | Execution order |
|---|---|---|---|---|---|
| `cockpit-chart-extraction` | Planning | Cockpit v2 Phase 2 | R-CHART (Snapshot + History split) | [`./cockpit-chart-extraction/plan-cockpit-chart-extraction-batch.md`](./cockpit-chart-extraction/plan-cockpit-chart-extraction-batch.md) | [`./cockpit-chart-extraction/Tasks/EXECUTION-ORDER-cockpit-chart-extraction.md`](./cockpit-chart-extraction/Tasks/EXECUTION-ORDER-cockpit-chart-extraction.md) |

---

## Where this day fits in the cockpit-v2 program

This day plans the **second** Phase-2 mini-batch in the cockpit-v2 chain.

```
2026-05-17  cockpit-v2 (Phase 1)                  ✅ shipped
2026-05-19  cockpit-shell-flip (Phase 2 foothold) 🟡 in flight
2026-05-20  cockpit-chart-extraction (R-CHART)    ⏳ today's planning  ← you are here
   ...      cockpit-ribbon (R-RIBBON)             ⏳ next
   ...      templates-r-mod (R-MOD-full)
   ...      cockpit-middle-* (R-MIDDLE)
   ...      cockpit-history-pane (R-HISTORY)
─── Phase 2 gate ───
   ...      Phase 3 batches (R-RX-POLISH, R-LAYOUT-UX, decommission)
```

Master tracker: [`docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md). Read that before planning the next cockpit-v2 batch — it has the file-overlap heatmap, recommended ordering, and decision rules in one place.

---

## What's in flight today (other branches)

- **`cockpit-shell-flip`** (planned 2026-05-19): csf-01..06. The 8-pane production cutover. **Must be merged before cockpit-chart-extraction's Wave 3 (cce-04) can ship** — cce-04 modifies `templates.tsx` which csf-02 + csf-03 also write. Wave 1 + Wave 2 of cockpit-chart-extraction are conflict-free with csf-* and can start in parallel.
- **`patients-redesign`** (planned 2026-05-18): pr-01..14. Disjoint surface (`patients-v2/**` route tree). No conflicts.

---

## Adjacent reading

- **Source product plan:** [`docs/Work/Product plans/plan-cockpit-v2.md`](../../../Product%20plans/plan-cockpit-v2.md) — R-CHART spec at §R-CHART (line ~283).
- **Aux-surface contracts:** [`frontend/lib/patient-profile/aux-surfaces.ts`](../../../../../frontend/lib/patient-profile/aux-surfaces.ts) (from cv2-09) — the side-sheet contract that R-CHART exercises for the first time.
- **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
- **Wave / lane / shape rules:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../EXECUTION-ORDER-GUIDELINES.md).
