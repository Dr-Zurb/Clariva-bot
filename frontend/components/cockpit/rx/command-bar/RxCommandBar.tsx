/**
 * In-cockpit visit command bar (rfec-01…03).
 *
 * `/` opens it when focus is not editable. Jump reuses the Phase 1 field
 * index and sets `rxFocus` on this visit so the existing consumer applies.
 * Show unhides via the same hidden-set the manage menus persist.
 * Set writes vitals through `useRxForm().setField` (no AI). Not a palette
 * — do not import `CockpitPalette`. Does not steal Cmd-K.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, PencilLine, Stethoscope } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  applySetVitalWrites,
  parseSetVitalCommand,
  type SetVitalOption,
} from "@/lib/cockpit/command-bar-set-vital";
import { searchRxFields, type RxFieldHit } from "@/lib/search/rx-fields";
import {
  rxCommandBarOpened,
  rxCommandBarSearched,
  rxCommandBarSelected,
} from "@/lib/telemetry/rx-command-bar";
import {
  rxFocusForHiddenTarget,
  searchShowHits,
  showHiddenTarget,
  useRxHiddenTargets,
  type RxHiddenTarget,
} from "@/components/cockpit/rx/command-bar/rx-hidden-set";

/** True when `/` must be ignored (RFE2-D2). */
export function isEditableFocusTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    if (
      type === "button" ||
      type === "submit" ||
      type === "checkbox" ||
      type === "radio" ||
      type === "file" ||
      type === "hidden"
    ) {
      return false;
    }
    return true;
  }
  const role = target.getAttribute("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

export function RxCommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { state, setField } = useRxForm();

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (open) rxCommandBarOpened();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const queryLen = query.trim().length;
    if (queryLen === 0) return;
    rxCommandBarSearched(queryLen);
  }, [open, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "/") return;
      if (isEditableFocusTarget(event.target)) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const hidden = useRxHiddenTargets();
  const hits = useMemo(
    () => searchRxFields(query, pathname),
    [query, pathname]
  );
  const showHits = useMemo(
    () => searchShowHits(query, hidden),
    [hidden, query]
  );
  const setResult = useMemo(() => parseSetVitalCommand(query), [query]);
  const setOptions: readonly SetVitalOption[] =
    setResult.kind === "one"
      ? [setResult.option]
      : setResult.kind === "pick"
        ? setResult.options
        : [];

  function applyRxFocus(focus: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("rxFocus", focus);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setOpen(false);
  }

  function jumpToHit(hit: RxFieldHit) {
    rxCommandBarSelected("jump");
    applyRxFocus(hit.id);
  }

  function showThenJump(target: RxHiddenTarget) {
    showHiddenTarget(target);
    rxCommandBarSelected("unhide");
    applyRxFocus(rxFocusForHiddenTarget(target));
  }

  function applySet(option: SetVitalOption) {
    for (const write of option.writes) {
      const target = hidden.find(
        (item) => item.kind === "vital" && item.field === write.key
      );
      if (target) showHiddenTarget(target);
    }
    applySetVitalWrites(setField, state.fields, option.writes);
    rxCommandBarSelected("set");
    applyRxFocus(`objective.vitals.${option.focusField}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Command bar</DialogTitle>
          <DialogDescription>
            Jump to a field, show a hidden section, or set a vital on this visit.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} label="Visit command bar">
          <CommandInput
            autoFocus
            placeholder="Jump, show, or set a vital…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {query.trim().length === 0
                ? "Type spo2 98 to set a vital, or a field to jump."
                : "No matching fields."}
            </CommandEmpty>
            {setOptions.length > 0 ? (
              <CommandGroup heading="Set">
                {setOptions.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={`set:${option.id}:${option.label}`}
                    onSelect={() => applySet(option)}
                  >
                    <PencilLine className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {showHits.length > 0 ? (
              <CommandGroup heading="Show">
                {showHits.map((target) => (
                  <CommandItem
                    key={`show:${rxFocusForHiddenTarget(target)}`}
                    value={`show:${rxFocusForHiddenTarget(target)}:${target.label}`}
                    onSelect={() => showThenJump(target)}
                  >
                    <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">Show {target.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {hits.length > 0 ? (
              <CommandGroup heading="Jump">
                {hits.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    value={`jump:${hit.id}:${hit.label}`}
                    onSelect={() => jumpToHit(hit)}
                  >
                    <Stethoscope className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{hit.label}</span>
                    {hit.subtitle ? (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {hit.subtitle}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
