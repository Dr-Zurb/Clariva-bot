"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SaveViewDialog } from "@/components/patients-v2/list/SaveViewDialog";
import { ManageViewsDialog } from "@/components/patients-v2/list/ManageViewsDialog";
import {
  PATIENT_LIST_COLUMN_DEFS,
  type PatientListColumnId,
} from "@/lib/patients-v2/list-preferences";
import { cn } from "@/lib/utils";
import type { PatientSavedView, PatientSegmentId } from "@/types/patient";

/** Filters available from View (KPI cards own the four worklists). */
const VIEW_EXTRA_SEGMENTS: ReadonlyArray<{ id: PatientSegmentId; label: string }> = [
  { id: "has-allergies", label: "Has allergies" },
];

/** Labels for active-filter pills (KPI worklists + View / legacy segments). */
const SEGMENT_PILL_LABELS: Readonly<Partial<Record<PatientSegmentId, string>>> = {
  "incomplete-consult": "Incomplete consults",
  "at-risk-followup": "Follow-up overdue",
  "new-30d": "New (30d)",
  "revisit-30d": "Revisits (30d)",
  "has-allergies": "Has allergies",
  "no-show-prone": "No-show prone",
  untagged: "Untagged",
  "active-90d": "Active (90d)",
  "has-open-episodes": "Open episodes",
};

export interface PatientsToolbarProps {
  q: string;
  onQChange: (next: string) => void;
  activeSegment: PatientSegmentId | null;
  onSegmentToggle: (segment: PatientSegmentId) => void;
  onSegmentPrefetch?: (segment: PatientSegmentId | null) => void;
  activeTag: string | null;
  onTagToggle: (tag: string) => void;
  onTagClear: () => void;
  knownTags: string[];
  savedViews: PatientSavedView[];
  activeViewId: string | null;
  onViewSelect: (view: PatientSavedView) => void;
  onSaveView: (name: string, setAsDefault: boolean) => Promise<void>;
  onRenameView: (id: string, newName: string) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  onSetDefaultView: (id: string) => Promise<void>;
  nextEvictionTarget: PatientSavedView | null;
  columns: PatientListColumnId[];
  onColumnsChange: (columns: PatientListColumnId[]) => void;
  selectedCount?: number;
  bulkActionsSlot?: React.ReactNode;
  onAddPatient?: () => void;
}

function FilterPill({
  label,
  prefix,
  onClear,
  onPrefetchClear,
}: {
  label: string;
  prefix: string;
  onClear: () => void;
  onPrefetchClear?: () => void;
}) {
  return (
    <div
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-0.5 text-xs text-foreground"
      role="status"
      aria-label={`${prefix} ${label}`}
    >
      <span className="truncate">
        {prefix}: <span className="font-medium">{label}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0 rounded-full"
        aria-label={`Clear ${prefix} ${label}`}
        onClick={onClear}
        onPointerEnter={onPrefetchClear}
        onFocus={onPrefetchClear}
      >
        <X className="h-3 w-3" aria-hidden />
      </Button>
    </div>
  );
}

export function PatientsToolbar({
  q,
  onQChange,
  activeSegment,
  onSegmentToggle,
  onSegmentPrefetch,
  activeTag,
  onTagToggle,
  onTagClear,
  knownTags,
  savedViews,
  activeViewId,
  onViewSelect,
  onSaveView,
  onRenameView,
  onDeleteView,
  onSetDefaultView,
  nextEvictionTarget,
  columns,
  onColumnsChange,
  selectedCount = 0,
  bulkActionsSlot,
  onAddPatient,
}: PatientsToolbarProps) {
  const [draftQ, setDraftQ] = useState(q);
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftQ(q);
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (draftQ !== q) onQChange(draftQ);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [draftQ, q, onQChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const showBulkBar = selectedCount >= 1 && bulkActionsSlot != null;

  const toggleColumn = (columnId: PatientListColumnId, checked: boolean) => {
    if (checked) {
      if (!columns.includes(columnId)) {
        onColumnsChange([...columns, columnId]);
      }
      return;
    }
    if (columns.length <= 1) return;
    onColumnsChange(columns.filter((c) => c !== columnId));
  };

  const clearSearch = () => {
    setDraftQ("");
    onQChange("");
  };

  const segmentPillLabel = activeSegment
    ? (SEGMENT_PILL_LABELS[activeSegment] ?? null)
    : null;

  return (
    <>
      <div className="sticky top-14 z-20 -mx-1 bg-background/80 px-1 pb-1 pt-0.5 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className={cn("relative w-full md:w-72")}>
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchInputRef}
                type="search"
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
                placeholder="Search by name, phone, or MRN…"
                className="pl-8 pr-8"
                aria-label="Search patients"
              />
              {draftQ !== "" ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className={cn(
                    "absolute right-2.5 top-1/2 -translate-y-1/2",
                    "rounded text-muted-foreground hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {segmentPillLabel && activeSegment ? (
              <FilterPill
                prefix="Filtered"
                label={segmentPillLabel}
                onClear={() => onSegmentToggle(activeSegment)}
                onPrefetchClear={() => onSegmentPrefetch?.(null)}
              />
            ) : null}
            {activeTag ? (
              <FilterPill
                prefix="Tag"
                label={activeTag}
                onClear={onTagClear}
              />
            ) : null}
          </div>

          {showBulkBar ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {bulkActionsSlot}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {onAddPatient ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1 self-end sm:self-auto"
                  onClick={onAddPatient}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add patient
                </Button>
              ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 self-end sm:self-auto"
                  aria-label="View options"
                >
                  View
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Saved views</DropdownMenuLabel>
                {savedViews.map((view) => (
                  <DropdownMenuItem
                    key={view.id}
                    onSelect={() => onViewSelect(view)}
                    className={activeViewId === view.id ? "bg-accent" : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      {view.is_default ? (
                        <Star
                          className="h-3.5 w-3.5 fill-primary text-primary"
                          aria-hidden
                        />
                      ) : null}
                      {view.name}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={() => setSaveOpen(true)}>
                  Save current view…
                </DropdownMenuItem>
                {savedViews.length > 0 ? (
                  <DropdownMenuItem onSelect={() => setManageOpen(true)}>
                    Manage views…
                  </DropdownMenuItem>
                ) : null}

                <DropdownMenuSeparator />

                <DropdownMenuLabel>More filters</DropdownMenuLabel>
                {VIEW_EXTRA_SEGMENTS.map((chip) => (
                  <DropdownMenuCheckboxItem
                    key={chip.id}
                    checked={activeSegment === chip.id}
                    onCheckedChange={() => onSegmentToggle(chip.id)}
                    onPointerEnter={() => onSegmentPrefetch?.(chip.id)}
                  >
                    {chip.label}
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Tags</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    <DropdownMenuCheckboxItem
                      checked={activeSegment === "untagged"}
                      onCheckedChange={() => onSegmentToggle("untagged")}
                    >
                      Untagged
                    </DropdownMenuCheckboxItem>
                    {knownTags.length === 0 ? (
                      <DropdownMenuItem
                        disabled
                        className="text-xs text-muted-foreground"
                      >
                        Select patients → Tag… to create tags
                      </DropdownMenuItem>
                    ) : (
                      knownTags.map((tag) => (
                        <DropdownMenuCheckboxItem
                          key={tag}
                          checked={Boolean(
                            activeTag &&
                              activeTag.toLowerCase() === tag.toLowerCase(),
                          )}
                          onCheckedChange={() => onTagToggle(tag)}
                        >
                          {tag}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Columns</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    {PATIENT_LIST_COLUMN_DEFS.map((col) => {
                      const checked = columns.includes(col.id);
                      return (
                        <DropdownMenuCheckboxItem
                          key={col.id}
                          checked={checked}
                          disabled={checked && columns.length <= 1}
                          onCheckedChange={(next) =>
                            toggleColumn(col.id, Boolean(next))
                          }
                          onSelect={(e) => e.preventDefault()}
                        >
                          {col.label}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSave={onSaveView}
        nextEvictionTarget={nextEvictionTarget}
      />
      <ManageViewsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        views={savedViews}
        onRename={onRenameView}
        onDelete={onDeleteView}
        onSetDefault={onSetDefaultView}
      />
    </>
  );
}
