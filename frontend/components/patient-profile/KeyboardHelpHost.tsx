"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import KeyboardHelpDialog from "@/components/patient-profile/KeyboardHelpDialog";
import { useRegisterCommand } from "@/lib/patient-profile/command-registry";

function isMidTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return (
      type === "text" ||
      type === "search" ||
      type === "email" ||
      type === "tel" ||
      type === "url" ||
      type === ""
    );
  }
  return target.isContentEditable;
}

/**
 * Mount once beside `<CommandBar>` on the patient-profile page.
 * Opens the keyboard-help dialog via `?` (when not mid-text-input) and
 * registers a Cmd+K palette entry ("Keyboard shortcuts").
 */
export default function KeyboardHelpHost() {
  const [open, setOpen] = useState(false);

  const openHelp = useCallback(() => {
    setOpen(true);
  }, []);

  const helpCommand = useMemo(
    () => ({
      id: "keyboard-shortcuts-help",
      label: "Keyboard shortcuts",
      keywords: ["help", "shortcuts", "keys", "keyboard"],
      group: "Other" as const,
      shortcutHint: "?",
      action: openHelp,
    }),
    [openHelp],
  );

  useRegisterCommand(helpCommand);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "?") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isMidTextInput(e.target)) return;

      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <KeyboardHelpDialog open={open} onOpenChange={setOpen} />;
}
