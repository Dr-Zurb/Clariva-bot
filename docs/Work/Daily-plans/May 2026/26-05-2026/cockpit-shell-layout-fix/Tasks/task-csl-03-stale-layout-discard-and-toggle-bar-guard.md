# csl-03 · Discard stale persisted layouts + guard toggle bar against stale IDs

> Companion hotfix to [`csl-01`](./task-csl-01-restore-column-shell-and-flex-chain.md) and `csl-02` (PaneToggleBar `lg`→`md` + pane-icon SoT extension). Targets the **invisible toggle bar after page hydration** that affected legacy v1 cockpit users in Chrome.

| Property | Value |
|---|---|
| **Status** | ⏳ Ready (code landed; smoke pending user reload) |
| **Owner** | Frontend |
| **Size** | XS (~50 LOC across 3 files + 9 unit tests) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | — (independent of csl-01 / csl-02) |
| **Blocks** | Anyone who saw "icons appear during loading, disappear after" |

---

## Why this exists

2026-05-26 Chrome dogfood: `<PaneToggleBar>` rendered 8 icons briefly during the page load, then collapsed to an invisible 2px-wide pill once hydration completed. Console showed:

```
[PaneToggleBar] paneOrder contains id "rx" with no matching PaneDefinition — skipping.
[PaneToggleBar] paneOrder contains id "chart" with no matching PaneDefinition — skipping.
[PaneToggleBar] paneOrder contains id "body" with no matching PaneDefinition — skipping.
```

Firefox + Edge were unaffected because their localStorage was fresh (never used during the v1 cockpit era).

---

## Root cause

```js
// Chrome DevTools snapshot at steady state
{
  exists: true,
  innerWidth: 870,
  classList: 'hidden md:inline-flex items-center gap-0.5 …',
  computedDisplay: 'inline-flex',
  childButtons: 0,   // ← the bar IS rendered, just empty
}
```

The toggle bar was rendering as expected; it had **zero children** because every persisted pane id was filtered out at the per-button render step:

```197:233:frontend/components/patient-profile/PaneToggleBar.tsx
  return (
    <TooltipProvider delayDuration={150}>
      <div role="toolbar" aria-label="Pane visibility" …>
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {paneOrder.map((id) => {
            const pane = paneById.get(id);
            if (!pane) {
              console.warn(`[PaneToggleBar] paneOrder contains id "${id}" with no matching PaneDefinition — skipping.`);
              return null;
            }
            …
```

The hydration race:

1. **Initial render:** `shellPaneOrder = []` in the consumer → fallback to `defaultLeafPaneOrder` (current template) → 8 buttons render → **bar visible**.
2. **After `useShellLayout`'s hydration `useEffect` fires:** `paneOrder` is reconstructed from the persisted v4 `paneTree`. The persisted IDs are stale v1 cockpit IDs (`chart`, `body`, `rx`) — migrated forward by schema (`v2 → v3 → v4`) but **never renamed**.
3. **Shell re-emits `onLayoutChange(paneOrder, paneState)`** → `shellPaneOrder` becomes `['chart', 'body', 'rx']`.
4. **Consumer's fallback** (`shellPaneOrder.length > 0 ? shellPaneOrder : defaultLeafPaneOrder`) prefers the persisted (now stale) IDs over the current template's defaults.
5. PaneToggleBar iterates `['chart', 'body', 'rx']`, looks each up in the current v2 template's `paneById` (`{snapshot, history, assessment, investigations-orders, plan, subjective, objective, …}`), finds none, returns 0 buttons → **bar invisible** (~2px of padding only).

`validateLayout` accepts the stale tree because schema is intact (`version: 4`, valid `paneTree`, every sizePct in range, every hidden boolean). It only checks the **shape**, never the **vocabulary**.

---

## What to do

Two layers of defense — both shipped.

### 1. Discard stale layouts at the source (`useShellLayout`)

Adds an `isLayoutAlignedWith(layout, knownLeafIds)` exported helper, a `knownLeafIds?: readonly string[]` option on `UseShellLayoutOptions`, and a discard step inside the hydration effect: if `knownLeafIds.size > 0` AND zero leaf ids in the persisted tree intersect that set, the layout is thrown away **and** the stale localStorage entries (v4 key + every legacy key) are removed so the next write seeds defaults.

Key bits:

```ts
export function isLayoutAlignedWith(
  layout: PatientProfileLayout,
  knownLeafIds: ReadonlySet<string> | readonly string[],
): boolean {
  const known = knownLeafIds instanceof Set ? knownLeafIds : new Set(knownLeafIds);
  if (known.size === 0) return true;             // empty set = "no template advertised" → preserve legacy behavior
  const { paneOrder } = paneTreeToFlat(layout.paneTree);
  for (const id of paneOrder) if (known.has(id)) return true;
  return false;
}
```

```ts
if (
  validated &&
  knownLeafIdsSet.size > 0 &&
  !isLayoutAlignedWith(validated, knownLeafIdsSet)
) {
  try {
    window.localStorage.removeItem(v4Key);
    for (const key of storageKeysToRead) {
      window.localStorage.removeItem(v4TreeLayoutStorageKey(key));
      window.localStorage.removeItem(key);
    }
  } catch { /* ignore */ }
  console.info("[useShellLayout] discarded stale persisted layout …");
  validated = null;
}
```

Wired from `Shell.tsx`:

```tsx
} = useShellLayout({
  storageKey,
  legacyStorageKeys,
  defaultPaneOrder: defaultFlat.paneOrder,
  defaultPaneState: defaultFlat.paneState,
  // csl-03: pass the current template's leaf ids so hydration discards
  // persisted layouts whose ids no longer exist.
  knownLeafIds: defaultFlat.paneOrder,
});
```

### 2. Belt-and-braces guard at the consumer (`PatientProfilePage`)

Even with #1, there's a window between initial render and hydration where `shellPaneOrder` could (in theory) contain stale ids. The consumer now filters the persisted order against the current template before deciding the fallback:

```tsx
const toggleBarPaneOrder = useMemo(() => {
  const known = new Set(toggleBarPanes.map((p) => p.id));
  if (shellPaneOrder.length === 0) return defaultLeafPaneOrder;
  return shellPaneOrder.some((id) => known.has(id))
    ? shellPaneOrder
    : defaultLeafPaneOrder;
}, [shellPaneOrder, toggleBarPanes, defaultLeafPaneOrder]);
```

Used at the JSX site:

```tsx
<PaneToggleBar
  panes={toggleBarPanes}
  paneOrder={toggleBarPaneOrder}
  paneState={shellPaneState}
  …
/>
```

### 3. Tests

`frontend/lib/patient-profile/__tests__/useShellLayout.test.ts` — 9 new tests across 2 describe blocks:

**`isLayoutAlignedWith`** (4 tests, pure function):
- returns true when at least one leaf id is in the known set
- returns false when no leaf id intersects
- accepts both ReadonlySet and readonly array inputs
- treats an empty known set as "no template advertised" and returns true

**`useShellLayout — knownLeafIds hydration guard (csl-03)`** (5 tests, with `renderHook`):
- discards a persisted layout whose leaf ids do NOT intersect the current template
- keeps a persisted layout when at least one leaf id matches (partial overlap preserved)
- preserves legacy behavior when `knownLeafIds` is omitted
- treats an empty `knownLeafIds` as "no template advertised" (no discard)
- also clears legacy v3 keys so re-hydration cannot resurrect stale ids

> The 4 `isLayoutAlignedWith` pure tests were verified green locally (`3.49s, 4 passed | 53 skipped`). The 5 hook-level tests follow the exact pattern of the existing `useShellLayout — localStorage persistence` block in the same file; they ship with the change but local vitest hung mid-suite on a heavily-loaded box. Re-run on CI to confirm.

---

## Files touched

| File | Lines | Change |
|---|---|---|
| `frontend/lib/patient-profile/useShellLayout.ts` | +~70 / -0 | Add `isLayoutAlignedWith`, `knownLeafIds` option, discard step in hydration effect |
| `frontend/components/patient-profile/Shell.tsx` | +5 / -0 | Pass `knownLeafIds: defaultFlat.paneOrder` to `useShellLayout` |
| `frontend/components/patient-profile/PatientProfilePage.tsx` | +12 / -3 | New `toggleBarPaneOrder` memo with intersection guard; JSX now uses it |
| `frontend/lib/patient-profile/__tests__/useShellLayout.test.ts` | +~180 / -0 | 9 new tests |

---

## Acceptance gate

- [x] `tsc --noEmit` clean for the files touched (pre-existing unrelated errors in `VoiceConsultRoom.tsx`, `share-target-bridge.ts`, `use-tab-presence-claim.ts` are out of scope).
- [x] `eslint` clean.
- [x] `isLayoutAlignedWith` 4 pure tests green locally.
- [ ] Hook-level 5 tests need to re-run on CI (local vitest hung due to system load).
- [ ] **Manual smoke (user-driven):** open the cockpit in Chrome with the stale localStorage. Reload. Expected behaviour:
  - First reload after this patch: console logs `[useShellLayout] discarded stale persisted layout — no leaf ids matched the current template` (once).
  - Toggle bar shows 8 distinct icon buttons that **stay visible** after page hydration completes — no longer disappears.
  - Reload a second time: no warning (localStorage was reset to clean v2 ids on the first reload's write).

---

## Anti-goals

- ❌ Don't expand the migration to "rename" stale ids to new ones. Cleanest path is discard → reseed; renaming makes assumptions about pane equivalence (`chart`→? has no clean answer when v1's `chart` was actually 3 v2 panes).
- ❌ Don't move the discard into `validateLayout`. That function is "schema OK?" — vocabulary is a separate concern with a different input set (`knownLeafIds`). Keeping them factored apart preserves unit-testability.
- ❌ Don't drop the consumer guard once the hydration discard ships. Belt-and-braces is cheap and protects against future regressions where someone re-introduces stale ids (e.g. a preset import without validation).
- ❌ Don't bundle this with `cnc` / `ppd` / `cpv` work. This is a pure correctness hotfix to the chrome of the shell — orthogonal to today's polish batches.

---

## Capture-inbox (append at close)

```md
- [ ] [csl follow-up] Add the same `knownLeafIds` discard to layout-tree-preset import (clpm-04). A user importing a v1-shape preset JSON would resurrect the same stale-id problem; the import path should validate against the current template's known ids too. (Source: docs/Work/Daily-plans/May 2026/26-05-2026/cockpit-shell-layout-fix/Tasks/task-csl-03-stale-layout-discard-and-toggle-bar-guard.md)
- [ ] [csl follow-up] Surface "Your saved layout was reset because the cockpit was upgraded" as a soft toast via `layoutUxToast.info(…)` on first discard. Right now the user sees the bar reset silently. (Source: same)
- [ ] [csl follow-up] Telemetry — fire `cockpit.layout.stale_discarded` once per discard so we can size the impacted user population pre-cleanup. (Source: same)
- [ ] [csl follow-up] Re-run the full vitest suite on a quieter machine — local run hung on heavy node-process backlog mid-suite. (Source: same)
```

---

## Notes

- The single root cause behind two visible symptoms ("toggle bar invisible in Chrome" + "no icons after hard reload") was the same: stale v1 ids in localStorage outliving the v1 → v2 cockpit rebuild. csl-02 (lg → md breakpoint, pane-icon SoT extension) was orthogonal — that fix unblocked viewports 768–1023px but did NOT address the stale-ids race. This task closes the second half of the bug.
- "Edge works but Chrome doesn't" was misleading — Edge and Chrome share Blink/Chromium engine, so behavior is identical at the renderer level. The actual asymmetry was localStorage state: the user had used Chrome during v1, Firefox + Edge only after the v2 cutover.
- This task does NOT need a plan doc — single-task hotfix mirroring csl-01's shape.
