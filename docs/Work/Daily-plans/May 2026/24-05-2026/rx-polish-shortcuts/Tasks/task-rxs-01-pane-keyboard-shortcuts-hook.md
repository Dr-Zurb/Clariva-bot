# rxs-01 · `usePaneKeyboardShortcuts` hook

> **Wave 1** of [rx-polish-shortcuts](../plan-rx-polish-shortcuts-batch.md). Generic, pane-scoped hotkey hook.

| **Size** | S | **Model** | Auto | **Wave** | 1 | **Depends on** | — | **Blocks** | rxs-03 |

---

## Goal

Reusable hook that binds keyboard shortcuts only when focus is inside the named pane (or, for `when: "safe"`, when not mid-text-input).

---

## What to do

### 1. New `frontend/hooks/usePaneKeyboardShortcuts.ts`

```ts
"use client";

import { useEffect } from "react";

export type ShortcutScope = "pane-focused" | "safe";

export interface PaneShortcut {
  /** `mod` = Cmd on macOS, Ctrl elsewhere. e.g. "mod+enter", "mod+shift+t". */
  combo: string;
  action: (event: KeyboardEvent) => void;
  /** Scope predicate; defaults to "pane-focused". */
  when?: ShortcutScope;
  /** Optional human-readable label for the keyboard help dialog. */
  label?: string;
}

export interface UsePaneKeyboardShortcutsOptions {
  paneId: string;
  shortcuts: PaneShortcut[];
  /** Set false to disable the hook (e.g. read-only mode). */
  enabled?: boolean;
}

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform);

function comboMatches(combo: string, event: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split("+").map((p) => p.trim());
  const wantMod = parts.includes("mod");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  const key = parts.filter((p) => !["mod", "shift", "alt"].includes(p))[0];
  const hasMod = IS_MAC ? event.metaKey : event.ctrlKey;
  if (wantMod !== hasMod) return false;
  if (wantShift !== event.shiftKey) return false;
  if (wantAlt !== event.altKey) return false;
  if (event.key.toLowerCase() !== key) return false;
  return true;
}

function isInsidePane(paneId: string): boolean {
  const active = document.activeElement;
  if (!active) return false;
  return Boolean(
    (active as HTMLElement).closest(`[data-cockpit-pane-id="${paneId}"]`),
  );
}

function isMidTextInput(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.tagName === "TEXTAREA") return true;
  if (active.tagName === "INPUT") {
    const type = (active as HTMLInputElement).type;
    return type === "text" || type === "search" || type === "email" || type === "tel" || type === "url" || type === "";
  }
  return active.isContentEditable;
}

export function usePaneKeyboardShortcuts(opts: UsePaneKeyboardShortcutsOptions): void {
  const { paneId, shortcuts, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      for (const sc of shortcuts) {
        if (!comboMatches(sc.combo, event)) continue;
        const scope = sc.when ?? "pane-focused";
        if (scope === "pane-focused" && !isInsidePane(paneId)) continue;
        if (scope === "safe") {
          // Safe: not mid-text-input OR user added Shift to opt-in.
          if (isMidTextInput() && !event.shiftKey) continue;
        }
        event.preventDefault();
        sc.action(event);
        return;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, paneId, shortcuts]);
}
```

### 2. Tests `frontend/hooks/__tests__/usePaneKeyboardShortcuts.test.tsx`

Use `@testing-library/react` + `userEvent`:

- "fires on combo + pane-focused" — render a div with `data-cockpit-pane-id="plan"` containing an input; mount hook with `combo: "mod+m"`; focus input; press Cmd+M (mock platform); action fires.
- "ignores combo when focus outside pane" — focus an element outside the pane; press combo; action does not fire.
- "safe scope: fires when no text input focused" — combo `mod+enter`, scope `safe`; focus a button; press combo; fires.
- "safe scope: ignored when textarea focused without shift" — focus textarea; press Cmd+Enter; does NOT fire.
- "safe scope: fires when shift added inside textarea" — focus textarea; press Cmd+Shift+Enter; fires.
- "platform detection" — mock `navigator.platform` as Windows; ctrl+m fires, meta+m does not.
- "disabled" — `enabled: false`; no listeners.
- "cleanup on unmount" — unmount; press combo; action does not fire.

### 3. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test hooks/__tests__/usePaneKeyboardShortcuts.test.tsx
```

---

## Acceptance gate

- [ ] Hook exports + tests cover all 8 cases.
- [ ] Platform detection works.
- [ ] Cleanup on unmount.
- [ ] tsc / lint clean.

---

## Anti-goals

- ❌ Don't add `keyup` handlers — keydown is enough.
- ❌ Don't depend on a third-party hotkey library — this codebase keeps deps lean.
- ❌ Don't add a global event bus / store — local `useEffect` only.
- ❌ Don't try to intercept keys at the React synthetic level — `document.addEventListener` is needed because focus can be outside React-rendered elements.
