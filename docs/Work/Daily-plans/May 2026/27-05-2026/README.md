# 27 May 2026 — daily plan README

> Day overview for batches scheduled to plan or ship on 2026-05-27. **Single hotfix day** — picks up the highest-priority follow-up from 2026-05-26's `cockpit-shell-layout-fix` capture-inbox: the middle column's empty body slot in `'review'` template (completed / cancelled / no-show appointments).

---

## Batches

| Batch | Status | Phase | Owning issue family | Plan doc | Execution order |
|---|---|---|---|---|---|
| `cockpit-ended-consult-body` | ✅ Shipped | Polish | Middle column gap in review template (`bodyVariant === 'review'`) | (single task — see Tasks/) | (single task — no order doc) |

---

## Where this day fits in the cockpit-v2 program

The cockpit-v2 program closed 2026-05-24 (all R-items shipped). 2026-05-26 spawned a polish day for 22 dogfooded UI defects; one explicit follow-up was captured in `docs/Work/capture/inbox.md`:

> `[ ] [csl follow-up] Add <EndedConsultBody> placeholder leaf for bodyVariant === 'review' in makeMiddleColumn so the middle column has a meaningful body when an appointment is ended (current state: leaf is omitted, column shows only Assessment + Plan-bottom).`

This day picks that up. No cockpit-v2 program scope re-opens; the plan docs stay frozen.

```
2026-05-24  rx-polish-* / cockpit-layout-presets / decommission  ⏳ in-flight / awaiting soak
─────── Cockpit-v2 program closed ───────
2026-05-26  cockpit-{plan-pane-dedup,nav-clarity,chart-density,polish-visual}  ✅ shipped
2026-05-26  cockpit-shell-layout-fix (hotfix triple: csl-01..03)               ✅ shipped
2026-05-27  cockpit-ended-consult-body                                         ✅ shipped (today)
```

Master tracker: [`docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md`](../../../Product%20plans/plan-cockpit-v2-execution-roadmap.md).

---

## Sibling batch ordering

Only one batch today. No ordering decisions needed.

Single-engineer wall-clock: ~1.5h (XS hotfix — one new component, one template wire-up, three test updates).

---

## Issue-to-batch crosswalk

| # | Issue | Batch | Task | Severity |
|---|---|---|---|---|
| 1 | Middle column shows a meaningless gap when appointment is completed / cancelled / no-show — `bodyVariant === 'review'` skipped the body leaf entirely | ecb | ecb-01 | Medium |

---

## What's in flight today (other branches)

- **Cockpit-v2 program batches:** `rx-polish-densification`, `rx-polish-favorites`, `rx-polish-shortcuts`, `cockpit-layout-presets-modality` — disjoint surfaces (autocomplete, cmdk, layout-tree). No conflict with today's batch which touches only `templates.tsx`, `pane-icons.ts`, `telemetry.ts`, and adds a new component file.
- **`cockpit-v2-decommission`:** awaiting soak. No conflict.
- **Other batches:** `patients-redesign`, text-stream — disjoint.

---

## Adjacent reading

- **Predecessor follow-up:** [`docs/Work/Daily-plans/May 2026/26-05-2026/cockpit-shell-layout-fix/Tasks/task-csl-01-restore-column-shell-and-flex-chain.md`](../26-05-2026/cockpit-shell-layout-fix/Tasks/task-csl-01-restore-column-shell-and-flex-chain.md) — explicitly captured this gap as out-of-scope and pointed at this work.
- **Capture inbox:** [`docs/Work/capture/inbox.md`](../../../../capture/inbox.md) — line that triggered today is the `[csl follow-up] Add <EndedConsultBody>` entry.
- **State machine reference:** [`frontend/lib/patient-profile/state.ts`](../../../../../frontend/lib/patient-profile/state.ts) — `deriveCockpitState` truth table + `mapStateToTemplate`.

---

## Capture-inbox

- [ ] [ecb follow-up] If dogfood shows doctors want richer post-call surfaces (full transcript replay for text consults, video/voice playback, multi-tab visit summary), promote `<EndedConsultBody>` into its own batch — current shipment is intentionally a compact informational strip only. (Source: docs/Work/Daily-plans/May 2026/27-05-2026/cockpit-ended-consult-body/Tasks/task-ecb-01-ended-consult-body.md)
