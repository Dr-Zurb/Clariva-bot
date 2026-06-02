# cpfc-01 · Customize-mode state + header toggle + `Cmd+Shift+L` + Shell gating

> **Wave 1** of [p3-cockpit-pane-freedom-customize](../plan-p3-cockpit-pane-freedom-customize-batch.md). The load-bearing task — it introduces the `customizeMode` bit that every other Phase 3 surface lives inside, and gates Phase 2's drag affordances on it.

| **Size** | M | **Model** | Auto | **Wave** | 1 | **Depends on** | Phase 2 merged (cpfd-01..05) | **Blocks** | cpfc-02, cpfc-03, cpfc-04 |

---

## Why this task

Phase 2 shipped the drag affordances **always-on**: the `ShellPaneHeader` grip and the `<PaneTabStrip>` tabs are draggable whenever a non-`body`/non-live pane is involved, and `<PaneDropOverlay>` arms on any active drag. That's the right interim for validating the mechanics, but it means a doctor can fat-finger a layout change mid-consult.

Phase 3's whole premise (P3-DL-1) is an explicit **editing mode**: off by default → cockpit identical to Phase 1 at rest; on → drag affordances surface and the customize bar appears. This task adds that single boolean, wires the toggle (button + `Cmd+Shift+L`), and threads it into the Shell so it gates the three Phase 2 drag surfaces. Everything else in the batch (the save bar, rename/delete, the cramped nudge) only renders *in customize mode*, so this bit must exist first.

**No new DnD code** — this is "add a gate to surfaces Phase 2 already built."

---

## What to do

### 1. Page state in `frontend/components/patient-profile/PatientProfilePage.tsx`

```tsx
// ── Customize mode (cpfc-01 / P3-DL-1, P3-DL-2) ──────────────────────────────
// Ephemeral page state — NEVER persisted. Resets to off on appointment change.
const [customizeMode, setCustomizeMode] = useState(false);

// P3-DL-2: reset to off whenever the appointment changes (new page context).
useEffect(() => {
  setCustomizeMode(false);
}, [appt.id]);

const handleToggleCustomizeMode = useCallback(
  (source: "button" | "hotkey") => {
    setCustomizeMode((prev) => {
      const next = !prev;
      trackCockpitPaneFreedomCustomizeToggled({ enabled: next, source });
      if (next) {
        // Leaving a shape signal for cpfc-04 is emitted on turn-OFF, not here.
      }
      return next;
    });
  },
  [],
);
```

> Place the state near the other layout/preset state (around `layoutTreePresets` / `selectedTemplateId`). Do **not** read or write `localStorage` / `doctor_settings` for this bit — P3-DL-2 forbids persistence.

### 2. Header toggle button in `frontend/components/patient-profile/PatientProfileHeader.tsx`

Add two optional props to `CockpitHeaderProps`:

```tsx
/**
 * cpfc-01: Customize-layout mode toggle. When `onToggleCustomizeMode` is
 * provided, the header renders a "Customize" toggle in the right cluster.
 * `customizeMode` drives its pressed/active state. The hotkey hint is Cmd+Shift+L.
 */
customizeMode?: boolean;
onToggleCustomizeMode?: () => void;
```

Render it in the right cluster, **before** the `<PresetPicker>` (so the order reads `[badge][CTA][Customize][Layout][kebab]`). Reuse the existing `Tooltip` + `Button` primitives already imported in this file:

```tsx
{onToggleCustomizeMode && (
  <TooltipProvider delayDuration={400}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={customizeMode ? "default" : "ghost"}
          size="sm"
          aria-pressed={customizeMode}
          onClick={onToggleCustomizeMode}
          className="gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span className="hidden lg:inline">Customize</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {customizeMode ? "Exit customize" : "Customize layout"} · ⌘⇧L
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

> `SlidersHorizontal` is already in `lucide-react`; add it to the existing icon import block. Only render the button in the non-terminal (active states) branch's right cluster — terminal/ended states have no layout to customize.

### 3. `Cmd+Shift+L` in `frontend/hooks/useShellHotkeys.ts`

Add `onToggleCustomize` to `UseShellHotkeysOptions`:

```tsx
/** cpfc-01: Toggle customize-layout mode. Bound to Cmd/Ctrl+Shift+L (P3-DL-3). */
onToggleCustomize: () => void;
```

Destructure it in the handler, then add the branch **inside the existing `(e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey` guard, before the digit-preset lookup** (so the same modifier combo routes "L" here and digits to presets):

```tsx
if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
  // cpfc-01: Cmd/Ctrl+Shift+L → toggle customize mode (P3-DL-3).
  if (e.key.toLowerCase() === "l") {
    e.preventDefault();
    onToggleCustomize();
    return;
  }
  const presetId = DIGIT_TO_PRESET[e.key];
  if (presetId) {
    e.preventDefault();
    applyPreset(presetId);
    return;
  }
}
```

> The editable-element guard above already prevents firing while a field is focused. `e.key.toLowerCase()` handles the Shift-uppercases-letters quirk. Update the hook's JSDoc key-binding table with the new `Cmd/Ctrl+Shift+L` row.

Wire it at the call site in `PatientProfilePage.tsx`:

```tsx
useShellHotkeys({
  // ...existing...
  onToggleCustomize: () => handleToggleCustomizeMode("hotkey"),
  enabled: !finishBusy,
});
```

And pass the header props where `<CockpitHeader>` is rendered:

```tsx
customizeMode={customizeMode}
onToggleCustomizeMode={() => handleToggleCustomizeMode("button")}
```

### 4. Thread `customizeMode` into the Shell + gate the Phase 2 drag sources

`PatientProfilePage` renders `<PatientProfileShell ref={shellRef} ... />`. Add a prop:

```tsx
<PatientProfileShell
  ref={shellRef}
  // ...existing...
  customizeMode={customizeMode}
/>
```

In `frontend/components/patient-profile/Shell.tsx`, add `customizeMode?: boolean` to the shell's props and make it available to the recursive `<PaneSubtreeGroup>`. **Recommended:** a tiny context to avoid drilling it through every recursion level (the recursive group already drills `paneMoveUx`; one more boolean via context keeps the signature stable):

```tsx
// cpfc-01: read by ShellPaneHeader, PaneTabStrip, and the overlay mount.
const CustomizeModeContext = createContext(false);
export const useCustomizeMode = () => useContext(CustomizeModeContext);
// ...wrap DesktopShell's tree: <CustomizeModeContext.Provider value={customizeMode ?? false}>
```

Then gate the **three Phase 2 surfaces**:

- **Grip (`ShellPaneHeader`):** Phase 2 (cpfd-03) made the grip `useDraggable` with a `disabled` that already covers the live-`body` guard. Extend that `disabled` with the mode:
  ```tsx
  const customizeMode = useCustomizeMode();
  const { ... } = useDraggable({
    id: `pane-drag-${paneId}`,
    data: { paneId },
    disabled: !customizeMode || isLiveBody, // isLiveBody = existing Phase 2 guard
  });
  ```
- **Tabs (`<PaneTabStrip>`):** Phase 2 (cpfd-04) made each tab a `useDraggable`. Add `disabled: !customizeMode` (preserve any existing per-tab guard with `||`).
- **Overlay (`<PaneDropOverlay>`):** Phase 2 (cpfd-03) mounts it per container during an active drag. Gate the mount on the mode:
  ```tsx
  {customizeMode && <PaneDropOverlay groupId={leaf.id} ... />}
  ```

> `<MobileShell>` must ignore `customizeMode` entirely (DL-7) — it has no grips, tabs-DnD, or overlay to gate. Don't pass the context provider into the mobile branch (or pass `false`).

### 5. Telemetry in `frontend/lib/patient-profile/telemetry.ts`

Mirror the existing `trackCockpitPaneFreedom*` shape:

```tsx
export function trackCockpitPaneFreedomCustomizeToggled(payload: {
  enabled: boolean;
  source: "button" | "hotkey";
}): void {
  track("cockpit_pane_freedom.customize_toggled", payload);
}
```

### 6. Verify

```powershell
cd frontend
npx tsc --noEmit
npm test hooks/__tests__/useShellHotkeys.test.ts
npm run lint
```

Add a `useShellHotkeys` test row: `Cmd+Shift+L calls onToggleCustomize and preventDefault`s; it does NOT fire while an input is focused; it does NOT collide with `Cmd+Shift+1` (preset).

---

## Acceptance gate

- [x] `customizeMode` state in `PatientProfilePage`, default `false`, reset to `false` on `appt.id` change (P3-DL-2). No persistence.
- [x] Header "Customize" toggle button renders in the right cluster (active states only), with pressed state when on + a `⌘⇧L` tooltip hint.
- [x] `Cmd/Ctrl+Shift+L` toggles the mode via `useShellHotkeys`, behind the editable-element guard, with no binding collision (digits still apply presets).
- [x] `customizeMode` is threaded into `<PatientProfileShell>` and gates the grip `useDraggable` (`disabled: !customizeMode || isLiveBody`), the tab `useDraggable`, and the `<PaneDropOverlay>` mount.
- [x] At rest (mode off): zero visual + behavioural diff from Phase 2 at rest — no draggable grips, no overlay.
- [x] Mode on: grips + tabs draggable; overlay arms on drag; live-`body` still refuses (DL-8).
- [x] `<MobileShell>` ignores the mode entirely (DL-7).
- [x] `cockpit_pane_freedom.customize_toggled` `{ enabled, source }` fires on every toggle (button + hotkey).
- [x] `cd frontend; npx tsc --noEmit` + the new hotkey test row clean.

---

## Anti-goals

- ❌ Don't persist customize mode (localStorage / doctor_settings) — P3-DL-2.
- ❌ Don't add any DnD logic — Phase 2 owns that; this task only adds a `disabled` gate + a mount condition.
- ❌ Don't gate the context-menu "Move pane to…" path on customize mode — it stays always-available (P2-DL-5).
- ❌ Don't render the toggle on terminal/ended header states or on `<MobileShell>` — nothing to customize there.
- ❌ Don't change the 8px `PointerSensor` activation distance or the live-`body` guard — reuse Phase 2's `disabled` condition, just `||` the mode onto it.

---

## Risks (executor-facing)

- **Gate completeness.** The mode must gate ALL THREE Phase 2 surfaces (grip, tabs, overlay). Miss one and e.g. tabs stay draggable at rest. The context approach makes this a single source of truth — verify each of the three reads `useCustomizeMode()`.
- **Hotkey collision.** `Cmd+Shift+L` is also a browser/OS combo in some environments (e.g. focus address bar). `preventDefault()` on match is essential; test in the actual app, not just a unit harness.
- **Reset on appointment change.** The `useEffect([appt.id])` reset is what enforces P3-DL-2. Without it, navigating between patients in the queue rail could carry customize mode across — verify it clears.
- **Terminal-state header.** The toggle button lives in the active-states right cluster only. Don't add it to the terminal branch (no layout there) — guard with the same `onToggleCustomizeMode &&` plus the existing state branch.
