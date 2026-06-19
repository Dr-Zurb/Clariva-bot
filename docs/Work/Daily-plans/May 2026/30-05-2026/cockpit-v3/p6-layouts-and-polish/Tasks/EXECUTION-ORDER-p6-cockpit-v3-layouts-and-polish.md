# Cockpit v3 — Phase 6: layouts + polish — execution order

> Sibling document of [`plan-p6-cockpit-v3-layouts-and-polish-batch.md`](../plan-p6-cockpit-v3-layouts-and-polish-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** Wave 1 runs **two honest lanes** (Shape B). Lane α is the layout chain (catalogue → switcher); Lane β is the visual pass, independent of α because it touches disjoint *view* components. Wave 2 is a single-lane verification + close-gate. The only Opus in the batch is the gate ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §8 hard-rule: close-gate review).
>
> **Where this sits:** Phase 6 is the **first post-ship enhancement phase** — Phases 0–5 shipped. It is purely additive (layout data + a switcher + CSS), so there is no soak, no kill-switch, and no parity matrix; the gate's "no pipeline/body change" assertion is the safety net.

---

## Wave plan (2 waves, no internal pause)

```
Wave 1 (Build — ~5–7h, two parallel lanes):
  Lane α  ──── **cv3l-01 (M, Auto)** ──> cv3l-02 (S, Auto)
  Lane β  ──── **cv3l-03 (M, Auto)**                         (independent — view CSS only)

        │  (both lanes converge)
        ▼
Wave 2 (Verify + gate — ~1–2h, single lane):
  Lane α  ──── **cv3l-04 (S, Opus)**
```

**Total wall-clock:** ~6–9h of agent-time (Wave 1's lanes overlap).
**Total agent-time (sequential equivalent):** ~6–9h.

The keystone is **Wave 1 Lane α — cv3l-01**: it authors the four layout trees and re-points the seed + reset from blank to Consult. The only real risk is the **reset/seed ripple** — several v3 suites assert a blank/all-hidden first-open (`useCockpitV3Layout.persistence`, `blank-seed-probe`, dnd/persistence fixtures); cv3l-01 must update those to the Consult-seed reality. It stays on Auto because the change is localized and well-spec'd, with a per-message Opus escalation budget if the ripple is deeper than expected.

---

## Lane-by-lane details

### Wave 1 — Build (two parallel lanes)

#### Lane α — Layout chain (sequential: cv3l-01 → cv3l-02)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **cv3l-01** | M | **Auto** | `blankLayout.ts`, `CockpitV3Shell.tsx` (the `blankLayout(panes)` → `blankDefaultTree` memo, L66/L97), `useCockpitV3Layout.ts` (seed effect + `resetLayout` path), `useShellLayout.ts` (`resetLayout`, L530), `cockpit-tabs.tsx` (the 8 ids), `layout-tree.ts` (`PaneTreeNode` + validators). | Create `default-layouts.ts` (the 4 complete trees + `DEFAULT_LAYOUTS` + `DEFAULT_SEED_ID`) + its unit test; re-point the v3 seed to Consult; make `reset` re-apply Consult; update the blank-start assertions in the v3 suites. **Do not** edit the engine, registry, or any pane body. |
| 1 | cv3l-02 | S | Auto | `CockpitPalette.tsx` (reset button + palette toolbar), `useCockpitV3Layout.ts` (`applyLayout`), `default-layouts.ts` (from cv3l-01), the shell hotkey wiring | Waits on cv3l-01. Add a "Layouts" control to the palette listing the four built-ins; apply on select via `applyLayout`; add an undo affordance; register `mod+shift+1..4` (no collision). Build the list so a future "My layouts" section slots in (P6-DL-7). Bounded UI → Auto. |

#### Lane β — Visual pass (independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **cv3l-03** | M | **Auto** | `CockpitLeafView.tsx`, `PaneTabStripV3.tsx`, `CockpitGroupView.tsx`, `CockpitEmptyState.tsx`, `CockpitCanvas.tsx`, the design tokens (`globals.css` / Tailwind theme: `bg-card`, `border`, `shadow-sm`, radius, `bg-primary`) | Purely presentational: leaf cards (border + shadow + radius), panel gutters, lifted active tab + accent, polished empty state. **Must not** touch `CockpitPalette.tsx` (Lane α's file), the engine, the registry, or any pane body. Keep the anchored safety strip/footer visually prominent (v3-DL-6). Auto — design taste, low risk. |

### Wave 2 — Verify + gate (single lane)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **cv3l-04** | S | **Opus** | the whole-batch acceptance gate (plan), the v3 test suites, the changed files' diff, a11y/contrast checklist | Waits on cv3l-01 + cv3l-02 + cv3l-03. Integration smoke (seed → switch → reshape → reset → empty → reload), a11y/contrast (light+dark), confirm zero change to the send pipeline / autosave / pane bodies, `tsc`/`lint`/suites green, stamp the gate. Build nothing. Opus per the close-gate review hard-rule. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| cv3l-01 | M | **Auto** | Bounded layout data (four hand-authored trees against a known 8-id registry) + a localized seed/reset re-point. The only subtlety is updating the blank-start test assertions — well understood, spec'd here. Escalate one message to Opus only if the reset ripple is tangled deeper than the named suites. |
| cv3l-02 | S | Auto | A small palette control + `applyLayout` call + hotkey registration. Pattern already exists (the reset button). Auto. |
| cv3l-03 | M | Auto | Presentational CSS across five view components. Needs design judgment but no behavioural risk; no clinical/data path. Auto (per-message escalation if a container-query/scroll regression appears). |
| cv3l-04 | S | **Opus** | Close-gate review of the whole batch + a11y/contrast + the "nothing clinical changed" assertion. One careful review beats four mediocre ones (hard-rule §5). |

**Caps check:** 1 Opus task in the batch (cv3l-04) ≤ the §8 max of two; ≤1 Opus per wave (Wave 1: none; Wave 2: cv3l-04). ✓

---

## Acceptance gates per wave

### Wave 1 gate — layouts seed + switch, and the cockpit looks premium (cv3l-01 → cv3l-02 · cv3l-03) — ✅ 2026-06-03

- [x] ✅ `default-layouts.ts` exports Consult · Read · Document · Review; each tree contains **all eight** pane ids (visible + hidden), passes the tree validators, and matches the visible/hidden contract in the plan.
- [x] ✅ First open (empty storage) → **Consult** 8-pane renders; `reset` → Consult; existing persisted layouts still hydrate.
- [x] ✅ Palette "Layouts" control lists the four; selecting applies over the current tree with an undo affordance; `mod+shift+1..4` switch without hotkey collision; all eight panes remain palette-toggleable after a switch.
- [x] ✅ Leaves render as carded panels with gutters; the active tab is visibly lifted with an accent; the empty state is polished; the safety strip/footer stay prominent (v3-DL-6).
- [x] ✅ `npx tsc --noEmit` + `npm run lint` clean on changed files.

### Wave 2 gate — verified + premium + nothing clinical moved (cv3l-04) — ✅ 2026-06-03

- [x] ✅ **All Wave 1 gates still green.**
- [x] ✅ Integration smoke passes: seed → switch (each of 4) → drag/resize/tab → reset → toggle-all-off → empty state → reload restores persisted layout. — `layouts.integration.test.tsx` (7/7).
- [x] ✅ a11y/contrast holds in light + dark (focus-visible, hit targets, contrast on the lifted tab + cards); no scroll/layout-shift regression at breakpoints; mobile flat fallback unaffected. — diff review (ARIA/focus-visible/ids preserved; active tab not color-only); visual light/dark contrast = manual residual.
- [x] ✅ Diff is **layouts + switcher + view CSS + test updates only** — zero change to the prescribe → safety → send pipeline, autosave, the registry (`cockpit-tabs.tsx`), the layout shape (`layout-tree.ts`), or any pane body. ⚠️ One noted, corrected deviation: `layout-tree-mutations.ts` got a test-backed toggle-duplicate-id fix the all-eight-panes invariant requires; the gate caught + fixed a `foundation.test.ts` regression it introduced. No clinical-path change.
- [x] ✅ Full v3 suites green (310/310, 33 files); gate stamped.

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet chats | Composer chats | Opus chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3l-01, cv3l-02, cv3l-03 | 3 | 0 | 0 | ~5–7h (α + β overlap) |
| Wave 2 | cv3l-04 | 0 | 0 | 1 | ~1–2h |
| **Total** | **4** | **3** | **0** | **1** | **~6–9h agent-time** |

Token estimate (rough): ~60k input / ~35k output, dominated by cv3l-01 (four trees + seed/reset + test updates) and cv3l-03 (five view components).

---

## References

- Plan: [`plan-p6-cockpit-v3-layouts-and-polish-batch.md`](../plan-p6-cockpit-v3-layouts-and-polish-batch.md).
- Source: [`Product plans/plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md) — V3-Q1 (default seed), R-PALETTE.
- Prior-phase exec orders (siblings in the same program):
  - [`../../p5-tab-model/Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md`](../../p5-tab-model/Tasks/EXECUTION-ORDER-p5-cockpit-v3-tab-model.md)
  - [`../../p4-cutover/Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md`](../../p4-cutover/Tasks/EXECUTION-ORDER-p4-cockpit-v3-cutover.md)
- Tasks: [`task-cv3l-01-default-layout-catalogue-and-seed.md`](./task-cv3l-01-default-layout-catalogue-and-seed.md) · [`task-cv3l-02-layout-switcher-and-hotkeys.md`](./task-cv3l-02-layout-switcher-and-hotkeys.md) · [`task-cv3l-03-tab-and-panel-premium-redesign.md`](./task-cv3l-03-tab-and-panel-premium-redesign.md) · [`task-cv3l-04-integration-a11y-and-phase-gate.md`](./task-cv3l-04-integration-a11y-and-phase-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-03.  
**Status:** ✅ `Shipped` (2026-06-03) — Wave 1 (Lane α: cv3l-01 → cv3l-02 · Lane β: cv3l-03) + Wave 2 (cv3l-04 gate) all green. Additive enhancement; no soak/kill-switch/parity-matrix.
