# Cockpit pane freedom — Phase 1: tabs foundation + context-menu move — 28 May 2026 batch plan

> **Vision umbrella, not just a batch.** This document carries the **full multi-phase vision** for turning the cockpit shell into a free-form Cursor/VS Code-style layout system (N columns, any nesting, every leaf is a tab container). Today's batch ships **Phase 1 only** — schema + tab renderer + context-menu move actions. Phases 2–4 are outlined here so future batches inherit the same decision lock without re-deriving it.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Zero Opus build tasks. Four Auto (cpf-01..04) + two Composer 2 Fast (cpf-05, cpf-06). One optional Opus close-gate on `cpf-01`'s schema migration (silent-corruption surface).
>
> **Source plan:** None — this batch is the source. The cockpit-v2 program ([archive](../../../../../Product%20plans/archive/plan-cockpit-v2.md)) closed 2026-05-24; subsequent batches (`cockpit-shell-layout-fix`, `cockpit-ended-consult-body`, this) are post-program shell evolution. This plan doc becomes the canonical reference for "the freedom shell vision."
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/24-05-2026/cockpit-layout-presets-modality](../../../24-05-2026/cockpit-layout-presets-modality/) — shipped `LayoutNode` + `layout-tree-mutations.ts` + `PaneContextMenu` + preset persistence (migration 112). This batch's tabs sit ON TOP of the tree shape that R-LAYOUT-UX shipped. **Sequencing dependency:** clpm-04's mutation engine is the substrate; cpf-02 extends it.
> - [Daily-plans/May 2026/26-05-2026/cockpit-shell-layout-fix](../../../26-05-2026/cockpit-shell-layout-fix/) — csl-01..03 stabilised the column shell + alignment-guard hydration. This batch raises the schema version once more; the alignment guard catches stale layouts.
> - [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild](../../../13-05-2026/patient-profile-shell-rebuild/) — the original 8-pane shell + `PaneToggleBar` + presets infrastructure (`useShellLayout`, `flattenPaneDefinitions`).
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-p1-cockpit-pane-freedom.md`](./Tasks/EXECUTION-ORDER-p1-cockpit-pane-freedom.md).

---

## The vision (carries across all four phases)

> **A tree where every leaf is a tab container, and any leaf can be split horizontally or vertically to create more containers.**

That's the entire model. Two node types in the grammar:

```text
LayoutTree = Split | Tabs
Split  = { direction: H|V, children: [LayoutTree, …], sizes: [number, …] }
Tabs   = { paneIds: [string, …], activeTabId: string, sizePct: number, hidden: boolean }
```

What the model unlocks:

- **N columns at the root** (or 1, or 7) — root is just a horizontal `Split` with N children. Not enforced.
- **N rows in any column** — that column is a vertical `Split` with N children. Not enforced.
- **Any depth of nesting** — `Split` children can be more `Split`s. Practically bounded by `MAX_LEAVES = 10`, not by code structure.
- **Any orientation at any level** — H inside V inside H, as deep as needed.
- **Tabs anywhere** — every leaf is a `Tabs` container with 1..N panes. Single-pane is just `paneIds: [id]` with no tab strip rendered.
- **Root can be a single Tabs** — one big tab group, no splits at all. Valid.
- **Root can be vertical** — full-width rows stacked. Valid.

There is no "column" concept in the data model. "Column" is just the word humans use for "child of a horizontal root split." The shell doesn't care.

---

## Decision lock (frozen for the entire vision, not just this batch)

These were negotiated in the [planning conversation 2026-05-28](#references). Re-opening any belongs in a new plan doc.

**DL-1: Pure freedom, no fixed structure.** The shell does NOT enforce "3 columns" or any other root shape. Templates are *seed data* and *Reset targets only* — the doctor's tree is the doctor's tree after the first edit. Built-in `BUILT_IN_PRESETS` (telemed-video / voice / text / review) remain as the per-modality seeds for new accounts and the always-reachable "Reset to default" target.

**DL-2: Five hard guardrails (no creative-layout cost).** These exist to prevent unrecoverable states, not to limit doctors:

1. **`MAX_LEAVES = 10`** (already shipped in `layout-tree-mutations.ts` line 37). Splits / tab-adds beyond 10 return `{ ok: false, reason: "cap-reached" }` and toast.
2. **Last-leaf protection** (already in `hideLeaf`). Can't hide every pane — at least one must remain visible.
3. **Pixel min-size per pane** (already via `minSizePx`). Resolved at render time based on the *current* orientation in the tree.
4. **Single-home panes.** Each pane appears in exactly one `Tabs` container. No duplicates. Duplicating a pane with internal state (RxForm draft, vitals) is a data-corruption surface; refuse at the mutation layer.
5. **Always-reachable Reset.** A doctor who destroys their layout always has "Reset to default" in the layout menu, restoring the modality-appropriate built-in tree.

**DL-3: Three soft hints (warn, don't block).** Nudge poor layouts, don't refuse them:

1. **"This layout may be cramped"** banner when > 5 horizontal siblings appear at the top level. Dismissible. Tracked in telemetry.
2. **Tabs overflow** menu when a container holds > 4 tabs (horizontal scroll + chevron, like every IDE).
3. **Orientation-aware mins** — `body` has `minSizePx: 280` horizontally and `60` vertically. Resolved at render time; no user-visible warning.

**DL-4: Tabs are the leaf type, not a separate concept.** Today's `PaneTreeNode` leaf shape `{ id, sizePct, hidden }` becomes `{ paneIds: [id], activeTabId: id, sizePct, hidden }`. Single-pane leaves continue to render exactly as today (no tab strip visible). The grammar is uniform: every leaf is a tabs container; some happen to hold only one tab.

**DL-5: Modality templates stay as seeds + Reset targets.** They encode clinical knowledge (text consult wants Body at 40%, voice wants 15%). New doctors see them on first paint; "Reset to default" restores them. After the first edit, the doctor's tree is what loads. No structural enforcement.

**DL-6: `hideShellHeader` becomes a render-mode hint.** Today, `body` / `snapshot` / `history` set `hideShellHeader: true` and draw their own header. When they become tabs in a multi-tab container, the tab strip wins (replaces the per-pane header). When they're alone in a container, today's behaviour is preserved.

**DL-7: Mobile stays flat.** `<MobileShell>` ignores the tree and renders the existing pillbar. Phones are for triage, not layout craft. Doctors who design custom desktop layouts see the same flat pillbar on mobile. No tree → mobile derivation logic.

**DL-8: Live-consult guard extends to moves, not just hides.** Today `body` can't be hidden mid-call. Tomorrow `body` can't be re-parented mid-call either. Toast: "Pause the consult before rearranging." Same `handleBeforeHide` pattern, new `handleBeforeMove` callback.

**DL-9: Pane component instances survive re-parenting.** When a pane moves to a different container, React must not remount the underlying component (would lose `RxForm` draft state, scroll positions, etc.). Solution: leaf renderers keyed on `pane-${paneId}` regardless of tree position. Verified via React DevTools "same Fiber" check.

**DL-10: Single-home panes refused at mutation layer.** `addToTabsNode(tree, paneId, targetGroupId)` returns `{ ok: false, reason: "already-present" }` if `paneId` already lives anywhere in the tree. Mutations always *move* a pane (remove from current home + add to target), never duplicate.

---

## Phase plan (whole-vision, four batches)

Each phase is its own batch. This document covers **Phase 1** in full; Phases 2–4 are outlined to lock scope.

### Phase 1 — **Tabs foundation + context-menu move (this batch, 6 tasks, ~12-16h)**

Schema, renderer, mutation ops, and the user-visible "Move pane to…" workflow via the existing context menu. No DnD. No customize toggle. No chrome refactor.

**Deliverable:** doctor right-clicks any pane → "Move to another container" → submenu lists every other leaf in the tree → pick one → pane moves there as a tab. Tab strip renders above the body when > 1 tab. Switch tabs via click. Existing 8-pane single-tab layouts look identical to today.

### Phase 2 — **Drag-drop with 5-zone overlay (future batch, ~3-5 tasks)**

Cursor-style drag affordances. Drop overlay shows N / S / E / W / Center zones on every container. Drop Center → tab into. Drop N/S/E/W → split as sibling. Drag tab strip header out → extract to new split.

**Deliverable:** doctor drags any pane → overlay appears on every other container → drops onto a zone → tree updates. All five mutation ops (split-N/S/E/W + tab-into) wired to the same op surface from Phase 1's context menu.

### Phase 3 — **Customize mode + preset workflow polish (future batch, ~4-5 tasks)**

"Customize layout" toggle in header (default off; clean cockpit during normal use). Hotkey `Cmd+Shift+L`. When on, drag handles surface, drop zones light up, and a save-as-preset bar appears. Reset-to-default button. Cramped-layout soft warning. Telemetry on layout shapes.

**Deliverable:** doctor enables Customize → rearranges → saves a custom preset → reloads page → preset restored. Server-side persistence reuses `cockpit_layout_presets` (migration 112).

### Phase 4 — **`groupWrapper` refactor: action chrome → shell-level docks (future batch, ~4-5 tasks)**

Three wrappers today are tree-position-bound (`ChartRailWithEmptyState`, `RxFormActionsBridgeProvider`, `<SafetyStickyStrip>` + `<PlanActionFooter>` inside `middle-bottom`'s `groupWrapper`). If a doctor drags `plan` to the left column, the "Finish visit" button shouldn't disappear. This phase lifts action-bearing chrome to shell-level docks; visual chrome (chart-rail empty card) stays leaf-anchored and travels with its pane.

**Deliverable:** layout reshuffling no longer breaks the consult-finish flow, the safety strip, or the chart-rail empty-state card. Doctors can move any pane anywhere without losing chrome they depend on.

---

## Why this batch (Phase 1 specifically)

After [`cockpit-layout-presets-modality`](../../../24-05-2026/cockpit-layout-presets-modality/) shipped the mutation engine + preset persistence (R-LAYOUT-UX → ✅ DONE), three structural limitations remained — and dogfood surfaced one of them this week (the consult column toggle bug in `csl-04` follow-up, fixed 2026-05-28):

1. **Each leaf holds exactly one pane.** Doctors can't stack two functional views in one slot. The mental model "history + meds in the same area, switch with a tab" has no expression in the layout grammar. The cockpit looks like every other cockpit — fixed.
2. **The 8 templates are structural, not just default.** Even though `BUILT_IN_PRESETS` and `applyLayoutTree` exist, the practical experience is "you get what the template gave you." Phase 1's context-menu move is the first time a doctor can reshape WITHOUT learning split/merge mechanics.
3. **`PaneTreeNode`'s leaf shape `{ id }` is single-pane.** The shape itself blocks Phase 2's DnD-into-tabs. The schema change has to come first; everything else stacks on it.

The clinical justification: doctors have *workflow personalities* that current templates don't capture. A psychiatrist wants Subjective and History stacked as tabs (long-form text views, same screen real estate). A pediatrician wants Vitals (Objective) and Body in one slot (constant glance). A specialist wants two Plan tabs (acute Rx + chronic Rx). None of these are expressible today. All are trivial after Phase 1.

The architectural unlock: **once leaves are tab containers, every later phase is a UX polish on the same data model.** Phase 2's DnD just emits the same `addToTabsNode` / `moveLeafBetweenTabs` ops the context menu emits. Phase 3's Customize toggle is pure UI state on top of those ops. Phase 4's chrome lift doesn't touch the tree at all — it lifts wrappers out of `groupWrapper`. Four phases, one data model.

This batch closes Phase 1 with **6 tasks across 3 waves**, **~12-16h wall-clock single-engineer (~2 dev-days)**, **zero new migrations** (uses existing v4 paneTree localStorage), **zero Opus build tasks** (one optional close-gate review on cpf-01 if schema-migration code review wants a second pass). The visible artifact at the close-gate: right-click any pane → "Move to..." → pick a target leaf → pane appears as a tab in that target's container; tab strip renders above the body; switching tabs swaps the rendered pane without remounting the others.

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed.

### Schema + persistence

- [ ] `PaneTreeNode` leaf shape supports `paneIds: string[]` + `activeTabId: string`. Backward-compat: leaves with a single `id` auto-upgrade.
- [ ] `validateLayout` accepts both old (`{ id }`) and new (`{ paneIds, activeTabId }`) shapes; old shape auto-migrates on hydration.
- [ ] `paneTreeToFlat` enumerates every paneId in every `paneIds` array (so toggle bar / hotkeys see all panes).
- [ ] `layoutVersion` bumps to `5`; loading a v4 layout migrates cleanly without dropping any panes.
- [ ] Migration is **idempotent** — re-running it on a v5 tree is a no-op.

### Mutation ops (extending `layout-tree-mutations.ts`)

- [ ] `addToTabsNode(tree, paneId, targetGroupId, position?)` — moves `paneId` into `targetGroupId`'s tabs at `position` (default end). Returns `{ ok: false, reason: "already-present" | "not-found" | "cap-reached" }` on failure.
- [ ] `extractFromTabsNode(tree, paneId, direction: "horizontal" | "vertical")` — removes `paneId` from its current tabs container and creates a new sibling split holding only that pane. Reverses tab-into.
- [ ] `moveLeafBetweenTabs(tree, paneId, fromGroupId, toGroupId)` — convenience wrapper that combines extract + add when both groups exist.
- [ ] `setActiveTab(tree, groupId, paneId)` — pure update of `activeTabId` on the matching `Tabs` node.
- [ ] **Single-home invariant** — every mutation that adds a pane refuses if the pane is already present anywhere in the tree (DL-10).
- [ ] Truth table covers: tab-into-self (no-op), tab-into-target-then-extract (round-trip), extract-only-tab (auto-collapses container), MAX_LEAVES enforcement, missing-target rejection.

### Renderer (`Shell.tsx` + `<PaneTabStrip>`)

- [ ] `<PaneSubtreeGroup>` leaf branch: when `paneIds.length === 1`, renders today's single-pane layout (zero visual diff). When `> 1`, renders `<PaneTabStrip>` above the body.
- [ ] `<PaneTabStrip>` renders one tab button per `paneId` (label = `paneById[id].title`, icon = `paneById[id].icon`). Active tab visually distinct. Overflow into a `+ N more` popover after 4 tabs.
- [ ] Click a tab → calls `setActiveTab(groupId, paneId)` → tree updates → renderer swaps the visible pane body without remounting the inactive tabs' component instances (DL-9).
- [ ] `hideShellHeader: true` panes lose their per-pane header when grouped (DL-6); tab strip is the header.
- [ ] Tab strip integrates with existing `PaneContextMenu` — right-click a tab opens the same context menu currently on pane headers.

### Context menu — new "Move to..." action

- [ ] `<PaneContextMenu>` gains a "Move pane to..." submenu listing every OTHER leaf id in the current tree.
- [ ] Selecting a target invokes `moveLeafBetweenTabs(tree, sourceId, sourceGroupId, targetGroupId)`.
- [ ] Submenu also includes "Move to new split (right)" and "Move to new split (below)" which invoke `extractFromTabsNode` with `"horizontal"` and `"vertical"`.
- [ ] Live-consult guard (DL-8): when `state === "live"` and the pane is `body`, all move actions show a tooltip and refuse with a toast.
- [ ] Telemetry: `r_pane_freedom_move_via_context_menu` fires with `{ sourcePaneId, targetType }`.

### Behaviour

- [ ] **Existing 8-pane layouts look identical to today** — no tab strip renders when every leaf is single-pane (the universal case for fresh accounts).
- [ ] Move a pane into another container → it appears as a tab in that container. Active tab becomes the moved pane.
- [ ] Move the LAST tab out of a container → empty container collapses (sibling absorbs); same behaviour as `hideLeaf` today.
- [ ] Move a pane back to its original container → tree returns to original shape (move is reversible).
- [ ] Hidden panes (panes not in any tab container) appear in the existing "Hidden panes" sub-menu and restore via `restoreLeaf` (unchanged).
- [ ] Drag-resize handles still work on the new schema; tab containers behave as a single resizable unit.
- [ ] Hotkeys `mod+1..9` focus the Nth VISIBLE pane (active tab in container N), regardless of tree position.

### Quality

- [ ] `cd frontend; npx tsc --noEmit` clean.
- [ ] `cd frontend; pnpm lint` clean.
- [ ] `cd frontend; pnpm test` clean — new tests + existing `useShellLayout` / `layout-tree-mutations` / `PaneContextMenu` / `Shell` suites still green.
- [ ] No new Sentry errors in a 10-min smoke session: open `/dashboard/appointments/[id]`, move 3 panes into one container, switch tabs, move back, reset layout, refresh.
- [ ] One new telemetry event firing: `r_pane_freedom_move_via_context_menu`. Tabs render / tab switch events deferred to Phase 2's customize-mode landing event.

### Documentation

- [ ] `docs/Reference/product/cockpit/COCKPIT.md` updated with the new tabs grammar sub-section (paneIds[] + activeTabId; renderer behaviour; soft cap at 4 tabs).
- [ ] `docs/Work/capture/inbox.md` has 4-6 new lines for Phase 2–4 follow-ups (DnD overlay; customize toggle hotkey; chrome lift; cramped-layout warning).
- [ ] No source-plan update — cockpit-v2 is archived; this batch IS the source.

---

## Out-of-scope (rolled forward to follow-up batches)

| Out-of-scope item | Where it lands |
|---|---|
| **Drag-and-drop with 5-zone overlay** | Phase 2 batch |
| **Customize-layout toggle + hotkey** (`Cmd+Shift+L`) | Phase 3 batch |
| **Save-as-preset bar in customize mode** | Phase 3 batch |
| **Reset-to-default button surfaced in layout dropdown** | Phase 3 batch |
| **Cramped-layout soft warning** (> 5 horizontal siblings) | Phase 3 batch |
| **`<PlanActionFooter>` lift to shell-level dock** | Phase 4 batch |
| **`<SafetyStickyStrip>` lift to shell-level** | Phase 4 batch |
| **`<RxFormActionsBridgeProvider>` lift to page root** | Phase 4 batch |
| **`<ChartRailWithEmptyState>` leaf-anchored to snapshot (travels)** | Phase 4 batch |
| **Per-patient-type layout overrides** (acute vs chronic) | Future research batch |
| **Increase preset cap from 5** | Future cap-relax batch (already capture-inbox tracked) |
| **Cross-doctor / clinic-wide shared presets** | Future (already capture-inbox tracked) |
| **Mobile tree rendering** | OUT — preserves DL-7 forever |
| **Multi-home panes (same pane in two containers)** | OUT — preserves DL-2.4 forever |

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | cpf-01, cpf-02 | 2/2 | 0/2 | 0/2 | ~5-7h (sequential — cpf-02 depends on cpf-01's schema) |
| Wave 2 | cpf-03, cpf-04, cpf-05 | 2/3 | 1/3 | 0/3 | ~5-7h (cpf-03/04 lane α sequential; cpf-05 lane β parallel after cpf-02) |
| Wave 3 | cpf-06 | 0/1 | 1/1 | 0/1 | ~2h |
| **Total** | **6** | **4** | **2** | **0** | **~12-16h (~2 dev-days single-engineer)** |

Token estimate (rough): ~220k input / ~140k output across the batch. Total batch spend (excluding optional close-gate review): ~$11-16.

**One optional Opus close-gate turn after cpf-01** budgeted on top. **Recommended** for this batch — the schema migration is a silent-corruption surface (a wrong migration loses every doctor's saved layout). Skip if cpf-01's truth-table tests cover all v4→v5 round-trips cleanly.

---

## Sequencing notes (the why behind the waves)

The 3-wave shape:

- **Wave 1 is sequential (cpf-01 → cpf-02).** The schema change (cpf-01) is load-bearing for every other task; the mutation ops (cpf-02) extend the mutation engine to operate on the new shape.
- **Wave 2 has two lanes.** Lane α (cpf-03 → cpf-04) builds the renderer side (`<PaneTabStrip>` + `Shell.tsx` wire). Lane β (cpf-05) builds the user-visible workflow (context-menu submenu). Both consume cpf-02's ops but touch disjoint files.
- **Wave 2 → Wave 3 is Cut 3 (kind-of-work change).** Wave 2 = Build (production wire-up). Wave 3 = QA + Docs + Telemetry + capture-inbox.

**Within Wave 1, cpf-01 must land before cpf-02 starts** because cpf-02's truth tables operate on the new schema. Don't start cpf-02 with cpf-01 still in review.

**Within Wave 2's lane α, cpf-03 → cpf-04.** The `<PaneTabStrip>` is the new component; cpf-04 wires it into `<PaneSubtreeGroup>`'s leaf branch. Both touch only `frontend/components/patient-profile/`.

**Lane β (cpf-05) can start in parallel with lane α as soon as cpf-02 merges.** It touches `<PaneContextMenu>` and the page's action handlers — disjoint from lane α's files.

**Why no Opus build tasks?** Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) hard-rules: no PHI columns added, no RLS surface, no novel security. cpf-01's schema migration is the only candidate (silent-corruption risk) — handled with truth tables + the optional close-gate. Mutation ops (cpf-02) extend a pattern already shipped by clpm-04.

**Optional close-gate Opus turn** — recommended. The cpf-01 schema migration + cpf-02 mutation ops together introduce the foundation every later phase depends on; one Opus pass at the end of Wave 1 catches subtle invariant violations (e.g. a mutation that produces a tree where `activeTabId` is not in `paneIds`). Budget: ~1 Opus chat / ~12k tokens.

---

## References

- **Planning conversation (2026-05-28):** the chat that locked the vision + decision lock. Cited as the canonical source for DL-1 through DL-10 above.
- [Daily-plans/May 2026/24-05-2026/cockpit-layout-presets-modality/](../../../24-05-2026/cockpit-layout-presets-modality/) — predecessor batch; ships the substrate.
- [Daily-plans/May 2026/26-05-2026/cockpit-shell-layout-fix/](../../../26-05-2026/cockpit-shell-layout-fix/) — predecessor batch; ships the alignment-guard hydration this batch's v4→v5 migration leans on.
- [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/](../../../13-05-2026/patient-profile-shell-rebuild/) — original shell rebuild; the `PaneDefinition` + `useShellLayout` infrastructure this batch extends.
- [`frontend/lib/patient-profile/layout-tree.ts`](../../../../../../frontend/lib/patient-profile/layout-tree.ts) — `PaneTreeNode` schema (cpf-01 modifies).
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — mutation engine (cpf-02 extends).
- [`frontend/lib/patient-profile/types.ts`](../../../../../../frontend/lib/patient-profile/types.ts) — `PaneDefinition` + `PaneTabDefinition` (the latter is type-only today, becomes consumed in cpf-03/04).
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — `validateLayout`, hydration guard (cpf-01 modifies).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — `<PaneSubtreeGroup>` renderer (cpf-04 modifies).
- [`frontend/components/patient-profile/PaneContextMenu.tsx`](../../../../../../frontend/components/patient-profile/PaneContextMenu.tsx) — context menu (cpf-05 extends).
- [`docs/Work/Product plans/archive/plan-cockpit-v2.md`](../../../../../Product%20plans/archive/plan-cockpit-v2.md) — archived predecessor product plan; R-LAYOUT-UX is the closest neighbour to this batch.
- [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane shape rules.
- Sibling: [`Tasks/EXECUTION-ORDER-p1-cockpit-pane-freedom.md`](./Tasks/EXECUTION-ORDER-p1-cockpit-pane-freedom.md) — wave / lane matrix.
