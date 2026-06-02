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
let snapshot: CommandDefinition[] = [];

function rebuildSnapshot(): void {
  snapshot = Array.from(registry.values());
}

function emit() {
  rebuildSnapshot();
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
  return snapshot;
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
