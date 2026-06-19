"use client";

import { useCallback, useState } from "react";
import {
  Check,
  LayoutGrid,
  LayoutTemplate,
  Pencil,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";
import { assertFlatLeafRegistry } from "@/lib/patient-profile/v3/blankLayout";
import { isFullEightPaneRegistry } from "@/lib/patient-profile/v3/default-layouts";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import type { CockpitLayoutSwitcher } from "@/lib/patient-profile/v3/useCockpitLayoutSwitcher";
import { LAYOUT_MENU_SECTIONS } from "@/lib/patient-profile/v3/useCockpitLayoutSwitcher";
import { formatLayoutHotkeyHint } from "@/lib/patient-profile/v3/useCockpitLayoutHotkeys";
import {
  MAX_SAVED_LAYOUTS,
  useCockpitLayoutPresets,
} from "@/lib/patient-profile/v3/useCockpitLayoutPresets";
import { toastOnCapRejection } from "@/lib/patient-profile/v3/cockpit-cap-toast";
import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface CockpitPaletteProps {
  panes: PaneDefinition[];
  layout: CockpitV3Layout;
  layoutSwitcher?: CockpitLayoutSwitcher;
  /** Doctor auth token — enables save/load custom layouts (cv3l-05). */
  token?: string;
  className?: string;
}

export default function CockpitPalette({
  panes,
  layout,
  layoutSwitcher,
  token,
  className,
}: CockpitPaletteProps) {
  const showLayoutSwitcher =
    Boolean(layoutSwitcher) && isFullEightPaneRegistry(panes);

  const layoutPresets = useCockpitLayoutPresets(token, showLayoutSwitcher);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleToggle = useCallback(
    (paneId: string) => {
      const hidden = layout.paneState[paneId]?.hidden ?? true;
      const result = hidden
        ? layout.addPane(paneId)
        : layout.removePane(paneId);
      toastOnCapRejection(result);
    },
    [layout],
  );

  const handleSaveLayout = useCallback(async () => {
    const name = saveName.trim();
    if (!name) {
      layoutUxToast.error("Enter a name for this layout.");
      return;
    }
    try {
      await layoutPresets.savePreset(name, layout.paneTree);
      setSaveOpen(false);
      setSaveName("");
    } catch (err) {
      layoutUxToast.error(
        err instanceof Error ? err.message : "Failed to save layout",
      );
    }
  }, [layout.paneTree, layoutPresets, saveName]);

  const handleRenameLayout = useCallback(async () => {
    if (!renameId) return;
    const name = renameName.trim();
    if (!name) {
      layoutUxToast.error("Enter a name for this layout.");
      return;
    }
    try {
      await layoutPresets.renamePresetById(renameId, name);
      setRenameOpen(false);
      setRenameId(null);
      setRenameName("");
    } catch (err) {
      layoutUxToast.error(
        err instanceof Error ? err.message : "Failed to rename layout",
      );
    }
  }, [layoutPresets, renameId, renameName]);

  const handleDeleteLayout = useCallback(async () => {
    if (!deleteId) return;
    try {
      await layoutPresets.deletePresetById(deleteId);
      setDeleteOpen(false);
      setDeleteId(null);
    } catch (err) {
      layoutUxToast.error(
        err instanceof Error ? err.message : "Failed to delete layout",
      );
    }
  }, [deleteId, layoutPresets]);

  const openRename = useCallback((id: string, currentName: string) => {
    setRenameId(id);
    setRenameName(currentName);
    setRenameOpen(true);
  }, []);

  const openDelete = useCallback((id: string) => {
    setDeleteId(id);
    setDeleteOpen(true);
  }, []);

  if (panes.length === 0) return null;

  assertFlatLeafRegistry(panes);

  const builtInSection = LAYOUT_MENU_SECTIONS.find((s) => s.id === "built-in");

  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="toolbar"
        aria-label="Pane palette"
        data-testid="cockpit-v3-palette"
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/30 px-2 py-1",
          className,
        )}
      >
        {panes.map((pane) => {
          const hidden = layout.paneState[pane.id]?.hidden ?? true;
          const Icon = pane.icon ?? LayoutGrid;
          const tooltipLabel = hidden
            ? `Add ${pane.title}`
            : `Remove ${pane.title}`;

          return (
            <Tooltip key={pane.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-palette-pane-id={pane.id}
                  data-palette-on-canvas={hidden ? "false" : "true"}
                  onClick={() => handleToggle(pane.id)}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    !hidden && "bg-primary/15 text-primary hover:bg-primary/25",
                    hidden &&
                      "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-pressed={!hidden}
                  aria-label={tooltipLabel}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {tooltipLabel}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <div className="mx-1 h-4 w-px bg-border/60" aria-hidden />
        {showLayoutSwitcher && layoutSwitcher ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="cockpit-v3-layouts-trigger"
                  aria-label="Layouts"
                  title="Switch workflow layout"
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs font-medium transition-colors",
                    "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  )}
                >
                  <LayoutTemplate className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="hidden sm:inline">Layouts</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-64"
                data-testid="cockpit-v3-layouts-menu"
              >
                {builtInSection ? (
                  <div>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {builtInSection.title}
                    </DropdownMenuLabel>
                    {builtInSection.entries.map((entry) => {
                      const active =
                        layoutSwitcher.activeLayoutId === entry.id;
                      return (
                        <DropdownMenuItem
                          key={entry.id}
                          data-testid={`cockpit-v3-layout-${entry.id}`}
                          className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                          onSelect={() =>
                            layoutSwitcher.applyDefaultLayout(entry.id)
                          }
                        >
                          <span className="flex w-full items-center gap-2">
                            <span className="font-medium">{entry.label}</span>
                            {entry.hotkey ? (
                              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                {formatLayoutHotkeyHint(entry.hotkey)}
                              </span>
                            ) : null}
                            {active ? (
                              <Check
                                className="h-3.5 w-3.5 shrink-0 text-primary"
                                aria-hidden
                              />
                            ) : null}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.description}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ) : null}
                {token ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      My layouts
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      data-testid="cockpit-v3-save-layout"
                      disabled={!layoutPresets.canSaveMore}
                      className="gap-2"
                      onSelect={(e) => {
                        e.preventDefault();
                        setSaveName("");
                        setSaveOpen(true);
                      }}
                    >
                      <Save className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Save current layout…
                      {!layoutPresets.canSaveMore ? (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {MAX_SAVED_LAYOUTS} max
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                    {layoutPresets.presets.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No saved layouts yet
                      </div>
                    ) : null}
                    {layoutPresets.presets.map((preset) => {
                      const active =
                        layoutSwitcher.activeSavedPresetId === preset.id;
                      return (
                        <DropdownMenuSub key={preset.id}>
                          <DropdownMenuSubTrigger className="gap-2">
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {preset.name}
                            </span>
                            {active ? (
                              <Check
                                className="h-3.5 w-3.5 shrink-0 text-primary"
                                aria-hidden
                              />
                            ) : null}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem
                              data-testid={`cockpit-v3-saved-layout-${preset.id}-apply`}
                              onSelect={() =>
                                layoutSwitcher.applySavedLayout(
                                  preset.paneTreeV3,
                                  preset.id,
                                )
                              }
                            >
                              Apply
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2"
                              onSelect={() => openRename(preset.id, preset.name)}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                              Rename…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-destructive focus:text-destructive"
                              onSelect={() => openDelete(preset.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      );
                    })}
                  </>
                ) : (
                  <div
                    className="px-2 py-1.5 text-xs text-muted-foreground"
                    data-testid="cockpit-v3-my-layouts-placeholder"
                  >
                    Sign in to save custom layouts
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="cockpit-v3-undo"
              onClick={() => layout.undo()}
              disabled={!layout.canUndo}
              aria-label="Undo layout"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
                "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Undo layout
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="cockpit-v3-redo"
              onClick={() => layout.redo()}
              disabled={!layout.canRedo}
              aria-label="Redo layout"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
                "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <Redo2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Redo layout
          </TooltipContent>
        </Tooltip>
      </div>

      <AlertDialog open={saveOpen} onOpenChange={setSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save layout</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="e.g. My consult setup"
            maxLength={60}
            aria-label="Layout name"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSaveLayout();
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleSaveLayout()}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename layout</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            maxLength={60}
            aria-label="Layout name"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameLayout();
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRenameLayout()}>
              Rename
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved layout?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            This cannot be undone.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDeleteLayout()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
