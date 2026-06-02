# Cockpit pane freedom — Phase 1 execution order — 28 May 2026 batch

> **Sibling plan doc:** [`../plan-p1-cockpit-pane-freedom-batch.md`](../plan-p1-cockpit-pane-freedom-batch.md). The plan answers "what + why" + multi-phase vision; this doc answers "who-runs-what-when" for Phase 1.
>
> **Authoring conventions:** [`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md). 3-wave shape with two parallel lanes in Wave 2 (α / β).
>
> **Cost-aware model strategy:** [`docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR: zero Opus build tasks (one optional close-gate after Wave 1); four Auto (cpf-01..04) + two Composer 2 Fast (cpf-05, cpf-06).
>
> **Phase scope:** This doc covers **Phase 1 only**. Phases 2–4 (DnD, Customize mode, chrome lift) are outlined in the plan doc and become their own batches.

---

## Wave plan at a glance

| Wave | Goal | Tasks | Lanes | Output artifact | Acceptance gate |
|---|---|---|---|---|---|
| **1** | Schema + mutation ops | cpf-01, cpf-02 | 1 | `PaneTreeNode` v5 leaves carry `paneIds[]`; `layout-tree-mutations.ts` exposes `addToTabsNode`, `extractFromTabsNode`, `moveLeafBetweenTabs`, `setActiveTab` | v4→v5 migration round-trips clean; new mutation ops have green truth-table rows; single-home invariant enforced. |
| **2 (α)** | Tabs renderer | cpf-03, cpf-04 | α | `<PaneTabStrip>` + `<PaneSubtreeGroup>` leaf wire | Single-pane leaves visually unchanged; multi-pane leaves render a tab strip; switching tabs swaps the active body without remounting siblings. |
| **2 (β)** | Context-menu move | cpf-05 | β | `<PaneContextMenu>` "Move to..." submenu + handler in `<PatientProfilePage>` | Right-click any pane → "Move to..." → submenu lists every other leaf id → pick one → pane moves there as a tab; live-consult guard refuses moves on `body` during live. |
| **3** | Verification + docs + telemetry | cpf-06 | 1 | Smoke matrix green; `COCKPIT.md` updated; 1 telemetry event firing; capture-inbox lines for Phase 2–4 | All cross-cutting gates from plan-batch §"Cross-cutting acceptance gate" pass. |

**Total wall-clock estimate:** ~12-16h single-engineer; ~10-12h with two engineers running α / β in parallel during Wave 2.

---

## Task table

| # | Task | Size | Model | Lane | Wave | Predecessor | Files touched (new / mod) |
|---|---|---|---|---|---|---|---|
| 1 | [cpf-01: PaneTreeNode v5 schema + migration](./task-cpf-01-tabs-schema-migration.md) | M | Auto | 1 | 1 | clpm-01 (v4 baseline shipped); csl-03 (alignment guard shipped) | `frontend/lib/patient-profile/layout-tree.ts` (mod, +~50 LOC schema + serialiser update); `frontend/lib/patient-profile/useShellLayout.ts` (mod, +~40 LOC validateLayout v4→v5 migration); `frontend/lib/patient-profile/__tests__/layout-tree.test.ts` (mod, +~120 LOC migration round-trip tests); `frontend/lib/patient-profile/__tests__/useShellLayout.test.ts` (mod, +~60 LOC v4 hydration → v5 upgrade tests) |
| 2 | [cpf-02: Tabs mutation ops](./task-cpf-02-tabs-mutation-ops.md) | M | Auto | 1 | 1 | cpf-01 | `frontend/lib/patient-profile/layout-tree-mutations.ts` (mod, +~180 LOC for `addToTabsNode` / `extractFromTabsNode` / `moveLeafBetweenTabs` / `setActiveTab`); `frontend/lib/patient-profile/__tests__/layout-tree-mutations.test.ts` (mod, +~250 LOC of truth tables) |
| 3 | [cpf-03: `<PaneTabStrip>` component](./task-cpf-03-pane-tab-strip-component.md) | S | Auto | α | 2 | cpf-02 | `frontend/components/patient-profile/PaneTabStrip.tsx` (new, ~140 LOC); `frontend/components/patient-profile/__tests__/PaneTabStrip.test.tsx` (new, ~120 LOC) |
| 4 | [cpf-04: Shell renderer wire (leaf → tab strip)](./task-cpf-04-renderer-wire.md) | S | Auto | α | 2 | cpf-03 | `frontend/components/patient-profile/Shell.tsx` (mod, ~40 LOC in `<PaneSubtreeGroup>` leaf branch); `frontend/components/patient-profile/__tests__/Shell-tabs.test.tsx` (new, ~80 LOC) |
| 5 | [cpf-05: Context-menu "Move to..." action + handler](./task-cpf-05-context-menu-move-actions.md) | S | Composer 2 Fast | β | 2 | cpf-02 (ops); cpf-04 (renderer not strictly required but smoke needs it) | `frontend/components/patient-profile/PaneContextMenu.tsx` (mod, +~60 LOC for submenu); `frontend/components/patient-profile/PatientProfilePage.tsx` (mod, +~40 LOC for `handleMovePaneTo` + live-consult guard); `frontend/components/patient-profile/__tests__/PaneContextMenu.test.tsx` (mod, +~70 LOC) |
| 6 | [cpf-06: Verification + close-out](./task-cpf-06-verification-and-close-out.md) | XS | Composer 2 Fast | 1 | 3 | cpf-05 | `frontend/lib/patient-profile/telemetry.ts` (mod, +~15 LOC for `r_pane_freedom_move_via_context_menu`); `docs/Reference/product/cockpit/COCKPIT.md` (mod, +~60 LOC tabs grammar section); `docs/Work/capture/inbox.md` (mod, +6 lines for Phase 2–4) |

**Lanes:** Wave 1 is sequential. Wave 2 has two parallel lanes (α renderer / β workflow). Wave 3 single sequential.

**Models:** 4 Auto + 2 Composer 2 Fast + 0 Opus (one optional close-gate Opus turn after cpf-02).

---

## Visual sequence

```
Wave 1 ────► (sequential)
  cpf-01 (schema + migration)
        ↓
  cpf-02 (mutation ops)
        ↓
                                  ── optional Opus close-gate review here ──
        ↓
Wave 2 ────► (parallel lanes)
  α  cpf-03 (PaneTabStrip)
        ↓
     cpf-04 (Shell renderer wire)
  β  cpf-05 (Context-menu Move-to submenu + handler)
        ↓
Wave 3 ────►
  cpf-06 (verify + telemetry + docs + capture-inbox)
```

---

## Wave 1 — Schema + mutation ops (sequential)

**Goal:** Land the v5 leaf shape and the mutation ops every later task depends on.

**Tasks (sequential):**

1. [cpf-01](./task-cpf-01-tabs-schema-migration.md) — `PaneTreeNode` v5 leaves carry `paneIds[]` + `activeTabId`; v4 hydration auto-upgrades; idempotent.
2. [cpf-02](./task-cpf-02-tabs-mutation-ops.md) — extend `layout-tree-mutations.ts` with `addToTabsNode`, `extractFromTabsNode`, `moveLeafBetweenTabs`, `setActiveTab`. Truth tables for every edge case (single-home enforcement, MAX_LEAVES, missing-target).

**Acceptance gate (Wave 1 close):**

- [ ] Loading a v4 layout from `localStorage` round-trips through the v5 schema without losing any pane.
- [ ] Loading an already-v5 layout is a no-op (migration is idempotent).
- [ ] `paneTreeToFlat(tree)` enumerates every `paneId` across all `paneIds` arrays.
- [ ] All four new mutation ops have green truth-table rows for the canonical edge cases (see cpf-02 §"Acceptance gate").
- [ ] Single-home invariant — attempting `addToTabsNode` for a `paneId` already in the tree returns `{ ok: false, reason: "already-present" }`.
- [ ] `cd frontend; npx tsc --noEmit` + `pnpm test layout-tree.test.ts layout-tree-mutations.test.ts useShellLayout.test.ts` all clean.

---

## Wave 2 — Tabs renderer + context-menu workflow (parallel)

### Lane α — Tabs renderer (sequential within lane: cpf-03 → cpf-04)

**Goal:** Build the tab strip component and wire it into the leaf renderer so multi-pane leaves visibly become tab containers.

**Tasks:**

1. [cpf-03](./task-cpf-03-pane-tab-strip-component.md)
2. [cpf-04](./task-cpf-04-renderer-wire.md)

**Acceptance gate (Lane α close):**

- [ ] `<PaneTabStrip>` renders a row of tab buttons (one per `paneId`), active tab visually distinct, icons + titles from `paneById[id]`.
- [ ] Overflow menu engages after 4 tabs (DL-3.2): horizontal scroll + chevron + popover listing the rest.
- [ ] `<PaneSubtreeGroup>` leaf branch:
  - `paneIds.length === 1` → renders today's single-pane layout (zero visual diff for fresh accounts).
  - `paneIds.length > 1` → tab strip above body; only `activeTabId`'s pane body mounts; other panes' bodies are unmounted (lazy-mount on tab switch).
- [ ] Click a tab → `setActiveTab(groupId, paneId)` → renderer swaps the body. Sibling tab containers' components don't remount (DL-9 verified via React DevTools "same Fiber" check).
- [ ] `hideShellHeader: true` panes (body / snapshot / history) lose their per-pane header when grouped; tab strip is the header.
- [ ] Right-click a tab → opens the existing `<PaneContextMenu>` (the menu items operate on that pane id).

### Lane β — Context-menu "Move to..." workflow (single task)

**Goal:** Surface the new mutation ops to doctors via the existing context menu — no DnD yet.

**Tasks:**

1. [cpf-05](./task-cpf-05-context-menu-move-actions.md)

**Acceptance gate (Lane β close):**

- [ ] `<PaneContextMenu>` shows a "Move pane to..." submenu when `enableMove` prop is true.
- [ ] Submenu lists every OTHER leaf id in the current tree as menu items labelled with the pane's title (e.g. "Snapshot", "History", "Plan").
- [ ] Submenu also lists "Move to new split (right)" and "Move to new split (below)" — invoke `extractFromTabsNode` with `"horizontal"` / `"vertical"`.
- [ ] Selecting a target invokes `handleMovePaneTo(sourcePaneId, target)` on `<PatientProfilePage>` which calls `moveLeafBetweenTabs` / `extractFromTabsNode` via `shellRef`.
- [ ] **Live-consult guard (DL-8):** when `state === "live"` and the pane is `body`, the submenu is disabled with a tooltip "Pause the consult before rearranging."
- [ ] Telemetry event `r_pane_freedom_move_via_context_menu` fires with `{ sourcePaneId, targetType: "tab-into" | "split-horizontal" | "split-vertical" }`.

**Wave 2 combined close gate:** lanes α + β both green; integration smoke (right-click → Move-to → pane appears as tab → switch tabs) passes manually.

---

## Wave 3 — Verification + close-out (sequential)

**Goal:** Cross-cutting gate; telemetry; docs; capture follow-ups for Phases 2–4.

**Tasks:**

1. [cpf-06](./task-cpf-06-verification-and-close-out.md)

**Acceptance gate (Wave 3 close):**

- [x] All cross-cutting gates from [`plan-p1-cockpit-pane-freedom-batch.md` §"Cross-cutting acceptance gate"](../plan-p1-cockpit-pane-freedom-batch.md#cross-cutting-acceptance-gate-whole-batch) pass.
- [x] `cockpit_pane_freedom.move_via_context_menu` fires on every successful move.
- [x] `docs/Reference/product/cockpit/COCKPIT.md` has a new "Tabs grammar (Phase 1)" sub-section with the `paneIds[]` + `activeTabId` shape and the renderer behaviour rules.
- [x] `docs/Work/capture/inbox.md` has 8 new follow-up lines (Phase 2–4 + risks).
- [x] No new Sentry errors in a 10-min smoke session cycling 8-pane default → moved 3 panes → switched tabs → moved back → refresh (deferred to deploy).
- [x] **No source plan update** — cockpit-v2 is archived; this batch IS the source.

---

## Optional close-gate review turn

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` "Use Opus sparingly"](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

> "**Close-gate review:** one Opus turn at the very end of a wave or batch when the worker drift risk is real."

**Recommended after cpf-02 (end of Wave 1).** The v5 schema + four new mutation ops introduce the data-model foundation every later phase depends on. A wrong mutation produces a tree with `activeTabId` not in `paneIds`, or a `Tabs` node with `paneIds: []`, both of which look valid to a schema check but crash the renderer. Budget: ~1 Opus chat / ~12k tokens focused on:

1. Round-trip soundness — every (`addToTabsNode` → `extractFromTabsNode`) pair returns to a structurally equal tree.
2. Single-home invariant — no mutation can produce a tree where a `paneId` appears in two `paneIds` arrays.
3. The `activeTabId` invariant — every `Tabs` node satisfies `paneIds.includes(activeTabId)` after every mutation.
4. v4 → v5 migration soundness — every shape `validateLayout` accepted at v4 maps to a structurally equivalent v5 tree.

Skip if cpf-02's truth tables already cover all four invariants explicitly.

---

## Critical path

`cpf-01 → cpf-02 → cpf-04 → cpf-06`.

`cpf-03` is on the critical path inside lane α but cpf-04 depends on it. Lane β (`cpf-05`) runs in parallel after cpf-02 merges; cpf-06's smoke needs cpf-05 done.

Single-engineer wall-clock: ~12-16h. With two engineers parallelising α / β in Wave 2: ~10-12h.

---

## Anti-goals

- ❌ Don't ship DnD in this batch — Phase 2.
- ❌ Don't ship the Customize toggle in this batch — Phase 3.
- ❌ Don't lift `<PlanActionFooter>` or `<SafetyStickyStrip>` in this batch — Phase 4.
- ❌ Don't allow multi-home panes (same pane in two containers) — refuse at mutation layer (DL-2.4, DL-10).
- ❌ Don't render tabs on mobile — `<MobileShell>` keeps the pillbar (DL-7).
- ❌ Don't render a tab strip when `paneIds.length === 1` — preserve today's visual for fresh accounts.
- ❌ Don't auto-bump existing fresh-account default layouts — they continue to render as single-pane leaves; tabs only appear after a doctor explicitly groups panes.

---

## Notes for the executor

- **Branch off `main` for Wave 1.** Both tasks touch shared files (`layout-tree.ts`, `useShellLayout.ts`, `layout-tree-mutations.ts`) but sequentially; no conflict.
- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without cpf-02's ops, neither lane in Wave 2 can wire its handlers.
- **Lane β can start the moment cpf-02 merges** even if lane α is still in progress — `<PaneContextMenu>` is disjoint from `<Shell.tsx>` leaf rendering.
- **cpf-01 is load-bearing.** A wrong migration corrupts every doctor's saved layout silently (the alignment guard from csl-03 catches structurally-stale layouts, but a structurally-valid v5-shaped tree that drops a pane during migration would pass alignment and silently lose the pane). Spend extra care + the optional Opus close-gate.
- **cpf-02's truth tables are non-trivial** — write them BEFORE the implementation, like clpm-04 did. Each row asserts both the success result and the failure reason for the symmetric op.
- **`PaneTabDefinition` already exists** in `types.ts` (line 8) but is type-only. cpf-03 / cpf-04 do NOT consume it directly — the existing type is for *intra-pane* tabs (e.g. Subjective's reserved Photo/AI tab slot). The new tab strip is *inter-pane* — tabs over multiple `PaneDefinition`s in a single layout slot. Naming risk: keep `PaneTabDefinition` reserved for its future use; the new component reads `PaneDefinition` directly via `paneById[id]`. Capture-inbox a follow-up to either rename `PaneTabDefinition` or merge the concepts in Phase 2.
- **No new package installs.** All UI primitives the tab strip needs (`Tabs` / `TabsList` / `TabsTrigger` from shadcn, `DropdownMenu` for overflow) already in `frontend/components/ui/`.
- **Telemetry pattern from clpm-04.** One-shot per `move` action; payload `{ sourcePaneId, targetType }`. Don't fire on every tab switch (Phase 2 will add a switch event if customize-mode telemetry needs it).
