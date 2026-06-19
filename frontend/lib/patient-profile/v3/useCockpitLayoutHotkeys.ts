"use client";

import { useEffect } from "react";
import {
  DEFAULT_LAYOUTS,
  type DefaultLayoutId,
} from "@/lib/patient-profile/v3/default-layouts";

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

function isMidTextInput(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.tagName === "TEXTAREA") return true;
  if (active.tagName === "INPUT") {
    const type = (active as HTMLInputElement).type;
    return (
      type === "text" ||
      type === "search" ||
      type === "email" ||
      type === "tel" ||
      type === "url" ||
      type === ""
    );
  }
  return active.isContentEditable;
}

const HOTKEY_LAYOUT_ENTRIES = DEFAULT_LAYOUTS.filter(
  (e): e is typeof e & { hotkey: string } => Boolean(e.hotkey),
).map((e) => [e.hotkey, e.id] as const);

/**
 * Registers mod+shift+1..4 layout switches on the document (cv3l-02).
 * Skips while focus is in a text field (Rx / notes).
 */
export function useCockpitLayoutHotkeys(
  enabled: boolean,
  applyDefaultLayout: (id: DefaultLayoutId) => void,
): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (isMidTextInput()) return;
      for (const [combo, id] of HOTKEY_LAYOUT_ENTRIES) {
        if (!comboMatches(combo, event)) continue;
        event.preventDefault();
        applyDefaultLayout(id);
        return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, applyDefaultLayout]);
}

/** Human-readable shortcut hint for menu labels (e.g. ⌘⇧1). */
export function formatLayoutHotkeyHint(combo: string): string {
  const parts = combo.toLowerCase().split("+").map((p) => p.trim());
  if (IS_MAC) {
    return parts
      .map((p) => {
        if (p === "mod") return "⌘";
        if (p === "shift") return "⇧";
        if (p === "alt") return "⌥";
        return p.toUpperCase();
      })
      .join("");
  }
  return parts
    .map((p) => {
      if (p === "mod") return "Ctrl";
      if (p === "shift") return "Shift";
      if (p === "alt") return "Alt";
      return p.toUpperCase();
    })
    .join("+");
}
