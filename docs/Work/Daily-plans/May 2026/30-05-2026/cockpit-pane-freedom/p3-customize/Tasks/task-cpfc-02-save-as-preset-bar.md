# cpfc-02 · `<CustomizeBar>` — save-as-preset + always-reachable reset

> **Wave 2** of [p3-cockpit-pane-freedom-customize](../plan-p3-cockpit-pane-freedom-customize-batch.md). The customize-mode toolbar: a thin sticky strip below the header, visible only while customize mode is on.

| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | cpfc-01 | **Blocks** | cpfc-04 (mounts its nudge here) |

---

## Why this task

Today, saving a layout is buried: open the Layout dropdown → scroll past built-ins + custom presets → "Save current layout" → a popover. Reset-to-default exists only per-custom-preset (a `RotateCcw` button) or in the empty state. In customize mode the doctor is *explicitly arranging the cockpit* — save and reset should be one click away, not nested in a menu.

This task adds a `<CustomizeBar>`: a horizontal strip that appears under the header when `customizeMode` is on, surfacing **Save current layout as preset** (inline name input, reusing the existing save handler) and an **always-visible Reset to default** (P3-DL-5 / DL-2.5). It also reserves the slot where cpfc-04 mounts the cramped-layout nudge.

The save mechanics already exist (`handleSaveLayoutTreePreset` → `layoutTreePresets.savePreset` → `savePresetTree`, 5-preset cap). This task is **surfacing**, not new persistence.

---

## What to do

### 1. New component `frontend/components/patient-profile/CustomizeBar.tsx`

```tsx
"use client";

import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CustomizeBarProps {
  /** Number of saved custom presets (for the "N/5" hint). */
  presetCount: number;
  /** True when the 5-preset cap is hit — disables Save. */
  atPresetCap: boolean;
  /** Reuses PatientProfilePage.handleSaveLayoutTreePreset. */
  onSaveCurrentLayout: (name: string) => void | Promise<void>;
  /** Applies the active template's built-in tree (P3-DL-5). Always enabled. */
  onResetToDefault: () => void;
  /** cpfc-04 mounts the cramped-layout nudge here; null until then. */
  warningSlot?: React.ReactNode;
}

export default function CustomizeBar({
  presetCount,
  atPresetCap,
  onSaveCurrentLayout,
  onResetToDefault,
  warningSlot,
}: CustomizeBarProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || atPresetCap) return;
    setBusy(true);
    try {
      await onSaveCurrentLayout(trimmed);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Customize layout"
      className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 lg:px-6"
    >
      <span className="text-xs font-medium text-muted-foreground">
        Customize layout
      </span>

      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={atPresetCap ? "Preset limit reached (5/5)" : "Name this layout…"}
          maxLength={60}
          disabled={atPresetCap}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
          }}
          className="h-8 w-48"
        />
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={!name.trim() || busy || atPresetCap}
          onClick={() => void handleSave()}
        >
          <Save className="h-3.5 w-3.5" aria-hidden />
          Save preset
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {presetCount}/5
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={onResetToDefault}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Reset to default
      </Button>

      {/* cpfc-04 mounts the cramped-layout nudge here. */}
      {warningSlot && <div className="ml-auto">{warningSlot}</div>}
    </div>
  );
}
```

> The name input + save mirrors the existing popover in `<PresetPicker>` (`handleSave` / `saveName` / `saveBusy`). Keep the same 60-char cap and trim behaviour so saved-here and saved-via-dropdown presets are indistinguishable.

### 2. `onResetToDefault` handler in `frontend/components/patient-profile/PatientProfilePage.tsx`

Mirror the existing `handleResetLayoutTreePreset`, but resolve the built-in by the **active** template instead of a passed-in preset:

```tsx
const handleResetToDefault = useCallback(() => {
  const builtin =
    BUILT_IN_PRESETS.find((p) => p.sourceTemplateId === selectedTemplateId) ??
    BUILT_IN_PRESETS[0]; // Telemed-Video fallback
  shellRef.current?.applyLayoutTree(builtin.layoutTree);
  trackCockpitV2RLayoutUxPresetApplied({
    presetId: builtin.id,
    isBuiltIn: true,
    paneCount: countLeaves(builtin.layoutTree),
  });
}, [selectedTemplateId]);
```

> `BUILT_IN_PRESETS`, `selectedTemplateId`, `countLeaves`, and `trackCockpitV2RLayoutUxPresetApplied` are all already imported/derived in this file (see `handleResetLayoutTreePreset` / `handleSaveLayoutTreePreset`). Reuse them.

### 3. Mount the bar in `PatientProfilePage`

In `pageContent`, render the bar **between `<CockpitHeader>` and the shell**, only in customize mode:

```tsx
{customizeMode && (
  <CustomizeBar
    presetCount={layoutTreePresets.presets.length}
    atPresetCap={layoutTreePresets.atCap}
    onSaveCurrentLayout={handleSaveLayoutTreePreset}
    onResetToDefault={handleResetToDefault}
    // warningSlot is added by cpfc-04
  />
)}
```

> Desktop branch only — the mobile shell never renders this (DL-7). If the page shares a `pageContent` across breakpoints, guard the mount with the same desktop condition the Phase 2 overlay uses.

### 4. Verify

```powershell
cd frontend
npx tsc --noEmit
npm test components/patient-profile/__tests__/CustomizeBar.test.tsx
npm run lint
```

Test rows: renders Save disabled when name empty / at cap; calls `onSaveCurrentLayout(trimmed)` on Save + Enter; Reset always enabled and calls `onResetToDefault`; the `N/5` hint reflects `presetCount`.

---

## Acceptance gate

- [x] `<CustomizeBar>` renders only when `customizeMode` is on (mounted by `PatientProfilePage`), as a sticky strip below the header.
- [x] Save: inline name input (60-char cap, trim) + Save button reusing `handleSaveLayoutTreePreset`; disabled when empty / busy / at cap; shows `N/5`.
- [x] At the 5-preset cap, the input is disabled with a "Preset limit reached (5/5)" placeholder; Save is disabled.
- [x] Reset to default is **always enabled** (P3-DL-5 / DL-2.5) and applies the active template's built-in tree.
- [x] A `warningSlot` prop exists and renders when provided (cpfc-04 fills it).
- [x] Desktop only — never on `<MobileShell>` (DL-7).
- [x] `cd frontend; npx tsc --noEmit` + the new `CustomizeBar` test rows clean.

---

## Anti-goals

- ❌ Don't add new persistence — Save reuses the shipped `savePresetTree`/`PUT`; no new endpoint.
- ❌ Don't raise the 5-preset cap — disable Save at the cap, don't bypass it.
- ❌ Don't make Reset conditional — it is always reachable (DL-2.5).
- ❌ Don't render rename/delete here — those live in `<PresetPicker>` (cpfc-03).
- ❌ Don't render the cramped warning here yet — only reserve the `warningSlot` (cpfc-04 fills it).
- ❌ Don't render on mobile.

---

## Risks (executor-facing)

- **Sticky stacking.** The header is `sticky top-0 z-30` on `<lg`. The bar is `sticky top-0 z-20` — verify it docks directly under the header without overlapping the queue rail (`CockpitQueueRail` sits below the header). On `lg+` the shell columns scroll independently; confirm the bar doesn't push the shell's fixed height off-screen.
- **Reset target.** `selectedTemplateId` may be null for walk-in; the `?? BUILT_IN_PRESETS[0]` fallback covers it. Verify the fallback applies a sensible default rather than throwing.
- **Save parity.** A preset saved from the bar must be byte-identical (shape, `sourceTemplateId`) to one saved from the dropdown — both go through `handleSaveLayoutTreePreset`. Don't fork the save logic.
