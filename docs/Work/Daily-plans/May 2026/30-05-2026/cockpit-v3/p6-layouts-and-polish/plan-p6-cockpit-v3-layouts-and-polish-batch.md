# Cockpit v3 — Phase 6: default layouts + premium polish (intent-based workflow presets · switchable · a visual pass) — 03 Jun 2026 batch plan

> **Phase 6 of the Cockpit v3 program — the first post-ship enhancement phase.** Phases 0–5 built the editor-group shell, flattened the eight-tab registry, and deleted the old shell. The program shipped a canvas that is *buildable but blank* — a doctor opening a consult sees an empty cockpit and an "add a pane to begin" palette (P5-DL-6 deliberately deferred the default seed as V3-Q1). Phase 6 realises that deferred seed **and** the deferred preset surface as one coherent feature: it ships a small catalogue of **intent-based workflow layouts** (Consult · Read · Document · Review), seeds the canvas to the **8-pane "Consult"** arrangement on first open (the v2 default doctors are used to), lets the doctor switch between layouts from the palette (+ hotkeys), and gives the tabs and panels a **premium visual pass** (carded leaves, gutters, lifted active tab, polished empty state). This is the phase where the cockpit goes from *blank-but-buildable* to *opinionated-yet-rearrangeable*, and from *functional* to *premium*.
>
> **Source plan:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — realises **V3-Q1** (type/intent default seed) and the **preset surface** fast-follow the program rolled forward (README "Deferred fast-follows": *V3-Q1 default seed layout · per-(doctor × consult-type) persistence · preset CRUD UI port*). Phase 5's **P5-DL-6** named this exactly: *"the flat registry is precisely the surface a future seed task arranges … the seed is a feature, not part of this fix."* This is that feature.
>
> **Prefix note:** tasks are `cv3l-*` (`cv3` = cockpit v3, `l` = **l**ayouts). Phase 0 = `cv3s` (scaffold), Phase 1 = `cv3c` (core shell), Phase 2 = `cv3d` (dnd), Phase 3 = `cv3p` (platform), Phase 4 = `cv3x` (cutover), Phase 5 = `cv3t` (tab model). Each phase restarts its sub-prefix at `01` — this program's established pattern (per [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) §3, a phase "may use its own sub-prefix when the work is genuinely distinct").
>
> **Builds on Phases 0–5 ([p0-scaffold](../p0-scaffold/), [p1-shell](../p1-shell/), [p2-dnd](../p2-dnd/), [p3-platform](../p3-platform/), [p4-cutover](../p4-cutover/), [p5-tab-model](../p5-tab-model/)).** The flat tab registry (`buildCockpitTabs`), the `PaneTreeNode` engine, `useShellLayout` persistence, the palette, and the anchored safety chrome are all live and unchanged here — Phase 6 is **additive**: a data module (the layouts), a small UI surface (the switcher), and a CSS-level visual pass. No engine, registry, or pane body is touched.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). One Opus task (the close-gate review — hard-rule §5). Everything else is Auto/Sonnet: the work is presentational + well-spec'd layout data with no PHI/RLS/migration surface.
>
> **Task-file note:** every `task-cv3l-*` file follows the current [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) — **no code or pseudo-code in tasks** ([planning/execution boundary](../../../../../process/TASK_MANAGEMENT_GUIDE.md)); the "how" lives in [`RECIPES.md`](../../../../../../Reference/engineering/development/RECIPES.md) / [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md) and the code. The concrete `PaneTreeNode` trees are designed and recorded in the chat that produced this batch; the task files describe the *contract* (which tabs visible, arrangement, sizes), not the literal tree.
>
> **Exec order + wave plan:** [`Tasks/EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md`](./Tasks/EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md).

---

## What Phase 6 does (one sentence)

> **Ship a v3-native catalogue of four intent-based workflow layouts (Consult · Read · Document · Review) as complete `PaneTreeNode` trees, seed the canvas to "Consult" (the v2 8-pane) on first open and on reset, add a "Layouts" switcher to the palette (+ hotkeys) that applies a layout over the current arrangement, and give the leaves, tab strips, and empty state a premium visual pass — all additive, with the engine, the flat registry, the persisted shape, and every pane body untouched.**

After Phase 6: a doctor opening any consult on v3 lands on the familiar **8-pane Consult** layout (not a blank canvas); can switch to **Read** (case-history-focused), **Document** (SOAP + Rx), or **Review** (post-visit) in one click or one hotkey; can still drag, resize, tab, and toggle freely from there; can **Reset** back to Consult; and sees a cockpit that *looks* premium — each pane a lifted card with clear borders and gutters, the active tab visibly raised with an accent, and a warm empty state when everything is toggled off.

---

## The opportunity this phase fills (why now)

Phase 5 closed with a deliberate seam (P5-DL-6):

> *"Phase 5 ships **blank-but-buildable**, not auto-seeded. No type-aware seed is decided here. The flat registry is precisely the surface a future seed task arranges (a `PaneTreeNode` of which tabs are visible + their sizes). Consistent with P4-DL-6: the seed is a feature, not part of this fix."*

That seam is now the product gap: doctors open to a blank canvas and have to build their cockpit from scratch every time. The fix has two halves, and they are cheap because Phase 5 made them cheap:

1. **A default that feels right out of the box.** The v2 8-pane layout (`getTelemedVideoTemplate`'s 3-column structure) is what doctors already know. We re-author it as a `PaneTreeNode` and seed it. We add three more *intent* layouts (Read / Document / Review) so a doctor can reshape to a task in one click instead of dragging six panes.
2. **A premium feel.** The current leaves render flush against each other with minimal chrome; the active tab is only subtly distinct. A focused CSS pass (cards, gutters, a lifted active tab, a polished empty state) lifts the whole surface without touching behaviour.

Neither half needs new engine work — the `PaneTreeNode` model, `applyLayout`, the palette, and `useShellLayout` already do everything required. Phase 6 is **data + a small switcher + CSS**.

---

## The layout model (the invariant that shapes every preset)

In v3, `paneState` (which powers the palette toggle and `addPane`/`removePane`) is **derived by flattening the live `paneTree`** ([`useShellLayout` → `paneTreeToFlat`](../../../../../../../frontend/lib/patient-profile/useShellLayout.ts)). `useCockpitV3Layout.addPane` rejects any pane whose id is absent from `paneState` (`reason: "not-found"`). Therefore:

> **Every default layout is a *complete* tree: all eight panes are present — the visible ones in their structural slots, the hidden ones as `hidden: true` leaves parked at the root** (mirroring what `hidePaneToRoot` produces at runtime). A layout that simply omitted a pane would make that pane un-toggleable from the palette.

The eight panes (stable ids, from `buildCockpitTabs`): `snapshot` · `history` · `body` (Consult / Visit-summary) · `assessment` · `investigations-orders` · `plan` · `subjective` · `objective`.

The four layouts (tab selection + arrangement; sizes are tuned starting points):

| Layout | Intent | Visible (arranged) | Hidden |
|---|---|---|---|
| **Consult** *(seed / reset target)* | Live visit — everything at hand; the v2 8-pane | all 8 (3 columns: Snapshot/History · Consult/Assessment/[Investigations·Plan] · Subjective/Objective) | — |
| **Read** | Reading case history | Snapshot, Assessment, History (wide), Subjective, Objective | body, investigations-orders, plan |
| **Document** | Writing SOAP + Rx | Snapshot, Assessment, Subjective, Objective, Investigations, Plan (dominant) | body, history |
| **Review** | Post-visit, read-only | all 8, calm reading arrangement (body renders as "Visit summary" by state) | — |

---

## Decision lock

The product plan's **v3-DL-1..10**, plus **P0-DL**…**P5-DL**, carry forward unchanged. Especially binding here: **v3-DL-1 (kept model/engine — never edited)**, **v3-DL-2 (uniform tabs; no pane is special)**, **v3-DL-6 (clinical-safety chrome stays anchored, never a tab)**, **P3-DL-4 (per-doctor persistence)**, **P5-DL-1 (flat registry is the v3 source of truth)**.

These seven are **Phase-6-specific**, frozen for this batch:

**P6-DL-1: The default seed is "Consult" (the v2 8-pane); reset returns to it.** v3 seeds the canvas to the Consult layout when no persisted layout exists, and `reset` re-applies Consult — **superseding P5-DL-6's blank-start interim**. The blank/empty-state path is retained (it still renders when a doctor toggles every pane off), but it is no longer the first-open state.

**P6-DL-2: A default layout is a complete `PaneTreeNode` with all eight panes.** Visible panes occupy structural slots; hidden panes are `hidden: true` leaves at the root, so `paneState` stays complete and the palette can toggle any pane back on. Structural (split) nodes use synthetic ids (`col-left`, `c-mid-bottom`, …) that are never pane ids — no collision with `assertFlatLeafRegistry` (the registry contract is about *available tabs*, not the seed tree, which may nest).

**P6-DL-3: Layouts are doctor-chosen workflow intents — never auto-applied by consult type.** There is **no return to `mapStateToTemplate` auto-switching**. Consult is the seed; Read/Document/Review are manual picks. (The Review layout's *content* still adapts by appointment state — `body` renders "Visit summary" when ended — but that is the registry's existing behaviour, not layout auto-selection.)

**P6-DL-4: One v3-native source of truth for default layouts.** The catalogue lives in a new `frontend/lib/patient-profile/v3/default-layouts.ts`. The two stale legacy definitions — the flat `built-in-presets.ts` (legacy `chart`/`body`/`rx` ids) and the `LayoutNode`-shaped `layout-presets-builtin.ts` — are **not** consumed by the v3 path. They are quarantined/retired only after a zero-live-reference audit (deletion is a clean-up, not a forced part of this batch — same discipline as cv3x-03).

**P6-DL-5: The visual pass is purely presentational.** No engine, registry, `PaneTreeNode` shape, persisted-layout key, or pane body changes. Only the v3 *view* components (`CockpitLeafView`, `PaneTabStripV3`, `CockpitGroupView`, `CockpitEmptyState`, `CockpitCanvas`) and their classNames. The anchored safety strip + "Send Rx & finish" footer (`safetyDock` / `actionDock`) keep their clinical-first prominence (v3-DL-6) — the polish must not visually demote them.

**P6-DL-6: Applying a layout overwrites the current arrangement (silent + undoable).** Picking a layout calls `applyLayout(preset.tree)` — it replaces the live tree. No confirm dialog; an undo affordance (toast or palette "Undo") restores the prior tree. Persistence is the existing per-doctor `useShellLayout` key (P3-DL-4); **per-(doctor × consult-type)** persistence stays deferred.

**P6-DL-7: Custom (user-saved) presets are Phase 7 — not this batch.** The backend API survives ([`cockpit-layout-presets-tree.ts`](../../../../../../../frontend/lib/api/cockpit-layout-presets-tree.ts): list/save/rename/delete, 5-preset cap), but the `LayoutNode ↔ PaneTreeNode` bridge (`preset-translation.ts`, deleted in cv3x-03) and the save/manage UI are a separate phase. Phase 6 ships **built-in defaults + the switcher only**; the switcher is built so a "My layouts" section slots in later without rework.

---

## What this phase does NOT do (deferred / out of scope)

| Item | State after Phase 6 | Lands |
|---|---|---|
| **Custom user-saved presets** (save / rename / delete current arrangement) | API intact; no UI; switcher has a built-in-only list with a forward-compatible slot | **Phase 7** (preset CRUD UI + the `LayoutNode ↔ PaneTreeNode` bridge) |
| Per-(doctor × consult-type) persistence | Per-doctor only (P3-DL-4); seed is consult-type-agnostic | Rides Phase 7 |
| Auto-applying a layout by consult type | Manual pick only (P6-DL-3) | Not planned (deliberately avoided) |
| Deleting legacy `built-in-presets.ts` / `layout-presets-builtin.ts` | Quarantined after a zero-ref audit; not force-deleted | Clean-up follow-on |
| New panes / changed pane bodies / new behaviour inside a tab | None — additive layouts + CSS only (P6-DL-5) | — |
| Sub-tabs within a tab, side-sheets, Cmd+K (`aux-surfaces.ts`) | Untouched | Future plan |

---

## Cross-cutting acceptance gate (whole batch)

**✅ STAMPED 2026-06-03 (cv3l-04).** All gate items green (one noted, corrected engine deviation — see below).

### Default layouts (cv3l-01)
- [x] ✅ `default-layouts.ts` exports the four layouts; each is a complete `PaneTreeNode` containing **all eight** pane ids (visible + hidden), validated by the existing tree validators (`isValidTreeNode` / no duplicate ids / `paneIds.includes(activeTabId)`). — `default-layouts.test.ts` green.
- [x] ✅ Visible/hidden sets per layout match the table above; structural split ids are never pane ids.
- [x] ✅ First open with empty storage → **Consult** (8-pane) renders, not the empty state. `reset` → Consult. — `layouts.integration.test.tsx`.
- [x] ✅ Existing persisted (dogfood) layouts still hydrate unchanged (seed only applies when storage is empty). — persistence suites + reload test green.

### Switcher (cv3l-02)
- [x] ✅ The palette shows a "Layouts" control listing Consult · Read · Document · Review; selecting one applies it over the current tree; an undo affordance restores the prior tree. — `CockpitPalette.test.tsx`.
- [x] ✅ Hotkeys switch layouts (`mod+shift+1..4`) without colliding with existing shell hotkeys (PlanSection uses `mod+shift+enter/t/p` only). — `useCockpitLayoutHotkeys.test.tsx` + integration.
- [x] ✅ After applying a layout, the palette toggles, drag/resize/tab, and caps all still operate on the result (all eight panes remain toggleable).

### Premium visual pass (cv3l-03)
- [x] ✅ Each visible leaf reads as a distinct card (border + subtle shadow + radius) with gutters between panels; the active tab is visibly lifted with an accent; the empty state is polished.
- [x] ✅ The anchored safety strip + send footer remain visually prominent (not demoted by the polish) — v3-DL-6. (Canvas backdrop scoped to the canvas region; docks untouched.)
- [x] ✅ Contrast / focus-visible / hit-target a11y holds (light + dark); no layout shift or scroll regression at the breakpoints; mobile flat fallback unaffected. — diff review: ARIA/focus-visible/`pane-body` ids preserved, active tab not color-only (elevation + accent bar), decorative icon `aria-hidden`. (Visual light/dark contrast = manual dogfood residual.)

### Whole-batch (cv3l-04)
- [x] ✅ `cd frontend; npx tsc --noEmit` clean; `npm run lint` clean (warnings only).
- [x] ✅ v3 suites green (engine, palette, build-up, persistence, dnd, mobile) + new catalogue/switcher/hotkey/integration tests — **310/310 across 33 files**.
- [x] ✅ No change to the prescribe → safety → send pipeline, autosave, registry (`cockpit-tabs.tsx`), the layout shape (`layout-tree.ts`), or any pane body (diff = layouts + switcher + view CSS + test updates). ⚠️ **Noted deviation:** `layout-tree-mutations.ts` (the pure layout engine) was touched for a real toggle-duplicate-id fix the all-eight-panes invariant requires; the gate caught a regression it introduced in `foundation.test.ts` (edge-drop on the root tabs-container) and the fix was corrected + re-verified (`normalizeLeafAfterPaneRemoval` now preserves `__root__`/`__tabs_`/remaining-pane container ids). No clinical-path change.
- [ ] Manual smoke: open consult → Consult renders → switch Read/Document/Review → reshape → reset → Consult; toggle all off → empty state; reload → persisted layout restored. — **automated equivalent green; final manual dogfood residual.**

---

## Phase plan position

This is **Phase 6 of the Cockpit v3 program — the first post-ship enhancement phase** (Phases 0–5 shipped the shell + cutover; this adds the deferred seed/preset feature + a visual pass). The ladder:

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Scaffold: flag + parallel mount + foundation boundary | ✅ Shipped (cv3s-01..02) |
| Phase 1 | Core shell: editor-group renderer + pane palette | ✅ Shipped (cv3c-01..04) |
| Phase 2 | Interaction: Cursor-style always-on drag/drop | ✅ Shipped (cv3d-01..04) |
| Phase 3 | Safety + platform: anchored chrome, persistence, mobile | ✅ Shipped (cv3p-01..04) |
| Phase 4 | Cutover: parity matrix + flag flip + delete old shell + docs | ✅ Shipped (cv3x-01..04) |
| Phase 5 | Tab model: flatten columns → uniform tabs; build-up canvas | ✅ Shipped (cv3t-01..03) |
| **Phase 6** | **Default layouts (Consult/Read/Document/Review) + switcher + premium visual pass (V3-Q1)** | ✅ Shipped 2026-06-03 (cv3l-01..04) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Composer | Opus | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cv3l-01 (catalogue + seed/reset) · cv3l-02 (switcher) · cv3l-03 (visual pass) | 3 | 0 | 0 | ~5–7h (two parallel lanes) |
| Wave 2 | cv3l-04 (integration + a11y + gate) | 0 | 0 | 1 | ~1–2h |
| **Total** | **4** | **3** | **0** | **1** | **~6–9h agent-time** |

One Opus task (cv3l-04 close-gate review — [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) hard-rule §5), well under the §8 two-Opus cap. cv3l-01 is the keystone but is bounded layout data + a localized seed/reset wiring change → Auto, with a per-message escalation budget if the reset-ripple across the v3 test suites is deeper than expected. cv3l-02 and cv3l-03 are bounded UI/CSS → Auto.

---

## Sequencing notes (the why behind the waves)

- **Wave 1 runs two honest lanes.** Lane α is sequential — **cv3l-01 → cv3l-02** (the switcher needs the catalogue to list and apply). Lane β — **cv3l-03 (visual pass)** — is independent: it touches the *view* components (`CockpitLeafView`, `PaneTabStripV3`, `CockpitGroupView`, `CockpitEmptyState`, `CockpitCanvas`), disjoint from α's files (`default-layouts.ts`, `CockpitV3Shell`, `useShellLayout`, `CockpitPalette`). The one seam — both could touch the palette — is resolved by **scope rule**: cv3l-02 owns the palette's switcher; cv3l-03 does **not** touch `CockpitPalette.tsx`.
- **Wave 1 → Wave 2 is a kind-of-work cut (build → verify).** cv3l-01/02/03 build; cv3l-04 is pure integration + a11y/visual verification + the gate. Different reviewer mindset.
- **Low blast radius.** Nothing here touches clinical data, the send pipeline, RLS, or migrations — so the only Opus is the close-gate review, and the soak/parity machinery from Phases 4–5 is not re-invoked (no parity matrix needed; the gate's "no pipeline/body change" assertion is the safety net).

---

## References

- **Source:** [`Product plans/plan-cockpit-v3.md`](../../../../../Product%20plans/plan-cockpit-v3.md) — V3-Q1 (default seed), R-PALETTE, v3-DL-2/5/6.
- **The surfaces this builds on:**
  - [`frontend/lib/patient-profile/v3/blankLayout.ts`](../../../../../../../frontend/lib/patient-profile/v3/blankLayout.ts) — current blank seed (`blankLayout(panes)`); the Consult seed replaces it as the first-open default.
  - [`frontend/lib/patient-profile/v3/cockpit-tabs.tsx`](../../../../../../../frontend/lib/patient-profile/v3/cockpit-tabs.tsx) — the eight-tab flat registry the layouts arrange.
  - [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — derives `blankDefaultTree`; the seed wiring point.
  - [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — `resetLayout` + persistence (per-doctor key).
  - [`frontend/components/patient-profile/v3/CockpitPalette.tsx`](../../../../../../../frontend/components/patient-profile/v3/CockpitPalette.tsx) — the switcher's home (and the reset button).
  - View components for the visual pass: [`CockpitLeafView`](../../../../../../../frontend/components/patient-profile/v3/CockpitLeafView.tsx) · [`PaneTabStripV3`](../../../../../../../frontend/components/patient-profile/v3/PaneTabStripV3.tsx) · [`CockpitGroupView`](../../../../../../../frontend/components/patient-profile/v3/CockpitGroupView.tsx) · [`CockpitEmptyState`](../../../../../../../frontend/components/patient-profile/v3/CockpitEmptyState.tsx) · [`CockpitCanvas`](../../../../../../../frontend/components/patient-profile/v3/CockpitCanvas.tsx).
- **The legacy preset definitions being superseded (audited, not force-deleted):** [`built-in-presets.ts`](../../../../../../../frontend/lib/patient-profile/built-in-presets.ts) (legacy `chart/body/rx`) · [`layout-presets-builtin.ts`](../../../../../../../frontend/lib/patient-profile/layout-presets-builtin.ts) (`LayoutNode` modality presets).
- **Phase 7 substrate (deferred):** [`frontend/lib/api/cockpit-layout-presets-tree.ts`](../../../../../../../frontend/lib/api/cockpit-layout-presets-tree.ts) — preset list/save/rename/delete (5-cap).
- **Prior phase:** [`p5-tab-model/plan-p5-cockpit-v3-tab-model-batch.md`](../p5-tab-model/plan-p5-cockpit-v3-tab-model-batch.md) — the flat registry + P5-DL-6 that named this seed.
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md`](./Tasks/EXECUTION-ORDER-p6-cockpit-v3-layouts-and-polish.md).

---

**Created:** 2026-06-03.  
**Status:** ⏳ `Planned` (2026-06-03) — Phase 6 of the v3 program; first post-ship enhancement (default layouts + switcher + premium visual pass). Realises the deferred V3-Q1 seed on the flat registry from Phase 5.  
**Next phase:** Phase 7 — custom user-saved presets (preset CRUD UI + `LayoutNode ↔ PaneTreeNode` bridge) on the surviving backend API.
