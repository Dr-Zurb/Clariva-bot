# Execution order — Rx fast entry Phase 2 (command bar)

> Batch: [`plan-p2-rx-fast-entry-command-bar-batch.md`](../plan-p2-rx-fast-entry-command-bar-batch.md) · Product plan: [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md)
>
> **3 waves, 3 tasks, one lane.** All three edit the command bar + Rx mount. No parallel lane.

---

## TL;DR for the executor

1. **rfec-01 first.** Mount the bar inside the Rx form provider. `/` opens it (not in inputs). Jump results reuse the Phase 1 index.
2. **rfec-02 next.** *Show \<section\>* mutates the same hidden-set the manage menus use, persists, scrolls.
3. **rfec-03 last.** Deterministic vital set-value + new counts-only telemetry. Phase 2 gate.

**Hard dep:** Phase 1's field index module. If Phase 1 is not merged, stop — do not fork the label maps.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | rfec-01 | Shell + `/` + jump | Phase 1 index | Lane α | M | Auto |
| **2** | rfec-02 | Unhide | rfec-01 | Lane α | M | Auto |
| **3** | rfec-03 | Set-value + telemetry + gate | rfec-02 | Lane α | M | Auto |

```
Phase 1 index
      │
      ▼
 rfec-01  ──>  rfec-02  ──>  rfec-03  ──>  Phase 2 closed
```

---

## Wave detail

### Wave 1 — empty bar that can jump (rfec-01)

**Goal:** `/` opens a bar; typing a field name jumps. No writes yet.

**Gate:** trigger respects editable focus; Cmd-K untouched; jump reuses the Phase 1 index.

### Wave 2 — unhide (rfec-02)

**Goal:** hidden sections become reachable from the bar.

**Gate:** persist path is the manage-menu path; empty-set ambiguity not "fixed."

### Wave 3 — set-value + close (rfec-03)

**Goal:** `spo2 98` writes a vital; telemetry is counts-only; batch gate green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): frontend, no migration, no new AI path. **Auto.** Phase 3 is the Opus phase, not this one.

---

## Pre-load (every task)

- Product plan RFE-DL-1, DL-3, DL-4, DL-9, DL-10 · RFE-Q3, Q5, Q6
- Phase locks RFE2-D1…D6
- Phase 1 field index module (whatever path rfeq-01 created)
- The four `*Section.tsx` hidden-set + `save*SectionHidden` paths
- `vitals-visibility.ts` + ManageVitalsMenu persist
- `frontend/lib/telemetry/cmdk.ts` (do **not** extend `cmdkSearched`)

---

**Last Updated:** 2026-08-30
