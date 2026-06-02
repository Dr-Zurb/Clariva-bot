# Cockpit v3 — Phase 5: tab model — execution order

> Sibling document of [`plan-p5-cockpit-v3-tab-model-batch.md`](../plan-p5-cockpit-v3-tab-model-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** all three tasks are single-lane (Shape A). The work is a sequential structural chain — build the flat registry → point the palette/seed at it → re-prove parity. There is no honest second lane (cv3t-02 needs cv3t-01's registry; cv3t-03 verifies both), so no parallelism is claimed ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §7: bias toward sequential for structural work).
>
> **Where this sits:** Phase 5 runs **after** cv3x-02 (flag flip ✅) and **before** the Phase-4 soak + cv3x-03 (delete). See the batch plan's "Re-sequencing" section.

---

## Wave plan (2 waves, no internal pause)

```
Wave 1 (Build the flat model — ~4–6h, single lane sequential):
  Lane α  ──── **cv3t-01 (M, Opus 4.7)** ──> cv3t-02 (S, Sonnet 4.6)

Wave 2 (Re-prove parity + gate — ~3–4h, single lane sequential):
  Lane α  ──── **cv3t-03 (M, Opus 4.7)**

        │  (Phase 5 closes here — hands back to Phase 4)
        ▼
  [ release window ~1 week prod soak ]  ⏸   ← Phase 4's soak, now on a buildable v3
        ▼
  cv3x-03 (delete old shell + now-dead glue) ──> cv3x-04 (docs / close-out)
```

**Total wall-clock:** ~7–10h of agent-time, continuous (the ~1-week soak belongs to Phase 4 and runs after cv3t-03).
**Total agent-time (sequential equivalent):** ~7–10h (no parallelism — every wave is single-lane).

The keystone is **Wave 1 — cv3t-01**: flattening the mount of the prescribe surface. The risk is the lifted-props contract on the Plan tab (drop one → double/missing safety banners or two send buttons), so it is single-lane Opus and reviewed as one change.

---

## Lane-by-lane details

### Wave 1 — Build the flat model (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **cv3t-01** | M | **Opus 4.7** | `templates.tsx` (the column factories + the leaf wiring to mirror by reference), `RxPane.tsx` (the lifted-prop set), `pane-icons.ts`, `CockpitV3Shell.tsx` (panes/docks/consultActive), `PatientProfilePage.tsx` (the mount branch + ctx it builds) | Create `buildCockpitTabs(ctx)` (8 uniform leaf tabs by reference); relabel body → Consult/Visit-summary + modality icon; decouple Plan/Investigations; switch the v3 mount. **Do not touch** any pane body or `templates.tsx` (legacy). Opus per the "re-mounts consult-critical surface / lifted-props hazard" rule. |
| 1 | cv3t-02 | S | Sonnet 4.6 | `blankLayout.ts`, `CockpitPalette.tsx`, `CockpitV3Shell.tsx`, the cv3c-03 `buildUp.test.tsx` | Waits on cv3t-01. Point palette + blank-seed at the flat registry; add the production-path build-up regression + the `render:()=>null` guard. Bounded change → Sonnet; escalate one message to Opus only if a nested-template assumption is tangled deeper than expected. |

### Wave 2 — Re-prove parity + gate (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **cv3t-03** | M | **Opus 4.7** | `PARITY-MATRIX-cv3x-01.md`, the send pipeline (`PlanActionFooter` + Rx actions), the v3 integration/parity suites, the consult-type list | Waits on cv3t-01 + cv3t-02. Re-run the matrix on the flat structure + the build-up axis; record the superseding artifact; confirm flag-off byte-identical; stamp the gate that re-opens the soak (P5-DL-5). Build nothing. Opus per the close-gate review hard-rule. |

### Hand-back to Phase 4 (not Phase-5 tasks)

| After | What | Where |
|---|---|---|
| cv3t-03 green | ~1-week prod soak on the buildable v3 (kill-switch live; telemetry confirms v3 serving) | [`p4-cutover`](../../p4-cutover/) (P4-DL-3) |
| soak clean | cv3x-03 deletes old shell + the now-legacy-only glue (column factories, `InvestigationsAutoMerge`, `middle-bottom`) → cv3x-04 docs | [`p4-cutover/Tasks`](../../p4-cutover/Tasks/) |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cv3t-01 | M | **Opus 4.7** | Structural keystone that re-mounts the prescribe surface. The failure mode is subtle and clinical (a dropped lifted prop → duplicated/missing safety banners or two send buttons), not a crash. One careful review beats four mediocre ones. |
| cv3t-02 | S | Sonnet 4.6 | A bounded data-contract alignment (point palette + `blankLayout` at the flat registry) + a regression test. Well-spec'd, small surface. Auto/Sonnet tier; escalate only if a nested assumption is deeper than expected. |
| cv3t-03 | M | **Opus 4.7** | Re-proving the parity close-gate over consult-critical paths, plus the build-up axis the original matrix missed. A missed gap re-ships a regression to every doctor and unblocks a delete on a false premise. |

**Caps check:** 2 Opus tasks in the batch (cv3t-01, cv3t-03) = the §8 max of two; ≤1 Opus per wave (Wave 1: cv3t-01, with cv3t-02 on Sonnet; Wave 2: cv3t-03). ✓

---

## Acceptance gates per wave

### Wave 1 gate — flat model built + canvas buildable (cv3t-01 → cv3t-02)

- [ ] `buildCockpitTabs(ctx)` returns 8 uniform top-level leaf tabs (no `children`); v3 mounts it; legacy mount byte-identical.
- [ ] Body tab = id `body`, "Consult" (live) / "Visit summary" (review), modality icon, non-draggable while live; `BodyZone` ↔ `EndedConsultBody` internal branch.
- [ ] Plan/Investigations are independent tabs (no auto-merge); both edit the same `investigationsOrders` field; Plan's lifted props transplanted verbatim (no double/missing banners or send buttons).
- [ ] Palette lists the 8 real tabs; adding any one (from blank) mounts real content; the `render:()=>null` guard test is in place.
- [ ] `npx tsc --noEmit` + `npm run lint` clean; palette/build-up/v3 suites green.

### Wave 2 gate — parity re-proven + soak re-opened (cv3t-03) ✅ 2026-05-31

- [x] ✅ **All Wave 1 gates still green.** (45 suites · 345 passed)
- [x] ✅ Every cv3x-01 matrix cell green on the flat structure (prescribe + send incl. post-reshape · autosave · finish/no-show/review · three mount surfaces · keyboard nav) **+ the build-up axis** — [`../PARITY-MATRIX-cv3t-03.md`](../PARITY-MATRIX-cv3t-03.md) §3a/§3b.
- [x] ✅ Flag-off / kill-switch-on → legacy `PatientProfileShell` byte-identical (P0-DL-1); send/autosave/finish suites green with v3 active.
- [x] ✅ Parity matrix artifact added/superseded + dated (P5-DL-5); statuses stamped; cv3x-03 deletion additions handed off (inbox).

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3t-01, cv3t-02 | 1 | 0 | 1 | ~4–6h |
| Wave 2 | cv3t-03 | 0 | 0 | 1 | ~3–4h |
| **Total** | **3** | **1** | **0** | **2** | **~7–10h agent-time** |

Token estimate (rough): ~90k input / ~50k output, dominated by cv3t-01 (registry + mount switch) + cv3t-03 (matrix re-verify).

---

## References

- Plan: [`plan-p5-cockpit-v3-tab-model-batch.md`](../plan-p5-cockpit-v3-tab-model-batch.md).
- Source: [`Product plans/plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md) — v3-DL-2, v3-DL-5, R-PALETTE.
- Prior-phase exec orders (siblings in the same program):
  - [`../../p4-cutover/Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](../../p4-cutover/Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md)
  - [`../../p3-platform/Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md`](../../p3-platform/Tasks/EXECUTION-ORDER-p3-cockpit-v3-platform.md)
- Tasks: [`task-cv3t-01-flat-tab-registry.md`](./task-cv3t-01-flat-tab-registry.md) · [`task-cv3t-02-palette-and-blank-seed-on-leaves.md`](./task-cv3t-02-palette-and-blank-seed-on-leaves.md) · [`task-cv3t-03-integration-parity-reverify-and-gate.md`](./task-cv3t-03-integration-parity-reverify-and-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-05-31.  
**Status:** ✅ `Complete` (2026-05-31) — Wave 1 (cv3t-01 → cv3t-02) + Wave 2 (cv3t-03) all green. Phase 5 closes; handed back to Phase 4 (soak → cv3x-03 → cv3x-04). Gate artifact: [`../PARITY-MATRIX-cv3t-03.md`](../PARITY-MATRIX-cv3t-03.md).
