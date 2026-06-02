# rxs-04 · Verification + close-out

> **Wave 3** of [rx-polish-shortcuts](../plan-rx-polish-shortcuts-batch.md). Smoke, telemetry, help dialog, docs.

| **Size** | XS | **Model** | Composer 2 Fast | **Wave** | 3 | **Depends on** | rxs-03 | **Blocks** | — |

---

## What to do

### 1. Smoke matrix

Walk through the plan §"Cross-cutting acceptance gate." Test in both macOS (Chrome) and Windows (Chrome / Edge).

### 2. Wire telemetry

In `frontend/lib/patient-profile/telemetry.ts`:

```ts
export function trackCockpitV2RRxPolishShortcutUsed(payload: {
  combo: string;
  action: string;
}): void {
  // NOT one-shot — every press is a signal.
  logCockpitEvent("cockpit_v2.r_rx_polish_shortcut_used", payload as Record<string, string | number | boolean>);
}
```

Invocations already added in rxs-03 (inside each shortcut's `action` callback).

### 3. Keyboard help dialog `frontend/components/patient-profile/KeyboardHelpDialog.tsx`

```tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCommands } from "@/lib/patient-profile/command-registry";

export default function KeyboardHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const commands = useCommands();
  const withHint = commands.filter((c) => c.shortcutHint);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
        <ul className="space-y-2">
          {withHint.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>{c.label}</span>
              <kbd className="rounded border px-2 py-0.5 text-xs">{c.shortcutHint}</kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
```

Mount in `PatientProfilePage` next to `<CommandBar>`. Bind `?` key globally to open (skip if focus is in a text input). Also register as a command in the registry so Cmd+K → "keyboard shortcuts" works.

### 4. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a "Keyboard shortcuts (R-RX-POLISH/3.x, 2026-05-24)" sub-section listing the four Plan bindings + Cmd+K palette + `?` help.

### 5. Update roadmap

R-RX-POLISH/3.x → ✅; ledger; §6; §10 changelog.

### 6. Capture-inbox

```md
- [ ] [rx-polish-shortcuts follow-up] Per-doctor shortcut remapping. (Source: docs/Work/Daily-plans/May 2026/24-05-2026/rx-polish-shortcuts/plan-rx-polish-shortcuts-batch.md)
- [ ] [rx-polish-shortcuts follow-up] Subjective/Objective pane shortcuts (e.g. Cmd+1/2/3/4 to jump panes). (Source: same)
- [ ] [rx-polish-shortcuts follow-up] Async commands (e.g. "Refresh patient data") in command palette. (Source: same)
- [ ] [rx-polish-shortcuts follow-up] Recent commands surfaced at top of palette. (Source: same)
```

---

## Acceptance gate

- [x] Smoke green on both platforms.
- [x] Telemetry firing.
- [x] Help dialog live + accessible via `?` and Cmd+K.
- [x] Docs + roadmap + capture-inbox updated.

---

## Anti-goals

- ❌ Don't update `plan-cockpit-v2.md` source plan — cockpit-v2-decommission owns that.
