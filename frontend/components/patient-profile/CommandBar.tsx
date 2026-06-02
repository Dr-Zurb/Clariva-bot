"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  executeCommand,
  useCommands,
} from "@/lib/patient-profile/command-registry";
import { Sparkles } from "lucide-react";

const GROUP_ORDER = [
  "Plan",
  "Subjective",
  "Objective",
  "Layout",
  "Other",
] as const;

/**
 * `<CommandBar>` — Cmd+K command palette for the patient-profile shell.
 *
 * Binds Cmd+K (Mac) / Ctrl+K (Win/Linux) to open a `cmdk`-backed dialog
 * that lists commands registered via `command-registry.ts` (rxs-03).
 *
 * Mount once at the page root (PatientProfilePage), not inside the shell.
 */
export default function CommandBar() {
  const [open, setOpen] = useState(false);
  const commands = useCommands();

  const grouped = useMemo(() => {
    const out: Record<string, typeof commands> = {};
    for (const cmd of commands) {
      const group = cmd.group ?? "Other";
      (out[group] ??= []).push(cmd);
    }
    return out;
  }, [commands]);

  const orderedGroups = useMemo(() => {
    const keys = Object.keys(grouped);
    return [
      ...GROUP_ORDER.filter((g) => keys.includes(g)),
      ...keys.filter((k) => !GROUP_ORDER.includes(k as (typeof GROUP_ORDER)[number])),
    ];
  }, [grouped]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key !== "k") return;
      const target = e.target as HTMLElement | null;
      const isInTextField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isInTextField && !e.shiftKey) return;

      e.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
            Command bar
          </DialogTitle>
          <DialogDescription>
            Search and run cockpit commands.
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-lg border-0 shadow-none" label="Command palette">
          <CommandInput autoFocus placeholder="Type a command…" />
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>
            {orderedGroups.map((group) => (
              <CommandGroup key={group} heading={group}>
                {(grouped[group] ?? []).map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={`${cmd.label} ${cmd.keywords?.join(" ") ?? ""}`}
                    disabled={cmd.enabled ? !cmd.enabled() : false}
                    onSelect={() => {
                      executeCommand(cmd.id);
                      setOpen(false);
                    }}
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcutHint ? (
                      <kbd className="ml-auto text-xs text-muted-foreground">
                        {cmd.shortcutHint}
                      </kbd>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
