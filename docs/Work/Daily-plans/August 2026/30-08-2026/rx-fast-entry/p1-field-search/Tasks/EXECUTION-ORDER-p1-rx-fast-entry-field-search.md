# Execution order — Rx fast entry Phase 1 (field search)

> Batch: [`plan-p1-rx-fast-entry-field-search-batch.md`](../plan-p1-rx-fast-entry-field-search-batch.md) · Product plan: [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md)
>
> **3 waves, 3 tasks, one lane.** All three converge on the palette + appointment deep-link. Do not invent a parallel lane.

---

## TL;DR for the executor

1. **rfeq-01 first.** Build the static field index from the existing label maps. Register a `fields` source. Hits only when the path is `/dashboard/appointments/:id`. `routedTo` is that same path plus `rxFocus`.
2. **rfeq-02 next.** The cockpit reads `rxFocus`, restores/activates the pane, expands, scrolls, focuses, strips the param.
3. **rfeq-03 last.** Telemetry source key, tests, Phase 1 gate.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | rfeq-01 | Field index + Cmd-K source | — | Lane α | M | Auto |
| **2** | rfeq-02 | `rxFocus` consumer | rfeq-01 | Lane α | M | Auto |
| **3** | rfeq-03 | Gate + tests | rfeq-01..02 | Lane α | S | Auto |

```
rfeq-01  ──>  rfeq-02  ──>  rfeq-03  ──>  Phase 1 closed
```

---

## Wave detail

### Wave 1 — the index (rfeq-01)

**Goal:** Cmd-K on an open visit lists matching fields. Selecting one changes the URL. Nothing in the form moves yet.

**Gate:** route-aware silence off a visit; `rxFocus` present after select; `SourceItem` still has only `routedTo`.

### Wave 2 — the landing (rfeq-02)

**Goal:** that URL actually focuses the field.

**Gate:** restore hidden pane, activate tab, expand section, scroll + focus, strip param. No snap-rail. No section unhide.

### Wave 3 — close (rfeq-03)

**Goal:** the Phase 1 gate in the batch plan is all green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): all three tasks are bounded frontend work against existing registries and layout mutations. **Auto.** No Opus. No Composer (the three tasks share `GlobalCommandPalette` + the appointment mount).

---

## Pre-load (every task)

- Product plan decision locks RFE-DL-1, DL-2, DL-4, DL-9, DL-11
- Phase locks RFE1-D1…D5
- `frontend/components/layout/GlobalCommandPalette.tsx`
- `frontend/lib/telemetry/cmdk.ts`
- The four `*-section-order.ts` label maps + `vitals-schema.ts` labels
- `restoreLeaf` / `setActiveTab` in `layout-tree-mutations.ts` (rfeq-02)
- Existing scroll helpers: `collapse-scroll.ts`, `exam-card-scroll.ts`, `complaint-card-scroll.ts` (rfeq-02)

---

**Last Updated:** 2026-08-30
