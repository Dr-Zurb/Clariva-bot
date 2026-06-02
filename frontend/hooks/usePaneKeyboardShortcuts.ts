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
