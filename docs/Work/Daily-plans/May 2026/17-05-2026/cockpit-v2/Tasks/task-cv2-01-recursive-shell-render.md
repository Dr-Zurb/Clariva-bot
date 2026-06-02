# Task cv2-01: Recursive `PaneDefinition.children` rendering in `<PatientProfileShell>`

## 17 May 2026 — Batch [Cockpit v2 — Phase 1](../plan-cockpit-v2-batch.md) — Wave 1, Lane α step 0 — **L, ~8h**

---

## Task overview

Activate the `PaneDefinition.children?: PaneDefinition[]` field that the ppr-03 batch reserved (ppr DL-5) but never wired. The shell currently renders a flat `<ResizablePanelGroup orientation="horizontal">` with one panel per top-level `PaneDefinition`. After this task, the shell walks a **recursive tree** — at each node, if `children?.length > 0` the renderer mounts a nested `<ResizablePanelGroup>` with the alternated orientation (parent horizontal → children vertical → grandchildren horizontal), each with its own `groupRef`, size snapshot, cascade-handle algorithm, and rebalance gate. Leaves still render with the existing `<PaneHeader>` + `pane.render()` chain.

This is the **single structural primitive** that Phase 1 + Phase 2 of the cockpit-v2 plan needs. cv2-02 (state model) and cv2-03 (Telemed-Video template) cannot start until this task ships — they consume the new renderer's contract.

The task is **pure renderer + type extension** in this slice. The layout-state model (`useShellLayout` → `PatientProfileLayout`) is **not** rewritten here; cv2-02 owns that. To keep `Shell.tsx` consumable by today's flat `<PatientProfilePage>` while cv2-02 is in flight, this task adds a tiny `paneTreeToFlat(rootNode)` adapter and a `flatToPaneTree(layout, panes)` round-trip helper that lets the existing flat layout still drive the renderer. The recursive renderer works on either shape; it doesn't care.

ESLint zone extension is the other deliverable: a new rule bans `<ResizablePanelGroup>` from any file other than `Shell.tsx`. Without this, downstream Phase 2 / 3 surfaces could bypass the shell to add ad-hoc nested splits — defeating the whole point of having a content-agnostic primitive.

**Estimated time:** ~8h (1h type extensions + 4h `renderPaneSubtree` extraction + 2h cascade-handle / rebalance-gate generalisation + 30min ESLint rule + 30min smoke fixture).

**Status:** Pending.

**Hard deps:** ppr-03 (the foundation `<PatientProfileShell>` + `PaneDefinition` contract). Must be merged to main OR this task ships on a branch stacked on `feature/patient-profile-shell-rebuild`.

**Source:** [plan-cockpit-v2-batch.md § Wave 1](../plan-cockpit-v2-batch.md#wave-1--recursive-shell-primitive-1-task-8h-single-sequential-lane) + R-SHELL + DL-1..DL-5, DL-22 in [Product plans/plan-cockpit-v2.md](../../../Product%20plans/plan-cockpit-v2.md).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High**. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § "When to escalate to Opus"](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules) rule #5 — this is a cross-cutting refactor of a 750-LOC primitive that touches ≥ 5 files (types, Shell.tsx, MobileShell helper, .eslintrc.json, Shell test/smoke fixture). The cascade-handle algorithm + rebalance-gate machinery in the existing `DesktopShell` is subtle (~200 LOC of carefully-commented invariants around `react-resizable-panels` internals — see the long comments in `Shell.tsx` around `sizeSnapshot` and `isRebalancingRef`); generalising it for arbitrary depth requires real reasoning, not pattern matching.

**Per-message escalation rule:** N/A — this entire task runs in Opus 4.7 Extra High. If a single message stalls (e.g. on the `react-resizable-panels` v4 nested-group hand-off semantics), back up and reload the source comments in `Shell.tsx` rather than escalating further.

**Manual-Sonnet fallback:** Not appropriate. The structural risk of getting the cascade-handle wrong at nested depths is high (the bug surfaces as "second-level resize handle locks after first drag" or "outer drag also moves inner panels" — both hard to debug and easy to ship).

**New chat?** **Yes** — fresh Opus chat. Pre-load:

- This task file.
- `frontend/components/patient-profile/Shell.tsx` (750 LOC — the file being refactored). Pay special attention to the long comments around `sizeSnapshot` (lines ~488–500), `isRebalancingRef` (lines ~395–410), `minByPaneId` (lines ~510–537), and the rebalance effect (lines ~560–620). The recursive rewrite must preserve every invariant those comments protect.
- `frontend/lib/patient-profile/types.ts` (the `PaneDefinition` interface this task extends).
- `frontend/lib/patient-profile/useShellLayout.ts` (NOT modified in this task, but the renderer's setter contracts (`setPaneSize`, `applyLayout`) must keep working).
- `frontend/components/patient-profile/CascadeHandle.tsx` (the cross-pane resize algorithm). Critically: the cascade handle uses `visiblePaneOrder` + `minByPaneId` as its source of truth for what to do when it hits a neighbour's min size. At each nesting level, those values are local to that level's group — the algorithm needs to be parameterised by the *current group's* visible order, not the global one.
- `frontend/components/patient-profile/PatientProfilePage.tsx` (the consumer — verify the `panes` prop contract still holds; this task does NOT change how `<PatientProfilePage>` calls `<PatientProfileShell>`).
- `frontend/.eslintrc.json` (the existing content-agnosticism zone that gains the new `<ResizablePanelGroup>` ban).
- `package.json` (verify `react-resizable-panels` is v4 — nested groups behave differently between v3 and v4; the comments in `Shell.tsx` reference v4 specifically).
- Source plan §DL-1..DL-5, §DL-22.
- ppr-03 batch acceptance gate (predecessor batch's invariants this task must preserve).

**Estimated turns:** 6–8 turns (1 type extension + 2 `renderPaneSubtree` first draft + 1 cascade-handle generalisation + 1 rebalance-gate generalisation + 1 ESLint rule + 1 smoke fixture + 1 verification round).

---

## Acceptance criteria

### Step 1 — Extend `PaneDefinition` with `direction?` (and document `children?` activation)

- [ ] In `frontend/lib/patient-profile/types.ts`, **modify** the `PaneDefinition.children` JSDoc (it currently says "RESERVED FOR FUTURE — DL-5. v1 MUST ignore this field") to say "Activated in cv2-01 (May 2026). When present, the shell renders these as a nested resizable group with the alternated orientation. See `direction?` below for explicit orientation control."
- [ ] **Add** a new field to `PaneDefinition`:

  ```ts
  /**
   * Explicit orientation for the nested group when `children?` is present.
   * Defaults to alternating from the parent's orientation: a horizontal
   * parent renders children vertically; a vertical parent renders children
   * horizontally. Set this only when you want to override the alternation
   * (rare — the bottom region of the Telemed-Video template overrides it
   * to keep `Investigations-orders | Plan` as a horizontal split inside
   * what would otherwise default to vertical).
   *
   * Ignored when `children` is empty / undefined.
   */
  direction?: 'horizontal' | 'vertical';
  ```

- [ ] **Preserve** all existing fields (`id`, `title`, `render`, `collapsedRender`, `minSizePct`, `minSizePx`, `naturalSizePct`, `canCollapse`, `hotkey`, `icon`, `children`). Order of fields in the interface is unchanged.
- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean. Every existing consumer of `PaneDefinition` still compiles (the new field is optional).

### Step 2 — Extract `renderPaneSubtree` from `DesktopShell`

The current `DesktopShell` body is ~400 LOC and assumes one horizontal panel group. Extract the per-group rendering into a helper that's called recursively.

- [ ] **New helper signature** (inside `Shell.tsx`, NOT exported — only used by `DesktopShell`):

  ```ts
  interface RenderPaneSubtreeArgs {
    nodes: PaneDefinition[];                                // children of this group
    orientation: 'horizontal' | 'vertical';
    groupId: string;                                        // unique per group, e.g. `${storageKey}::root` or `${storageKey}::root.1.0`
    visibleOrder: string[];                                 // ids of nodes that are not hidden
    paneState: Record<string, PaneRuntimeState>;            // sizes + hidden flags for THIS group's leaves
    minByPaneId: Record<string, number>;                    // computed minimums for THIS group's visible leaves
    sizeSnapshot: Record<string, number>;                   // stable per-render snapshot of absolute sizePcts for THIS group
    onLeafResize: (paneId: string, size: PanelSize) => void;
    onLeafReorder: (fromId: string, toId: string) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    depth: number;                                          // 0 = root, 1 = nested, 2 = grandchild
  }

  function renderPaneSubtree(args: RenderPaneSubtreeArgs): React.ReactNode { /* ... */ }
  ```

- [ ] **Algorithm** (the helper's body):

  1. Allocate a new `groupRef` for *this* group via `useRef<GroupImperativeHandle | null>(null)`. **Critical:** Because this helper is called from a `useMemo` inside `DesktopShell`, `useRef` cannot be called directly here — refs must be allocated once per group id and survive remounts. Use a `Map<groupId, GroupImperativeHandle | null>` held in a ref at the `DesktopShell` level; the helper looks up its group ref from that map.
  2. Render a `<ResizablePanelGroup id={groupId} groupRef={groupRefForThisGroup} orientation={orientation}>`.
  3. For each id in `visibleOrder`, look up its `PaneDefinition`. If `children?.length > 0`, recurse: render a `<ResizablePanel id={node.id} defaultSize={...} minSize={...}>` whose body is `renderPaneSubtree({...args, nodes: node.children, orientation: oppositeOrientation, groupId: `${groupId}.${node.id}`, depth: depth + 1, ...})`. Otherwise render the leaf (the existing `<PaneHeader>` + `pane.render()` chain).
  4. Insert a `<CascadeHandle>` between every adjacent pair within the same group (NOT across nested groups — each group has its own handles).
  5. Suppress the `<PaneHeader>` for non-leaf nodes (they have no body to title; the title would be redundant with the child group's headers). Optional: render a thin "group label" strip at depth > 0 if the parent definition has a non-empty `title` — out of scope for this task; defer.

- [ ] **`renderPaneSubtree` does NOT touch `localStorage`, `useShellLayout`, or `onLayoutChange`.** It's a pure rendering helper. Persistence stays in `DesktopShell`'s outer scope (and gets rewritten in cv2-02).

- [ ] **Mobile branch unchanged in this task.** `MobileShell` keeps its flat-stacked rendering; it does NOT recurse into `children` in this task (cv2-02 picks that up via the `flatToPaneTree` adapter the other way). For the mobile branch, the tree is flattened to a leaf list using a tiny inline helper (`function flattenLeaves(nodes: PaneDefinition[]): PaneDefinition[]`) — the task verifies `MobileShell` still renders the existing pane set correctly.

### Step 3 — Generalise the rebalance-gate machinery for nested groups

The existing `DesktopShell` has a single `isRebalancingRef` + `visibleAbsoluteSumRef` pair guarding the panel-group library's onResize cluster after structural changes. With nested groups, **each group needs its own pair** — a rebalance on the inner group must not poison the outer group's persisted sizes.

- [ ] **Per-group state map.** Replace the singular refs in `DesktopShell` with a map keyed on `groupId`:

  ```ts
  const isRebalancingRefMap = useRef<Map<string, boolean>>(new Map());
  const visibleAbsoluteSumRefMap = useRef<Map<string, number>>(new Map());
  const sizeSnapshotMap = useRef<Map<string, Record<string, number>>>(new Map());
  ```

  Each `groupId` (e.g. `${storageKey}::root`, `${storageKey}::root.middle`, `${storageKey}::root.middle.bottom`) gets its own entry on first encounter. The helper `renderPaneSubtree` reads / writes its own entry.

- [ ] **The rebalance `useEffect`** (currently lines ~560–620 in `Shell.tsx`) needs to fire once per group, keyed on each group's own `visibleKey + layoutVersion`. The cleanest way: extract the rebalance effect into a helper `useRebalanceEffect(groupId, visibleIds, paneState, paneById, groupRef, ...)` called once per group from `renderPaneSubtree` via a child component `GroupRebalanceController` that takes the group's args and uses normal `useEffect` / `useRef` hooks (rules-of-hooks compliant).

- [ ] **`handleResize` (per group)** translates the library's viewport-relative pct to an absolute one using *this group's* `visibleAbsoluteSumRef`. Persisted via `setPaneSize(paneId, absolutePct)` against the flat layout (cv2-02 will route nested-leaf resizes via the new `setLeafSize(nodeId, pct)` API; until then, the flat shape is the only persistence target).

- [ ] **Critical invariant.** The two-rAF release window for `isRebalancingRef` documented in the existing `Shell.tsx` comments (lines ~605–610) must be preserved per-group. Do NOT collapse it to a single rAF for "simplicity" — the deferred onResize callbacks from `react-resizable-panels` v4 still land in a follow-up microtask.

### Step 4 — Generalise the cascade-handle algorithm for nested groups

The `<CascadeHandle>` component already takes `visiblePaneOrder` + `minByPaneId` as props. The rewrite just needs to make sure each `<CascadeHandle>` instance is given *its own group's* visible order and minimum map — not the global one.

- [ ] **`<CascadeHandle>` props are unchanged**: `groupRef`, `containerRef`, `visiblePaneOrder`, `minByPaneId`, `handleIndex`, `prevPaneTitle`, `nextPaneTitle`, `withHandle`.
- [ ] **`renderPaneSubtree` passes the local `visibleOrder` + `minByPaneId` to each handle within its group.** Verify: in the Telemed-Video template fixture (or smoke), dragging the outer-horizontal column boundary moves the columns; dragging an inner-vertical row boundary moves the rows within that column — neither bleeds into the other.
- [ ] **`minByPaneId` is recomputed per group.** Reuse the existing memo logic (per-leaf `max(minSizePct, minSizePxAsPct)` with the 4% floor) but key on the group's `visibleIds.join(",")` + container width.

### Step 5 — `paneTreeToFlat` adapter (kept this task only; cv2-02 retires)

- [ ] **New helper** in `frontend/lib/patient-profile/types.ts` (or a new sibling file `frontend/lib/patient-profile/tree-adapter.ts` if preferred — task picks one):

  ```ts
  /**
   * Stub adapter — cv2-01 only. Walks a PaneDefinition tree and returns
   * the leaves in left-to-right depth-first order. Used by the shell while
   * `useShellLayout` is still keyed on flat paneOrder + paneState. Retired
   * by cv2-02, which rewrites the hook to consume the recursive tree.
   *
   * Round-trip note: the returned `paneOrder` is just leaf ids in DFS
   * order; structure is lost. Tree-aware persistence is cv2-02's job.
   */
  export function paneTreeToFlat(nodes: PaneDefinition[]): {
    paneOrder: string[];
    paneById: Record<string, PaneDefinition>;
  } {
    const order: string[] = [];
    const byId: Record<string, PaneDefinition> = {};
    function walk(n: PaneDefinition) {
      byId[n.id] = n;
      if (n.children && n.children.length > 0) {
        for (const child of n.children) walk(child);
      } else {
        order.push(n.id);
      }
    }
    for (const root of nodes) walk(root);
    return { paneOrder: order, paneById: byId };
  }
  ```

- [ ] **`DesktopShell` calls `paneTreeToFlat(panes)` once on mount** to derive the flat shape, then runs `useShellLayout` against it as before. The recursive renderer descends into `panes` directly (not the flat shape) — `paneTreeToFlat` is only there to keep the *persistence* layer flat for this task.

- [ ] **A `// TODO(cv2-02):` comment** flags this adapter as transitional. cv2-02 deletes it.

### Step 6 — New ESLint rule banning `<ResizablePanelGroup>` outside `Shell.tsx`

The shell is the only place in the codebase that should mount the panel-group library directly. Without a lint rule, Phase 2 / 3 surfaces could quietly add ad-hoc nested splits and bypass the shell entirely.

- [ ] **Extend `frontend/.eslintrc.json`** with a `no-restricted-syntax` rule:

  ```json
  {
    "rules": {
      "no-restricted-syntax": [
        "error",
        {
          "selector": "JSXIdentifier[name='ResizablePanelGroup']",
          "message": "Direct use of <ResizablePanelGroup> is forbidden outside Shell.tsx. Use the patient-profile shell with a PaneDefinition tree instead. See docs/Reference/product/cockpit/COCKPIT.md."
        }
      ]
    }
  }
  ```

  (If the existing eslintrc structure uses `overrides`, scope the rule to all `frontend/components/**` and `frontend/app/**` paths EXCEPT `frontend/components/patient-profile/Shell.tsx`. Match the precedent set by ppr-03's existing zone if it uses overrides.)

- [ ] **Fixture file** `tools/eslint-fixtures/bad-resizable.tsx` (path adjusts if `tools/` doesn't exist — task picks a sensible alternative under `frontend/test-fixtures/` or similar):

  ```tsx
  // Lint-fixture to verify the cv2-01 ESLint rule. Should fail lint.
  import { ResizablePanelGroup } from '@/components/ui/resizable';
  export function BadPanelGroupOutsideShell() {
    return <ResizablePanelGroup orientation="horizontal" />;
  }
  ```

  This file is **explicitly excluded** from CI lint via `frontend/.eslintignore` (or the equivalent), but documents the expected lint behaviour. Running `pnpm --filter frontend lint -- --no-ignore tools/eslint-fixtures/bad-resizable.tsx` should error out. If preferred, skip the fixture file and instead document the lint behaviour in a comment in `.eslintrc.json` — task chooses.

- [ ] **Existing files don't trip the rule.** `pnpm --filter frontend lint` clean. The only legitimate user is `Shell.tsx`, which is exempted via the override path.

### Step 7 — Smoke fixture

To verify nested rendering without waiting for cv2-03's full template:

- [ ] **New dev page** `frontend/app/dev/shell-tree-smoke/page.tsx` (or wherever dev fixtures live — task identifies; if `frontend/app/dev/` doesn't exist, propose adding it with a single-line note in `frontend/app/dev/README.md`):

  ```tsx
  'use client';
  import dynamic from 'next/dynamic';
  import type { PaneDefinition } from '@/lib/patient-profile/types';

  const PatientProfileShell = dynamic(
    () => import('@/components/patient-profile/Shell'),
    { ssr: false },
  );

  const PANES: PaneDefinition[] = [
    {
      id: 'left',
      title: 'Left (split vertical)',
      render: () => null,
      children: [
        { id: 'left-top',    title: 'Left top',    render: () => <div className="p-4">Left top placeholder</div> },
        { id: 'left-bottom', title: 'Left bottom', render: () => <div className="p-4">Left bottom placeholder</div> },
      ],
    },
    {
      id: 'middle',
      title: 'Middle (split vertical, bottom split horizontal)',
      render: () => null,
      children: [
        { id: 'middle-top', title: 'Middle top', render: () => <div className="p-4">Middle top placeholder</div> },
        {
          id: 'middle-bottom',
          title: 'Middle bottom (split horizontal)',
          render: () => null,
          direction: 'horizontal',
          children: [
            { id: 'middle-bottom-left',  title: 'Middle bottom left',  render: () => <div className="p-4">M-B-L placeholder</div> },
            { id: 'middle-bottom-right', title: 'Middle bottom right', render: () => <div className="p-4">M-B-R placeholder</div> },
          ],
        },
      ],
    },
    {
      id: 'right',
      title: 'Right',
      render: () => <div className="p-4">Right placeholder</div>,
    },
  ];

  export default function ShellTreeSmokePage() {
    return (
      <div className="h-screen w-screen">
        <PatientProfileShell panes={PANES} storageKey="dev/shell-tree-smoke" />
      </div>
    );
  }
  ```

- [ ] **Manually verify on `/dev/shell-tree-smoke`:**
  - All 6 leaves render with their placeholder text.
  - The outer-horizontal group has two resize handles (between Left/Middle and Middle/Right).
  - The Left column's inner-vertical group has one resize handle (between Left-Top/Left-Bottom).
  - The Middle column's inner-vertical group has one resize handle (between Middle-Top/Middle-Bottom).
  - The Middle-Bottom's inner-horizontal group has one resize handle (between MBL/MBR).
  - Dragging any handle moves only that group's children; no bleed-through.
  - Cascade behaviour at each level: drag MBL's separator past its minimum → MBR collapses to its minimum, then the entire Middle-Bottom group's allotment compresses (or stops at its outer minimum) without affecting Left/Right columns.
  - Drag-to-reorder via header GripVertical works at each level (drop Left-Top onto Left-Bottom swaps them; drop MBL onto MBR swaps them; drop Left onto Right swaps the outer columns).
  - Viewport < 1024px: the page falls through to `MobileShell` and stacks all 6 leaves vertically with no resize handles.

- [ ] **Smoke fixture is NOT registered in production nav.** It lives under `/dev/*` and is excluded from sitemaps / robots / etc. via the existing `frontend/middleware.ts` or `frontend/app/dev/layout.tsx` pattern — task picks the right mechanism.

### Step 8 — Verification (deterministic)

- [ ] **Type-check:** `pnpm --filter frontend tsc --noEmit` clean. New `direction?` field on `PaneDefinition` compiles; `paneTreeToFlat` typed correctly.
- [ ] **Lint:** `pnpm --filter frontend lint` clean. ESLint rule passes against all real code; fixture file errors when explicitly linted.
- [ ] **Existing `/v2` route renders identically.** Manual diff: open `/dashboard/appointments/[id]/v2` against a fixture appointment pre- and post-this task. Visual diff zero modulo dynamic content. Drag, resize, collapse, reorder all three panes — all behaviour identical to today.
- [ ] **No console errors / warnings.** Specifically, no `react-resizable-panels` `Invalid N panel layout: …%, …%` errors during any pane interaction.
- [ ] **`rg "<ResizablePanelGroup" frontend/components --files-with-matches`** returns ONLY `frontend/components/patient-profile/Shell.tsx`.
- [ ] **`rg "PaneDefinition.children" frontend/lib/patient-profile/types.ts`** returns the activated JSDoc. The old "RESERVED FOR FUTURE" wording is gone.
- [ ] **`rg "paneTreeToFlat" frontend/lib/patient-profile`** returns the new helper. **A `// TODO(cv2-02):` comment is present** flagging it as transitional.

---

## Out of scope

- **`useShellLayout` rewrite to consume the recursive tree.** cv2-02. This task keeps the flat shape driving persistence via `paneTreeToFlat`.
- **`PatientProfileLayout` schema v4 with `paneTree`.** cv2-02.
- **`templates.ts` / Telemed-Video template literal.** cv2-03.
- **`/v2-tree` page route.** cv2-03.
- **Synthetic placeholder leaves with title + icon.** cv2-03 (this task ships a smoke fixture with inline placeholders, but `<PanePlaceholder>` as a reusable component is cv2-03).
- **Aux-surface contracts.** cv2-09.
- **Backend migration for SOAP fields.** cv2-04.
- **Group-level title strips for non-leaf nodes** (e.g. "Middle column" header above the vertical split). Deferred; the source plan doesn't ask for it, and the visual design is unclear. Phase 2 may revisit.
- **Drag-to-reorder ACROSS groups** (e.g. dragging Middle-Top out of its column into the Right column). The header drag in this task only reorders within its own group. Cross-group reorder is a Phase 3 UX feature.
- **Collapse / uncollapse for non-leaf nodes** (collapsing the entire Left column at once). The existing toggle bar still toggles leaves; toggling a non-leaf is a Phase 3 concern.
- **Mobile branch recursion.** Mobile flattens the tree to leaves and stacks. No nested rendering on mobile.

---

## Files expected to touch

**New:**

- `frontend/app/dev/shell-tree-smoke/page.tsx` (~70 LOC — the smoke fixture).
- Optional: `frontend/lib/patient-profile/tree-adapter.ts` (~30 LOC) — IF the task chooses to put `paneTreeToFlat` in a separate file rather than `types.ts`.
- Optional: `tools/eslint-fixtures/bad-resizable.tsx` (~5 LOC) — IF the task chooses to ship a lint fixture rather than a comment.

**Modified:**

- `frontend/components/patient-profile/Shell.tsx` (~400 LOC delta — extract `renderPaneSubtree`, generalise rebalance / cascade / size-snapshot per group, allocate per-group refs map). The file will grow to ~900–1,000 LOC. If it exceeds 1,100 LOC, factor `renderPaneSubtree` into its own file `frontend/components/patient-profile/renderPaneSubtree.tsx` (task picks; the ESLint rule still exempts the new file via the override path).
- `frontend/lib/patient-profile/types.ts` (~25 LOC delta — `direction?` field, updated `children?` JSDoc, optional `paneTreeToFlat` helper).
- `frontend/.eslintrc.json` (~10 LOC delta — `no-restricted-syntax` rule for `JSXIdentifier[name='ResizablePanelGroup']` with the Shell.tsx override).

**Read but do not modify in this task:**

- `frontend/lib/patient-profile/useShellLayout.ts` (cv2-02 modifies).
- `frontend/components/patient-profile/CascadeHandle.tsx` (props are unchanged; only the values passed in change).
- `frontend/components/patient-profile/PatientProfilePage.tsx` (the `<PatientProfileShell panes={...} />` contract is unchanged — `panes` is still the top-level `PaneDefinition[]`).
- `frontend/components/ui/resizable.tsx` (the thin wrapper around `react-resizable-panels`; no changes needed).

**Tests:** No new automated test files in this task. The smoke fixture (`/dev/shell-tree-smoke`) is the manual verification. Adding `react-testing-library` tests for nested-group rendering is Phase 2 / 3 work — the library's interaction model (drag, resize, collapse) doesn't lend itself to RTL tests cleanly, and the existing `Shell.test.tsx` (if any) covers the flat-shape invariants this task preserves.

---

## Notes / open decisions

1. **Why is the layout-state rewrite separated into cv2-02?** Two reasons. (a) The renderer change is the structural risk; landing it on top of a stable persistence layer means any regression bisects cleanly to the renderer. (b) `useShellLayout`'s extension to tree-aware setters touches a different file with different invariants (debounce, hydration gating, applyLayout) — putting it in the same Opus task would push cv2-01 from L to XL and spread Opus's reasoning over too much surface. The `paneTreeToFlat` stub is the cheap glue that keeps the two halves independent.

2. **Why does `renderPaneSubtree` need its own per-group `groupRef`?** `react-resizable-panels` v4 (per the existing `Shell.tsx` comments around line ~457–488) requires a stable Group identity per `<ResizablePanelGroup>` mount; sharing one `groupRef` across nested groups would crash the library's `mountedGroups` map. The per-group map keyed on `groupId` is the cleanest way; allocating refs via a child-component-per-group is the React-canonical way but adds an extra component layer for no behavioural gain.

3. **What about `applyLayout` (the imperative handle used by ppr-08 to apply legacy seeds)?** `applyLayout` is keyed on the flat `PatientProfileLayout` shape; cv2-02 extends it to tree-aware payloads. This task leaves the imperative handle's signature unchanged; ppr-08's legacy-seed effect still works.

4. **Why ban `<ResizablePanelGroup>` outside `Shell.tsx`?** Without the rule, any future surface (e.g. a settings page wanting a nested split) could mount the library directly and bypass the shell's invariants (cascade handles, rebalance gates, size snapshots). The shell's correctness guarantees only hold inside the shell. The ban forces all nested splits through `PaneDefinition.children`, which gets them for free.

5. **Why is the smoke fixture under `/dev/` rather than a Jest test?** The bugs this task can introduce ("first handle drag locks the second-level group") only surface against the real `react-resizable-panels` v4 runtime + a real ResizeObserver + real pointer events. Jest's jsdom doesn't faithfully simulate any of those. A manual smoke is the honest verification.

6. **Could a Storybook story replace `/dev/shell-tree-smoke`?** Yes — if the repo has Storybook configured. As of the task's pre-load (`package.json`), check whether `@storybook/react` is present. If yes, ship the smoke as a story under `frontend/stories/PatientProfileShell.tree-smoke.stories.tsx` instead of `/dev/shell-tree-smoke/page.tsx`. If no Storybook, the dev page is the right home.

7. **What about the `direction?` field's defaults?** The default is **alternation from parent**: root group = horizontal (the shell's outer orientation), its children = vertical, grandchildren = horizontal. The Telemed-Video template (cv2-03) overrides on the `middle-bottom` group to keep `Investigations-orders | Plan` as horizontal, matching the layout sketch. The `direction?` field is the escape hatch for that specific override; in 90% of cases, alternation is right.

8. **Could nested depth grow beyond 2 levels in Phase 1?** Theoretically yes (the renderer recurses without depth limit). In practice, the Telemed-Video template caps at 2 levels (column-vertical → bottom-horizontal). DL-3 in the source plan formalises the cap at 2 for Phase 1 readability and acceptance-gating. Depths > 2 are not blocked by the type or the renderer — they just aren't part of any template the source plan ships.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `frontend/lib/patient-profile/useShellLayout.ts` (cv2-02 modifies).
  - `frontend/components/patient-profile/CascadeHandle.tsx` (props unchanged).
  - `frontend/components/patient-profile/PatientProfilePage.tsx` (consumer contract unchanged).
- **Source decisions:** [Product plans/plan-cockpit-v2.md § R-SHELL + DL-1..DL-5, DL-22](../../../Product%20plans/plan-cockpit-v2.md).
- **Wave gate:** [`EXECUTION-ORDER-cockpit-v2.md` § Wave 1 gate](./EXECUTION-ORDER-cockpit-v2.md#wave-1-gate-after-cv2-01).
- **Predecessor batch invariants:** [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild.md](../../../13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild.md) — ppr DL-5 reserved this field; ppr-03 ESLint zone enforced content-agnosticism; ppr-08 / ppr-15a established the schema-migration pattern this task extends.
- **Next task:** [`task-cv2-02-layout-tree-state-and-persistence.md`](./task-cv2-02-layout-tree-state-and-persistence.md) — Wave 3, Lane α step 0. Fresh chat. Consumes the recursive renderer shipped by this task; rewrites `useShellLayout` for tree-aware persistence.
- **Parallel task in Wave 2:** [`task-cv2-04-soap-fields-migration.md`](./task-cv2-04-soap-fields-migration.md) — Lane α of Wave 2. Independent backend work; can start the moment this task ships.

---

**Owner:** TBD
**Created:** 2026-05-17
**Status:** Pending
