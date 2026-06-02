# cpfc-04 · Cramped-layout soft warning + layout-shape telemetry

> **Wave 2** of [p3-cockpit-pane-freedom-customize](../plan-p3-cockpit-pane-freedom-customize-batch.md). The layout-health nudge + the "what shape did they build" signal. Closes the Phase 3 build work.

| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | cpfc-02 (mounts into its bar), cpfc-03 | **Blocks** | — |

---

## Why this task

The pane-freedom vision (Phase 1, DL-3.1) promised a **soft** guardrail: when a doctor packs too many panes into one row, nudge them — but never block. The threshold is **> 5 horizontal siblings at the root split**. This is a hint, not a constraint (P3-DL-6): the doctor can ignore it and keep going.

Separately, the Phase 1 plan's Phase 3 line calls for **telemetry on layout shapes** — we want to learn what cockpit shapes doctors actually build (how many leaves, how many tab containers, how wide the root row gets) without instrumenting every drop. The natural sampling moment is **when the doctor exits customize mode** — they're done arranging, so the shape is "settled."

Both read the same tree; both share one threshold constant.

---

## What to do

### 1. Pure helper in `frontend/lib/patient-profile/layout-tree.ts`

```ts
/** DL-3.1 / P3-DL-6: a root row wider than this many horizontal siblings is "cramped". */
export const CRAMPED_ROOT_SIBLINGS = 5;

export interface LayoutShape {
  /** Number of leaf containers (a multi-tab leaf counts once). */
  leafCount: number;
  /** Leaf containers holding more than one pane (i.e. tab strips). */
  tabContainers: number;
  /** Horizontal children directly under the root (1 when the root isn't a horizontal split). */
  maxRootSiblings: number;
}

/** Describe the shape of a live PaneTreeNode for the layout_shape telemetry signal. */
export function describeLayoutShape(root: PaneTreeNode): LayoutShape {
  let leafCount = 0;
  let tabContainers = 0;
  const walk = (n: PaneTreeNode): void => {
    if (n.children && n.children.length > 0) {
      n.children.forEach(walk);
      return;
    }
    leafCount += 1;
    if ((n.paneIds?.length ?? 1) > 1) tabContainers += 1;
  };
  walk(root);
  const maxRootSiblings =
    root.children && root.children.length > 0 && root.direction === "horizontal"
      ? root.children.length
      : 1;
  return { leafCount, tabContainers, maxRootSiblings };
}

/** True when the root row exceeds the soft cramped threshold (DL-3.1). */
export function isLayoutCramped(root: PaneTreeNode): boolean {
  return describeLayoutShape(root).maxRootSiblings > CRAMPED_ROOT_SIBLINGS;
}
```

> Unit-test `describeLayoutShape` against: a single-leaf tree (`{leafCount:1, tabContainers:0, maxRootSiblings:1}`); the canonical 3-column horizontal root (`maxRootSiblings:3`); a 6-wide root (`maxRootSiblings:6`, `isLayoutCramped → true`); a vertical root (`maxRootSiblings:1`); a leaf with `paneIds:["a","b"]` (`tabContainers:1`).

### 2. Reactive cramped nudge, mounted into the bar's `warningSlot`

The page already holds a reactive `LayoutNode` in `currentLayoutTree` (set via `onLayoutTreeChange`). A `LayoutNode` root and a `PaneTreeNode` root both expose `direction` + `children`, so the root-row count is the same number on either shape. Compute the nudge reactively off `currentLayoutTree`, reusing the shared threshold constant:

```tsx
// PatientProfilePage.tsx
const isCramped = useMemo(() => {
  const root = currentLayoutTree ?? templateLayoutTree;
  return (
    root?.kind === "split" &&
    root.direction === "horizontal" &&
    root.children.length > CRAMPED_ROOT_SIBLINGS
  );
}, [currentLayoutTree, templateLayoutTree]);

// Per-session dismiss (P3-DL-6) — not persisted; resets on reload with the rest.
const [crampedDismissed, setCrampedDismissed] = useState(false);
```

Pass the nudge into the bar (cpfc-02 reserved `warningSlot`):

```tsx
<CustomizeBar
  // ...cpfc-02 props...
  warningSlot={
    isCramped && !crampedDismissed ? (
      <LayoutCrampedNudge onDismiss={() => setCrampedDismissed(true)} />
    ) : null
  }
/>
```

`<LayoutCrampedNudge>` is a tiny inline element (co-locate in `CustomizeBar.tsx` or a small component):

```tsx
function LayoutCrampedNudge({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="status" className="flex items-center gap-2 text-xs text-warning-foreground">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
      <span>This row is getting cramped — consider stacking some panes as tabs.</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
```

> `TriangleAlert` + `X` are in `lucide-react`. The nudge **never** blocks a drop or a save — it's pure advice (P3-DL-6). Dismiss is per-session.

### 3. Emit `layout_shape` telemetry on customize-OFF

Extend cpfc-01's `handleToggleCustomizeMode` so that **when turning OFF**, it samples the settled shape from the live `PaneTreeNode`:

```tsx
const handleToggleCustomizeMode = useCallback(
  (source: "button" | "hotkey") => {
    setCustomizeMode((prev) => {
      const next = !prev;
      trackCockpitPaneFreedomCustomizeToggled({ enabled: next, source });
      if (!next) {
        // Turning OFF — sample the shape the doctor settled on.
        const paneTree = shellRef.current?.getPaneTree();
        if (paneTree) trackCockpitPaneFreedomLayoutShape(describeLayoutShape(paneTree));
      }
      return next;
    });
  },
  [],
);
```

> Use `getPaneTree()` (the v5 `PaneTreeNode`, tab-aware) for the telemetry sample — not `getLayoutTree()` (the `LayoutNode`, which has no tab info). Fire it once per customize-off, NOT per drop.

### 4. Telemetry in `frontend/lib/patient-profile/telemetry.ts`

```tsx
export function trackCockpitPaneFreedomLayoutShape(payload: {
  leafCount: number;
  tabContainers: number;
  maxRootSiblings: number;
}): void {
  track("cockpit_pane_freedom.layout_shape", payload);
}
```

### 5. Verify

```powershell
cd frontend
npx tsc --noEmit
npm test lib/patient-profile/__tests__/layout-tree.test.ts
npm run lint
```

---

## Acceptance gate

- [x] `describeLayoutShape` + `isLayoutCramped` + `CRAMPED_ROOT_SIBLINGS` added to `layout-tree.ts` with unit coverage (single leaf, 3-wide, 6-wide cramped, vertical root, tab-container counting).
- [x] The customize bar shows a dismissible nudge when the root has **> 5 horizontal siblings** (P3-DL-6 / DL-3.1); the nudge is reactive (updates as the layout changes).
- [x] The nudge **never** blocks a drop, save, or any layout; dismiss is per-session (not persisted).
- [x] `cockpit_pane_freedom.layout_shape` `{ leafCount, tabContainers, maxRootSiblings }` fires **once** when customize mode is turned off (sampled from `getPaneTree()`), never per-drop.
- [x] `cd frontend; npx tsc --noEmit` + the new `layout-tree` shape test rows clean.

---

## Anti-goals

- ❌ Don't make the warning a hard block — it's a soft, dismissible nudge (P3-DL-6).
- ❌ Don't persist the dismiss state — per-session only.
- ❌ Don't count nested-split horizontal siblings — DL-3.1 is the ROOT row only.
- ❌ Don't fire `layout_shape` on every drop — once, on customize-off.
- ❌ Don't sample the shape from `getLayoutTree()` (LayoutNode, no tabs) — use `getPaneTree()`.

---

## Risks (executor-facing)

- **Shape source mismatch.** The reactive nudge reads the root-row count off `currentLayoutTree` (LayoutNode); the telemetry reads the full shape off `getPaneTree()` (PaneTreeNode). Both must use `CRAMPED_ROOT_SIBLINGS` so the "is it cramped" definition can't drift between the nudge and any future gate.
- **Nudge thrash.** If `currentLayoutTree` updates on every resize tick the nudge could flicker. It only needs to react to structural changes (sibling count), and `onLayoutTreeChange` fires on structure/order, not resize ticks (see the `shellPaneOrder` comment) — verify a resize drag doesn't toggle the nudge.
- **Dismiss semantics.** "Per-session" = until reload. If the doctor dismisses, un-cramps, then re-cramps, the nudge stays dismissed (by design — don't nag). Confirm this matches the intended behaviour; if not, reset `crampedDismissed` when `isCramped` goes false.
