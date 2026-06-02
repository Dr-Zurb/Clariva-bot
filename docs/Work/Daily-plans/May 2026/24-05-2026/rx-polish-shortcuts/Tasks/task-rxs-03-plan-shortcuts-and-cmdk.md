# rxs-03 · Plan-pane shortcuts + Cmd+K real palette + shell pane-id attrs

> **Wave 2** of [rx-polish-shortcuts](../plan-rx-polish-shortcuts-batch.md). The visible work.

| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | rxs-01, rxs-02 | **Blocks** | rxs-04 |

---

## Goal

Wire four Plan-pane shortcuts via the new hook. Replace Cmd+K placeholder with a working `cmdk` palette. Add `data-cockpit-pane-id` to pane containers.

---

## What to do

### 1. Add pane-id attribute in `<Shell>` / pane renderer

Find where individual leaf panes render in `frontend/components/patient-profile/Shell.tsx` (or its sub-components). Add:

```tsx
<div
  data-cockpit-pane-id={pane.id}
  className={...}
>
  {paneRenderer(pane)}
</div>
```

This is the hook's focus-detection target.

### 2. Modify `<PlanSection>` (`frontend/components/cockpit/rx/sections/PlanSection.tsx`)

```tsx
import { usePaneKeyboardShortcuts } from "@/hooks/usePaneKeyboardShortcuts";
import { useRegisterCommand } from "@/lib/patient-profile/command-registry";

// inside the component body:
const shortcuts = useMemo(
  () => [
    {
      combo: "mod+enter",
      label: "Send Rx & finish",
      when: "safe" as const,
      action: () => {
        if (canSend) handleSend();
        trackCockpitV2RRxPolishShortcutUsed({ combo: "mod+enter", action: "send-rx" });
      },
    },
    {
      combo: "mod+m",
      label: "Add medicine",
      when: "pane-focused" as const,
      action: () => {
        handleAddMedicine();
        trackCockpitV2RRxPolishShortcutUsed({ combo: "mod+m", action: "add-medicine" });
      },
    },
    {
      combo: "mod+shift+t",
      label: "Open templates",
      when: "pane-focused" as const,
      action: () => {
        handleOpenTemplates();
        trackCockpitV2RRxPolishShortcutUsed({ combo: "mod+shift+t", action: "open-templates" });
      },
    },
    {
      combo: "mod+shift+p",
      label: "Open preview",
      when: "pane-focused" as const,
      action: () => {
        handleOpenPreview();
        trackCockpitV2RRxPolishShortcutUsed({ combo: "mod+shift+p", action: "open-preview" });
      },
    },
  ],
  [canSend, handleSend, handleAddMedicine, handleOpenTemplates, handleOpenPreview],
);

usePaneKeyboardShortcuts({ paneId: "plan", shortcuts, enabled: !isReadOnly });

// Auto-register each shortcut as a command:
useRegisterCommand({
  id: "send-rx",
  label: "Send Rx & finish",
  shortcutHint: "Ctrl+Enter",
  group: "Plan",
  enabled: () => canSend,
  action: handleSend,
});
useRegisterCommand({
  id: "add-medicine",
  label: "Add medicine",
  shortcutHint: "Ctrl+M",
  group: "Plan",
  action: handleAddMedicine,
});
useRegisterCommand({
  id: "open-templates",
  label: "Open templates",
  shortcutHint: "Ctrl+Shift+T",
  group: "Plan",
  action: handleOpenTemplates,
});
useRegisterCommand({
  id: "open-preview",
  label: "Open preview",
  shortcutHint: "Ctrl+Shift+P",
  group: "Plan",
  action: handleOpenPreview,
});
```

(Use platform-aware hint text — Cmd vs Ctrl — via a small helper, OR show the macOS variant in tooltip + the OS-detected variant in palette badge. Simplest: always show "Ctrl/Cmd+X" in the hint string.)

### 3. Add tooltip hints

On Send Rx button (likely inside `<PlanActionFooter>` from cmr-03) and Add Medicine button:

```tsx
<TooltipProvider><Tooltip>
  <TooltipTrigger asChild>{/* button */}</TooltipTrigger>
  <TooltipContent>Send Rx &amp; finish <kbd className="ml-2 text-xs">Ctrl+Enter</kbd></TooltipContent>
</Tooltip></TooltipProvider>
```

### 4. Real Cmd+K palette in `<CommandBar>`

Modify `frontend/components/patient-profile/CommandBar.tsx` — replace the placeholder dialog body with a `cmdk`-backed component:

```tsx
import { Command } from "cmdk";
import { useCommands, executeCommand } from "@/lib/patient-profile/command-registry";

// inside the existing <Dialog> body:
const commands = useCommands();
const grouped = useMemo(() => {
  const out: Record<string, typeof commands> = {};
  for (const c of commands) (out[c.group ?? "Other"] ??= []).push(c);
  return out;
}, [commands]);

return (
  <Command className="..." label="Command palette">
    <Command.Input autoFocus placeholder="Type a command…" />
    <Command.List>
      <Command.Empty>No commands found.</Command.Empty>
      {Object.entries(grouped).map(([group, items]) => (
        <Command.Group key={group} heading={group}>
          {items.map((cmd) => (
            <Command.Item
              key={cmd.id}
              value={`${cmd.label} ${cmd.keywords?.join(" ") ?? ""}`}
              disabled={cmd.enabled ? !cmd.enabled() : false}
              onSelect={() => {
                executeCommand(cmd.id);
                setOpen(false);
              }}
            >
              <span>{cmd.label}</span>
              {cmd.shortcutHint && <kbd className="ml-auto text-xs">{cmd.shortcutHint}</kbd>}
            </Command.Item>
          ))}
        </Command.Group>
      ))}
    </Command.List>
  </Command>
);
```

### 5. Add `cmdk` to deps if not already present

```powershell
pnpm --filter frontend add cmdk
```

Check `package.json` first — many shadcn-based apps already have it.

### 6. Tests

- `PlanSection.test.tsx` (extend): Cmd+M fires add-medicine; Cmd+Enter from inside textarea does NOT send; Cmd+Shift+Enter from textarea sends.
- `CommandBar.test.tsx` (new or extend): typing "send" matches Send Rx command; Enter executes; dialog closes.
- Manual smoke: `/dashboard/appointments/[id]` — try all four shortcuts + Cmd+K.

### 7. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] `data-cockpit-pane-id` set per pane in shell.
- [x] All four Plan shortcuts work (DL-1).
- [x] Cmd+Enter from inside textarea inserts newline; Cmd+Shift+Enter sends.
- [x] Cmd+K opens real palette; fuzzy search works; Enter executes command.
- [x] Tooltip hints visible on Send + Add Medicine.
- [x] Telemetry event fires per shortcut use.

---

## Anti-goals

- ❌ Don't add shortcuts to other panes — out of scope.
- ❌ Don't make the palette a route — it's a dialog.
- ❌ Don't try to handle async commands in v1.
- ❌ Don't change cv2-09's Cmd+K detection logic — only the placeholder content changes.
