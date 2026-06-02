# rxs-02 · Command registry

> **Wave 1** of [rx-polish-shortcuts](../plan-rx-polish-shortcuts-batch.md). Per-session command registry for Cmd+K palette.

| **Size** | S | **Model** | Auto | **Wave** | 1 | **Depends on** | — | **Blocks** | rxs-03 |

---

## Goal

In-memory command store. Commands register at component mount, unregister at unmount. `<CommandBar>` lists / filters / executes.

---

## What to do

### 1. New `frontend/lib/patient-profile/command-registry.ts`

```ts
"use client";

import { useEffect, useSyncExternalStore } from "react";

export interface CommandDefinition {
  /** Stable string; how the command is referenced. */
  id: string;
  /** Display label shown in the palette. */
  label: string;
  /** Optional keywords for fuzzy-matching. */
  keywords?: string[];
  /** Optional shortcut hint (e.g. "Ctrl+M"); shown as a kbd badge on the right. */
  shortcutHint?: string;
  /** Group label for the palette section header. */
  group?: "Plan" | "Subjective" | "Objective" | "Layout" | "Other";
  /** Synchronous executor — runs when the user picks the command. */
  action: () => void;
  /** Whether the command is currently usable (e.g. Send Rx disabled if no draft). */
  enabled?: () => boolean;
}

type Listener = () => void;

const registry = new Map<string, CommandDefinition>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function registerCommand(cmd: CommandDefinition): () => void {
  registry.set(cmd.id, cmd);
  emit();
  return () => {
    registry.delete(cmd.id);
    emit();
  };
}

export function listCommands(): CommandDefinition[] {
  return Array.from(registry.values());
}

export function executeCommand(id: string): void {
  const cmd = registry.get(id);
  if (!cmd) return;
  if (cmd.enabled && !cmd.enabled()) return;
  cmd.action();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CommandDefinition[] {
  return listCommands();
}

/** React hook — subscribes to registry changes. */
export function useCommands(): CommandDefinition[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Convenience hook for components that want to register a command on mount. */
export function useRegisterCommand(cmd: CommandDefinition | null): void {
  useEffect(() => {
    if (!cmd) return;
    return registerCommand(cmd);
  }, [cmd]);
}
```

### 2. Tests `frontend/lib/patient-profile/__tests__/command-registry.test.ts`

- Register → list returns the cmd.
- Unregister (via returned cleanup) → list returns empty.
- `useCommands` re-renders on register / unregister.
- `executeCommand` runs the action.
- `executeCommand` no-ops if `enabled()` returns false.
- `executeCommand` no-ops if id unknown.

### 3. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test lib/patient-profile/__tests__/command-registry.test.ts
```

---

## Acceptance gate

- [x] All exports present.
- [x] Tests pass.
- [x] `useSyncExternalStore` correctly re-renders subscribers.

---

## Anti-goals

- ❌ Don't persist commands to localStorage — registry is ephemeral per-session.
- ❌ Don't add async actions in v1 — synchronous `action` keeps the palette responsive.
- ❌ Don't add nested command trees — flat list with optional group label.
- ❌ Don't add per-user enable/disable toggles — `enabled()` predicate is enough.
