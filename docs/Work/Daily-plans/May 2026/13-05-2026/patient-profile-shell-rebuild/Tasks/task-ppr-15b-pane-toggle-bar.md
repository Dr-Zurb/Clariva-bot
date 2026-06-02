# Task ppr-15b: `<PaneToggleBar>` component (mini-layout map)

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 4.5, Lane α step 1 — **M, ~1.5h**

---

## Task overview

Build the **`<PaneToggleBar>`** — the central UI surface that replaces the strip+chevron model.

It's a **mini layout map** sitting in the center of `<CockpitHeader>`:

- Renders one icon+label button per pane in `paneOrder`.
- Click an icon → toggles that pane's `hidden` bit (calls `setPaneHidden(id, !hidden)` on the shell).
- Drag an icon left/right → reorders the column it represents (calls `reorderPane(fromId, toId)` on the shell).
- Visual states: visible / hidden / dragging / drop-target.
- Mobile (`<lg`) hides the bar — `<MobilePillBar>` continues to own the small-viewport layout.

This task **does not mount** the bar anywhere yet (that's ppr-15c). ppr-15b ships the standalone component + tests; ppr-15c wires it into `<CockpitHeader>` + `<PatientProfilePage>`.

**Estimated time:** ~1.5h.

**Status:** Done.

**Hard deps:** ppr-15a (`PaneDefinition.icon` field exists; `setPaneHidden` API exists).

**Source:** Mid-batch amendment in [plan-patient-profile-shell-rebuild-batch.md § Mid-batch amendment](../plan-patient-profile-shell-rebuild-batch.md#mid-batch-amendment-toggle-bar-redesign-ppr-15), Decision Q3 (toggle bar is a mini layout map).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- [`frontend/components/consultation/cockpit/MobilePillBar.tsx`](../../../../../../frontend/components/consultation/cockpit/MobilePillBar.tsx) — the mobile precedent. Same pattern (icon + label + `aria-pressed` + tap-to-toggle). The desktop bar is the same idea minus the bottom Sheet.
- [`frontend/lib/patient-profile/types.ts`](../../../../../../frontend/lib/patient-profile/types.ts) — for `PaneDefinition` (post-ppr-15a, so `icon` exists).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — the `<PaneHeader>` drag/drop pattern (dnd-kit `useDraggable` + `useDroppable`); the toggle bar reuses the same pattern.
- [`frontend/components/ui/button.tsx`](../../../../../../frontend/components/ui/button.tsx) (or wherever the design-system button lives) — to match the existing button visual language.

**Estimated turns:** 4-6 turns. New file + tests + design-system styling. No integration.

---

## Acceptance criteria

### New component: `frontend/components/patient-profile/PaneToggleBar.tsx`

- [x] Create the file with the following shape:

  ```tsx
  "use client";

  import { useCallback } from "react";
  import {
    DndContext,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
  } from "@dnd-kit/core";
  import type { PaneDefinition, PaneRuntimeState } from "@/lib/patient-profile/types";
  import { cn } from "@/lib/utils";

  export interface PaneToggleBarProps {
    /** All panes in the user's preferred order. Drives the icon order. */
    panes: PaneDefinition[];
    /** Live pane order from the shell — matches `panes.map(p => p.id)` after reorders. */
    paneOrder: string[];
    /** Live per-pane runtime state — used to compute `hidden` per pane. */
    paneState: Record<string, PaneRuntimeState>;
    /** Toggle a pane's hidden bit. Forwards to the shell's `setPaneHidden`. */
    onToggleHidden: (paneId: string) => void;
    /** Reorder one pane onto another's slot. Forwards to the shell's `reorderPane`. */
    onReorder: (fromId: string, toId: string) => void;
    /** Optional className for the outer wrapper. */
    className?: string;
    /**
     * Optional hook fired BEFORE a toggle that would HIDE a pane. Returning
     * `false` cancels the toggle; returning `true` (or undefined) lets it proceed.
     * Used by ppr-15e to gate hiding the Consultation pane during a live call.
     */
    onBeforeHide?: (paneId: string) => boolean | undefined;
  }

  export default function PaneToggleBar({ ... }: PaneToggleBarProps): JSX.Element { ... }
  ```

### Visual states (Tailwind classes — match the design system)

- [x] Each toggle is a `<button type="button">` with:
  - `min-h-9 px-3 py-1.5 text-sm font-medium rounded-md transition-colors`
  - `inline-flex items-center gap-2`
  - Visible: `bg-primary/10 text-primary border border-primary/30`
  - Hidden: `bg-transparent text-muted-foreground border border-transparent hover:bg-muted`
  - Hover (visible OR hidden): `hover:bg-primary/15`
  - Focus: `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background`
  - Dragging: `opacity-40`
  - Drop target (drag-over): `ring-2 ring-primary ring-offset-2`

- [x] Icon: `<Icon className="h-4 w-4 shrink-0" aria-hidden />` where `Icon = pane.icon`. If a pane omits `icon`, fall back to a generic dot or `LayoutGrid` icon — never crash.

- [x] Label: `<span className="hidden lg:inline">{pane.title}</span>` — at lg+ show the label, below lg the bar is hidden entirely (mobile uses `<MobilePillBar>`). Add `xl:inline` if we want to keep label visible on lg too — see Q10 below.

- [x] `aria-pressed={!hidden}` on every button (states: `true` = pane visible, `false` = pane hidden).

- [x] `aria-label={hidden ? \`Show ${pane.title}\` : \`Hide ${pane.title}\`}` — screen-reader friendly.

### Outer container

- [x] Outer `<div role="toolbar" aria-label="Pane visibility">` — wraps the buttons. Tailwind: `flex items-center gap-1 rounded-lg border bg-card p-1`.

- [x] Hidden below lg via `hidden lg:flex` — mobile keeps `<MobilePillBar>`.

### Drag-to-reorder (mirrors `<PaneHeader>` from `Shell.tsx`)

- [x] Wrap the row of buttons in a `<DndContext>` with `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))`. Same activation distance as `<PaneHeader>` so a click doesn't accidentally start a drag.

- [x] Each button is BOTH a `useDraggable({ id: \`toggle-drag-${paneId}\` })` AND a `useDroppable({ id: \`toggle-drop-${paneId}\` })`. The data payload is `{ paneId }` for both.

- [x] On `onDragEnd`: if `from.paneId !== to.paneId`, call `onReorder(from.paneId, to.paneId)`.

- [x] **Important:** the `<DndContext>` here is INDEPENDENT of `<Shell>`'s. Reorders happen via the same `reorderPane` callback (the shell's hook setter), so both sources of drag-reorder converge on the same state. **Both DndContexts must share `useSensor`'s activation distance** (8px) for consistent UX.

### Toggle behaviour

- [x] On button click:
  1. If the button is currently in the visible state AND the click would HIDE it: call `onBeforeHide?.(paneId)` if supplied. If it returns `false`, abort.
  2. Call `onToggleHidden(paneId)`. The shell flips the bit; the visual state updates on next render.

- [x] **Do not** call `onToggleHidden` during a drag — the dnd-kit pointer event bubbles after a successful drop. Use the `useDraggable` hook's `isDragging` to gate the click handler:
  ```tsx
  const handleClick = () => {
    if (isDragging) return;
    if (!hidden && onBeforeHide?.(paneId) === false) return;
    onToggleHidden(paneId);
  };
  ```

### Visual order matches `paneOrder`

- [x] The buttons render in the order of `paneOrder` (NOT in the order of the `panes` array). Resolution: build a `Map<id, PaneDefinition>` from `panes`, then iterate `paneOrder` and look up each definition.

- [x] If a `paneOrder` entry has no matching `PaneDefinition` (defensive — shouldn't happen), skip it and `console.warn`.

- [x] If a `PaneDefinition` exists but isn't in `paneOrder` (also defensive), skip it.

### Q10 overflow handling — narrow viewports

- [x] At lg (≥ 1024px) the buttons render with icon + label.
- [x] At md (768-1023px) the bar is hidden entirely (mobile pill bar takes over per DL-11).
- [x] **Future-proofing:** at any width where the parent's allocated space is < `panes.length * 140px`, the buttons SHOULD render icon-only with the label moved to a `title` attribute for hover tooltip. **For ppr-15b**, with 3 panes in the 600-800px center slot, this isn't needed. Add a TODO comment noting Q10's icon-only-on-overflow strategy will be wired when a 4th+ pane lands.

### Tests

- [x] New test file: `frontend/components/patient-profile/__tests__/PaneToggleBar.test.tsx`. Cover:
  1. **Renders one button per pane in `paneOrder`** — assert button count matches `paneOrder.length`.
  2. **`aria-pressed=true` for visible panes, `false` for hidden** — assert correct ARIA state per pane.
  3. **Click on a visible pane fires `onToggleHidden(paneId)`** — assert callback called with correct id.
  4. **Click on a hidden pane fires `onToggleHidden(paneId)`** — same.
  5. **`onBeforeHide` returning `false` cancels the toggle** — visible-pane click + `onBeforeHide` mock returning `false` → `onToggleHidden` NOT called.
  6. **`onBeforeHide` is NOT called when toggling FROM hidden TO visible** — only blocks hide path.
  7. **Reorder via drag fires `onReorder(fromId, toId)`** — simulate dnd-kit `onDragEnd` with mismatched data, assert callback fires. (Use `@testing-library/react` + the existing dnd-kit testing pattern from `<PaneHeader>` tests.)
  8. **Buttons render in `paneOrder` order, not `panes` array order** — supply `panes` in [chart, body, rx] but `paneOrder` in [rx, body, chart]; assert DOM order is rx → body → chart.
  9. **Icon falls back to generic when `pane.icon` is undefined** — render a pane with no icon, assert no crash + a fallback icon is rendered.

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] `pnpm --filter frontend vitest run components/patient-profile/__tests__/PaneToggleBar` — all green (10/10).

### Manual smoke

- [ ] **Standalone smoke (optional, recommended):** Add a temporary mount in a Storybook-style page or just in `app/dashboard/dev-sandbox/page.tsx` (gitignored) — render `<PaneToggleBar>` with mocked panes/state/handlers. Confirm:
  - Three buttons render with icon + label.
  - Click toggles visible / hidden state (visual change immediate).
  - Drag one button onto another swaps positions.
  - No console errors.

  Remove the sandbox mount before pushing.

---

## Out of scope

- **Mounting the bar in `<CockpitHeader>` or `<PatientProfilePage>`.** That's ppr-15c.
- **Slim-down of `<PatientProfileShell>` (deleting strips/chevrons/absorber/spacer).** That's ppr-15c.
- **The live-consult `onBeforeHide` callback's actual implementation.** ppr-15b only exposes the prop; ppr-15e supplies the implementation.
- **Hotkey rewiring (`Cmd/Ctrl+1/2/3`).** That's ppr-15d.
- **Preset model B (apply auto-toggles).** That's ppr-15d.
- **Walk-in mode toggle bar variant.** Walk-in is out of scope for the whole batch (Q8).

---

## Files expected to touch

**New:**
- `frontend/components/patient-profile/PaneToggleBar.tsx` (~120 LOC).
- `frontend/components/patient-profile/__tests__/PaneToggleBar.test.tsx` (~150 LOC).

**Modified:** none.

**Tests:** ~9 new cases.

---

## Notes / open decisions

1. **Why a SECOND DndContext (one in toggle bar, one in shell)?** They could share, but coupling them means the toggle bar can't be unit-tested without mounting the shell. Independent DndContexts both call `reorderPane` on the shared hook — same state, two sources. The cost is ~3KB of duplicated dnd-kit runtime; the benefit is composability + testability. Worth it.
2. **Why icon-only at narrow widths instead of overflow scroll?** Per Q10 in the design discussion: doctors should never need to scroll to find a pane toggle. Icon-only with hover tooltip preserves "all panes visible at a glance".
3. **Why `aria-pressed` instead of `aria-checked`?** `aria-pressed` is the canonical pattern for toggle-button visibility per WAI-ARIA Authoring Practices. `aria-checked` is for switches/checkboxes that have semantic on/off state outside the visual context.
4. **Why pass `panes` AND `paneOrder` separately?** `paneOrder` may not match `panes.map(p => p.id)` because the shell's hook reorders panes independently. Passing both lets the bar render in the live order while looking up icon/title from the static definition.
5. **What happens if `panes` is empty?** Render nothing. Don't crash. (Edge case for future N-pane layouts where every pane is conditionally filtered out.)

---

## References

- **Affected files:**
  - new `frontend/components/patient-profile/PaneToggleBar.tsx`
  - new `frontend/components/patient-profile/__tests__/PaneToggleBar.test.tsx`
- **Source decisions:** Mid-batch amendment Q1 (location), Q3 (mini-layout drag), Q4 (size memory — handled in ppr-15c, not here), Q9 (future panes), Q10 (overflow).
- **Pattern precedent:** [`frontend/components/consultation/cockpit/MobilePillBar.tsx`](../../../../../../frontend/components/consultation/cockpit/MobilePillBar.tsx) — mobile equivalent.
- **Drag pattern precedent:** `<PaneHeader>` in [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx).
- **Next task:** [`task-ppr-15c-shell-slim.md`](./task-ppr-15c-shell-slim.md) — fresh chat after ppr-15b is green.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Done
