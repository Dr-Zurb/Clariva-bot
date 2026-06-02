# Execution order — Cockpit v3 Phase 1 (core shell)

> Batch: [`plan-p1-cockpit-v3-shell-batch.md`](../plan-p1-cockpit-v3-shell-batch.md) · Product plan: [`plan-cockpit-v3.md`](../../../../../../Product%20plans/plan-cockpit-v3.md)
>
> **3 waves, 4 tasks.** This is the real shell rewrite — but behind the Phase 0 flag, reusing `useShellLayout` (state + persistence) and the engine (mutations). Net new code is rendering + wiring only. Read this file top-to-bottom before starting; it is the contract for *order*, the task files are the contract for *content*.

---

## TL;DR for the executor

1. **cv3c-01 first, alone.** It turns the Phase 0 stub into a real recursive editor-group renderer (splits + resize + active body) wired to `useShellLayout`. Everything else renders *inside* it.
2. **cv3c-02 next, same lane.** Adds the always-on tab strip to every leaf (fork `PaneTabStrip`, drop the customize gate) + tab activate/close. It edits the same component cv3c-01 just wrote, so it cannot run in parallel with it.
3. **cv3c-03 after the renderer + tabs exist.** The palette (blank → build up) + the minimal context menu — both need a renderer to add panes into and tabs to surface them.
4. **cv3c-04 last.** Integration, persistence parity, mobile fallback, the Phase 1 gate, and tests.
5. **Flag stays OFF in committed config.** Verify flag-off parity at the start of cv3c-01 and again in cv3c-04. Turn the flag on only locally to dogfood.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | **cv3c-01** | Recursive editor-group renderer spine (splits + resize + active body) | Phase 0 (cv3s-01/02) | Lane A | **L** | **Auto** |
| **1** | **cv3c-02** | Always-on tabbed leaves (fork tab strip, activate + close) | cv3c-01 | Lane A (serial) | **M** | **Auto** |
| **2** | **cv3c-03** | Pane palette + blank-canvas build-up + minimal context menu | cv3c-01, cv3c-02 | Lane A | **M–L** | **Auto** |
| **3** | **cv3c-04** | Integration + persistence parity + mobile fallback + Phase 1 gate + tests | cv3c-01..03 | Lane A | **M** | **Auto** (optional Opus review) |

> **There is only one honest lane.** All four tasks converge on `CockpitV3Shell` + its v3 helpers, so they serialise. This is by design ([`EXECUTION-ORDER-GUIDELINES.md`](../../../../../EXECUTION-ORDER-GUIDELINES.md): do not invent parallel lanes that fight over the same file). The waves exist to create clean review/commit checkpoints, not parallelism.

---

## Critical path

```
Phase 0 (flag + stub + foundation.ts)
        │
        ▼
   cv3c-01  ── recursive renderer + resize spine (fills the stub)
        │
        ▼
   cv3c-02  ── always-on tab strip on every leaf + activate/close
        │
        ▼
   cv3c-03  ── palette (blank → build up) + minimal context menu
        │
        ▼
   cv3c-04  ── integrate + persist parity + mobile + Phase 1 GATE + tests
        │
        ▼
   Phase 1 closed → promote Phase 2 (R-DND3) to its own batch
```

Single chain. The leverage is **cv3c-01**: a faithful recursive renderer wired to `useShellLayout` makes cv3c-02/03 additive; a shaky one makes them firefighting. Spend the care there.

---

## Wave detail

### Wave 1 — the shell spine (cv3c-01 → cv3c-02, sequential)

**Goal:** a real editor-group shell that renders any `PaneTreeNode` with resizable splits and a tab strip on every leaf — no palette, no DnD, no customize mode.

- **cv3c-01 — Recursive editor-group renderer spine.** Replace the Phase 0 stub's placeholder with `CockpitGroupView` (recursive): split node → `PanelGroup` + `Panel` + resize handle (direction per node); leaf node → a group container rendering `paneById[activeTabId].render()`. Wire `useShellLayout` for the tree + resize (`setGroupSizes` / `setLeafSize`) + hydration. Import model/engine via `foundation.ts`. Seed from a small hard-coded tree for development only (the palette replaces it in cv3c-03). **Gate:** renders nested splits + multi-tab leaves (active pane only) for an arbitrary tree; resize persists across reload; flag-off byte-identical.
- **cv3c-02 — Always-on tabbed leaves.** Fork `PaneTabStrip` → `PaneTabStripV3`, removing the `useCustomizeMode` gate (tabs always interactive). Render the strip on **every** leaf (single pane = one tab). Wire tab click → `setActiveTab`; close (×) → engine remove (`extractFromTabsNode` / last-leaf guard) → `applyLayout`. Keep the overflow popover. **Gate:** tabs switch the body without remounting siblings; close removes a pane; no `useCustomizeMode` import in `v3/`.

**Why sequential:** both edit `CockpitV3Shell` / its leaf renderer. cv3c-02 builds directly on cv3c-01's leaf container.

### Wave 2 — build-up (cv3c-03)

**Goal:** turn "renders a hard-coded tree" into "doctor builds the tree from blank."

- **cv3c-03 — Pane palette + blank canvas + minimal context menu.** Header palette (evolved from `PaneToggleBar`): lists every `PaneDefinition`, marks on-canvas vs available, click adds (engine `restoreLeaf` → new column) / removes (close last tab). Blank canvas empty-state. Per-leaf context menu: Split right / Split down / Move to group / Close (engine `dropPaneIntoZone` / `extractFromTabsNode` / `addToTabsNode` + `applyLayout`). Caps → toast. Replace cv3c-01's dev seed with the blank default. **Gate:** add three panes → three columns; split one into a row; move one in as a tab; remove one; empty-state shows when all removed.

### Wave 3 — close the phase (cv3c-04)

**Goal:** prove the Phase 1 gate and lock parity.

- **cv3c-04 — Integration + persistence parity + mobile + gate + tests.** End-to-end build-up persists across reload (reuse `useShellLayout` storage; v3 blank default). Flag-off re-verified byte-identical. Docks stay anchored in every arrangement. Mobile flat fallback. Tests: renderer round-trip, tab activate/close, palette add/remove, resize persist, empty-state, flag on/off mount. Inbox line. **Gate:** the cross-cutting acceptance gate in the batch plan is fully green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **cv3c-01 — Auto (L).** Recursive rendering + wiring an existing hook. Mechanically involved but not novel-risk: no PHI, no security, no persisted-state *mutation* logic (the hook + engine own that). Auto handles it; the size is in volume, not danger.
- **cv3c-02 — Auto (M).** Forking a component and removing a gate + two engine calls.
- **cv3c-03 — Auto (M–L).** Palette + context menu dispatching existing engine ops. Largest UX surface but each op is a one-liner against the engine.
- **cv3c-04 — Auto (M).** Integration + tests. **Optional Opus close-review** (recommended-light): confirm tree round-trip + resize/active-tab persistence correctness — the foundation later phases build on. Skip if cv3c-04's tests assert round-trip + persistence explicitly. Not consult-critical: the whole path is flag-gated off in committed config.

**No Opus build tasks. No Composer tasks** (Composer shines on mechanical multi-file edits; here the multi-file work is interdependent rendering, better kept coherent under Auto).

---

## Global anti-goals (apply to every task)

- ❌ Do **not** edit `layout-tree.ts`, `layout-tree-mutations.ts`, `types.ts`, `panes/*`, or any migration. The model + engine + bodies are reused as-is (v3-DL-1).
- ❌ Do **not** write a new persistence layer. Reuse `useShellLayout` (P1-DL-1); R-PERSIST3 hardens it in Phase 3.
- ❌ Do **not** import `customize-mode-context`, `CustomizeBar`, or `PaneDropOverlay` from any `v3/` file (P1-DL-3; DnD is Phase 2).
- ❌ Do **not** import kept model/engine directly — go through `foundation.ts` (P0-DL-4).
- ❌ Do **not** touch the old shell, `PatientProfileHeader`'s customize toggle, or the flag-off path's behaviour.
- ❌ Do **not** pre-fill a fixed template — v3 starts blank (P1-DL-4 / v3-DL-5).
- ❌ Do **not** flip `NEXT_PUBLIC_COCKPIT_V3` on in committed `.env*`. Local dogfooding only.

## Global definition of done (every task)

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; npm run lint` clean (warnings ok).
- [ ] Task's own v3 test suite green (targeted — full `npm test` may hang on the pre-existing inbox issue).
- [ ] Flag-off path unchanged (spot-check at cv3c-01 and cv3c-04).
- [ ] Task file's checklist ticked + a one-line status stamp at the bottom.

---

## Notes for the executor

- **Read [`foundation.ts`](../../../../../../frontend/lib/patient-profile/v3/foundation.ts) first.** It is the only sanctioned door to the model + engine. If something you need isn't re-exported, add the re-export there (with a one-line note) rather than importing the source module directly.
- **`useShellLayout` is your state.** Don't reinvent persistence/resize/active-tab — call its callbacks. For structural moves not exposed as a callback (split/tab-into/extract), call the engine from `foundation.ts` then `applyLayout({ version: 5, paneTree: result.tree })`. Check `result.ok` and toast on cap rejection.
- **`Shell.tsx` is a reference, not a copy source.** Read it to match resize/collapse behaviour and the `paneById` lookup, but re-author cleanly — the whole point of v3 is to shed the customize-mode branching. Don't paste its `customizeMode` conditionals.
- **Keep the docks sacred.** `CockpitV3Shell` already places `safetyDock` / `actionDock` (Phase 0). Render the renderer *between* them; never let the tree own a dock.
- **Dogfood with the flag on locally**, then make sure your committed `.env*` leaves it off.
