"use client";

import { useState } from "react";
import { Check, LayoutGrid, Pencil, RotateCcw, Save, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CockpitLayoutPresetTree } from "@/lib/api/cockpit-layout-presets-tree";
import {
  BUILT_IN_PRESETS,
  type BuiltInLayoutPreset,
} from "@/lib/patient-profile/layout-presets-builtin";
import {
  collectLayoutPaneIds,
  layoutTreesEqual,
} from "@/lib/patient-profile/layout-node-bridge";
import type { LayoutNode } from "@/lib/patient-profile/types";

export interface PresetPickerProps {
  currentLayoutTree: LayoutNode;
  templatePaneIds: readonly string[];
  paneTitleById: Record<string, string>;
  customPresets: CockpitLayoutPresetTree[];
  customPresetsLoading: boolean;
  customPresetsError: boolean;
  atPresetCap: boolean;
  onApplyPreset: (preset: BuiltInLayoutPreset | CockpitLayoutPresetTree) => void;
  onSaveCurrentLayout: (name: string) => void | Promise<void>;
  onResetToTemplate: (preset: CockpitLayoutPresetTree) => void;
  onRestoreHiddenPane: (paneId: string) => void;
  /** cpfc-03: when true, "My presets" rows show rename + delete affordances. */
  customizeMode?: boolean;
  onDeletePreset?: (id: string) => void | Promise<void>;
  onRenamePreset?: (id: string, name: string) => void | Promise<void>;
}

function titleForPaneId(paneId: string, paneTitleById: Record<string, string>): string {
  return paneTitleById[paneId] ?? paneId;
}

export default function PresetPicker({
  currentLayoutTree,
  templatePaneIds,
  paneTitleById,
  customPresets,
  customPresetsLoading,
  customPresetsError,
  atPresetCap,
  onApplyPreset,
  onSaveCurrentLayout,
  onResetToTemplate,
  onRestoreHiddenPane,
  customizeMode,
  onDeletePreset,
  onRenamePreset,
}: PresetPickerProps) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const currentPaneIds = new Set(collectLayoutPaneIds(currentLayoutTree));
  const hiddenPaneIds = templatePaneIds.filter((id) => !currentPaneIds.has(id));

  const isBuiltInActive = (preset: BuiltInLayoutPreset) =>
    layoutTreesEqual(currentLayoutTree, preset.layoutTree);

  const isCustomActive = (preset: CockpitLayoutPresetTree) =>
    preset.layoutTree != null &&
    layoutTreesEqual(currentLayoutTree, preset.layoutTree);

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name || saveBusy) return;
    setSaveBusy(true);
    try {
      await onSaveCurrentLayout(name);
      setSaveName("");
      setSaveOpen(false);
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <LayoutGrid className="h-4 w-4" aria-hidden />
          Layout
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Built-in</DropdownMenuLabel>
        {BUILT_IN_PRESETS.map((preset) => {
          const active = isBuiltInActive(preset);
          return (
            <DropdownMenuItem
              key={preset.id}
              onSelect={() => onApplyPreset(preset)}
              className="flex items-center gap-2"
            >
              {active ? (
                <Check className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <Star className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="flex-1">{preset.name}</span>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>My presets</DropdownMenuLabel>

        {customPresetsLoading && (
          <DropdownMenuItem disabled>Loading presets…</DropdownMenuItem>
        )}
        {customPresetsError && (
          <DropdownMenuItem disabled className="text-destructive">
            Could not load presets
          </DropdownMenuItem>
        )}
        {!customPresetsLoading &&
          !customPresetsError &&
          customPresets.length === 0 && (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              No custom presets yet
            </DropdownMenuItem>
          )}

        {customPresets.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            onSelect={() => {
              if (renamingId === preset.id) return;
              onApplyPreset(preset);
            }}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {isCustomActive(preset) ? (
                <Check className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <Star className="h-3 w-3 shrink-0 fill-current text-warning" aria-hidden />
              )}
              {renamingId === preset.id ? (
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={60}
                  className="h-7"
                  autoFocus
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      void onRenamePreset?.(preset.id, renameValue);
                      setRenamingId(null);
                    }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => setRenamingId(null)}
                />
              ) : (
                <span className="truncate">{preset.name}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {preset.sourceTemplateId ? (
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onResetToTemplate(preset);
                  }}
                  aria-label={`Reset ${preset.name} to template default`}
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                </button>
              ) : null}
              {customizeMode && (
                <>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenamingId(preset.id);
                      setRenameValue(preset.name);
                      setConfirmingDeleteId(null);
                    }}
                    aria-label={`Rename ${preset.name}`}
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (confirmingDeleteId === preset.id) {
                        void onDeletePreset?.(preset.id);
                        setConfirmingDeleteId(null);
                      } else {
                        setConfirmingDeleteId(preset.id);
                      }
                    }}
                    aria-label={
                      confirmingDeleteId === preset.id
                        ? `Confirm delete ${preset.name}`
                        : `Delete ${preset.name}`
                    }
                  >
                    {confirmingDeleteId === preset.id ? (
                      <Check className="h-3 w-3 text-destructive" aria-hidden />
                    ) : (
                      <Trash2 className="h-3 w-3" aria-hidden />
                    )}
                  </button>
                </>
              )}
            </span>
          </DropdownMenuItem>
        ))}

        {!atPresetCap && (
          <Popover open={saveOpen} onOpenChange={setSaveOpen}>
            <PopoverTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSaveOpen(true);
                }}
                className="gap-2"
              >
                <Save className="h-3 w-3" aria-hidden />
                Save current layout
              </DropdownMenuItem>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end" side="left">
              <p className="mb-2 text-sm font-medium">Name this layout</p>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Chronic care"
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                }}
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSaveOpen(false);
                    setSaveName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!saveName.trim() || saveBusy}
                  onClick={() => void handleSave()}
                >
                  Save
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {hiddenPaneIds.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Hidden panes</DropdownMenuLabel>
            {hiddenPaneIds.map((paneId) => (
              <DropdownMenuItem
                key={paneId}
                onSelect={() => onRestoreHiddenPane(paneId)}
              >
                Restore: {titleForPaneId(paneId, paneTitleById)}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
