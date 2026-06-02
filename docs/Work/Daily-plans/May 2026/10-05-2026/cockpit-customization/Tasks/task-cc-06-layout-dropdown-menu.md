# Task cc-06: Layout dropdown menu in `<CockpitHeader>`

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase C, Lane δ step 2 — **S, ~1.5h**

---

## Task overview

Doctors need a discoverable, click-to-apply UI for switching cockpit layouts. Drag-to-reorder (cc-07) is the power-user path; the dropdown menu is the **default** path for first-time customization.

cc-06 adds a **"Layout"** button to `<CockpitHeader>` — between the existing "Mark No-show" kebab and the existing controls. Clicking opens a `<DropdownMenu>` with three sections:

1. **Built-in presets** (3 items): Triage / Consult / Document.
2. **Column orders** (6 items): all permutations of the three column types — labelled by the column-symbol triple, e.g. "Chart · Body · Rx", "Body · Rx · Chart", etc.
3. **Custom presets** (variable, 0–5 items): populated by cc-10. cc-06 ships the empty section + the "Save current layout..." item; cc-10 fills it.

Each item, when clicked, calls `setLayout(...)` with the appropriate next layout. The currently active layout is marked with a check icon.

**Estimated time:** ~1.5h.

**Status:** Pending.

**Hard deps:** cc-04 (need `setLayout` and the `cockpit-layout` shape), cc-05 (need the slot-collapsibility guards in place so reorder via menu doesn't put the cockpit in a bad state).

**Source:** [plan-cockpit-customization-batch.md § CC-D3](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (the existing header — confirm where the "Mark No-show" kebab sits and follow that placement pattern).
- `frontend/components/ui/dropdown-menu.tsx` (the shadcn primitive — confirm sub-section / separator / item shapes).
- `frontend/lib/consultation/cockpit-layout.ts` (the cc-04 helpers — `swapSlots`, `DEFAULT_COCKPIT_LAYOUT`).
- The cc-04 `setLayout` setter signature exposed by `<ConsultationCockpit>`.

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### Built-in presets

- [ ] Define the three built-ins in `frontend/lib/consultation/cockpit-layout.ts`:

  ```ts
  /** Built-in presets bundled with the cockpit. Distinct from custom presets (cc-10). */
  export const BUILT_IN_PRESETS = {
    triage: {
      id: 'built-in:triage',
      label: 'Triage',
      description: 'Chart focused — wide chart rail, narrow Rx',
      layout: {
        slots: ['chart', 'body', 'rx'] as const,
        widths: [40, 50, 10] as const,
        collapsed: { chart: false, rx: true },
      },
      hotkey: 'mod+shift+1',
    },
    consult: {
      id: 'built-in:consult',
      label: 'Consult',
      description: 'Balanced 3-column — default layout',
      layout: DEFAULT_COCKPIT_LAYOUT,  // chart-body-rx, 26/48/26, none collapsed
      hotkey: 'mod+shift+2',
    },
    document: {
      id: 'built-in:document',
      label: 'Document',
      description: 'Rx focused — wide Rx, chart collapsed',
      layout: {
        slots: ['chart', 'body', 'rx'] as const,
        widths: [10, 35, 55] as const,
        collapsed: { chart: true, rx: false },
      },
      hotkey: 'mod+shift+3',
    },
  } as const;

  export type BuiltInPresetId = keyof typeof BUILT_IN_PRESETS;
  ```

  - **Why these three?** They cover the dominant doctor mental modes:
    - Triage = "I'm reviewing the chart heavily, just need basics ready"
    - Consult = "Balanced view, talking with patient + writing"
    - Document = "Patient gone, focus on writing the prescription / notes"
  - **Why no full-screen-body preset?** Doctors who want full-screen body can collapse both side rails via `[` `]` in two keystrokes from any layout. A preset for it would be redundant.

### Layout dropdown menu in `<CockpitHeader>`

- [ ] In `frontend/components/consultation/cockpit/CockpitHeader.tsx`, add a "Layout" `<DropdownMenu>` next to the existing kebab. Suggested placement: after the consultation-state badge, before the "Mark No-show" kebab.

  ```tsx
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="gap-2">
        <LayoutGrid className="h-4 w-4" />
        Layout
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-72">
      <DropdownMenuLabel>Built-in presets</DropdownMenuLabel>
      {Object.values(BUILT_IN_PRESETS).map((p) => (
        <DropdownMenuItem
          key={p.id}
          onSelect={() => onApplyPreset(p.layout)}
          className="flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            {layoutsEqual(currentLayout, p.layout) && <Check className="h-3 w-3" />}
            <span>{p.label}</span>
          </span>
          <kbd className="text-xs text-muted-foreground">⌘⇧{p.hotkey.at(-1)}</kbd>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Column order</DropdownMenuLabel>
      {COLUMN_ORDER_PERMUTATIONS.map(({ slots, label }) => (
        <DropdownMenuItem
          key={slots.join('-')}
          onSelect={() => onApplyColumnOrder(slots)}
        >
          {slotsEqualOrder(currentLayout.slots, slots) && <Check className="mr-2 h-3 w-3" />}
          {label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      {/* CC-10 will inject the custom-presets list and the "Save current layout..." item here */}
      <DropdownMenuLabel>Custom presets</DropdownMenuLabel>
      <DropdownMenuItem disabled className="text-xs text-muted-foreground">
        No custom presets yet
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onOpenSavePresetDialog()}>
        <Save className="mr-2 h-3 w-3" />
        Save current layout…
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  ```

- [ ] Define `COLUMN_ORDER_PERMUTATIONS` in `cockpit-layout.ts`:

  ```ts
  export const COLUMN_ORDER_PERMUTATIONS = [
    { slots: ['chart', 'body', 'rx'] as const, label: 'Chart · Body · Rx' },
    { slots: ['chart', 'rx', 'body'] as const, label: 'Chart · Rx · Body' },
    { slots: ['body', 'chart', 'rx'] as const, label: 'Body · Chart · Rx' },
    { slots: ['body', 'rx', 'chart'] as const, label: 'Body · Rx · Chart' },
    { slots: ['rx', 'chart', 'body'] as const, label: 'Rx · Chart · Body' },
    { slots: ['rx', 'body', 'chart'] as const, label: 'Rx · Body · Chart' },
  ] as const;
  ```

- [ ] Add helpers in `cockpit-layout.ts`:

  ```ts
  /** Deep-compare two layouts. Used to mark the active preset in the menu. */
  export function layoutsEqual(a: CockpitLayout, b: CockpitLayout): boolean;

  /** Compare just the slot order. Used to mark the active permutation in the menu. */
  export function slotsEqualOrder(a: ColumnSlots, b: ColumnSlots): boolean;
  ```

### Wiring callbacks in `<ConsultationCockpit>`

- [ ] Pass `onApplyPreset` and `onApplyColumnOrder` from `<ConsultationCockpit>` down into `<CockpitHeader>` as props:

  ```ts
  const handleApplyPreset = useCallback(
    (next: CockpitLayout) => {
      setLayout(setLayoutWithGuards(next));
      // Apply the panel widths via the imperative API
      groupRef.current?.setLayout([...next.widths]);
      // Apply collapsed state imperatively
      if (next.collapsed.chart && !chartCollapsed) chartPanelRef.current?.collapse();
      else if (!next.collapsed.chart && chartCollapsed) chartPanelRef.current?.expand();
      if (next.collapsed.rx && !rxCollapsed) rxPanelRef.current?.collapse();
      else if (!next.collapsed.rx && rxCollapsed) rxPanelRef.current?.expand();
    },
    [setLayout, setLayoutWithGuards, chartCollapsed, rxCollapsed],
  );

  const handleApplyColumnOrder = useCallback(
    (slots: ColumnSlots) => {
      // Reorder only — keep current widths and collapsed state
      handleApplyPreset({ ...layout, slots });
    },
    [handleApplyPreset, layout],
  );
  ```

- [ ] `onOpenSavePresetDialog` is a no-op stub for cc-06 (logs `console.log("save preset stub")`). cc-10 wires the actual dialog.

### Tests

- [ ] In `frontend/components/consultation/cockpit/__tests__/CockpitHeader.test.tsx` (create if absent):
  - "renders Layout button" — clicks open the menu.
  - "marks the active preset with a check" — render with `currentLayout = BUILT_IN_PRESETS.triage.layout`, assert the Triage item has the check icon.
  - "calls onApplyPreset with the preset layout when an item is selected".
  - "calls onApplyColumnOrder with the permutation when a column-order item is selected".
- [ ] `pnpm --filter frontend tsc --noEmit` clean. Lint clean.

### Manual verification

- [ ] Click "Layout" in the cockpit header. Menu opens with three sections (built-in / column order / custom).
- [ ] Click "Triage". Layout snaps to: chart wide, body narrow, Rx collapsed. The Triage item now has a check.
- [ ] Click "Body · Rx · Chart". Layout snaps to that permutation. The active permutation gets a check.
- [ ] Click "Save current layout..." — placeholder behavior (cc-10 will replace with a real dialog).

---

## Out of scope

- **Custom presets list with rename/delete actions** — cc-10.
- **Save-current-layout dialog with name input** — cc-10.
- **Built-in preset hotkeys actually working** — cc-11. cc-06 only renders the `<kbd>` hint.
- **Drag-to-reorder via column header drag handles** — cc-07.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~80 LOC delta — new dropdown menu).
- `frontend/components/consultation/ConsultationCockpit.tsx` (~30 LOC delta — `handleApplyPreset` / `handleApplyColumnOrder` and pass-through props).
- `frontend/lib/consultation/cockpit-layout.ts` (~80 LOC delta — `BUILT_IN_PRESETS`, `COLUMN_ORDER_PERMUTATIONS`, `layoutsEqual`, `slotsEqualOrder`).
- `frontend/components/consultation/cockpit/__tests__/CockpitHeader.test.tsx` (~80 LOC; create if absent).

**New:** none (extending existing files only).

---

## Notes / open decisions

1. **Why three built-ins, not five?** More built-ins crowds the menu and dilutes recall. Three is enough to cover Triage / Consult / Document — the three doctor mental modes. Custom presets cover specialty-specific variants.
2. **Why use `· ` (middle dot) as the column separator in labels?** Visually compact, parses as a label not a path, and avoids confusion with `/` (which doctors might read as "or").
3. **What about i18n?** All labels stay as English literals for now (same as the rest of the cockpit pre-i18n).
4. **Accessibility — keyboard navigation in the dropdown?** shadcn `<DropdownMenu>` handles arrow-key nav and Enter-to-select natively. No extra wiring.
5. **Should the menu close after item click?** Yes (default shadcn behavior). The doctor's intent is "apply and continue working", not "shop around".

---

## References

- **Affected files:**
  - `frontend/components/consultation/cockpit/CockpitHeader.tsx`
  - `frontend/lib/consultation/cockpit-layout.ts`
  - `frontend/components/consultation/ConsultationCockpit.tsx`
- **Predecessor:** [`task-cc-04-cockpit-layout-slot-state.md`](./task-cc-04-cockpit-layout-slot-state.md), [`task-cc-05-slot-based-collapsibility.md`](./task-cc-05-slot-based-collapsibility.md).
- **Successor:** [`task-cc-10-presets-frontend-hook-and-ui.md`](./task-cc-10-presets-frontend-hook-and-ui.md) — fills the custom-presets section and replaces the "Save current layout..." stub.

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
