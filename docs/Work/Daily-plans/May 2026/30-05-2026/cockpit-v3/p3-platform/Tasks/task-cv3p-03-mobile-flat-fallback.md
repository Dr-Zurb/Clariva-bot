# cv3p-03 — Mobile flat fallback upgrade + reachable safety/send

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 3 — safety + platform](../plan-p3-cockpit-v3-platform-batch.md) |
| **Wave** | 2 (Lane A — after cv3p-01; shares `CockpitV3Shell`) |
| **Depends on** | cv3p-01 (settles the dock contract) |
| **Blocks** | cv3p-04 (gate) |
| **Size** | **S–M** |
| **Model** | **Auto** |
| **Decision locks** | v3-DL-8, P3-DL-1, P3-DL-6 |
| **R-item** | R-MOBILE3 |

---

## Objective

**Turn the minimal Phase-1 mobile stack into a real flat fallback with the controls that end a visit reachable** — no editor groups, no drag, on phones (`<lg`):

1. **Flat stacked view (v3-DL-8).** `<lg` renders the visible panes as a vertical scrolling stack of titled cards — **no `ResizablePanelGroup`, no DnD, no palette columns**. Phase 1's `CockpitMobileFallback` already does the bones (titled `<section>` per visible pane); polish it to the `MobilePillBar` lineage (tap targets ≥44px, safe-area inset, clean headers).
2. **Safety + send reachable (P3-DL-6 — the R-MOBILE3 delta).** The safety strip + a finish/send affordance must be **reachable** on mobile. Today the v3 mobile branch passes **no docks** (`CockpitV3Shell` L118–127 renders `<CockpitMobileFallback>` bare). Render the `safetyDock` (pinned top) + `actionDock` (pinned bottom) around the scrollable stack so a clash banner and "Send Rx & finish" are reachable without desktop editor groups.
3. **Hydration + empty-state parity.** The fallback reads the same persisted layout (shows the visible panes); shows the empty-state when nothing is visible; shows the loading skeleton until `hydrated`.
4. **No regression at `lg+`.** The desktop editor-group shell is unchanged.

## Why this task

Editor groups don't work on a phone (v3-DL-8), so v3 must fall back — but a fallback that drops the safety banner and the finish button isn't safe to ship to a doctor who sometimes opens a consult on mobile. The old shell sidestepped this by making mobile finish a header CTA (desktop-dock-only, pane-freedom P4-DL-5). v3's product plan is explicit that **safety strip + action footer remain reachable on mobile** (R-MOBILE3 acceptance), so this task deliberately surfaces the docks on mobile around the flat stack — a small, well-scoped divergence from the old shell that makes the flag turn-on-able for mobile users.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/CockpitMobileFallback.tsx` | **Edit** — accept optional `safetyDock?: ReactNode` + `actionDock?: ReactNode`; render `safetyDock` as a `shrink-0` pinned top band, the existing flat pane stack as the `flex-1` scroll region, and `actionDock` as a `shrink-0` pinned bottom band. Keep the skeleton + empty-state branches. Polish the pane cards toward the `MobilePillBar` lineage (tap targets, safe-area). **No DnD, no splits.** |
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit (thin)** — in the `!isLg` branch, pass `safetyDock`/`actionDock` (and `consultActive` if the footer needs it) into `<CockpitMobileFallback>`. The desktop branch is unchanged. |
| `frontend/components/patient-profile/v3/__tests__/CockpitMobileFallback.test.tsx` | **New** — `<lg` renders the flat stack (no `ResizablePanelGroup`, no drag attributes); safety + action docks render and are reachable; empty-state when nothing visible; skeleton until hydrated; `lg+` does not render the fallback. |

> **No edit to** `SafetyStickyStrip` / `PlanActionFooter` / `MobilePillBar` (reused; `MobilePillBar` is the *lineage reference*, not necessarily mounted here) or any engine/state file.

> **Import discipline (P0-DL-4):** model/types via `foundation.ts`; kept UI (`SafetyStickyStrip`/`PlanActionFooter`) flow in as the `safetyDock`/`actionDock` nodes from the page — the fallback just slots them, it does not import them.

## Implementation sketch

### CockpitMobileFallback — docks around the flat stack

```tsx
export interface CockpitMobileFallbackProps {
  panes: PaneDefinition[];
  layout: CockpitV3Layout;
  safetyDock?: ReactNode;   // NEW
  actionDock?: ReactNode;   // NEW
}

return (
  <div data-testid="cockpit-v3-mobile-fallback" className="flex h-full min-h-0 flex-col">
    {safetyDock ? <div className="shrink-0">{safetyDock}</div> : null}
    <div className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-3 p-3">
      {visiblePaneIds.map((paneId) => (/* titled <section> per pane — unchanged bones */))}
    </div>
    {actionDock ? <div className="shrink-0">{actionDock}</div> : null}
  </div>
);
```

- Keep the **skeleton** (`!layout.hydrated`) and **empty-state** (`visiblePaneIds.length === 0`) branches — but ensure the docks still render around the empty-state so safety/send are reachable on a blank mobile canvas too (mirror the desktop blank-canvas rule from cv3p-01).
- Cards keep `min-h-[44px]`-class tap ergonomics (MobilePillBar lineage); preserve the `data-cockpit-mobile-pane` hook.

### CockpitV3Shell — pass docks into the mobile branch

```tsx
if (!isLg) {
  return (
    <div data-testid="p1-cockpit-v3-shell-mobile" className="flex h-full min-h-0 w-full flex-col">
      <CockpitMobileFallback
        panes={panes}
        layout={layout}
        safetyDock={safetyDock}    // NEW
        actionDock={actionDock}    // NEW
      />
    </div>
  );
}
```

> The docks are the same `ReactNode`s the page already passes (`<SafetyStickyStrip …/>` / `<PlanActionFooter …/>`); no new prop plumbing from the page. Mobile still renders **no `<CockpitDndContext>`** and no palette columns (v3-DL-8 / P3-DL-1).

## Tests (`CockpitMobileFallback.test.tsx`)

- [x] **Flat, no DnD** → `<lg` renders titled pane sections; no `ResizablePanelGroup`, no `useDraggable`/droppable attributes, no palette toggle row.
- [x] **Safety + send reachable** → passing `safetyDock`/`actionDock` renders them around the stack; both are in the document and not inside any DnD context.
- [x] **Empty-state** → no visible panes → empty-state shows, docks still present.
- [x] **Skeleton** → `!hydrated` → loading skeleton.
- [x] **`lg+` unaffected** → at `lg+` the shell renders the desktop editor-group path, not the fallback (assert via the media-query mock).

## Acceptance criteria

- [x] `<lg` renders the flat stacked fallback — no splits, no DnD, no palette columns (v3-DL-8).
- [x] Safety strip + a finish/send affordance are reachable on mobile (P3-DL-6).
- [x] `lg+` renders the editor-group shell unchanged (no regression).
- [x] Mobile hydrates from the same persisted layout; shows empty-state / skeleton correctly.
- [x] Mobile renders no `<CockpitDndContext>` and no drag affordances (P3-DL-1 / v3-DL-8).
- [x] Flag off → unchanged. `npx tsc --noEmit` + `npm run lint` clean; the new suite green.

## Out of scope (explicit)

- Chrome desktop verification → cv3p-01. Persistence → cv3p-02.
- Touch DnD / editor groups / splits on mobile → OUT forever (v3-DL-8).
- Re-implementing `MobilePillBar`'s sheet/room-mounted behaviour — it's a *lineage reference* for ergonomics; this task renders the docks + flat stack, it does not port the pill/sheet model unless cv3p-01's footer needs a sheet to be usable on a small screen (then keep it minimal).
- Mobile-specific telemetry.

## Decision log

- **Surface the docks on mobile (deliberate divergence).** The old shell was desktop-dock-only with a header-CTA finish (P4-DL-5). v3's R-MOBILE3 explicitly requires safety + send *reachable on mobile*, so v3 renders the docks around the flat stack. This is a v3 product choice, scoped here and locked as P3-DL-6 — it does not change the old shell.
- **Polish, don't replace.** Phase 1's `CockpitMobileFallback` already has the right bones (flat, titled sections, hydration/empty-state). The task adds the docks + ergonomic polish rather than a rewrite, keeping it S–M.
- **Lane A, after cv3p-01.** Both edit `CockpitV3Shell`; serialising avoids a merge fight and lets the dock contract settle in cv3p-01 first.

## References

- [`frontend/components/patient-profile/v3/CockpitMobileFallback.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitMobileFallback.tsx) — the Phase-1 flat stack (skeleton + empty-state branches to preserve).
- [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — the `!isLg` branch (L118–127) that currently passes no docks.
- [`frontend/components/patient-profile/MobilePillBar.tsx`](../../../../../../frontend/components/patient-profile/MobilePillBar.tsx) — mobile ergonomics lineage (≥44px tap targets, safe-area inset, sheet pattern).
- [`frontend/components/cockpit/middle/SafetyStickyStrip.tsx`](../../../../../../frontend/components/cockpit/middle/SafetyStickyStrip.tsx) + [`PlanActionFooter.tsx`](../../../../../../frontend/components/cockpit/middle/PlanActionFooter.tsx) — the dock nodes (passed from the page, slotted here).
- Batch: [`plan-p3-cockpit-v3-platform-batch.md`](../plan-p3-cockpit-v3-platform-batch.md) · Order: [`EXECUTION-ORDER-p3-cockpit-v3-platform.md`](./EXECUTION-ORDER-p3-cockpit-v3-platform.md).

---

**Status:** `Done` (2026-05-31). Mobile fallback pins safety/action docks around flat stack; `CockpitMobileFallback.test.tsx` green (5 tests); tsc + lint clean.
